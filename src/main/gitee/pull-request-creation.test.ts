import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateHostedReviewInput } from '../../shared/hosted-review'
import { createGiteePullRequest, isGiteeReviewCreationAuthenticated } from './pull-request-creation'
import { _resetGiteePullRequestScanCache } from './pull-request-scan-cache'
import { _resetGiteeRepoRefCache } from './repository-ref'

const { getSshGitProviderMock, gitExecFileAsyncMock } = vi.hoisted(() => ({
  getSshGitProviderMock: vi.fn(),
  gitExecFileAsyncMock: vi.fn()
}))

vi.mock('../git/runner', () => ({
  gitExecFileAsync: gitExecFileAsyncMock
}))

vi.mock('../providers/ssh-git-dispatch', () => ({
  getSshGitProvider: getSshGitProviderMock
}))

vi.mock('../source-control/pull-request-template', () => ({
  readHostedPullRequestTemplate: vi.fn(async () => 'Template body')
}))

const OLD_ENV = process.env

const CREATE_INPUT: CreateHostedReviewInput = {
  provider: 'gitee',
  base: 'origin/main',
  head: 'refs/heads/feature/gitee',
  title: 'Add Gitee create',
  body: 'Body',
  draft: true
}

function giteePr(number = 13) {
  return {
    number,
    title: 'Add Gitee create',
    state: 'open',
    draft: true,
    html_url: `https://gitee.com/team/repo/pulls/${number}`,
    updated_at: '2026-07-17T00:00:00Z',
    mergeable: true,
    head: {
      ref: 'feature/gitee',
      label: 'team:feature/gitee',
      sha: 'abc123'
    }
  }
}

describe('Gitee pull request creation', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV, ORCA_GITEE_TOKEN: 'gitee-token' }
    delete process.env.ORCA_GITEE_API_BASE_URL
    getSshGitProviderMock.mockReset()
    gitExecFileAsyncMock.mockReset()
    gitExecFileAsyncMock.mockResolvedValue({
      stdout: 'https://gitee.com/team/repo.git\n',
      stderr: ''
    })
    _resetGiteeRepoRefCache()
    _resetGiteePullRequestScanCache()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    process.env = OLD_ENV
    _resetGiteeRepoRefCache()
    _resetGiteePullRequestScanCache()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('requires ORCA_GITEE_TOKEN before resolving the repository or calling Gitee', async () => {
    delete process.env.ORCA_GITEE_TOKEN
    const fetchMock = vi.fn(async () => Response.json({}, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    expect(isGiteeReviewCreationAuthenticated()).toBe(false)
    await expect(createGiteePullRequest('/repo', CREATE_INPUT)).resolves.toMatchObject({
      ok: false,
      code: 'auth_required'
    })
    expect(gitExecFileAsyncMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts a normalized pull request body to Gitee API v5', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      expect(url.pathname).toBe('/api/v5/repos/team/repo/pulls')
      expect(init).toBeDefined()
      const requestInit = init!
      expect(requestInit.method).toBe('POST')
      expect((requestInit.headers as Record<string, string>).Authorization).toBe(
        'token gitee-token'
      )
      expect(JSON.parse(String(requestInit.body))).toEqual({
        base: 'main',
        head: 'feature/gitee',
        title: 'Add Gitee create',
        body: 'Body',
        draft: true
      })
      return Response.json(giteePr(), { status: 201 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(createGiteePullRequest('/repo', CREATE_INPUT)).resolves.toEqual({
      ok: true,
      number: 13,
      url: 'https://gitee.com/team/repo/pulls/13'
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('ignores unsafe API base URL overrides when creating pull requests', async () => {
    process.env.ORCA_GITEE_API_BASE_URL = 'http://mirror.example.test/gitee'
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(new URL(String(input)).origin).toBe('https://gitee.com')
      return Response.json(giteePr(), { status: 201 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(createGiteePullRequest('/repo', CREATE_INPUT)).resolves.toMatchObject({
      ok: true,
      number: 13
    })
  })

  it('resolves the local repository through the selected WSL distro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(giteePr(), { status: 201 })))

    await expect(
      createGiteePullRequest('/repo', CREATE_INPUT, null, {
        localGitExecOptions: { wslDistro: 'Ubuntu' }
      })
    ).resolves.toMatchObject({ ok: true, number: 13 })

    expect(gitExecFileAsyncMock).toHaveBeenCalledWith(['remote', 'get-url', 'origin'], {
      cwd: '/repo',
      wslDistro: 'Ubuntu'
    })
  })

  it('classifies API authentication errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ message: '401 Unauthorized' }, { status: 401 }))
    )

    await expect(createGiteePullRequest('/repo', CREATE_INPUT)).resolves.toMatchObject({
      ok: false,
      code: 'auth_required'
    })
  })

  it('classifies duplicate pull requests and returns the existing review', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Response.json({ message: 'Pull Request already exists' }, { status: 409 })
      }
      return Response.json([giteePr(9)])
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(createGiteePullRequest('/repo', CREATE_INPUT)).resolves.toEqual({
      ok: false,
      code: 'already_exists',
      error: 'A pull request already exists for this branch.',
      existingReview: {
        number: 9,
        url: 'https://gitee.com/team/repo/pulls/9'
      }
    })
  })

  it('classifies validation failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ message: 'Validation failed' }, { status: 422 }))
    )

    await expect(createGiteePullRequest('/repo', CREATE_INPUT)).resolves.toMatchObject({
      ok: false,
      code: 'validation'
    })
  })

  it('classifies timed out creates as unknown completion', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const error = new Error('Request timed out')
        error.name = 'TimeoutError'
        throw error
      }
      return Response.json([])
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(createGiteePullRequest('/repo', CREATE_INPUT)).resolves.toMatchObject({
      ok: false,
      code: 'unknown_completion'
    })
  })

  it('classifies other API failures as unknown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ message: 'Service unavailable: secret-body-token' }, { status: 503 })
      )
    )

    await expect(createGiteePullRequest('/repo', CREATE_INPUT)).resolves.toMatchObject({
      ok: false,
      code: 'unknown'
    })
    expect(console.warn).toHaveBeenCalledWith('createGiteePullRequest failed', {
      category: 'unknown',
      status: 503
    })
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('secret-body-token')
  })
})

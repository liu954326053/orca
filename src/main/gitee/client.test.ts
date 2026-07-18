import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { gitExecFileAsyncMock } = vi.hoisted(() => ({
  gitExecFileAsyncMock: vi.fn()
}))

vi.mock('../git/runner', () => ({
  gitExecFileAsync: gitExecFileAsyncMock
}))

import {
  getGiteePullRequest,
  getGiteePullRequestForBranch,
  getGiteeRepoSlug,
  invalidateGiteePullRequestScanForRepo,
  normalizeGiteeApiBaseUrl
} from './client'
import {
  _resetGiteePullRequestScanCache,
  invalidateGiteePullRequestScan,
  scanGiteePullRequests
} from './pull-request-scan-cache'
import { _resetGiteeRepoRefCache } from './repository-ref'

const OLD_ENV = process.env

function giteePr(number = 7, branch = 'feature/gitee') {
  return {
    number,
    title: 'Add Gitee',
    state: 'open',
    html_url: `https://gitee.com/team/repo/pulls/${number}`,
    updated_at: '2026-07-17T00:00:00Z',
    mergeable: true,
    head: {
      ref: branch,
      label: `team:${branch}`,
      sha: 'abc123'
    }
  }
}

describe('Gitee client', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV, ORCA_GITEE_TOKEN: 'gitee-token' }
    delete process.env.ORCA_GITEE_API_BASE_URL
    gitExecFileAsyncMock.mockReset()
    gitExecFileAsyncMock.mockResolvedValue({
      stdout: 'https://gitee.com/team/repo.git\n',
      stderr: ''
    })
    _resetGiteeRepoRefCache()
    _resetGiteePullRequestScanCache()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    process.env = OLD_ENV
    _resetGiteeRepoRefCache()
    _resetGiteePullRequestScanCache()
    vi.unstubAllGlobals()
  })

  it('normalizes API base URLs to Gitee API v5', () => {
    expect(normalizeGiteeApiBaseUrl('https://gitee.com')).toBe('https://gitee.com/api/v5')
    expect(normalizeGiteeApiBaseUrl('https://gitee.com/api/v5/')).toBe('https://gitee.com/api/v5')
    expect(normalizeGiteeApiBaseUrl('http://gitee.com')).toBeNull()
    expect(normalizeGiteeApiBaseUrl('https://mirror.example.test/gitee')).toBeNull()
    expect(normalizeGiteeApiBaseUrl('https://user:secret@gitee.com')).toBeNull()
  })

  it('queries by head before scanning all pull requests', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init).toBeDefined()
      expect((init!.headers as Record<string, string>).Authorization).toBe('token gitee-token')
      return Response.json([giteePr()])
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getGiteePullRequestForBranch('/repo', 'refs/heads/feature/gitee')
    ).resolves.toMatchObject({
      number: 7,
      state: 'open',
      status: 'neutral',
      headSha: 'abc123'
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/api/v5/repos/team/repo/pulls')
    expect(url.searchParams.get('head')).toBe('feature/gitee')
    expect(url.searchParams.get('state')).toBe('all')
    expect(url.searchParams.get('sort')).toBe('updated')
    expect(url.searchParams.get('direction')).toBe('desc')
    expect(url.searchParams.get('per_page')).toBe('50')
  })

  it('ignores a closed pull request discovered implicitly by branch', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json([{ ...giteePr(13, 'feature/abandoned'), state: 'closed' }])
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getGiteePullRequestForBranch('/repo', 'feature/abandoned')).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('shows a closed pull request when it is explicitly linked', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      return Response.json(
        url.pathname.endsWith('/pulls/14') ? { ...giteePr(14, 'remote-name'), state: 'closed' } : []
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getGiteePullRequestForBranch('/repo', 'local-review-branch', 14)
    ).resolves.toMatchObject({
      number: 14,
      state: 'closed'
    })
  })

  it('falls back to a paginated scan when the head-filtered request fails', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.searchParams.has('head')) {
        return Response.json({ message: 'head filter unavailable' }, { status: 400 })
      }
      return Response.json([giteePr(8, 'feature/from-scan')])
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(getGiteePullRequestForBranch('/repo', 'feature/from-scan')).resolves.toMatchObject(
      { number: 8 }
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const scanUrl = new URL(String(fetchMock.mock.calls[1]?.[0]))
    expect(scanUrl.searchParams.has('head')).toBe(false)
    expect(scanUrl.searchParams.get('page')).toBe('1')
  })

  it('fetches a pull request by number', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => Response.json(giteePr(42)))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getGiteePullRequest('/repo', 42)).resolves.toMatchObject({ number: 42 })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://gitee.com/api/v5/repos/team/repo/pulls/42'
    )
  })

  it('falls back to a linked pull request number when branch lookup misses', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      return Response.json(url.pathname.endsWith('/pulls/42') ? giteePr(42, 'remote-name') : [])
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(getGiteePullRequestForBranch('/repo', 'local-name', 42)).resolves.toMatchObject({
      number: 42
    })
  })

  it('ignores API base URL overrides outside the Gitee HTTPS origin', async () => {
    process.env.ORCA_GITEE_API_BASE_URL = 'https://user:secret@mirror.example.test/gitee'
    const fetchMock = vi.fn(async (_input: string | URL | Request) => Response.json(giteePr(12)))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getGiteePullRequest('/repo', 12)).resolves.toMatchObject({ number: 12 })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://gitee.com/api/v5/repos/team/repo/pulls/12'
    )
  })

  it.each([
    [401, 'authentication'],
    [403, 'authentication'],
    [429, 'rate_limited'],
    [503, 'server']
  ] as const)('surfaces HTTP %i as a %s API error', async (status, kind) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ message: 'request failed' }, { status }))
    )

    await expect(getGiteePullRequest('/repo', 42)).rejects.toMatchObject({
      name: 'GiteeApiRequestError',
      kind,
      status
    })
  })

  it('keeps a 404 pull request miss distinct from API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ message: 'not found' }, { status: 404 }))
    )

    await expect(getGiteePullRequest('/repo', 42)).resolves.toBeNull()
  })

  it('invalidates cached scans by cache key and repository ref', async () => {
    let fetches = 0
    const fetchPage = vi.fn(async () => {
      fetches += 1
      return [giteePr(fetches)]
    })

    await expect(scanGiteePullRequests('repo-key', fetchPage, 50, 5)).resolves.toHaveLength(1)
    await expect(scanGiteePullRequests('repo-key', fetchPage, 50, 5)).resolves.toHaveLength(1)
    expect(fetches).toBe(1)

    invalidateGiteePullRequestScan('repo-key')
    await scanGiteePullRequests('repo-key', fetchPage, 50, 5)
    expect(fetches).toBe(2)

    const repo = await getGiteeRepoSlug('/repo')
    expect(repo).not.toBeNull()
    const repoKey = 'https://gitee.com/api/v5/team/repo'
    await scanGiteePullRequests(repoKey, fetchPage, 50, 5)
    invalidateGiteePullRequestScanForRepo(repo!)
    await scanGiteePullRequests(repoKey, fetchPage, 50, 5)
    expect(fetches).toBe(4)
  })
})

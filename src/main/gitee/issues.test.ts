import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { gitExecFileAsyncMock } = vi.hoisted(() => ({
  gitExecFileAsyncMock: vi.fn()
}))

vi.mock('../git/runner', () => ({
  gitExecFileAsync: gitExecFileAsyncMock
}))

import {
  addGiteeIssueComment,
  createGiteeIssue,
  getGiteeIssue,
  GiteeIssueApiError,
  listGiteeIssueComments,
  listGiteeIssues,
  listGiteeLabels,
  updateGiteeIssue
} from './issues'
import { _resetGiteeRepoRefCache } from './repository-ref'

const OLD_ENV = process.env

function rawIssue(number = 1, state = 'open') {
  return {
    number,
    title: `Issue ${number}`,
    state,
    body: 'Some body',
    html_url: `https://gitee.com/team/repo/issues/${number}`,
    created_at: '2026-07-17T00:00:00Z',
    updated_at: '2026-07-17T00:00:00Z',
    user: { login: 'alice' },
    labels: [{ id: 1, name: 'bug', color: '#d73a4a' }],
    comments: 2
  }
}

function rawComment(id = 10) {
  return {
    id,
    body: 'A comment',
    user: { login: 'bob' },
    created_at: '2026-07-17T01:00:00Z',
    updated_at: '2026-07-17T01:00:00Z'
  }
}

function rawLabel(id = 1, name = 'bug') {
  return { id, name, color: '#d73a4a' }
}

describe('Gitee issues client', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV, ORCA_GITEE_TOKEN: 'gitee-token' }
    delete process.env.ORCA_GITEE_API_BASE_URL
    gitExecFileAsyncMock.mockReset()
    gitExecFileAsyncMock.mockResolvedValue({
      stdout: 'https://gitee.com/team/repo.git\n',
      stderr: ''
    })
    _resetGiteeRepoRefCache()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    process.env = OLD_ENV
    _resetGiteeRepoRefCache()
    vi.unstubAllGlobals()
  })

  describe('listGiteeIssues', () => {
    it('returns open issues by default', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL) => {
          const url = new URL(String(input))
          expect(url.pathname).toBe('/api/v5/repos/team/repo/issues')
          expect(url.searchParams.get('state')).toBe('open')
          return Response.json([rawIssue(1), rawIssue(2)])
        })
      )

      const issues = await listGiteeIssues('/repo')
      expect(issues).toHaveLength(2)
      expect(issues[0]).toMatchObject({
        number: '1',
        title: 'Issue 1',
        state: 'open',
        author: 'alice',
        labels: ['bug']
      })
    })

    it.each(['open', 'progressing', 'closed', 'rejected', 'all'] as const)(
      'serializes state=%s when requested',
      async (state) => {
        const fetchMock = vi.fn(async (_input: string | URL) => Response.json([rawIssue(3, state)]))
        vi.stubGlobal('fetch', fetchMock)

        await listGiteeIssues('/repo', { state })
        const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
        expect(url.searchParams.get('state')).toBe(state)
      }
    )

    it('serializes keyword, creator, assignee, and label filters', async () => {
      const fetchMock = vi.fn(async (_input: string | URL) => Response.json([]))
      vi.stubGlobal('fetch', fetchMock)

      await listGiteeIssues('/repo', {
        q: 'login failure',
        creator: 'alice',
        assignee: 'bob',
        labels: ['bug', 'performance']
      })
      const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
      expect(url.searchParams.get('q')).toBe('login failure')
      expect(url.searchParams.get('creator')).toBe('alice')
      expect(url.searchParams.get('assignee')).toBe('bob')
      expect(url.searchParams.get('labels')).toBe('bug,performance')
    })

    it('serializes page and per_page to the query string', async () => {
      const fetchMock = vi.fn(async (_input: string | URL) => Response.json([rawIssue(5)]))
      vi.stubGlobal('fetch', fetchMock)

      await listGiteeIssues('/repo', { page: 3, perPage: 10 })
      const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
      expect(url.searchParams.get('page')).toBe('3')
      expect(url.searchParams.get('per_page')).toBe('10')
    })

    it('defaults page to 1 when not specified', async () => {
      const fetchMock = vi.fn(async (_input: string | URL) => Response.json([]))
      vi.stubGlobal('fetch', fetchMock)

      await listGiteeIssues('/repo')
      const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
      expect(url.searchParams.get('page')).toBe('1')
    })

    it('returns empty array when repo is not Gitee', async () => {
      gitExecFileAsyncMock.mockResolvedValue({
        stdout: 'https://github.com/team/repo.git\n',
        stderr: ''
      })
      const issues = await listGiteeIssues('/repo')
      expect(issues).toEqual([])
    })

    it('sends Authorization header with token', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_input: string | URL, init?: RequestInit) => {
          expect((init!.headers as Record<string, string>).Authorization).toBe('token gitee-token')
          return Response.json([rawIssue(1)])
        })
      )
      await listGiteeIssues('/repo')
    })
  })

  describe('getGiteeIssue', () => {
    it('fetches a single issue by number', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL) => {
          expect(String(input)).toBe('https://gitee.com/api/v5/repos/team/repo/issues/5')
          return Response.json(rawIssue(5))
        })
      )

      const issue = await getGiteeIssue('/repo', 5)
      expect(issue).toMatchObject({ number: '5', title: 'Issue 5' })
    })

    it('returns null for a 404', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ message: 'not found' }, { status: 404 }))
      )
      await expect(getGiteeIssue('/repo', 99)).resolves.toBeNull()
    })

    it('maps closed state correctly', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json(rawIssue(3, 'closed')))
      )
      const issue = await getGiteeIssue('/repo', 3)
      expect(issue?.state).toBe('closed')
    })
  })

  describe('createGiteeIssue', () => {
    it('posts a new issue and returns the mapped result', async () => {
      const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = new URL(String(input))
        expect(url.pathname).toBe('/api/v5/repos/team/issues')
        expect(init?.method).toBe('POST')
        const sent = JSON.parse(String(init?.body))
        expect(sent.title).toBe('New bug')
        expect(sent.owner).toBe('team')
        expect(sent.repo).toBe('repo')
        return Response.json(rawIssue(10))
      })
      vi.stubGlobal('fetch', fetchMock)

      const issue = await createGiteeIssue('/repo', { title: 'New bug', body: 'Details' })
      expect(issue).toMatchObject({ number: '10' })
    })

    it('serializes labels as comma-separated string', async () => {
      const fetchMock = vi.fn(async (_: unknown, init?: RequestInit) => {
        const sent = JSON.parse(String(init?.body))
        expect(sent.labels).toBe('bug,enhancement')
        return Response.json(rawIssue(11))
      })
      vi.stubGlobal('fetch', fetchMock)

      await createGiteeIssue('/repo', { title: 'Labeled', labels: ['bug', 'enhancement'] })
    })

    it('returns null when the repo is not Gitee', async () => {
      gitExecFileAsyncMock.mockResolvedValue({
        stdout: 'https://github.com/team/repo.git\n',
        stderr: ''
      })
      const result = await createGiteeIssue('/repo', { title: 'X' })
      expect(result).toBeNull()
    })
  })

  describe('updateGiteeIssue', () => {
    it('patches the issue state to closed', async () => {
      const fetchMock = vi.fn(async (_: unknown, init?: RequestInit) => {
        expect(init?.method).toBe('PATCH')
        const sent = JSON.parse(String(init?.body))
        expect(sent.state).toBe('closed')
        return Response.json(rawIssue(7, 'closed'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const issue = await updateGiteeIssue('/repo', 7, { state: 'closed' })
      expect(issue?.state).toBe('closed')
    })

    it('patches the issue state back to open', async () => {
      const fetchMock = vi.fn(async (_: unknown, init?: RequestInit) => {
        const sent = JSON.parse(String(init?.body))
        expect(sent.state).toBe('open')
        return Response.json(rawIssue(7, 'open'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const issue = await updateGiteeIssue('/repo', 7, { state: 'open' })
      expect(issue?.state).toBe('open')
    })
  })

  describe('listGiteeLabels', () => {
    it('returns the repo labels', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL) => {
          expect(String(input)).toBe('https://gitee.com/api/v5/repos/team/repo/labels')
          return Response.json([rawLabel(1, 'bug'), rawLabel(2, 'enhancement')])
        })
      )

      const labels = await listGiteeLabels('/repo')
      expect(labels).toHaveLength(2)
      expect(labels[0]).toMatchObject({ id: 1, name: 'bug', color: '#d73a4a' })
    })

    it('returns empty array on fetch failure', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({}, { status: 500 }))
      )
      await expect(listGiteeLabels('/repo')).resolves.toEqual([])
    })
  })

  describe('listGiteeIssueComments', () => {
    it('returns comments for an issue', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL) => {
          expect(String(input)).toBe('https://gitee.com/api/v5/repos/team/repo/issues/3/comments')
          return Response.json([rawComment(10), rawComment(11)])
        })
      )

      const comments = await listGiteeIssueComments('/repo', 3)
      expect(comments).toHaveLength(2)
      expect(comments[0]).toMatchObject({ id: 10, author: 'bob' })
    })
  })

  describe('addGiteeIssueComment', () => {
    it('posts a comment and returns the mapped result', async () => {
      const fetchMock = vi.fn(async (_: unknown, init?: RequestInit) => {
        expect(init?.method).toBe('POST')
        const sent = JSON.parse(String(init?.body))
        expect(sent.body).toBe('Great work!')
        return Response.json(rawComment(20))
      })
      vi.stubGlobal('fetch', fetchMock)

      const comment = await addGiteeIssueComment('/repo', 3, 'Great work!')
      expect(comment).toMatchObject({ id: 20, author: 'bob' })
    })

    it('returns null when the repo is not Gitee', async () => {
      gitExecFileAsyncMock.mockResolvedValue({
        stdout: 'https://github.com/team/repo.git\n',
        stderr: ''
      })
      const result = await addGiteeIssueComment('/repo', 3, 'Comment')
      expect(result).toBeNull()
    })
  })

  describe('authentication errors', () => {
    it.each([
      [401, 401],
      [403, 403],
      [429, 429]
    ] as const)(
      'surfaces HTTP %i as GiteeIssueApiError with status %i',
      async (status, expectedStatus) => {
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => Response.json({ message: 'error' }, { status }))
        )
        await expect(getGiteeIssue('/repo', 1)).rejects.toMatchObject({
          name: 'GiteeIssueApiError',
          status: expectedStatus
        })
      }
    )

    it('surfaces auth errors on list', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ message: 'Unauthorized' }, { status: 401 }))
      )
      await expect(listGiteeIssues('/repo')).rejects.toBeInstanceOf(GiteeIssueApiError)
    })
  })
})

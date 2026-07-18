import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listGiteeIssuesMock, listGiteePullsMock } = vi.hoisted(() => ({
  listGiteeIssuesMock: vi.fn(),
  listGiteePullsMock: vi.fn()
}))

vi.mock('./client', () => ({
  listGiteeIssues: listGiteeIssuesMock,
  listGiteePulls: listGiteePullsMock
}))

import {
  listGiteeIssuesForTaskPage,
  listGiteePullsForTaskPage,
  type GiteeWorkItem
} from './work-items'

describe('Gitee task-page work-item adapter', () => {
  beforeEach(() => {
    listGiteeIssuesMock.mockReset()
    listGiteePullsMock.mockReset()
  })

  it('maps issues to the unified row shape and forwards pagination', async () => {
    listGiteeIssuesMock.mockResolvedValueOnce([
      {
        number: 12,
        title: 'Keep issue rows simple',
        state: 'closed',
        url: 'https://gitee.com/acme/orca/issues/12',
        labels: ['ui'],
        updatedAt: '2026-07-18T01:00:00Z',
        author: 'alice'
      }
    ])

    const result = await listGiteeIssuesForTaskPage('/repo', {
      state: 'closed',
      page: 2,
      limit: 25,
      repoId: 'repo-1',
      connectionId: 'ssh-1',
      localGitExecOptions: { wslDistro: 'Ubuntu' }
    })

    expect(listGiteeIssuesMock).toHaveBeenCalledWith(
      '/repo',
      { state: 'closed', page: 2, perPage: 25 },
      'ssh-1',
      { localGitExecOptions: { wslDistro: 'Ubuntu' } }
    )
    expect(result).toEqual({
      items: [
        {
          id: 'gitee-issue-repo-1-12',
          type: 'issue',
          number: 12,
          title: 'Keep issue rows simple',
          state: 'closed',
          url: 'https://gitee.com/acme/orca/issues/12',
          labels: ['ui'],
          updatedAt: '2026-07-18T01:00:00Z',
          author: 'alice',
          repoId: 'repo-1'
        }
      ] satisfies GiteeWorkItem[]
    })
  })

  it('maps pull requests to the same row contract', async () => {
    listGiteePullsMock.mockResolvedValueOnce({
      items: [
        {
          number: 7,
          title: 'Add task page rows',
          state: 'draft',
          url: 'https://gitee.com/acme/orca/pulls/7',
          updatedAt: '2026-07-18T02:00:00Z',
          branchName: 'feature/gitee-tasks',
          baseRefName: 'main',
          labels: ['tasks'],
          author: 'bob'
        }
      ]
    })

    const result = await listGiteePullsForTaskPage('/repo', {
      state: 'all',
      page: 3,
      limit: 40,
      repoId: 'repo-2',
      connectionId: 'ssh-2'
    })

    expect(listGiteePullsMock).toHaveBeenCalledWith('/repo', {
      state: 'all',
      page: 3,
      perPage: 40,
      connectionId: 'ssh-2'
    })
    expect(result.items).toEqual([
      {
        id: 'gitee-pr-repo-2-7',
        type: 'pr',
        number: 7,
        title: 'Add task page rows',
        state: 'draft',
        url: 'https://gitee.com/acme/orca/pulls/7',
        labels: ['tasks'],
        updatedAt: '2026-07-18T02:00:00Z',
        author: 'bob',
        branchName: 'feature/gitee-tasks',
        baseRefName: 'main',
        repoId: 'repo-2'
      }
    ] satisfies GiteeWorkItem[])
  })

  it('collapses Gitee-only issue states into the task-page lifecycle', async () => {
    listGiteeIssuesMock.mockResolvedValueOnce([
      {
        number: 20,
        title: 'In progress',
        state: 'progressing',
        url: 'https://gitee.com/acme/orca/issues/20'
      },
      {
        number: 21,
        title: 'Rejected',
        state: 'rejected',
        url: 'https://gitee.com/acme/orca/issues/21'
      }
    ])

    const result = await listGiteeIssuesForTaskPage('/repo')

    expect(result.items.map((item) => item.state)).toEqual(['open', 'closed'])
  })

  it('accepts issue client envelopes and preserves classified errors', async () => {
    listGiteeIssuesMock.mockResolvedValueOnce({
      items: [],
      error: { type: 'authentication', message: 'Set ORCA_GITEE_TOKEN' }
    })

    await expect(listGiteeIssuesForTaskPage('/repo')).resolves.toEqual({
      items: [],
      error: { type: 'authentication', message: 'Set ORCA_GITEE_TOKEN' }
    })
  })

  it('preserves pull-list errors while keeping any usable rows', async () => {
    listGiteePullsMock.mockResolvedValueOnce({
      items: [
        {
          number: 8,
          title: 'Still usable',
          state: 'open',
          url: 'https://gitee.com/acme/orca/pulls/8',
          updatedAt: ''
        }
      ],
      error: { type: 'rate_limited', message: 'Try again later' }
    })

    await expect(listGiteePullsForTaskPage('/repo', { repoId: 'repo-3' })).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'gitee-pr-repo-3-8',
          type: 'pr',
          labels: [],
          author: null
        })
      ],
      error: { type: 'rate_limited', message: 'Try again later' }
    })
  })

  it('normalizes unsafe page sizes before calling either client', async () => {
    listGiteeIssuesMock.mockResolvedValueOnce([])
    listGiteePullsMock.mockResolvedValueOnce({ items: [] })

    await listGiteeIssuesForTaskPage('/repo', { page: 0, limit: 10_000 })
    await listGiteePullsForTaskPage('/repo', { page: Number.NaN, limit: -5 })

    expect(listGiteeIssuesMock).toHaveBeenCalledWith(
      '/repo',
      { state: 'open', page: 1, perPage: 50 },
      undefined,
      {}
    )
    expect(listGiteePullsMock).toHaveBeenCalledWith('/repo', {
      state: 'open',
      page: 1,
      perPage: 1
    })
  })

  it('converts client failures into renderer-safe error envelopes', async () => {
    listGiteeIssuesMock.mockRejectedValueOnce(new Error('HTTP 401'))
    listGiteePullsMock.mockRejectedValueOnce('network unavailable')

    await expect(listGiteeIssuesForTaskPage('/repo')).resolves.toEqual({
      items: [],
      error: { type: 'unknown', message: 'HTTP 401' }
    })
    await expect(listGiteePullsForTaskPage('/repo')).resolves.toEqual({
      items: [],
      error: { type: 'unknown', message: 'network unavailable' }
    })
  })
})

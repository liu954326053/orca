import { describe, expect, it } from 'vitest'

import {
  mergeGiteeTaskPageRepoResults,
  toGiteeIssueTaskPageItem,
  toGiteePullTaskPageItem
} from './task-page-gitee-items'

describe('task-page-gitee-items', () => {
  it('normalizes issue and pull payloads for the shared list', () => {
    expect(
      toGiteeIssueTaskPageItem('repo-a', {
        number: 12,
        title: 'Issue title',
        state: 'open',
        url: 'https://gitee.com/acme/orca/issues/I12',
        labels: ['bug'],
        body: '',
        updatedAt: '2026-07-18T09:00:00Z',
        author: 'magic'
      })
    ).toMatchObject({
      id: 'gitee-issue-repo-a-12',
      repoId: 'repo-a',
      type: 'issue',
      number: 12,
      labels: ['bug'],
      author: 'magic'
    })

    expect(
      toGiteeIssueTaskPageItem('repo-a', {
        number: 13,
        title: 'Rejected issue',
        state: 'rejected',
        url: 'https://gitee.com/acme/orca/issues/I13',
        labels: [],
        body: '',
        updatedAt: '2026-07-18T09:30:00Z',
        author: null
      }).state
    ).toBe('closed')

    expect(
      toGiteePullTaskPageItem('repo-a', {
        number: 34,
        title: 'PR title',
        state: 'draft',
        url: 'https://gitee.com/acme/orca/pulls/34',
        updatedAt: '2026-07-18T10:00:00Z'
      })
    ).toMatchObject({
      id: 'gitee-pr-repo-a-34',
      repoId: 'repo-a',
      type: 'pr',
      number: 34,
      state: 'draft',
      labels: []
    })
  })

  it('sorts cross-repo rows and suppresses non-Gitee repositories', () => {
    const merged = mergeGiteeTaskPageRepoResults([
      {
        repoId: 'repo-a',
        items: [
          {
            id: 'gitee-issue-repo-a-1',
            repoId: 'repo-a',
            type: 'issue',
            number: 1,
            title: 'Older',
            state: 'open',
            url: 'https://gitee.com/acme/a/issues/I1',
            labels: [],
            updatedAt: '2026-07-17T10:00:00Z',
            author: null
          }
        ]
      },
      {
        repoId: 'repo-b',
        items: [
          {
            id: 'gitee-issue-repo-b-2',
            repoId: 'repo-b',
            type: 'issue',
            number: 2,
            title: 'Newer',
            state: 'open',
            url: 'https://gitee.com/acme/b/issues/I2',
            labels: [],
            updatedAt: '2026-07-18T10:00:00Z',
            author: null
          }
        ]
      },
      {
        repoId: 'repo-c',
        items: [],
        error: { type: 'not_found', message: 'Not a Gitee repository' }
      }
    ])

    expect(merged.items.map((item) => item.number)).toEqual([2, 1])
    expect(merged.error).toBeNull()
  })

  it('keeps working rows on partial failure and reports an all-source failure', () => {
    const partial = mergeGiteeTaskPageRepoResults([
      {
        repoId: 'repo-a',
        items: [
          {
            id: 'gitee-pr-repo-a-8',
            repoId: 'repo-a',
            type: 'pr',
            number: 8,
            title: 'Working row',
            state: 'open',
            url: 'https://gitee.com/acme/a/pulls/8',
            labels: [],
            updatedAt: '2026-07-18T10:00:00Z',
            author: null
          }
        ]
      },
      {
        repoId: 'repo-b',
        items: [],
        error: { type: 'auth', message: 'Authentication failed' }
      }
    ])
    expect(partial.items).toHaveLength(1)
    expect(partial.error).toBeNull()

    const failed = mergeGiteeTaskPageRepoResults([
      {
        repoId: 'repo-b',
        items: [],
        error: { type: 'auth', message: 'Authentication failed' }
      }
    ])
    expect(failed).toEqual({ items: [], error: 'Authentication failed' })
  })
})

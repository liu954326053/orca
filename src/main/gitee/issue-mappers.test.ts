import { describe, expect, it } from 'vitest'
import {
  mapGiteeIssue,
  mapGiteeIssueComment,
  mapGiteeIssueState,
  mapGiteeLabel
} from './issue-mappers'

describe('Gitee issue mappers', () => {
  it('maps issue fields including Gitee-only states and skips PRs', () => {
    expect(mapGiteeIssueState('progressing')).toBe('progressing')
    expect(
      mapGiteeIssue({
        number: 3,
        title: 'Bug',
        state: 'progressing',
        html_url: 'https://gitee.com/team/repo/issues/3',
        body: 'details',
        labels: [{ id: 1, name: 'bug' }, 'docs'],
        user: { login: 'alice' },
        updated_at: '2026-07-17T00:00:00Z'
      })
    ).toEqual({
      number: '3',
      title: 'Bug',
      state: 'progressing',
      url: 'https://gitee.com/team/repo/issues/3',
      labels: ['bug', 'docs'],
      body: 'details',
      updatedAt: '2026-07-17T00:00:00Z',
      author: 'alice'
    })

    // Why: real Gitee repos often use alphanumeric public issue numbers.
    expect(
      mapGiteeIssue({
        number: 'IK1X2N',
        title: '测试issue',
        state: 'open',
        html_url: 'https://gitee.com/xhh936/content-management/issues/IK1X2N',
        body: '测试issue',
        updated_at: '2026-07-18T00:00:00Z',
        user: { login: 'xhh936' },
        pull_request: null
      })
    ).toMatchObject({
      number: 'IK1X2N',
      title: '测试issue',
      state: 'open'
    })

    expect(
      mapGiteeIssue({
        number: 9,
        title: 'PR as issue',
        html_url: 'https://gitee.com/team/repo/pulls/9',
        pull_request: {}
      })
    ).toBeNull()
  })

  it('maps labels and comments', () => {
    expect(mapGiteeLabel({ id: 9, name: 'docs', color: '#fff' })).toEqual({
      id: 9,
      name: 'docs',
      color: '#fff'
    })
    expect(
      mapGiteeIssueComment({
        id: 11,
        body: 'looks good',
        user: { login: 'bob' },
        created_at: '2026-07-17T01:00:00Z'
      })
    ).toEqual({
      id: 11,
      body: 'looks good',
      author: 'bob',
      createdAt: '2026-07-17T01:00:00Z',
      updatedAt: '2026-07-17T01:00:00Z'
    })
  })
})

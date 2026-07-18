import { describe, expect, it } from 'vitest'
import {
  mapGiteeMergeable,
  mapGiteePullRequest,
  mapGiteePullRequestState,
  matchesGiteeBranch
} from './pull-request-mappers'

describe('Gitee pull request mappers', () => {
  it('maps open, draft, closed, and merged pull request states', () => {
    expect(mapGiteePullRequestState({ state: 'open' })).toBe('open')
    expect(mapGiteePullRequestState({ state: 'open', draft: true })).toBe('draft')
    expect(mapGiteePullRequestState({ state: 'closed', draft: true })).toBe('closed')
    expect(mapGiteePullRequestState({ state: 'closed', merged_at: '2026-07-17T00:00:00Z' })).toBe(
      'merged'
    )
  })

  it('maps mergeability', () => {
    expect(mapGiteeMergeable(true)).toBe('MERGEABLE')
    expect(mapGiteeMergeable(false)).toBe('CONFLICTING')
    expect(mapGiteeMergeable(null)).toBe('UNKNOWN')
  })

  it('maps the Gitee API payload to the hosted review shape', () => {
    expect(
      mapGiteePullRequest({
        number: 12,
        title: 'Add Gitee',
        state: 'open',
        html_url: 'https://gitee.com/team/project/pulls/12',
        updated_at: '2026-07-17T00:00:00Z',
        mergeable: true,
        head: { sha: 'abc123' }
      })
    ).toEqual({
      number: 12,
      title: 'Add Gitee',
      state: 'open',
      url: 'https://gitee.com/team/project/pulls/12',
      status: 'neutral',
      updatedAt: '2026-07-17T00:00:00Z',
      mergeable: 'MERGEABLE',
      headSha: 'abc123'
    })
  })

  it('rejects incomplete pull request payloads', () => {
    expect(mapGiteePullRequest({ number: 12, title: 'Missing URL' })).toBeNull()
    expect(
      mapGiteePullRequest({ number: 12, html_url: 'https://gitee.com/team/project/pulls/12' })
    ).toBeNull()
  })

  it('matches source branches by ref and owner-prefixed label', () => {
    expect(matchesGiteeBranch({ head: { ref: 'feature/ref' } }, 'feature/ref')).toBe(true)
    expect(matchesGiteeBranch({ head: { label: 'team:feature/label' } }, 'feature/label')).toBe(
      true
    )
    expect(matchesGiteeBranch({ head: { ref: 'feature/other' } }, 'feature/missing')).toBe(false)
  })
})

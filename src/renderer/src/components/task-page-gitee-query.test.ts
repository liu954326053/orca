import { describe, expect, it } from 'vitest'

import {
  getGiteeIssueRequestStates,
  getGiteePullRequestState,
  normalizeGiteeSearchQuery
} from './task-page-gitee-query'

describe('TaskPage Gitee query planning', () => {
  it('includes progressing issues in the open filter', () => {
    expect(getGiteeIssueRequestStates('open')).toEqual(['open', 'progressing'])
  })

  it('keeps all and explicit issue states as single server requests', () => {
    expect(getGiteeIssueRequestStates('all')).toEqual(['all'])
    expect(getGiteeIssueRequestStates('progressing')).toEqual(['progressing'])
    expect(getGiteeIssueRequestStates('closed')).toEqual(['closed'])
  })

  it('repairs the issue-only state before requesting pull requests', () => {
    expect(getGiteePullRequestState('progressing')).toBe('open')
    expect(getGiteePullRequestState('all')).toBe('all')
    expect(getGiteePullRequestState('closed')).toBe('closed')
  })

  it('trims keyword queries and omits blank values', () => {
    expect(normalizeGiteeSearchQuery('  login bug  ')).toBe('login bug')
    expect(normalizeGiteeSearchQuery('   ')).toBeUndefined()
  })
})

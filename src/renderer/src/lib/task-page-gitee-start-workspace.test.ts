import { describe, expect, it } from 'vitest'
import type { Worktree } from '../../../shared/types'
import {
  resolveGiteeStartWorkspaceAction,
  resolveGiteeWorkItemExternalUrl
} from './task-page-gitee-start-workspace'

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'repo::/path/wt',
    repoId: 'repo-gitee',
    displayName: 'existing',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    linkedGiteePR: null,
    linkedGiteeIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    path: '/path/wt',
    head: 'abc',
    branch: 'refs/heads/feature',
    isBare: false,
    isMainWorktree: false,
    ...overrides
  }
}

const issue = {
  type: 'issue' as const,
  number: 'IK1X2N',
  title: 'Broken CI',
  url: 'https://gitee.com/acme/app/issues/IK1X2N',
  repoId: 'repo-gitee'
}

const pull = {
  type: 'pr' as const,
  number: 8,
  title: 'Ship fix',
  url: 'https://gitee.com/acme/app/pulls/8',
  repoId: 'repo-gitee'
}

describe('resolveGiteeStartWorkspaceAction', () => {
  it('resumes when linkedGiteeIssue already exists on a worktree', () => {
    const action = resolveGiteeStartWorkspaceAction({
      item: issue,
      worktrees: [makeWorktree({ id: 'wt-issue', linkedGiteeIssue: 'IK1X2N' })]
    })
    expect(action).toEqual({ kind: 'resume', worktreeId: 'wt-issue' })
  })

  it('starts composer with linkedGitee metadata when no attachment exists', () => {
    const action = resolveGiteeStartWorkspaceAction({
      item: pull,
      worktrees: [makeWorktree({ linkedGiteePR: 99 })],
      taskSourceContext: {
        kind: 'task-source',
        provider: 'gitee',
        projectId: 'project-1',
        hostId: 'local',
        repoId: 'repo-gitee'
      }
    })
    expect(action.kind).toBe('start')
    if (action.kind !== 'start') {
      return
    }
    expect(action.payload.linkedWorkItem).toMatchObject({
      provider: 'gitee',
      type: 'pr',
      number: 8,
      url: pull.url
    })
    expect(action.payload.initialRepoId).toBe('repo-gitee')
    expect(action.payload.prefilledName).toContain('pr-8')
  })

  it('does not resume GitHub linkedIssue with the same number', () => {
    const action = resolveGiteeStartWorkspaceAction({
      item: issue,
      worktrees: [makeWorktree({ linkedIssue: 15, linkedGiteeIssue: null })]
    })
    expect(action.kind).toBe('start')
  })
})

describe('resolveGiteeWorkItemExternalUrl', () => {
  it('returns trimmed html_url for browser open', () => {
    expect(resolveGiteeWorkItemExternalUrl({ url: '  https://gitee.com/a/b/issues/1  ' })).toBe(
      'https://gitee.com/a/b/issues/1'
    )
    expect(resolveGiteeWorkItemExternalUrl({ url: '   ' })).toBeNull()
  })
})

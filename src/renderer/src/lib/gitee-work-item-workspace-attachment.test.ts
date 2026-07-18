import { describe, expect, it } from 'vitest'
import type { Worktree } from '../../../shared/types'
import {
  findGiteeWorkItemWorkspaceAttachment,
  getGiteeWorkItemWorkspaceAttachmentLabel,
  getGiteeWorkItemWorkspaceSeed
} from './gitee-work-item-workspace-attachment'

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'repo::/path/wt',
    repoId: 'repo-1',
    displayName: '',
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

describe('findGiteeWorkItemWorkspaceAttachment', () => {
  it('matches linkedGiteeIssue for issues without touching linkedIssue', () => {
    const worktrees = [
      makeWorktree({ id: 'a', linkedIssue: 9, linkedGiteeIssue: 9 }),
      makeWorktree({ id: 'b', linkedIssue: 42, linkedGiteeIssue: null })
    ]

    expect(findGiteeWorkItemWorkspaceAttachment(worktrees, 'repo-1', 'issue', 9)?.id).toBe('a')
    expect(findGiteeWorkItemWorkspaceAttachment(worktrees, 'repo-1', 'issue', 42)).toBeNull()
  })

  it('matches linkedGiteePR for pull requests without touching linkedPR', () => {
    const worktrees = [
      makeWorktree({ id: 'pr', linkedPR: 7, linkedGiteePR: 7 }),
      makeWorktree({ id: 'gh', linkedPR: 7, linkedGiteePR: null })
    ]

    expect(findGiteeWorkItemWorkspaceAttachment(worktrees, 'repo-1', 'pr', 7)?.id).toBe('pr')
  })

  it('ignores archived worktrees and other repos', () => {
    const worktrees = [
      makeWorktree({ id: 'archived', linkedGiteeIssue: 3, isArchived: true }),
      makeWorktree({ id: 'other', repoId: 'repo-2', linkedGiteeIssue: 3 })
    ]

    expect(findGiteeWorkItemWorkspaceAttachment(worktrees, 'repo-1', 'issue', 3)).toBeNull()
  })
})

describe('gitee work item attachment labels and seeds', () => {
  it('prefers displayName then branch then path basename', () => {
    expect(
      getGiteeWorkItemWorkspaceAttachmentLabel(
        makeWorktree({ displayName: 'My Workspace', branch: 'refs/heads/feature' })
      )
    ).toBe('My Workspace')
    expect(
      getGiteeWorkItemWorkspaceAttachmentLabel(makeWorktree({ displayName: '', branch: 'refs/heads/feature' }))
    ).toBe('feature')
  })

  it('builds a readable workspace seed', () => {
    expect(getGiteeWorkItemWorkspaceSeed({ type: 'issue', number: 12, title: 'Fix login' })).toBe(
      'issue-12-Fix login'
    )
    expect(getGiteeWorkItemWorkspaceSeed({ type: 'pr', number: 4, title: '  ' })).toBe('pr-4')
  })
})

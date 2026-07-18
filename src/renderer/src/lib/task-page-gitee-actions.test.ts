import { describe, expect, it, vi } from 'vitest'
import {
  applyGiteeStartWorkspaceAction,
  createGiteeTaskPageActions,
  openGiteeWorkItemInBrowser
} from './task-page-gitee-actions'
import type { Worktree } from '../../../shared/types'

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'wt-1',
    repoId: 'repo-gitee',
    displayName: 'wt',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    linkedGiteeIssue: 22,
    linkedGiteePR: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    path: '/p',
    head: 'h',
    branch: 'refs/heads/main',
    isBare: false,
    isMainWorktree: false,
    ...overrides
  }
}

describe('createGiteeTaskPageActions', () => {
  it('resumes attached issue worktrees and starts when missing', () => {
    const actions = createGiteeTaskPageActions({
      worktrees: [makeWorktree()],
      getTaskSourceContext: () => null
    })
    expect(
      actions.startOrResume({
        type: 'issue',
        number: 22,
        title: 'x',
        url: 'https://gitee.com/a/b/issues/22',
        repoId: 'repo-gitee'
      })
    ).toEqual({ kind: 'resume', worktreeId: 'wt-1' })
    expect(
      actions.startOrResume({
        type: 'pr',
        number: 3,
        title: 'y',
        url: 'https://gitee.com/a/b/pulls/3',
        repoId: 'repo-gitee'
      }).kind
    ).toBe('start')
  })
})

describe('applyGiteeStartWorkspaceAction / openGiteeWorkItemInBrowser', () => {
  it('activates resume targets and opens composer for start', async () => {
    const activate = vi.fn()
    const openComposer = vi.fn()
    await applyGiteeStartWorkspaceAction(
      { kind: 'resume', worktreeId: 'wt-1' },
      { activateAndRevealWorktree: activate, openComposer }
    )
    expect(activate).toHaveBeenCalledWith('wt-1')
    await applyGiteeStartWorkspaceAction(
      {
        kind: 'start',
        payload: {
          linkedWorkItem: {
            type: 'issue',
            provider: 'gitee',
            number: 1,
            title: 't',
            url: 'https://gitee.com/a/b/issues/1'
          },
          prefilledName: 'issue-1-t',
          initialRepoId: 'repo-gitee',
          telemetrySource: 'sidebar'
        }
      },
      { activateAndRevealWorktree: activate, openComposer }
    )
    expect(openComposer).toHaveBeenCalled()
  })

  it('opens html_url in the browser when present', async () => {
    const openUrl = vi.fn()
    expect(
      await openGiteeWorkItemInBrowser({ url: 'https://gitee.com/a/b/issues/1' }, openUrl)
    ).toBe(true)
    expect(openUrl).toHaveBeenCalledWith('https://gitee.com/a/b/issues/1')
    expect(await openGiteeWorkItemInBrowser({ url: '' }, openUrl)).toBe(false)
  })
})

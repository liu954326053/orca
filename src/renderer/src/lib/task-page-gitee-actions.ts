import type { TaskSourceContext } from '../../../shared/task-source-context'
import type { Worktree } from '../../../shared/types'
import {
  resolveGiteeStartWorkspaceAction,
  resolveGiteeWorkItemExternalUrl,
  type GiteeStartWorkspaceAction
} from './task-page-gitee-start-workspace'
import type { GiteeTaskWorkItem } from './gitee-work-item-workspace-attachment'

export type GiteeTaskPageActions = {
  /** Start composer or resume an attached worktree for a Gitee issue/PR row. */
  startOrResume: (item: GiteeTaskWorkItem) => GiteeStartWorkspaceAction
  /** Prefer external browser for detail (html_url); no dialog required. */
  openInBrowser: (item: Pick<GiteeTaskWorkItem, 'url'>) => string | null
}

/**
 * TaskPage Gitee Start/detail actions for list row wiring (dev 7/9 shell).
 * Start writes linkedGiteeIssue / linkedGiteePR via the composer seed path.
 */
export function createGiteeTaskPageActions(args: {
  worktrees: readonly Worktree[]
  getTaskSourceContext: (repoId: string) => TaskSourceContext | null
}): GiteeTaskPageActions {
  return {
    startOrResume: (item) =>
      resolveGiteeStartWorkspaceAction({
        item,
        worktrees: args.worktrees,
        taskSourceContext: args.getTaskSourceContext(item.repoId)
      }),
    openInBrowser: (item) => resolveGiteeWorkItemExternalUrl(item)
  }
}

export async function applyGiteeStartWorkspaceAction(
  action: GiteeStartWorkspaceAction,
  deps: {
    activateAndRevealWorktree: (worktreeId: string) => void | Promise<void>
    openComposer: (payload: Extract<GiteeStartWorkspaceAction, { kind: 'start' }>['payload']) => void
    recordFeatureInteraction?: (feature: string) => void
  }
): Promise<void> {
  deps.recordFeatureInteraction?.('gitee-tasks')
  if (action.kind === 'resume') {
    await deps.activateAndRevealWorktree(action.worktreeId)
    return
  }
  deps.openComposer(action.payload)
}

export async function openGiteeWorkItemInBrowser(
  item: Pick<GiteeTaskWorkItem, 'url'>,
  openUrl: (url: string) => void | Promise<void>
): Promise<boolean> {
  const url = resolveGiteeWorkItemExternalUrl(item)
  if (!url) {
    return false
  }
  await openUrl(url)
  return true
}

import type { TaskSourceContext } from '../../../shared/task-source-context'
import type { Worktree } from '../../../shared/types'
import {
  findGiteeWorkItemWorkspaceAttachment,
  getGiteeWorkItemWorkspaceSeed,
  type GiteeTaskWorkItem
} from './gitee-work-item-workspace-attachment'
import type { LinkedWorkItemSummary } from './new-workspace'

export type GiteeStartWorkspaceComposerPayload = {
  linkedWorkItem: LinkedWorkItemSummary
  taskSourceContext?: TaskSourceContext | null
  prefilledName: string
  initialRepoId: string
  telemetrySource: 'sidebar'
}

export type GiteeStartWorkspaceAction =
  | { kind: 'resume'; worktreeId: string }
  | { kind: 'start'; payload: GiteeStartWorkspaceComposerPayload }

/**
 * Prefer resuming an already-linked worktree; otherwise open the composer
 * with Gitee-linked metadata so create writes linkedGiteeIssue / linkedGiteePR.
 */
export function resolveGiteeStartWorkspaceAction(args: {
  item: GiteeTaskWorkItem
  worktrees: readonly Worktree[]
  taskSourceContext?: TaskSourceContext | null
}): GiteeStartWorkspaceAction {
  const attached = findGiteeWorkItemWorkspaceAttachment(
    args.worktrees,
    args.item.repoId,
    args.item.type,
    args.item.number
  )
  if (attached) {
    return { kind: 'resume', worktreeId: attached.id }
  }

  return {
    kind: 'start',
    payload: {
      linkedWorkItem: {
        type: args.item.type,
        provider: 'gitee',
        number: args.item.number,
        title: args.item.title,
        url: args.item.url,
        repoId: args.item.repoId
      },
      taskSourceContext: args.taskSourceContext ?? null,
      prefilledName: getGiteeWorkItemWorkspaceSeed(args.item),
      initialRepoId: args.item.repoId,
      telemetrySource: 'sidebar'
    }
  }
}

/** Prefer opening the provider HTML URL in the system browser (no full dialog required). */
export function resolveGiteeWorkItemExternalUrl(item: Pick<GiteeTaskWorkItem, 'url'>): string | null {
  const url = item.url?.trim()
  return url || null
}

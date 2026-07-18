import type { Worktree } from '../../../shared/types'
import { basename } from './path'

export type GiteeWorkItemType = 'issue' | 'pr'

export type GiteeTaskWorkItem = {
  type: GiteeWorkItemType
  // Why: Gitee issue numbers are alphanumeric public ids (e.g. IK1X2N) while PRs
  // are integers, matching Worktree.linkedGiteeIssue's string | number contract.
  number: string | number
  title: string
  url: string
  repoId: string
}

export function findGiteeWorkItemWorkspaceAttachment(
  worktrees: readonly Worktree[],
  repoId: string | null | undefined,
  type: GiteeWorkItemType,
  number: string | number
): Worktree | null {
  if (!repoId) {
    return null
  }

  return (
    worktrees.find((worktree) => {
      if (worktree.repoId !== repoId || worktree.isArchived) {
        return false
      }

      return type === 'pr'
        ? worktree.linkedGiteePR === number
        : worktree.linkedGiteeIssue === number
    }) ?? null
  )
}

export function getGiteeWorkItemWorkspaceAttachmentLabel(worktree: Worktree): string {
  const displayName = worktree.displayName.trim()
  if (displayName) {
    return displayName
  }

  const branch = getBranchLabel(worktree.branch)
  if (branch) {
    return branch
  }

  return basename(worktree.path) || worktree.path
}

export function getGiteeWorkItemWorkspaceSeed(item: Pick<GiteeTaskWorkItem, 'type' | 'number' | 'title'>): string {
  const kind = item.type === 'pr' ? 'pr' : 'issue'
  const title = item.title.trim()
  return title ? `${kind}-${item.number}-${title}` : `${kind}-${item.number}`
}

function getBranchLabel(branch: string | null | undefined): string | null {
  const trimmed = branch?.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.startsWith('refs/heads/')) {
    return trimmed.slice('refs/heads/'.length)
  }

  return trimmed
}

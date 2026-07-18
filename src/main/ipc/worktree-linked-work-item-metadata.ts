import type { Worktree, WorktreeMeta } from '../../shared/types'

type LinkedWorkItemMetadata = Pick<
  Worktree,
  | 'linkedGitLabMR'
  | 'linkedGitLabIssue'
  | 'linkedBitbucketPR'
  | 'linkedAzureDevOpsPR'
  | 'linkedGiteaPR'
  | 'linkedGiteePR'
  | 'linkedGiteeIssue'
>

export function getLinkedWorkItemMetadata(meta: WorktreeMeta | undefined): LinkedWorkItemMetadata {
  return {
    linkedGitLabMR: meta?.linkedGitLabMR ?? null,
    linkedGitLabIssue: meta?.linkedGitLabIssue ?? null,
    linkedBitbucketPR: meta?.linkedBitbucketPR ?? null,
    linkedAzureDevOpsPR: meta?.linkedAzureDevOpsPR ?? null,
    linkedGiteaPR: meta?.linkedGiteaPR ?? null,
    linkedGiteePR: meta?.linkedGiteePR ?? null,
    linkedGiteeIssue: meta?.linkedGiteeIssue ?? null
  }
}

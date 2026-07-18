export type GiteeTaskPageMode = 'issues' | 'prs'
// Why: `progressing` mirrors Gitee's 进行中 issue state. It only applies to
// issues, so PR mode narrows the visible filters back to open/closed/all.
export type GiteeTaskPageState = 'open' | 'progressing' | 'closed' | 'all'

export type GiteeTaskPageItem = {
  id: string
  repoId: string
  type: 'issue' | 'pr'
  /** Issue public id (string) or PR integer number. */
  number: string | number
  title: string
  state: 'open' | 'closed' | 'merged' | 'draft'
  url: string
  labels: string[]
  updatedAt: string
  author: string | null
}

export type GiteeIssueTaskPayload = {
  number: string | number
  title: string
  state: 'open' | 'closed' | 'progressing' | 'rejected'
  url: string
  labels: string[]
  body: string
  updatedAt: string
  author: string | null
}

export type GiteePullTaskPayload = {
  number: number
  title: string
  state: 'open' | 'closed' | 'merged' | 'draft'
  url: string
  updatedAt: string
}

export type GiteeTaskPageRepoResult = {
  repoId: string
  items: GiteeTaskPageItem[]
  error?: { type?: string; message: string }
}

export function toGiteeIssueTaskPageItem(
  repoId: string,
  issue: GiteeIssueTaskPayload
): GiteeTaskPageItem {
  return {
    id: `gitee-issue-${repoId}-${issue.number}`,
    repoId,
    type: 'issue',
    number: issue.number,
    title: issue.title,
    state: issue.state === 'closed' || issue.state === 'rejected' ? 'closed' : 'open',
    url: issue.url,
    labels: issue.labels,
    updatedAt: issue.updatedAt,
    author: issue.author
  }
}

export function toGiteePullTaskPageItem(
  repoId: string,
  pull: GiteePullTaskPayload
): GiteeTaskPageItem {
  return {
    id: `gitee-pr-${repoId}-${pull.number}`,
    repoId,
    type: 'pr',
    number: pull.number,
    title: pull.title,
    state: pull.state,
    url: pull.url,
    labels: [],
    updatedAt: pull.updatedAt,
    author: null
  }
}

export function mergeGiteeTaskPageRepoResults(results: readonly GiteeTaskPageRepoResult[]): {
  items: GiteeTaskPageItem[]
  error: string | null
} {
  const items: GiteeTaskPageItem[] = []
  const errors: string[] = []

  for (const result of results) {
    items.push(...result.items)
    if (result.error && result.error.type !== 'not_found') {
      errors.push(result.error.message)
    }
  }

  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  // Why: mixed repo selections commonly include another forge. Only block the
  // list when every selected Gitee source failed and no useful rows survived.
  return { items, error: items.length === 0 ? (errors[0] ?? null) : null }
}

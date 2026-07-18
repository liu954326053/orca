import type { CheckStatus, PRMergeableState } from '../../shared/types'

export type RawGiteePullRequest = {
  number?: number
  title?: string
  state?: string | null
  html_url?: string | null
  updated_at?: string | null
  merged_at?: string | null
  draft?: boolean | null
  mergeable?: boolean | null
  head?: {
    ref?: string | null
    label?: string | null
    sha?: string | null
  } | null
}

export type GiteePullRequestInfo = {
  number: number
  title: string
  state: 'open' | 'closed' | 'merged' | 'draft'
  url: string
  status: CheckStatus
  updatedAt: string
  mergeable: PRMergeableState
  headSha?: string
}

export function mapGiteePullRequestState(
  raw: Pick<RawGiteePullRequest, 'draft' | 'merged_at' | 'state'>
): GiteePullRequestInfo['state'] {
  if (raw.merged_at) {
    return 'merged'
  }
  // Closed Gitee PRs can still carry draft-like flags; terminal state should win.
  if (raw.state?.trim().toLowerCase() === 'closed') {
    return 'closed'
  }
  if (raw.draft) {
    return 'draft'
  }
  return 'open'
}

export function mapGiteeMergeable(value: boolean | null | undefined): PRMergeableState {
  if (value === true) {
    return 'MERGEABLE'
  }
  if (value === false) {
    return 'CONFLICTING'
  }
  return 'UNKNOWN'
}

export function mapGiteePullRequest(raw: RawGiteePullRequest): GiteePullRequestInfo | null {
  if (typeof raw.number !== 'number' || !raw.title || !raw.html_url) {
    return null
  }
  const headSha = raw.head?.sha?.trim()
  return {
    number: raw.number,
    title: raw.title,
    state: mapGiteePullRequestState(raw),
    url: raw.html_url,
    // Why: Gitee does not expose a GitHub-style combined commit status in the
    // PR payload; keep neutral until a dedicated checks path exists.
    status: 'neutral',
    updatedAt: raw.updated_at ?? '',
    mergeable: mapGiteeMergeable(raw.mergeable),
    ...(headSha ? { headSha } : {})
  }
}

export function matchesGiteeBranch(raw: RawGiteePullRequest, branchName: string): boolean {
  const ref = raw.head?.ref?.trim()
  if (ref === branchName) {
    return true
  }
  const label = raw.head?.label?.trim()
  return label === branchName || label?.endsWith(`:${branchName}`) === true
}

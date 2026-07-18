// Query planning for the Gitee Tasks filter. Gitee's issue lifecycle has four
// states (open/progressing/closed/rejected); the UI exposes open/closed/all
// plus explicit progressing, so this module translates a filter selection into
// the concrete server requests each list endpoint understands.

/** Filter selection exposed by the Gitee Tasks toolbar. */
export type GiteeIssueFilterState = 'open' | 'closed' | 'all' | 'progressing'

/** State value the Gitee pull-request list endpoint accepts. */
export type GiteePullRequestListState = 'open' | 'closed' | 'all'

/**
 * Issue states to request for a filter selection. "Open" fans out to include
 * Gitee's active `progressing` state so in-progress issues surface under Open;
 * every other selection maps to a single server request.
 */
export function getGiteeIssueRequestStates(state: GiteeIssueFilterState): GiteeIssueFilterState[] {
  if (state === 'open') {
    return ['open', 'progressing']
  }
  return [state]
}

/**
 * Repair an issue-only filter selection into a state the PR list endpoint
 * accepts. Gitee PRs have no `progressing` state, so it collapses to `open`.
 */
export function getGiteePullRequestState(state: GiteeIssueFilterState): GiteePullRequestListState {
  if (state === 'progressing' || state === 'open') {
    return 'open'
  }
  return state
}

/** Trim a keyword query, omitting it entirely when only whitespace remains. */
export function normalizeGiteeSearchQuery(query: string): string | undefined {
  const trimmed = query.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

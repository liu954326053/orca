export function normalizeHostedReviewHeadRef(ref: string): string {
  return ref
    .trim()
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/remotes\/[^/]+\//, '')
}

export function normalizeHostedReviewBaseRef(ref: string): string {
  const normalized = normalizeHostedReviewHeadRef(ref)
  return normalized.replace(/^(origin|upstream)\//, '')
}

/**
 * Compare local/UI branch names that may come from different tools.
 * Why: some IDEs/checkouts materialize local branches as `origin/feature` while
 * Orca UI and forge APIs talk about `feature`. Treat those as the same identity
 * for create-PR preflight so users do not have to rename local branches.
 */
export function normalizeHostedReviewBranchIdentity(ref: string): string {
  let normalized = normalizeHostedReviewHeadRef(ref)
  // Strip one common remote prefix; keep any remaining path (e.g. feature/foo).
  normalized = normalized.replace(/^(origin|upstream)\//, '')
  return normalized
}

export function hostedReviewBranchNamesMatch(left: string, right: string): boolean {
  const a = left.trim()
  const b = right.trim()
  if (!a || !b) {
    return false
  }
  if (a === b) {
    return true
  }
  const identityA = normalizeHostedReviewBranchIdentity(a)
  const identityB = normalizeHostedReviewBranchIdentity(b)
  return (
    identityA === identityB ||
    a === identityB ||
    b === identityA ||
    identityA === b ||
    identityB === a
  )
}

/**
 * Resolve the branch name to send to forge create APIs.
 * Prefer the upstream remote branch short name when available
 * (`origin/dev-client` upstream → `dev-client`, or
 * `origin/origin/dev-client` → `origin/dev-client` when that is the remote ref).
 * Fall back to identity normalization of the local branch name.
 */
export function resolveHostedReviewApiHeadRef(
  localBranch: string,
  upstreamName?: string | null
): string {
  const upstream = upstreamName?.trim() ?? ''
  if (upstream) {
    const slash = upstream.indexOf('/')
    if (slash > 0 && slash < upstream.length - 1) {
      return upstream.slice(slash + 1)
    }
  }
  const identity = normalizeHostedReviewBranchIdentity(localBranch)
  return identity || localBranch.trim()
}

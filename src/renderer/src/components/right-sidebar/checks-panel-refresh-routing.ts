import type { HostedReviewProvider } from '../../../../shared/hosted-review'

/**
 * Which refresh mechanism the Checks panel must drive for the active context.
 * - `github`: the GitHub-only path (fetchPRForBranch + fetchPRChecks/Comments).
 * - `gitlab`: the GitLab MR path (hosted-review card + GitLab detail fetch).
 * - `hosted-review`: the provider-neutral hosted-review card refresh, used for
 *   Gitee/Gitea/Bitbucket/Azure DevOps so they never touch GitHub-only lookups.
 */
export type ChecksPanelRefreshStrategy = 'github' | 'gitlab' | 'hosted-review'

export type ChecksPanelRefreshRoute = {
  provider: HostedReviewProvider
  strategy: ChecksPanelRefreshStrategy
}

export type ChecksPanelRefreshRouteInput = {
  activeReviewProvider: HostedReviewProvider | null
  linkedGitLabMR: number | null
  linkedBitbucketPR: number | null
  linkedAzureDevOpsPR: number | null
  linkedGiteaPR: number | null
  linkedGiteePR: number | null
}

/**
 * Pick the refresh path for the Checks panel. Only GitHub uses the GitHub-only
 * lookups; every other hosted provider (including Gitee) routes through the
 * provider-neutral hosted-review refresh so a Gitee link never triggers a
 * GitHub breadcrumb or fetchPRForBranch call.
 */
export function resolveChecksPanelRefreshRoute({
  activeReviewProvider,
  linkedGitLabMR,
  linkedBitbucketPR,
  linkedAzureDevOpsPR,
  linkedGiteaPR,
  linkedGiteePR
}: ChecksPanelRefreshRouteInput): ChecksPanelRefreshRoute {
  // GitLab keeps its dedicated detail-fetch path; a linked MR counts even
  // before the hosted-review card has resolved the provider.
  if (activeReviewProvider === 'gitlab' || linkedGitLabMR !== null) {
    return { provider: 'gitlab', strategy: 'gitlab' }
  }
  if (linkedBitbucketPR !== null) {
    return { provider: 'bitbucket', strategy: 'hosted-review' }
  }
  if (linkedAzureDevOpsPR !== null) {
    return { provider: 'azure-devops', strategy: 'hosted-review' }
  }
  if (linkedGiteaPR !== null) {
    return { provider: 'gitea', strategy: 'hosted-review' }
  }
  if (linkedGiteePR !== null) {
    return { provider: 'gitee', strategy: 'hosted-review' }
  }
  return { provider: 'github', strategy: 'github' }
}

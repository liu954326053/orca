import type { PRInfo } from '../../../../shared/types'
import type { HostedReviewInfo } from '../../../../shared/hosted-review'
import { hostedReviewInfoFromGitHubPRInfo } from '../../../../shared/hosted-review-github'

export type ChecksPanelReview = HostedReviewInfo

export type ChecksPanelReviewSelectionInput = {
  hostedReview: HostedReviewInfo | null | undefined
  pr: PRInfo | null | undefined
  linkedGitLabMR: number | null
  linkedBitbucketPR: number | null
  linkedAzureDevOpsPR: number | null
  linkedGiteaPR: number | null
  linkedGiteePR: number | null
}

export function gitHubPRToChecksPanelReview(pr: PRInfo): ChecksPanelReview {
  // Why: the checks panel must not maintain a second GitHub PR metadata mapper;
  // merge-state fields drifting here regressed the right-sidebar action label.
  return hostedReviewInfoFromGitHubPRInfo(pr)
}

export function selectChecksPanelReview({
  hostedReview,
  pr,
  linkedGitLabMR,
  linkedBitbucketPR,
  linkedAzureDevOpsPR,
  linkedGiteaPR,
  linkedGiteePR
}: ChecksPanelReviewSelectionInput): ChecksPanelReview | null {
  const gitLabHostedReview = hostedReview?.provider === 'gitlab' ? hostedReview : null
  if (gitLabHostedReview) {
    return gitLabHostedReview
  }
  const giteeHostedReview =
    hostedReview?.provider === 'gitee' && hostedReview.number === linkedGiteePR
      ? hostedReview
      : null
  if (giteeHostedReview) {
    // Why: Gitee metadata is display-only; preserve its provider identity so
    // mutation-capable consumers can reject it instead of treating it as GitHub.
    return giteeHostedReview
  }
  const hasNonGitHubLinkedReview =
    linkedGitLabMR !== null ||
    linkedBitbucketPR !== null ||
    linkedAzureDevOpsPR !== null ||
    linkedGiteaPR !== null ||
    linkedGiteePR !== null
  if (hasNonGitHubLinkedReview) {
    return null
  }
  return pr ? gitHubPRToChecksPanelReview(pr) : null
}

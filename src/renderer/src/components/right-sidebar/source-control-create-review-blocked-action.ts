import type {
  HostedReviewCreationBlockedReason,
  HostedReviewCreationEligibility,
  HostedReviewProvider
} from '../../../../shared/hosted-review'
import {
  localizedHostedReviewCopy,
  resolveSupportedHostedReviewCopyProvider
} from '@/i18n/hosted-review-localized-copy'
import { translate } from '@/i18n/i18n'

export function canClickBlockedCreateReviewReason(
  reason: HostedReviewCreationBlockedReason | undefined
): boolean {
  // Why: actionable blocked states stay clickable so the UI can explain the
  // next step inline instead of silently hard-disabling Create Review.
  return (
    reason === 'dirty' ||
    reason === 'default_branch' ||
    reason === 'no_upstream' ||
    reason === 'needs_push' ||
    reason === 'needs_sync' ||
    reason === 'auth_required'
  )
}

export function resolveHostedReviewAuthInstruction(provider: HostedReviewProvider): string {
  if (provider === 'gitlab') {
    return translate(
      'auto.components.right.sidebar.createReviewBlocked.authGitlab',
      'Run glab auth login'
    )
  }
  if (provider === 'azure-devops') {
    return translate(
      'auto.components.right.sidebar.createReviewBlocked.authAzureDevOps',
      'Set ORCA_AZURE_DEVOPS_TOKEN'
    )
  }
  if (provider === 'gitea') {
    return translate(
      'auto.components.right.sidebar.createReviewBlocked.authGitea',
      'Set ORCA_GITEA_TOKEN'
    )
  }
  if (provider === 'gitee') {
    return translate(
      'auto.components.right.sidebar.createReviewBlocked.authGitee',
      'Set ORCA_GITEE_TOKEN'
    )
  }
  return translate(
    'auto.components.right.sidebar.createReviewBlocked.authGitHub',
    'Run gh auth login'
  )
}

export function resolveBlockedCreateReviewNoticeMessage(
  eligibility: HostedReviewCreationEligibility | null | undefined
): string | null {
  if (!eligibility || eligibility.canCreate) {
    return null
  }
  const reason = eligibility.blockedReason
  if (!canClickBlockedCreateReviewReason(reason)) {
    return null
  }
  const copy = localizedHostedReviewCopy(
    resolveSupportedHostedReviewCopyProvider(eligibility.provider)
  )
  switch (reason) {
    case 'dirty':
      // Why: UI locale must surface blocked-create guidance in the active
      // language; English remains the defaultValue for en/tests.
      return translate(
        'auto.components.right.sidebar.createReviewBlocked.dirty',
        'Create {{shortLabel}} failed: commit or discard local changes before creating a {{reviewLabel}}.',
        { shortLabel: copy.shortLabel, reviewLabel: copy.reviewLabel }
      )
    case 'default_branch':
      return translate(
        'auto.components.right.sidebar.createReviewBlocked.defaultBranch',
        'Create {{shortLabel}} failed: choose a feature branch before creating a {{reviewLabel}}.',
        { shortLabel: copy.shortLabel, reviewLabel: copy.reviewLabel }
      )
    case 'no_upstream':
      return translate(
        'auto.components.right.sidebar.createReviewBlocked.noUpstream',
        'Create {{shortLabel}} failed: publish this branch before creating a {{reviewLabel}}.',
        { shortLabel: copy.shortLabel, reviewLabel: copy.reviewLabel }
      )
    case 'needs_push':
      return translate(
        'auto.components.right.sidebar.createReviewBlocked.needsPush',
        'Create {{shortLabel}} failed: push this branch before creating a {{reviewLabel}}.',
        { shortLabel: copy.shortLabel, reviewLabel: copy.reviewLabel }
      )
    case 'needs_sync':
      return translate(
        'auto.components.right.sidebar.createReviewBlocked.needsSync',
        'Create {{shortLabel}} failed: sync this branch before creating a {{reviewLabel}}.',
        { shortLabel: copy.shortLabel, reviewLabel: copy.reviewLabel }
      )
    case 'auth_required':
      return translate(
        'auto.components.right.sidebar.createReviewBlocked.authRequired',
        'Create {{shortLabel}} failed: {{providerName}} is not authenticated. Next step: {{authInstruction}} in this environment.',
        {
          shortLabel: copy.shortLabel,
          providerName: copy.providerName,
          authInstruction: resolveHostedReviewAuthInstruction(eligibility.provider)
        }
      )
    case 'detached_head':
    case 'existing_review':
    case 'fork_head_unsupported':
    case 'unsupported_provider':
    // Why: base_not_on_remote is a create-time hard failure surfaced as an error
    // result, not an inline-actionable eligibility state, so it is non-clickable.
    case 'base_not_on_remote':
    case null:
      return null
  }
}

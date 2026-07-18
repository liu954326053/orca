import type { CreateHostedReviewResult } from '../../../../shared/hosted-review'
import { translate } from '@/i18n/i18n'

export type { LocalizedHostedReviewCopy as CreatePullRequestReviewCopy } from '@/i18n/hosted-review-localized-copy'

export { localizedHostedReviewCopy as reviewCopy } from '@/i18n/hosted-review-localized-copy'

/**
 * Map known main-process English create-review errors to the active UI locale.
 * Why: main process still returns English technical strings for provider create
 * results; the Source Control composer displays them verbatim unless we localize
 * here on the renderer boundary.
 */
export function localizeCreateReviewErrorMessage(error: string, shortLabel: string): string {
  const trimmed = error.trim()
  if (!trimmed) {
    return trimmed
  }

  // Strip a leading "Create PR/MR failed: " so pattern matching is stable.
  const withoutPrefix = trimmed.replace(new RegExp(`^Create ${shortLabel} failed:\\s*`, 'i'), '')

  if (/switch back to the selected branch before creating/i.test(withoutPrefix)) {
    return translate(
      'auto.components.right.sidebar.createReviewError.switchBackToBranch',
      'Create {{shortLabel}} failed: switch back to the selected branch before creating a pull request.',
      { shortLabel }
    )
  }
  if (/commit or discard local changes before creating/i.test(withoutPrefix)) {
    return translate(
      'auto.components.right.sidebar.createReviewError.dirty',
      'Create {{shortLabel}} failed: commit or discard local changes before creating a pull request.',
      { shortLabel }
    )
  }
  if (/choose a feature branch before creating/i.test(withoutPrefix)) {
    return translate(
      'auto.components.right.sidebar.createReviewError.defaultBranch',
      'Create {{shortLabel}} failed: choose a feature branch before creating a pull request.',
      { shortLabel }
    )
  }
  if (/publish this branch before creating/i.test(withoutPrefix)) {
    return translate(
      'auto.components.right.sidebar.createReviewError.noUpstream',
      'Create {{shortLabel}} failed: publish this branch before creating a pull request.',
      { shortLabel }
    )
  }
  if (/push this branch before creating/i.test(withoutPrefix)) {
    return translate(
      'auto.components.right.sidebar.createReviewError.needsPush',
      'Create {{shortLabel}} failed: push this branch before creating a pull request.',
      { shortLabel }
    )
  }
  if (/sync this branch before creating/i.test(withoutPrefix)) {
    return translate(
      'auto.components.right.sidebar.createReviewError.needsSync',
      'Create {{shortLabel}} failed: sync this branch before creating a pull request.',
      { shortLabel }
    )
  }
  if (/switch to a branch before creating/i.test(withoutPrefix)) {
    return translate(
      'auto.components.right.sidebar.createReviewError.detachedHead',
      'Create {{shortLabel}} failed: switch to a branch before creating a pull request.',
      { shortLabel }
    )
  }
  if (/refresh source control status and try again/i.test(withoutPrefix)) {
    return translate(
      'auto.components.right.sidebar.createReviewError.refreshAndRetry',
      'Create {{shortLabel}} failed: refresh source control status and try again.',
      { shortLabel }
    )
  }
  if (/hasn't been pushed to the remote/i.test(withoutPrefix)) {
    return translate(
      'auto.components.right.sidebar.createReviewError.baseNotOnRemote',
      'Create {{shortLabel}} failed: the selected base branch has not been pushed to the remote. Choose a pushed base or push it first.',
      { shortLabel }
    )
  }
  if (/already exists for this branch/i.test(withoutPrefix)) {
    return translate(
      'auto.components.right.sidebar.createReviewError.alreadyExists',
      'A pull request already exists for this branch.'
    )
  }
  if (/is not authenticated/i.test(withoutPrefix)) {
    return translate(
      'auto.components.right.sidebar.createReviewError.notAuthenticated',
      'Create {{shortLabel}} failed: {{detail}}',
      { shortLabel, detail: withoutPrefix }
    )
  }
  if (/^Create .+ failed:/i.test(trimmed) || /^Creating .+ requires/i.test(trimmed)) {
    // Why: keep provider-specific tails (Gitee/GitHub API text) but localize the
    // fixed "Create PR failed" shell when possible.
    return translate(
      'auto.components.right.sidebar.createReviewError.genericWithDetail',
      'Create {{shortLabel}} failed: {{detail}}',
      { shortLabel, detail: withoutPrefix }
    )
  }
  return trimmed
}

export function formatCreateError(
  result: CreateHostedReviewResult,
  pushed: boolean,
  shortLabel: string
): string {
  if (result.ok) {
    return ''
  }
  const localized = localizeCreateReviewErrorMessage(result.error, shortLabel)
  if (pushed) {
    const prefix = new RegExp(`^Create ${shortLabel} failed:\\s*`, 'i')
    const zhPrefix = new RegExp(`^创建${shortLabel}失败[：:]\\s*`)
    const detail = localized.replace(prefix, '').replace(zhPrefix, '')
    return translate(
      'auto.components.right.sidebar.create.pull.request.review.copy.a1f8c3d2e4',
      'Push succeeded, but {{value0}} creation failed: {{value1}}',
      {
        value0: shortLabel,
        value1: detail
      }
    )
  }
  return localized
}

import { describe, expect, it } from 'vitest'
import { gitHubPRToChecksPanelReview, selectChecksPanelReview } from './checks-panel-review'
import type { PRInfo } from '../../../../shared/types'
import type { HostedReviewInfo } from '../../../../shared/hosted-review'

function makePR(overrides: Partial<PRInfo> = {}): PRInfo {
  return {
    number: 42,
    title: 'Add merge queue support',
    state: 'open',
    url: 'https://github.com/acme/web/pull/42',
    checksStatus: 'success',
    updatedAt: '2026-06-02T00:00:00Z',
    mergeable: 'MERGEABLE',
    ...overrides
  }
}

function makeGitLabReview(overrides: Partial<HostedReviewInfo> = {}): HostedReviewInfo {
  return {
    provider: 'gitlab',
    number: 9,
    title: 'GitLab MR',
    state: 'open',
    url: 'https://gitlab.com/acme/widgets/-/merge_requests/9',
    status: 'pending',
    updatedAt: '2026-06-02T00:00:00Z',
    mergeable: 'UNKNOWN',
    ...overrides
  }
}

function makeGiteeReview(overrides: Partial<HostedReviewInfo> = {}): HostedReviewInfo {
  return {
    provider: 'gitee',
    number: 18,
    title: 'Gitee pull request',
    state: 'open',
    url: 'https://gitee.com/acme/widgets/pulls/18',
    status: 'pending',
    updatedAt: '2026-07-17T00:00:00Z',
    mergeable: 'UNKNOWN',
    ...overrides
  }
}

describe('gitHubPRToChecksPanelReview', () => {
  // Why: the right-sidebar merge presenter reads these fields off the converted
  // review object. PR #4001 dropped them here, so review-required/merge-queue
  // PRs silently rendered as plain "Able to merge" (regressing PR #2856).
  it('propagates review and merge-queue metadata from the PR', () => {
    const review = gitHubPRToChecksPanelReview(
      makePR({
        reviewDecision: 'REVIEW_REQUIRED',
        mergeQueueRequired: true,
        mergeStateStatus: 'BLOCKED',
        autoMergeEnabled: true,
        autoMergeAllowed: false
      })
    )

    expect(review.reviewDecision).toBe('REVIEW_REQUIRED')
    expect(review.mergeQueueRequired).toBe(true)
    expect(review.mergeStateStatus).toBe('BLOCKED')
    expect(review.autoMergeEnabled).toBe(true)
    expect(review.autoMergeAllowed).toBe(false)
  })

  it('carries the base identity fields', () => {
    const review = gitHubPRToChecksPanelReview(makePR({ headSha: 'abc123' }))
    expect(review.provider).toBe('github')
    expect(review.number).toBe(42)
    expect(review.status).toBe('success')
    expect(review.headSha).toBe('abc123')
  })
})

describe('selectChecksPanelReview', () => {
  it('uses GitLab hosted review metadata ahead of GitHub PR cache', () => {
    const review = makeGitLabReview({ number: 34 })

    expect(
      selectChecksPanelReview({
        hostedReview: review,
        pr: makePR({ number: 12 }),
        linkedGitLabMR: 34,
        linkedBitbucketPR: null,
        linkedAzureDevOpsPR: null,
        linkedGiteaPR: null,
        linkedGiteePR: null
      })
    ).toBe(review)
  })

  it('uses matching Gitee hosted review metadata ahead of GitHub PR cache', () => {
    const review = makeGiteeReview({
      number: 61,
      url: 'https://gitee.com/acme/widgets/pulls/61'
    })

    expect(
      selectChecksPanelReview({
        hostedReview: review,
        pr: makePR({ number: 12 }),
        linkedGitLabMR: null,
        linkedBitbucketPR: null,
        linkedAzureDevOpsPR: null,
        linkedGiteaPR: null,
        linkedGiteePR: 61
      })
    ).toBe(review)
  })

  // Why: website-created Gitee PRs leave linkedGiteePR null; branch discovery must still show.
  it('uses a branch-discovered Gitee review when the worktree has no linked Gitee PR', () => {
    const review = makeGiteeReview({ number: 18 })
    const staleGitHubPR = makePR({ number: 12, state: 'merged' })

    expect(
      selectChecksPanelReview({
        hostedReview: review,
        pr: staleGitHubPR,
        linkedGitLabMR: null,
        linkedBitbucketPR: null,
        linkedAzureDevOpsPR: null,
        linkedGiteaPR: null,
        linkedGiteePR: null
      })
    ).toBe(review)
  })

  // Why: multi-provider links are allowed; an explicit non-Gitee link must beat unlinked Gitee discovery.
  it.each([
    { provider: 'GitLab', linkedGitLabMR: 7 },
    { provider: 'Bitbucket', linkedBitbucketPR: 8 },
    { provider: 'Azure DevOps', linkedAzureDevOpsPR: 9 },
    { provider: 'Gitea', linkedGiteaPR: 10 }
  ])(
    'does not use branch-discovered Gitee when a $provider review is explicitly linked',
    (links) => {
      const review = makeGiteeReview({ number: 18 })

      expect(
        selectChecksPanelReview({
          hostedReview: review,
          pr: makePR({ number: 12, state: 'merged' }),
          linkedGitLabMR: links.linkedGitLabMR ?? null,
          linkedBitbucketPR: links.linkedBitbucketPR ?? null,
          linkedAzureDevOpsPR: links.linkedAzureDevOpsPR ?? null,
          linkedGiteaPR: links.linkedGiteaPR ?? null,
          linkedGiteePR: null
        })
      ).toBeNull()
    }
  )

  // Why: explicit link mismatch must not leak Gitee cache or stale GitHub PR.
  it('returns null when linkedGiteePR disagrees with the cached Gitee review number', () => {
    const review = makeGiteeReview({ number: 18 })

    expect(
      selectChecksPanelReview({
        hostedReview: review,
        pr: makePR({ number: 12 }),
        linkedGitLabMR: null,
        linkedBitbucketPR: null,
        linkedAzureDevOpsPR: null,
        linkedGiteaPR: null,
        linkedGiteePR: 99
      })
    ).toBeNull()
  })

  it('uses GitHub PR cache when no non-GitHub review is linked', () => {
    const selected = selectChecksPanelReview({
      hostedReview: null,
      pr: makePR({ number: 12, state: 'merged' }),
      linkedGitLabMR: null,
      linkedBitbucketPR: null,
      linkedAzureDevOpsPR: null,
      linkedGiteaPR: null,
      linkedGiteePR: null
    })

    expect(selected).toMatchObject({ provider: 'github', number: 12, state: 'merged' })
  })

  it.each([
    { provider: 'GitLab', linkedGitLabMR: 7 },
    { provider: 'Bitbucket', linkedBitbucketPR: 8 },
    { provider: 'Azure DevOps', linkedAzureDevOpsPR: 9 },
    { provider: 'Gitea', linkedGiteaPR: 10 },
    { provider: 'Gitee', linkedGiteePR: 11 }
  ])('does not surface GitHub PR cache when a $provider review is linked', (links) => {
    expect(
      selectChecksPanelReview({
        hostedReview: null,
        pr: makePR({ number: 12, state: 'merged' }),
        linkedGitLabMR: links.linkedGitLabMR ?? null,
        linkedBitbucketPR: links.linkedBitbucketPR ?? null,
        linkedAzureDevOpsPR: links.linkedAzureDevOpsPR ?? null,
        linkedGiteaPR: links.linkedGiteaPR ?? null,
        linkedGiteePR: links.linkedGiteePR ?? null
      })
    ).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import {
  hostedReviewBranchNamesMatch,
  normalizeHostedReviewBaseRef,
  normalizeHostedReviewBranchIdentity,
  normalizeHostedReviewHeadRef,
  resolveHostedReviewApiHeadRef
} from './hosted-review-refs'

describe('hosted review ref normalization', () => {
  it('normalizes local and remote head refs to branch names', () => {
    expect(normalizeHostedReviewHeadRef(' refs/heads/feature/create-pr ')).toBe('feature/create-pr')
    expect(normalizeHostedReviewHeadRef('refs/remotes/origin/feature/create-pr')).toBe(
      'feature/create-pr'
    )
  })

  it('strips common remote prefixes from base refs', () => {
    expect(normalizeHostedReviewBaseRef('origin/main')).toBe('main')
    expect(normalizeHostedReviewBaseRef('refs/remotes/upstream/release/1.0')).toBe('release/1.0')
  })

  it('matches IDE-style origin/ prefixed local branches to short names', () => {
    expect(normalizeHostedReviewBranchIdentity('origin/dev-client')).toBe('dev-client')
    expect(hostedReviewBranchNamesMatch('origin/dev-client', 'dev-client')).toBe(true)
    expect(hostedReviewBranchNamesMatch('dev-client', 'origin/dev-client')).toBe(true)
    expect(hostedReviewBranchNamesMatch('feature', 'other')).toBe(false)
  })

  it('resolves forge API head from upstream or local identity', () => {
    expect(resolveHostedReviewApiHeadRef('origin/dev-client', 'origin/dev-client')).toBe(
      'dev-client'
    )
    // Broken double-origin upstream: remote branch is literally origin/dev-client
    expect(resolveHostedReviewApiHeadRef('origin/dev-client', 'origin/origin/dev-client')).toBe(
      'origin/dev-client'
    )
    expect(resolveHostedReviewApiHeadRef('origin/dev-client', null)).toBe('dev-client')
  })
})

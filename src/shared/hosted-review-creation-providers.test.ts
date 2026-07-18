import { describe, expect, it } from 'vitest'
import type { HostedReviewProvider } from './hosted-review'
import {
  resolveHostedReviewCreationProvider,
  supportsHostedReviewCreation
} from './hosted-review-creation-providers'

describe('hosted review creation providers', () => {
  it('treats Gitee as a hosted review creation provider', () => {
    const provider: HostedReviewProvider = 'gitee'

    expect(supportsHostedReviewCreation(provider)).toBe(true)
    expect(resolveHostedReviewCreationProvider(provider)).toBe('gitee')
  })
})

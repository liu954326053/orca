import { describe, expect, it } from 'vitest'
import { isHostedReviewMutationProvider } from './hosted-review-mutation-provider'

describe('isHostedReviewMutationProvider', () => {
  it.each([
    ['github', true],
    ['gitlab', true],
    ['bitbucket', false],
    ['azure-devops', false],
    ['gitea', false],
    ['gitee', false],
    ['unsupported', false]
  ] as const)('returns %s for %s', (provider, expected) => {
    expect(isHostedReviewMutationProvider(provider)).toBe(expected)
  })
})

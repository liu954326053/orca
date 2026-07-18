import { describe, expect, it } from 'vitest'
import { resolveProvisionalHostedReviewProvider } from './source-control-primary-create-pr-intent-action'

describe('resolveProvisionalHostedReviewProvider', () => {
  it('uses linked Gitee metadata as the provider hint', () => {
    expect(resolveProvisionalHostedReviewProvider({ linkedGiteePR: 42 })).toBe('gitee')
  })
})

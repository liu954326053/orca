import { describe, expect, it } from 'vitest'
import type { WorktreeCardPrDisplay } from './worktree-card-pr-display'
import { getProviderName } from './worktree-review-helpers'

describe('getProviderName', () => {
  it('labels Gitee reviews distinctly from Gitea and GitHub', () => {
    const review = { provider: 'gitee' } as WorktreeCardPrDisplay
    expect(getProviderName(review)).toBe('Gitee')
  })
})

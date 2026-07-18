import { describe, expect, it } from 'vitest'
import { formatCreateError, localizeCreateReviewErrorMessage } from './create-pull-request-review-copy'

describe('localizeCreateReviewErrorMessage', () => {
  it('localizes switch-back-to-branch errors', () => {
    expect(
      localizeCreateReviewErrorMessage(
        'Create PR failed: switch back to the selected branch before creating a pull request.',
        'PR'
      )
    ).toBe(
      'Create PR failed: switch back to the selected branch before creating a pull request.'
    )
  })

  it('localizes dirty-workspace errors', () => {
    expect(
      localizeCreateReviewErrorMessage(
        'Create PR failed: commit or discard local changes before creating a pull request.',
        'PR'
      )
    ).toBe(
      'Create PR failed: commit or discard local changes before creating a pull request.'
    )
  })
})

describe('formatCreateError', () => {
  it('returns localized create failure without push prefix', () => {
    expect(
      formatCreateError(
        {
          ok: false,
          code: 'validation',
          error:
            'Create PR failed: switch back to the selected branch before creating a pull request.'
        },
        false,
        'PR'
      )
    ).toContain('switch back to the selected branch')
  })
})

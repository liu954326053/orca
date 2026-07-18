import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Repo, Worktree } from '../../../../shared/types'
import HostedReviewActions from './HostedReviewActions'

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { deleteStateByWorktreeId: Record<string, never> }) => unknown) =>
    selector({ deleteStateByWorktreeId: {} })
}))

vi.mock('@/components/confirmation-dialog', () => ({
  useConfirmationDialog: () => vi.fn()
}))

describe('HostedReviewActions provider gate', () => {
  it('does not expose GitHub mutations for a Gitee review', () => {
    const markup = renderToStaticMarkup(
      <HostedReviewActions
        review={{
          provider: 'gitee',
          number: 42,
          state: 'open',
          status: 'success',
          mergeable: 'MERGEABLE'
        }}
        githubPR={null}
        repo={{ id: 'repo-1', path: '/repo', displayName: 'repo', kind: 'git' } as Repo}
        worktree={{ id: 'repo-1::/repo', path: '/repo' } as Worktree}
        onRefreshReview={vi.fn().mockResolvedValue(undefined)}
      />
    )

    expect(markup).toBe('')
  })
})

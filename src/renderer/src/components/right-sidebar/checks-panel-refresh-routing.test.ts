import { describe, expect, it } from 'vitest'
import { resolveChecksPanelRefreshRoute } from './checks-panel-refresh-routing'

const NO_LINKS = {
  linkedGitLabMR: null,
  linkedBitbucketPR: null,
  linkedAzureDevOpsPR: null,
  linkedGiteaPR: null,
  linkedGiteePR: null
} as const

describe('resolveChecksPanelRefreshRoute', () => {
  it('routes a plain GitHub context through the GitHub refresh path', () => {
    expect(
      resolveChecksPanelRefreshRoute({
        activeReviewProvider: 'github',
        ...NO_LINKS
      })
    ).toEqual({ provider: 'github', strategy: 'github' })
  })

  it('routes a GitHub context with no active review through the GitHub refresh path', () => {
    expect(
      resolveChecksPanelRefreshRoute({
        activeReviewProvider: null,
        ...NO_LINKS
      })
    ).toEqual({ provider: 'github', strategy: 'github' })
  })

  it('routes an active GitLab review through the GitLab refresh path', () => {
    expect(
      resolveChecksPanelRefreshRoute({
        activeReviewProvider: 'gitlab',
        ...NO_LINKS
      })
    ).toEqual({ provider: 'gitlab', strategy: 'gitlab' })
  })

  it('routes a linked GitLab MR through the GitLab refresh path even before the review loads', () => {
    expect(
      resolveChecksPanelRefreshRoute({
        activeReviewProvider: null,
        ...NO_LINKS,
        linkedGitLabMR: 34
      })
    ).toEqual({ provider: 'gitlab', strategy: 'gitlab' })
  })

  it('routes a linked Gitee PR through the provider-neutral hosted-review path, not GitHub', () => {
    const route = resolveChecksPanelRefreshRoute({
      activeReviewProvider: null,
      ...NO_LINKS,
      linkedGiteePR: 11
    })
    expect(route).toEqual({ provider: 'gitee', strategy: 'hosted-review' })
    expect(route.strategy).not.toBe('github')
  })

  it.each([
    { provider: 'bitbucket', links: { linkedBitbucketPR: 8 } },
    { provider: 'azure-devops', links: { linkedAzureDevOpsPR: 9 } },
    { provider: 'gitea', links: { linkedGiteaPR: 10 } },
    { provider: 'gitee', links: { linkedGiteePR: 11 } }
  ] as const)(
    'keeps a linked $provider review off the GitHub-only refresh path',
    ({ provider, links }) => {
      expect(
        resolveChecksPanelRefreshRoute({
          activeReviewProvider: null,
          ...NO_LINKS,
          ...links
        })
      ).toEqual({ provider, strategy: 'hosted-review' })
    }
  )

  it('prefers the GitLab path when both a GitLab MR and another provider are linked', () => {
    expect(
      resolveChecksPanelRefreshRoute({
        activeReviewProvider: 'gitlab',
        ...NO_LINKS,
        linkedGitLabMR: 34,
        linkedGiteePR: 11
      })
    ).toEqual({ provider: 'gitlab', strategy: 'gitlab' })
  })
})

import { describe, expect, it } from 'vitest'
import { getLinkedWorkItemMetadata } from './worktree-linked-work-item-metadata'

describe('getLinkedWorkItemMetadata', () => {
  it('reads linkedGiteeIssue symmetrically with linkedGiteePR', () => {
    expect(
      getLinkedWorkItemMetadata({
        displayName: '',
        comment: '',
        linkedIssue: 1,
        linkedPR: 2,
        linkedLinearIssue: null,
        linkedGiteePR: 9,
        linkedGiteeIssue: 8,
        isArchived: false,
        isUnread: false,
        isPinned: false,
        sortOrder: 0,
        lastActivityAt: 0
      })
    ).toMatchObject({
      linkedGiteePR: 9,
      linkedGiteeIssue: 8
    })
  })

  it('defaults missing Gitee issue links to null without touching linkedIssue', () => {
    expect(
      getLinkedWorkItemMetadata({
        displayName: '',
        comment: '',
        linkedIssue: 42,
        linkedPR: null,
        linkedLinearIssue: null,
        isArchived: false,
        isUnread: false,
        isPinned: false,
        sortOrder: 0,
        lastActivityAt: 0
      })
    ).toMatchObject({
      linkedGiteeIssue: null,
      linkedGiteePR: null
    })
  })
})

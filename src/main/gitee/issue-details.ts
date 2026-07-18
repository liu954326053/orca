import type { HostedReviewExecutionOptions } from '../source-control/hosted-review-git-options'
import type { GiteeCommentInfo, GiteeIssueInfo } from './issue-mappers'
import { listGiteeIssueComments } from './issue-comments'
import { getGiteeIssue } from './issues'

export async function getGiteeIssueWithComments(
  repoPath: string,
  issueNumber: string | number,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<(GiteeIssueInfo & { comments: GiteeCommentInfo[] }) | null> {
  const issue = await getGiteeIssue(repoPath, issueNumber, connectionId, options)
  if (!issue) {
    return null
  }
  const comments = await listGiteeIssueComments(repoPath, issueNumber, connectionId, options)
  return { ...issue, comments }
}

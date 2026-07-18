import type { HostedReviewExecutionOptions } from '../source-control/hosted-review-git-options'
import { mapGiteeIssueComment, type GiteeCommentInfo, type RawGiteeComment } from './issue-mappers'
import { encodedRepoPath, requestJson, resolveGiteeRepo } from './request'

const REQUEST_TIMEOUT_MS = 8_000
const MUTATE_TIMEOUT_MS = 20_000

export async function listGiteeIssueComments(
  repoPath: string,
  issueNumber: string | number,
  connectionId?: string | null,
  execOptions: HostedReviewExecutionOptions = {}
): Promise<GiteeCommentInfo[]> {
  const repo = await resolveGiteeRepo(repoPath, connectionId, execOptions)
  if (!repo) {
    return []
  }
  const raw = await requestJson<RawGiteeComment[]>(
    repo,
    `/repos/${encodedRepoPath(repo)}/issues/${encodeURIComponent(String(issueNumber))}/comments`,
    { timeoutMs: REQUEST_TIMEOUT_MS }
  )
  return (raw ?? []).flatMap((comment) => {
    const mapped = mapGiteeIssueComment(comment)
    return mapped ? [mapped] : []
  })
}

export async function addGiteeIssueComment(
  repoPath: string,
  issueNumber: string | number,
  commentBody: string,
  connectionId?: string | null,
  execOptions: HostedReviewExecutionOptions = {}
): Promise<GiteeCommentInfo | null> {
  const repo = await resolveGiteeRepo(repoPath, connectionId, execOptions)
  if (!repo) {
    return null
  }
  const raw = await requestJson<RawGiteeComment>(
    repo,
    `/repos/${encodedRepoPath(repo)}/issues/${encodeURIComponent(String(issueNumber))}/comments`,
    { method: 'POST', body: { body: commentBody }, timeoutMs: MUTATE_TIMEOUT_MS }
  )
  return raw ? mapGiteeIssueComment(raw) : null
}

import {
  mapGiteePullRequest,
  matchesGiteeBranch,
  type GiteePullRequestInfo,
  type RawGiteePullRequest
} from './pull-request-mappers'
import { getGiteeRepoRef, type GiteeRepoRef } from './repository-ref'
import { invalidateGiteePullRequestScan, scanGiteePullRequests } from './pull-request-scan-cache'
import {
  getHostedReviewLocalGitOptions,
  type HostedReviewExecutionOptions
} from '../source-control/hosted-review-git-options'
import {
  configuredApiBaseUrl,
  encodedRepoPath,
  getGiteeAuthConfig,
  GiteeApiRequestError,
  normalizeGiteeApiBaseUrl,
  requestJson,
  requestJsonAtBase,
  type GiteeApiRequestErrorKind
} from './request'
import {
  addGiteeIssueComment,
  createGiteeIssue,
  getGiteeIssue,
  listGiteeIssueComments,
  listGiteeIssues,
  listGiteeLabels,
  updateGiteeIssue,
  type CreateGiteeIssueInput,
  type ListGiteeIssuesOptions,
  type UpdateGiteeIssueInput
} from './issues'
import { getGiteeIssueWithComments } from './issue-details'
import type {
  GiteeCommentInfo,
  GiteeIssueInfo,
  GiteeIssueState,
  GiteeLabelInfo
} from './issue-mappers'

export { GiteeApiRequestError, normalizeGiteeApiBaseUrl }
export type { GiteeApiRequestErrorKind }
export {
  addGiteeIssueComment,
  createGiteeIssue,
  getGiteeIssue,
  getGiteeIssueWithComments,
  listGiteeIssueComments,
  listGiteeIssues,
  listGiteeLabels,
  updateGiteeIssue
}
export type { CreateGiteeIssueInput, ListGiteeIssuesOptions, UpdateGiteeIssueInput }
export type { GiteeCommentInfo, GiteeIssueInfo, GiteeIssueState, GiteeLabelInfo }

const PULL_REQUEST_LIST_TIMEOUT_MS = 15_000
const PULL_REQUEST_PAGE_LIMIT = 50
const MAX_PULL_REQUEST_PAGES = 5

export type GiteeAuthStatus = {
  configured: boolean
  authenticated: boolean
  account: string | null
  baseUrl: string | null
  tokenConfigured: boolean
}

export type GiteePullListState = 'open' | 'closed' | 'all'

export type GiteePullListResult = {
  items: GiteePullRequestInfo[]
  error?: { type: string; message: string }
}

function giteePullRequestScanKey(repo: GiteeRepoRef): string {
  return `${configuredApiBaseUrl(repo)}/${encodedRepoPath(repo)}`
}

/** Invalidate the shared /pulls scan after Orca itself creates a PR so the
 *  next worktree-card refresh sees it instead of a cached miss. */
export function invalidateGiteePullRequestScanForRepo(repo: GiteeRepoRef): void {
  invalidateGiteePullRequestScan(giteePullRequestScanKey(repo))
}

export async function getGiteeAuthStatus(): Promise<GiteeAuthStatus> {
  const config = getGiteeAuthConfig()
  const tokenConfigured = config.token !== null
  if (!config.apiBaseUrl && !tokenConfigured) {
    return {
      configured: false,
      authenticated: false,
      account: null,
      baseUrl: null,
      tokenConfigured: false
    }
  }
  if (!config.apiBaseUrl) {
    return {
      configured: true,
      authenticated: tokenConfigured,
      account: null,
      baseUrl: null,
      tokenConfigured
    }
  }

  if (!tokenConfigured) {
    return {
      configured: true,
      authenticated: false,
      account: null,
      baseUrl: config.apiBaseUrl,
      tokenConfigured
    }
  }

  const user = await requestJsonAtBase<{
    login?: string | null
    name?: string | null
  }>(config.apiBaseUrl, '/user', { timeoutMs: 4000 })
  return {
    configured: true,
    authenticated: user !== null,
    account: user?.login ?? user?.name ?? null,
    baseUrl: config.apiBaseUrl,
    tokenConfigured
  }
}

export async function getGiteePullRequest(
  repoPath: string,
  prNumber: number,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<GiteePullRequestInfo | null> {
  const repo = await getGiteeRepoRef(
    repoPath,
    connectionId,
    getHostedReviewLocalGitOptions(options)
  )
  if (!repo) {
    return null
  }
  const raw = await requestJson<RawGiteePullRequest>(
    repo,
    `/repos/${encodedRepoPath(repo)}/pulls/${encodeURIComponent(String(prNumber))}`
  )
  return raw ? mapGiteePullRequest(raw) : null
}

async function findPullRequestByBranchScan(
  repo: GiteeRepoRef,
  branchName: string
): Promise<RawGiteePullRequest | null> {
  const pullRequests = await scanGiteePullRequests(
    giteePullRequestScanKey(repo),
    (page) =>
      requestJson<RawGiteePullRequest[]>(repo, `/repos/${encodedRepoPath(repo)}/pulls`, {
        searchParams: {
          state: 'all',
          sort: 'updated',
          direction: 'desc',
          page,
          per_page: PULL_REQUEST_PAGE_LIMIT
        },
        timeoutMs: PULL_REQUEST_LIST_TIMEOUT_MS
      }),
    PULL_REQUEST_PAGE_LIMIT,
    MAX_PULL_REQUEST_PAGES
  )
  return pullRequests.find((item) => matchesGiteeBranch(item, branchName)) ?? null
}

export async function getGiteePullRequestForBranch(
  repoPath: string,
  branch: string,
  linkedPRNumber?: number | null,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<GiteePullRequestInfo | null> {
  const branchName = branch.replace(/^refs\/heads\//, '')
  if (!branchName && linkedPRNumber == null) {
    return null
  }

  const repo = await getGiteeRepoRef(
    repoPath,
    connectionId,
    getHostedReviewLocalGitOptions(options)
  )
  if (!repo) {
    return null
  }

  if (branchName) {
    // Why: Gitee list supports a head filter for the source branch; prefer it
    // before falling back to a paginated scan shared across worktree cards.
    const filtered = await requestJson<RawGiteePullRequest[]>(
      repo,
      `/repos/${encodedRepoPath(repo)}/pulls`,
      {
        searchParams: {
          state: 'all',
          head: branchName,
          sort: 'updated',
          direction: 'desc',
          page: 1,
          per_page: PULL_REQUEST_PAGE_LIMIT
        },
        timeoutMs: PULL_REQUEST_LIST_TIMEOUT_MS
      }
    )
    const fromFilter = filtered?.find((item) => matchesGiteeBranch(item, branchName))
    if (fromFilter) {
      const pullRequest = mapGiteePullRequest(fromFilter)
      // Why: a closed branch match is abandoned history unless the user explicitly linked it.
      return typeof linkedPRNumber !== 'number' && pullRequest?.state === 'closed'
        ? null
        : pullRequest
    }

    const fromScan = await findPullRequestByBranchScan(repo, branchName)
    if (fromScan) {
      const pullRequest = mapGiteePullRequest(fromScan)
      return typeof linkedPRNumber !== 'number' && pullRequest?.state === 'closed'
        ? null
        : pullRequest
    }
  }

  if (typeof linkedPRNumber !== 'number') {
    return null
  }
  const raw = await requestJson<RawGiteePullRequest>(
    repo,
    `/repos/${encodedRepoPath(repo)}/pulls/${encodeURIComponent(String(linkedPRNumber))}`
  )
  return raw ? mapGiteePullRequest(raw) : null
}

function normalizePullListState(state: GiteePullListState | undefined): GiteePullListState {
  return state === 'closed' || state === 'all' ? state : 'open'
}

function clampPullPageSize(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 30
  }
  return Math.min(Math.max(1, Math.trunc(value)), PULL_REQUEST_PAGE_LIMIT)
}

/** Task-page PR list with open/closed/all state filter. */
export async function listGiteePulls(
  repoPath: string,
  options: {
    state?: GiteePullListState
    page?: number
    perPage?: number
    connectionId?: string | null
  } & HostedReviewExecutionOptions = {}
): Promise<GiteePullListResult> {
  const repo = await getGiteeRepoRef(
    repoPath,
    options.connectionId,
    getHostedReviewLocalGitOptions(options)
  )
  if (!repo) {
    return {
      items: [],
      error: {
        type: 'not_found',
        message: 'Could not resolve a Gitee repository for this path.'
      }
    }
  }

  try {
    const state = normalizePullListState(options.state)
    const page =
      typeof options.page === 'number' && Number.isFinite(options.page)
        ? Math.min(Math.max(1, Math.trunc(options.page)), 10_000)
        : 1
    const perPage = clampPullPageSize(options.perPage)
    const raw = await requestJson<RawGiteePullRequest[]>(
      repo,
      `/repos/${encodedRepoPath(repo)}/pulls`,
      {
        searchParams: {
          state,
          sort: 'updated',
          direction: 'desc',
          page,
          per_page: perPage
        },
        timeoutMs: PULL_REQUEST_LIST_TIMEOUT_MS
      }
    )
    if (!raw) {
      return { items: [] }
    }
    return {
      items: raw
        .map((item) => mapGiteePullRequest(item))
        .filter((item): item is GiteePullRequestInfo => item !== null)
    }
  } catch (error) {
    const message =
      error instanceof GiteeApiRequestError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Failed to list Gitee pull requests'
    return {
      items: [],
      error: { type: 'unknown', message }
    }
  }
}

export async function getGiteeRepoSlug(
  repoPath: string,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<GiteeRepoRef | null> {
  return getGiteeRepoRef(repoPath, connectionId, getHostedReviewLocalGitOptions(options))
}

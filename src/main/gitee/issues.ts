import {
  mapGiteeIssue,
  mapGiteeLabel,
  type GiteeIssueInfo,
  type GiteeIssueState,
  type GiteeLabelInfo,
  type RawGiteeIssue,
  type RawGiteeLabel
} from './issue-mappers'
import { normalizeGiteeApiBaseUrl } from './request'
import { getGiteeRepoRef, type GiteeRepoRef } from './repository-ref'
import {
  getHostedReviewLocalGitOptions,
  type HostedReviewExecutionOptions
} from '../source-control/hosted-review-git-options'

const REQUEST_TIMEOUT_MS = 8_000
const ISSUE_LIST_TIMEOUT_MS = 15_000
const MUTATE_TIMEOUT_MS = 20_000
const ISSUE_LIST_PAGE_LIMIT = 20

export type ListGiteeIssuesOptions = {
  state?: GiteeIssueState | 'all'
  page?: number
  perPage?: number
  // Why: task-page filters mirror Gitee web — keyword search plus optional
  // creator/assignee/label narrowing, all forwarded as v5 query params.
  q?: string
  creator?: string
  assignee?: string
  labels?: string[]
}

export type CreateGiteeIssueInput = {
  title: string
  body?: string
  labels?: string[]
}

export type UpdateGiteeIssueInput = {
  state?: 'open' | 'closed'
  title?: string
  body?: string
}

function envValue(name: string): string | null {
  const value = process.env[name]?.trim() ?? ''
  return value.length > 0 ? value : null
}

function authHeaders(): Record<string, string> {
  const token = envValue('ORCA_GITEE_TOKEN')
  return token ? { Authorization: `token ${token}` } : {}
}

function resolvedApiBaseUrl(repo: GiteeRepoRef): string {
  const override = envValue('ORCA_GITEE_API_BASE_URL')
  return (override ? normalizeGiteeApiBaseUrl(override) : null) ?? repo.apiBaseUrl
}

function encodedRepoPath(repo: GiteeRepoRef): string {
  return `${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`
}

function buildUrl(
  baseUrl: string,
  path: string,
  searchParams?: Record<string, string | number>
): URL {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path}`)
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, String(value))
    }
  }
  return url
}

async function requestJson<T>(
  repo: GiteeRepoRef,
  path: string,
  searchParams?: Record<string, string | number>,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<T | null> {
  const url = buildUrl(resolvedApiBaseUrl(repo), path, searchParams)
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', ...authHeaders() },
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        throw new GiteeIssueApiError(response.status)
      }
      return null
    }
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof GiteeIssueApiError) {
      throw error
    }
    return null
  }
}

async function mutateJson<T>(
  repo: GiteeRepoRef,
  method: 'POST' | 'PATCH',
  path: string,
  body: Record<string, unknown>,
  timeoutMs = MUTATE_TIMEOUT_MS
): Promise<T | null> {
  const url = buildUrl(resolvedApiBaseUrl(repo), path)
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...authHeaders()
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        throw new GiteeIssueApiError(response.status)
      }
      return null
    }
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof GiteeIssueApiError) {
      throw error
    }
    return null
  }
}

export class GiteeIssueApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Gitee Issues API request failed (HTTP ${status})`)
    this.name = 'GiteeIssueApiError'
    this.status = status
  }
}

async function resolveRepo(
  repoPath: string,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<GiteeRepoRef | null> {
  return getGiteeRepoRef(repoPath, connectionId, getHostedReviewLocalGitOptions(options))
}

export async function listGiteeIssues(
  repoPath: string,
  opts: ListGiteeIssuesOptions = {},
  connectionId?: string | null,
  execOptions: HostedReviewExecutionOptions = {}
): Promise<GiteeIssueInfo[]> {
  const repo = await resolveRepo(repoPath, connectionId, execOptions)
  if (!repo) {
    return []
  }
  const { state = 'open', page = 1, perPage = ISSUE_LIST_PAGE_LIMIT } = opts
  const searchParams: Record<string, string | number> = {
    state,
    page,
    per_page: perPage,
    sort: 'updated',
    direction: 'desc'
  }
  // Why: only send optional filters when present so unfiltered lists keep the
  // narrow query string Gitee caches best.
  if (opts.q) {
    searchParams.q = opts.q
  }
  if (opts.creator) {
    searchParams.creator = opts.creator
  }
  if (opts.assignee) {
    searchParams.assignee = opts.assignee
  }
  if (opts.labels?.length) {
    // Why: Gitee v5 expects labels as a comma-separated string, not repeated params.
    searchParams.labels = opts.labels.join(',')
  }
  const raw = await requestJson<RawGiteeIssue[]>(
    repo,
    `/repos/${encodedRepoPath(repo)}/issues`,
    searchParams,
    ISSUE_LIST_TIMEOUT_MS
  )
  return (raw ?? []).flatMap((r) => {
    const mapped = mapGiteeIssue(r)
    return mapped ? [mapped] : []
  })
}

export async function getGiteeIssue(
  repoPath: string,
  issueNumber: string | number,
  connectionId?: string | null,
  execOptions: HostedReviewExecutionOptions = {}
): Promise<GiteeIssueInfo | null> {
  const repo = await resolveRepo(repoPath, connectionId, execOptions)
  if (!repo) {
    return null
  }
  const raw = await requestJson<RawGiteeIssue>(
    repo,
    `/repos/${encodedRepoPath(repo)}/issues/${encodeURIComponent(String(issueNumber))}`
  )
  return raw ? mapGiteeIssue(raw) : null
}

export async function createGiteeIssue(
  repoPath: string,
  input: CreateGiteeIssueInput,
  connectionId?: string | null,
  execOptions: HostedReviewExecutionOptions = {}
): Promise<GiteeIssueInfo | null> {
  const repo = await resolveRepo(repoPath, connectionId, execOptions)
  if (!repo) {
    return null
  }
  const body: Record<string, unknown> = {
    owner: repo.owner,
    repo: repo.repo,
    title: input.title
  }
  if (input.body) {
    body.body = input.body
  }
  // Why: Gitee v5 accepts labels as a comma-separated string, not an array.
  if (input.labels?.length) {
    body.labels = input.labels.join(',')
  }
  const raw = await mutateJson<RawGiteeIssue>(
    repo,
    'POST',
    `/repos/${encodeURIComponent(repo.owner)}/issues`,
    body
  )
  return raw ? mapGiteeIssue(raw) : null
}

export async function updateGiteeIssue(
  repoPath: string,
  issueNumber: string | number,
  input: UpdateGiteeIssueInput,
  connectionId?: string | null,
  execOptions: HostedReviewExecutionOptions = {}
): Promise<GiteeIssueInfo | null> {
  const repo = await resolveRepo(repoPath, connectionId, execOptions)
  if (!repo) {
    return null
  }
  const body: Record<string, unknown> = {
    owner: repo.owner,
    repo: repo.repo
  }
  if (input.state !== undefined) {
    body.state = input.state
  }
  if (input.title !== undefined) {
    body.title = input.title
  }
  if (input.body !== undefined) {
    body.body = input.body
  }
  const raw = await mutateJson<RawGiteeIssue>(
    repo,
    'PATCH',
    `/repos/${encodeURIComponent(repo.owner)}/issues/${encodeURIComponent(String(issueNumber))}`,
    body
  )
  return raw ? mapGiteeIssue(raw) : null
}

export async function listGiteeLabels(
  repoPath: string,
  connectionId?: string | null,
  execOptions: HostedReviewExecutionOptions = {}
): Promise<GiteeLabelInfo[]> {
  const repo = await resolveRepo(repoPath, connectionId, execOptions)
  if (!repo) {
    return []
  }
  const raw = await requestJson<RawGiteeLabel[]>(repo, `/repos/${encodedRepoPath(repo)}/labels`)
  return (raw ?? []).flatMap((r) => {
    const mapped = mapGiteeLabel(r)
    return mapped ? [mapped] : []
  })
}

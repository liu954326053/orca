import type { HostedReviewExecutionOptions } from '../source-control/hosted-review-git-options'
import { listGiteeIssues, listGiteePulls } from './client'

export type GiteeTaskPageState = 'open' | 'closed' | 'all'

export type GiteeWorkItem = {
  id: string
  type: 'issue' | 'pr'
  /** Issue public id (string) or PR integer number. */
  number: string | number
  title: string
  state: 'open' | 'closed' | 'merged' | 'draft'
  url: string
  labels: string[]
  updatedAt: string
  author: string | null
  branchName?: string
  baseRefName?: string
  repoId: string
}

export type GiteeTaskPageError = {
  type: string
  message: string
}

export type GiteeTaskPageResult = {
  items: GiteeWorkItem[]
  error?: GiteeTaskPageError
}

export type GiteeTaskPageListOptions = HostedReviewExecutionOptions & {
  state?: GiteeTaskPageState
  page?: number
  limit?: number
  repoId?: string
  connectionId?: string | null
}

type IssueRowSource = {
  number: string | number
  title: string
  state: 'open' | 'closed' | 'progressing' | 'rejected'
  url: string
  labels?: string[]
  updatedAt?: string
  author?: string | null
}

type PullRowSource = {
  number: number
  title: string
  state: 'open' | 'closed' | 'merged' | 'draft'
  url: string
  labels?: string[]
  updatedAt?: string
  author?: string | null
  branchName?: string
  baseRefName?: string
}

type ClientListResult<T> = T[] | { items: T[]; error?: GiteeTaskPageError }

const MAX_PAGE = 10_000
const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 30

function normalizeState(state: GiteeTaskPageState | undefined): GiteeTaskPageState {
  return state === 'closed' || state === 'all' ? state : 'open'
}

function normalizePositiveInteger(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.min(Math.max(1, Math.trunc(value)), max)
}

function normalizeClientResult<T>(result: ClientListResult<T>): {
  items: T[]
  error?: GiteeTaskPageError
} {
  if (Array.isArray(result)) {
    return { items: result }
  }
  return result
}

function listError(error: unknown): GiteeTaskPageError {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number(error.status)
      : null
  const kind =
    typeof error === 'object' && error !== null && 'kind' in error
      ? String(error.kind)
      : null
  const type =
    kind === 'authentication' || status === 401 || status === 403
      ? 'authentication'
      : kind === 'rate_limited' || status === 429
        ? 'rate_limited'
        : kind === 'server' || (status !== null && status >= 500)
          ? 'server'
          : 'unknown'
  return {
    type,
    message: error instanceof Error ? error.message : String(error)
  }
}

function rowLabels(labels: string[] | undefined): string[] {
  return Array.isArray(labels) ? labels.filter((label) => typeof label === 'string') : []
}

export function mapGiteeIssueToWorkItem(source: IssueRowSource, repoId: string): GiteeWorkItem {
  return {
    id: `gitee-issue-${repoId}-${source.number}`,
    type: 'issue',
    number: source.number,
    title: source.title,
    // Why: the Tasks UI exposes an open/closed lifecycle. Gitee's progressing
    // state is active while rejected is terminal, so collapse them at this boundary.
    state: source.state === 'closed' || source.state === 'rejected' ? 'closed' : 'open',
    url: source.url,
    labels: rowLabels(source.labels),
    updatedAt: source.updatedAt ?? '',
    author: source.author ?? null,
    repoId
  }
}

export function mapGiteePullToWorkItem(source: PullRowSource, repoId: string): GiteeWorkItem {
  const branchName = source.branchName?.trim()
  const baseRefName = source.baseRefName?.trim()
  return {
    id: `gitee-pr-${repoId}-${source.number}`,
    type: 'pr',
    number: source.number,
    title: source.title,
    state: source.state,
    url: source.url,
    labels: rowLabels(source.labels),
    updatedAt: source.updatedAt ?? '',
    author: source.author ?? null,
    ...(branchName ? { branchName } : {}),
    ...(baseRefName ? { baseRefName } : {}),
    repoId
  }
}

export async function listGiteeIssuesForTaskPage(
  repoPath: string,
  options: GiteeTaskPageListOptions = {}
): Promise<GiteeTaskPageResult> {
  const {
    state,
    page,
    limit,
    repoId = repoPath,
    connectionId,
    ...executionOptions
  } = options
  try {
    // Why: the task-page adapter owns renderer row identity while the issues
    // client remains a provider-shaped API usable by details and mutations.
    const response = await listGiteeIssues(
      repoPath,
      {
        state: normalizeState(state),
        page: normalizePositiveInteger(page, 1, MAX_PAGE),
        perPage: normalizePositiveInteger(limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
      },
      connectionId,
      executionOptions
    )
    const result = normalizeClientResult(response)
    return {
      items: result.items.map((item) => mapGiteeIssueToWorkItem(item, repoId)),
      ...(result.error ? { error: result.error } : {})
    }
  } catch (error) {
    return { items: [], error: listError(error) }
  }
}

export async function listGiteePullsForTaskPage(
  repoPath: string,
  options: GiteeTaskPageListOptions = {}
): Promise<GiteeTaskPageResult> {
  const {
    state,
    page,
    limit,
    repoId = repoPath,
    connectionId,
    ...executionOptions
  } = options
  try {
    // Why: PR discovery stays in the existing Gitee client; this layer only
    // adapts provider records to the row contract shared by the Tasks UI.
    const response = await listGiteePulls(repoPath, {
      state: normalizeState(state),
      page: normalizePositiveInteger(page, 1, MAX_PAGE),
      perPage: normalizePositiveInteger(limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...(connectionId !== undefined ? { connectionId } : {}),
      ...executionOptions
    })
    const result = normalizeClientResult(response)
    return {
      items: result.items.map((item) => mapGiteePullToWorkItem(item, repoId)),
      ...(result.error ? { error: result.error } : {})
    }
  } catch (error) {
    return { items: [], error: listError(error) }
  }
}

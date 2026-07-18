import { getGiteeRepoRef, isGiteeHost, type GiteeRepoRef } from './repository-ref'
import {
  getHostedReviewLocalGitOptions,
  type HostedReviewExecutionOptions
} from '../source-control/hosted-review-git-options'

const REQUEST_TIMEOUT_MS = 5000

type GiteeAuthConfig = {
  apiBaseUrl: string | null
  token: string | null
}

export type GiteeApiRequestErrorKind = 'authentication' | 'rate_limited' | 'server'

export class GiteeApiRequestError extends Error {
  readonly kind: GiteeApiRequestErrorKind
  readonly status: number

  constructor(kind: GiteeApiRequestErrorKind, status: number) {
    super(`Gitee API request failed (${kind}, HTTP ${status})`)
    this.name = 'GiteeApiRequestError'
    this.kind = kind
    this.status = status
  }
}

export type RequestOptions = {
  searchParams?: Record<string, string | number>
  timeoutMs?: number
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
}

function envValue(name: string): string | null {
  const value = process.env[name]?.trim() ?? ''
  return value.length > 0 ? value : null
}

export function normalizeGiteeApiBaseUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !isGiteeHost(url.hostname) ||
      url.search ||
      url.hash
    ) {
      return null
    }
    const basePath = url.pathname.replace(/\/+$/, '')
    url.pathname = /\/api\/v5$/i.test(basePath) ? basePath : `${basePath}/api/v5`
    return url.toString()
  } catch {
    return null
  }
}

export function getGiteeAuthConfig(): GiteeAuthConfig {
  const apiBaseUrl = envValue('ORCA_GITEE_API_BASE_URL')
  return {
    apiBaseUrl: apiBaseUrl ? normalizeGiteeApiBaseUrl(apiBaseUrl) : null,
    token: envValue('ORCA_GITEE_TOKEN')
  }
}

function authHeaders(config: Pick<GiteeAuthConfig, 'token'>): Record<string, string> {
  return config.token ? { Authorization: `token ${config.token}` } : {}
}

export function configuredApiBaseUrl(repo: GiteeRepoRef): string {
  return getGiteeAuthConfig().apiBaseUrl ?? repo.apiBaseUrl
}

function responseErrorKind(status: number): GiteeApiRequestErrorKind | null {
  if (status === 401 || status === 403) {
    return 'authentication'
  }
  if (status === 429) {
    return 'rate_limited'
  }
  return status >= 500 && status <= 599 ? 'server' : null
}

function apiUrl(baseUrl: string, path: string, searchParams?: RequestOptions['searchParams']): URL {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path}`)
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, String(value))
    }
  }
  return url
}

export async function requestJsonAtBase<T>(
  baseUrl: string,
  path: string,
  options: RequestOptions = {}
): Promise<T | null> {
  const config = getGiteeAuthConfig()
  const method = options.method ?? 'GET'
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...authHeaders(config)
    }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    const response = await fetch(apiUrl(baseUrl, path, options.searchParams), {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS)
    })
    if (!response.ok) {
      const kind = responseErrorKind(response.status)
      if (kind) {
        throw new GiteeApiRequestError(kind, response.status)
      }
      return null
    }
    // Why: some Gitee mutations return 204/empty; treat empty success as null
    // without throwing so callers can interpret status-only responses.
    const text = await response.text()
    if (!text.trim()) {
      return null
    }
    return JSON.parse(text) as T
  } catch (error) {
    if (error instanceof GiteeApiRequestError) {
      throw error
    }
    return null
  }
}

export function requestJson<T>(
  repo: GiteeRepoRef,
  path: string,
  options: RequestOptions = {}
): Promise<T | null> {
  return requestJsonAtBase(configuredApiBaseUrl(repo), path, options)
}

export function encodedRepoPath(repo: GiteeRepoRef): string {
  return `${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`
}

export async function resolveGiteeRepo(
  repoPath: string,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<GiteeRepoRef | null> {
  return getGiteeRepoRef(repoPath, connectionId, getHostedReviewLocalGitOptions(options))
}

export function giteeMutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof GiteeApiRequestError) {
    return error.message
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return fallback
}

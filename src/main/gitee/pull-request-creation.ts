import type { CreateHostedReviewInput, CreateHostedReviewResult } from '../../shared/hosted-review'
import {
  normalizeHostedReviewBaseRef,
  normalizeHostedReviewHeadRef
} from '../../shared/hosted-review-refs'
import {
  HostedReviewApiRequestError,
  requestHostedReviewJson
} from '../source-control/hosted-review-api-request'
import {
  getHostedReviewLocalGitOptions,
  type HostedReviewExecutionOptions
} from '../source-control/hosted-review-git-options'
import { readHostedPullRequestTemplate } from '../source-control/pull-request-template'
import {
  getGiteePullRequestForBranch,
  invalidateGiteePullRequestScanForRepo,
  normalizeGiteeApiBaseUrl
} from './client'
import { mapGiteePullRequest, type RawGiteePullRequest } from './pull-request-mappers'
import { getGiteeRepoRef, type GiteeRepoRef } from './repository-ref'

const CREATE_REQUEST_TIMEOUT_MS = 60_000

function envValue(name: string): string | null {
  const value = process.env[name]?.trim() ?? ''
  return value.length > 0 ? value : null
}

function configuredApiBaseUrl(repo: GiteeRepoRef): string {
  const configured = envValue('ORCA_GITEE_API_BASE_URL')
  return (configured ? normalizeGiteeApiBaseUrl(configured) : null) ?? repo.apiBaseUrl
}

export function isGiteeReviewCreationAuthenticated(): boolean {
  return envValue('ORCA_GITEE_TOKEN') !== null
}

function authHeaders(): Record<string, string> {
  const token = envValue('ORCA_GITEE_TOKEN')
  return token ? { Authorization: `token ${token}` } : {}
}

function apiUrl(repo: GiteeRepoRef, path: string): URL {
  return new URL(`${configuredApiBaseUrl(repo).replace(/\/+$/, '')}${path}`)
}

function encodedRepoPath(repo: GiteeRepoRef): string {
  return `${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`
}

function apiErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function classifyCreateError(error: unknown): CreateHostedReviewResult {
  const message = apiErrorMessage(error)
  const lower = message.toLowerCase()
  const status = error instanceof HostedReviewApiRequestError ? error.status : null
  let classified: CreateHostedReviewResult
  if (
    status === 401 ||
    status === 403 ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('authentication')
  ) {
    classified = {
      ok: false,
      code: 'auth_required',
      error:
        'Create PR failed: Gitee is not authenticated. Next step: set ORCA_GITEE_TOKEN in this environment.'
    }
  } else if (status === 409 || lower.includes('already exists') || lower.includes('already open')) {
    classified = {
      ok: false,
      code: 'already_exists',
      error: 'A pull request already exists for this branch.'
    }
  } else if (error instanceof HostedReviewApiRequestError && error.timedOut) {
    classified = {
      ok: false,
      code: 'unknown_completion',
      error: 'PR creation may have completed. Refreshing branch review state...'
    }
  } else if (status === 400 || status === 422 || lower.includes('validation')) {
    classified = {
      ok: false,
      code: 'validation',
      error:
        'Create PR failed: Gitee rejected the pull request. Check the base branch and branch state, then try again.'
    }
  } else {
    classified = {
      ok: false,
      code: 'unknown',
      error: 'Create PR failed: Gitee could not create the pull request. Try again in a moment.'
    }
  }
  console.warn('createGiteePullRequest failed', {
    category: classified.ok ? 'unknown' : classified.code,
    status
  })
  return classified
}

async function findExistingPullRequest(
  repoPath: string,
  head: string,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<{ number: number; url: string } | null> {
  const repo = await getGiteeRepoRef(
    repoPath,
    connectionId,
    getHostedReviewLocalGitOptions(options)
  )
  if (repo) {
    invalidateGiteePullRequestScanForRepo(repo)
  }
  const existing = await getGiteePullRequestForBranch(repoPath, head, null, connectionId, options)
  return existing ? { number: existing.number, url: existing.url } : null
}

export async function createGiteePullRequest(
  repoPath: string,
  input: CreateHostedReviewInput,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<CreateHostedReviewResult> {
  if (input.provider !== 'gitee') {
    return {
      ok: false,
      code: 'unsupported_provider',
      error: 'Creating reviews for this provider is not supported yet.'
    }
  }

  if (!isGiteeReviewCreationAuthenticated()) {
    return {
      ok: false,
      code: 'auth_required',
      error:
        'Create PR failed: Gitee is not authenticated. Next step: set ORCA_GITEE_TOKEN in this environment.'
    }
  }

  const repo = await getGiteeRepoRef(
    repoPath,
    connectionId,
    getHostedReviewLocalGitOptions(options)
  )
  if (!repo) {
    return {
      ok: false,
      code: 'unsupported_provider',
      error: 'Creating pull requests requires a Gitee remote.'
    }
  }

  const base = normalizeHostedReviewBaseRef(input.base)
  const head = input.head ? normalizeHostedReviewHeadRef(input.head) : ''
  const title = input.title.trim()
  if (!base || !head || !title) {
    return {
      ok: false,
      code: 'validation',
      error: 'Create PR failed: base branch, head branch, and title are required.'
    }
  }
  if (head.toLowerCase() === base.toLowerCase()) {
    return {
      ok: false,
      code: 'validation',
      error: 'Create PR failed: choose a different base branch before creating a pull request.'
    }
  }

  const body =
    input.useTemplate && !input.body?.trim()
      ? await readHostedPullRequestTemplate(repoPath, connectionId)
      : (input.body ?? '')
  const requestBody = {
    base,
    head,
    title,
    body,
    ...(input.draft ? { draft: true } : {})
  }

  try {
    const raw = await requestHostedReviewJson<RawGiteePullRequest>(
      apiUrl(repo, `/repos/${encodedRepoPath(repo)}/pulls`),
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify(requestBody)
      },
      CREATE_REQUEST_TIMEOUT_MS
    )
    const created = mapGiteePullRequest(raw)
    if (created) {
      invalidateGiteePullRequestScanForRepo(repo)
      return { ok: true, number: created.number, url: created.url }
    }
    const found = await findExistingPullRequest(repoPath, head, connectionId, options).catch(
      () => null
    )
    return found
      ? { ok: true, ...found }
      : {
          ok: false,
          code: 'unknown_completion',
          error: 'PR creation may have completed. Refreshing branch review state...'
        }
  } catch (error) {
    const classified = classifyCreateError(error)
    if (
      !classified.ok &&
      (classified.code === 'already_exists' || classified.code === 'unknown_completion')
    ) {
      const existing = await findExistingPullRequest(repoPath, head, connectionId, options).catch(
        () => null
      )
      if (existing) {
        return {
          ok: false,
          code: 'already_exists',
          error: 'A pull request already exists for this branch.',
          existingReview: existing
        }
      }
    }
    return classified
  }
}

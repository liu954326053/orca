/* Why: parallel to ipc/gitlab.ts — keep Gitee task-page IPC co-located so
repo-path validation and token-safe auth status stay one reviewable surface. */
import { ipcMain } from 'electron'
import { resolve } from 'node:path'
import type { Repo } from '../../shared/types'
import { getRepoExecutionHostId } from '../../shared/execution-host'
import type { TaskSourceContext } from '../../shared/task-source-context'
import type { Store } from '../persistence'
import {
  addGiteeIssueComment,
  createGiteeIssue,
  getGiteeAuthStatus,
  getGiteeIssueWithComments,
  getGiteeRepoSlug,
  listGiteeIssues,
  listGiteePulls,
  updateGiteeIssue,
  type CreateGiteeIssueInput,
  type GiteeIssueState,
  type GiteePullListState,
  type UpdateGiteeIssueInput
} from '../gitee/client'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import type { HostedReviewExecutionOptions } from '../source-control/hosted-review-git-options'

type GiteeRepoSelectorArgs = {
  repoPath: string
  repoId?: string | null
  sourceContext?: TaskSourceContext | null
}

// Why: TaskProvider may gain 'gitee' in a sibling wave; read as string so this
// IPC surface can already enforce host isolation without blocking on that type.
function taskSourceProvider(sourceContext: TaskSourceContext | null | undefined): string | null {
  const provider = sourceContext?.provider
  return typeof provider === 'string' && provider.trim() ? provider.trim() : null
}

function findRegisteredGiteeRepo(args: GiteeRepoSelectorArgs, store: Store): Repo | undefined {
  const sourceRepoId =
    taskSourceProvider(args.sourceContext) === 'gitee'
      ? args.sourceContext?.repoId?.trim()
      : null
  const repoId = args.repoId?.trim() || sourceRepoId || null
  if (repoId) {
    const repo = store.getRepo(repoId)
    if (repo) {
      return repo
    }
  }
  const resolvedRepoPath = resolve(args.repoPath)
  return store.getRepos().find((r) => resolve(r.path) === resolvedRepoPath)
}

// Why: mirror github/gitlab assertRegisteredRepo — main handlers must never
// operate on a path the user hasn't registered (filesystem-auth boundary).
function assertRegisteredRepo(args: GiteeRepoSelectorArgs, store: Store): Repo {
  const repo = findRegisteredGiteeRepo(args, store)
  if (!repo) {
    throw new Error('Access denied: unknown repository path')
  }
  if (
    taskSourceProvider(args.sourceContext) === 'gitee' &&
    args.sourceContext &&
    args.sourceContext.hostId !== getRepoExecutionHostId(repo)
  ) {
    throw new Error('Access denied: Gitee source host does not match repository host')
  }
  return repo
}

function repoConnectionId(repo: Repo): string | null {
  return repo.connectionId ?? null
}

function hostedReviewOptionArgs(store: Store, repo: Repo): HostedReviewExecutionOptions {
  const localGitOptions = getLocalProjectWorktreeGitOptions(store, repo)
  return localGitOptions.wslDistro
    ? { localGitExecOptions: { wslDistro: localGitOptions.wslDistro } }
    : {}
}

function normalizePositiveInteger(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.min(Math.max(1, Math.trunc(value)), max)
}

function normalizeIssueListState(value: unknown): GiteeIssueState | 'all' {
  if (value === 'closed' || value === 'all' || value === 'progressing' || value === 'rejected') {
    return value
  }
  return 'open'
}

function normalizePullListState(value: unknown): GiteePullListState {
  return value === 'closed' || value === 'all' ? value : 'open'
}

function normalizeSearchText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeLabelList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const labels = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  return labels.length > 0 ? labels : null
}

function normalizeIssueNumber(value: unknown): string | null {
  // Why: Gitee public issue ids are often alphanumeric (e.g. IK1X2N), not ints.
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value))
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  return null
}

export function registerGiteeHandlers(store: Store): void {
  // Why: never return ORCA_GITEE_TOKEN (or any secret) over IPC — only booleans
  // and non-secret account/baseUrl metadata for empty-state token guidance.
  ipcMain.handle('gitee:authStatus', async () => getGiteeAuthStatus())

  ipcMain.handle('gitee:repoSlug', async (_event, args: GiteeRepoSelectorArgs) => {
    const repo = assertRegisteredRepo(args, store)
    return getGiteeRepoSlug(
      repo.path,
      repoConnectionId(repo),
      hostedReviewOptionArgs(store, repo)
    )
  })

  ipcMain.handle(
    'gitee:listIssues',
    async (
      _event,
      args: GiteeRepoSelectorArgs & {
        state?: GiteeIssueState | 'all'
        page?: number
        perPage?: number
        limit?: number
        q?: string
        creator?: string
        assignee?: string
        labels?: string[]
      }
    ) => {
      const repo = assertRegisteredRepo(args, store)
      const perPage = normalizePositiveInteger(args.perPage ?? args.limit, 20, 100)
      const q = normalizeSearchText(args.q)
      const creator = normalizeSearchText(args.creator)
      const assignee = normalizeSearchText(args.assignee)
      const labels = normalizeLabelList(args.labels)
      const items = await listGiteeIssues(
        repo.path,
        {
          state: normalizeIssueListState(args.state),
          page: normalizePositiveInteger(args.page, 1, 10_000),
          perPage,
          // Why: omit empty filters so the client keeps the compact query
          // string that Gitee's list cache keys on.
          ...(q ? { q } : {}),
          ...(creator ? { creator } : {}),
          ...(assignee ? { assignee } : {}),
          ...(labels ? { labels } : {})
        },
        repoConnectionId(repo),
        hostedReviewOptionArgs(store, repo)
      )
      // Why: match GitLab listIssues envelope so the Tasks page can share
      // empty/error rendering without a Gitee-only branch.
      return { items }
    }
  )

  ipcMain.handle(
    'gitee:getIssue',
    async (_event, args: GiteeRepoSelectorArgs & { number: string | number }) => {
      const repo = assertRegisteredRepo(args, store)
      const issueNumber = normalizeIssueNumber(args.number)
      if (issueNumber == null) {
        return null
      }
      return getGiteeIssueWithComments(
        repo.path,
        issueNumber,
        repoConnectionId(repo),
        hostedReviewOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle(
    'gitee:listPulls',
    async (
      _event,
      args: GiteeRepoSelectorArgs & {
        state?: GiteePullListState
        page?: number
        perPage?: number
      }
    ) => {
      const repo = assertRegisteredRepo(args, store)
      return listGiteePulls(repo.path, {
        state: normalizePullListState(args.state),
        page: normalizePositiveInteger(args.page, 1, 10_000),
        perPage: normalizePositiveInteger(args.perPage, 30, 50),
        connectionId: repoConnectionId(repo),
        ...hostedReviewOptionArgs(store, repo)
      })
    }
  )

  ipcMain.handle(
    'gitee:createIssue',
    async (
      _event,
      args: GiteeRepoSelectorArgs & {
        title: string
        body?: string
        labels?: string[]
      }
    ) => {
      const repo = assertRegisteredRepo(args, store)
      const input: CreateGiteeIssueInput = {
        title: typeof args.title === 'string' ? args.title : '',
        ...(typeof args.body === 'string' ? { body: args.body } : {}),
        ...(Array.isArray(args.labels) ? { labels: args.labels } : {})
      }
      const created = await createGiteeIssue(
        repo.path,
        input,
        repoConnectionId(repo),
        hostedReviewOptionArgs(store, repo)
      )
      // Why: only confirm success when the created issue carries a usable
      // public number — the renderer keys the follow-up refresh/open on it.
      if (!created || !created.number) {
        return { ok: false as const, error: 'Failed to create Gitee issue' }
      }
      return { ok: true as const, number: created.number, url: created.url }
    }
  )

  ipcMain.handle(
    'gitee:updateIssue',
    async (
      _event,
      args: GiteeRepoSelectorArgs & { number: number; updates: UpdateGiteeIssueInput }
    ) => {
      const repo = assertRegisteredRepo(args, store)
      const issueNumber = normalizeIssueNumber(args.number)
      if (issueNumber == null) {
        return { ok: false as const, error: 'Invalid issue number' }
      }
      const updated = await updateGiteeIssue(
        repo.path,
        issueNumber,
        args.updates ?? {},
        repoConnectionId(repo),
        hostedReviewOptionArgs(store, repo)
      )
      if (!updated) {
        return { ok: false as const, error: 'Failed to update Gitee issue' }
      }
      return { ok: true as const }
    }
  )

  ipcMain.handle(
    'gitee:addIssueComment',
    async (_event, args: GiteeRepoSelectorArgs & { number: number; body: string }) => {
      const repo = assertRegisteredRepo(args, store)
      const issueNumber = normalizeIssueNumber(args.number)
      if (issueNumber == null) {
        return { ok: false as const, error: 'Invalid issue number' }
      }
      const comment = await addGiteeIssueComment(
        repo.path,
        issueNumber,
        typeof args.body === 'string' ? args.body : '',
        repoConnectionId(repo),
        hostedReviewOptionArgs(store, repo)
      )
      if (!comment) {
        return { ok: false as const, error: 'Failed to add Gitee issue comment' }
      }
      return { ok: true as const, comment }
    }
  )
}

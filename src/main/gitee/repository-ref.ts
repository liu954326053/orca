import { gitExecFileAsync } from '../git/runner'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'

export type GiteeRepoRef = {
  host: string
  owner: string
  repo: string
  apiBaseUrl: string
  webBaseUrl: string
}

type LocalGitExecOptions = {
  wslDistro?: string
}

const REPO_REF_CACHE_MAX_ENTRIES = 512
const repoRefCache = new Map<string, GiteeRepoRef | null>()

/** @internal - exposed for tests only */
export function _resetGiteeRepoRefCache(): void {
  repoRefCache.clear()
}

/** @internal - exposed for tests only */
export function _getGiteeRepoRefCacheSize(): number {
  return repoRefCache.size
}

export function isGiteeHost(host: string): boolean {
  const normalized = host.trim().toLowerCase()
  return normalized === 'gitee.com' || normalized.endsWith('.gitee.com')
}

function rememberRepoRefCacheEntry(cacheKey: string, value: GiteeRepoRef | null): void {
  repoRefCache.set(cacheKey, value)
  while (repoRefCache.size > REPO_REF_CACHE_MAX_ENTRIES) {
    const oldestKey = repoRefCache.keys().next().value
    if (oldestKey === undefined) {
      return
    }
    repoRefCache.delete(oldestKey)
  }
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseOwnerRepo(pathname: string): { owner: string; repo: string } | null {
  const withoutSuffix = pathname.replace(/\/+$/, '').replace(/\.git$/i, '')
  const parts = withoutSuffix
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length < 2) {
    return null
  }

  const owner = decodeSegment(parts.at(-2) ?? '')
  const repo = decodeSegment(parts.at(-1) ?? '')
  if (!owner || !repo) {
    return null
  }

  return { owner, repo }
}

function makeRepoRef(host: string, path: string, webOrigin: string): GiteeRepoRef | null {
  const normalizedHost = host.toLowerCase()
  // Why: Gitee is a named product host family, not a catch-all forge. Only
  // claim remotes we can call with Gitee API v5 without colliding with Gitea.
  if (!isGiteeHost(normalizedHost)) {
    return null
  }

  const parsed = parseOwnerRepo(path)
  if (!parsed) {
    return null
  }

  const webBaseUrl = webOrigin.replace(/\/+$/, '')
  return {
    host: normalizedHost,
    owner: parsed.owner,
    repo: parsed.repo,
    // Why: Git remotes may use plaintext HTTP, but API requests may only use
    // the authenticated HTTPS Gitee origin derived from the validated host.
    apiBaseUrl: `https://${normalizedHost}/api/v5`,
    webBaseUrl
  }
}

export function parseGiteeRepoRef(remoteUrl: string): GiteeRepoRef | null {
  const trimmed = remoteUrl.trim()
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    const scpLike = trimmed.match(/^(?:[^@/:]+@)?([^:\s/]+):([^\s]+?)(?:\.git)?$/)
    if (scpLike) {
      const host = scpLike[1]
      const path = scpLike[2]
      return makeRepoRef(host, path, `https://${host.toLowerCase()}`)
    }
  }

  try {
    const url = new URL(trimmed)
    const protocol = url.protocol.toLowerCase()
    if (!['http:', 'https:', 'ssh:', 'git+ssh:'].includes(protocol)) {
      return null
    }

    const webOrigin =
      protocol === 'http:' || protocol === 'https:'
        ? `${protocol}//${url.host}`
        : `https://${url.hostname.toLowerCase()}`
    return makeRepoRef(url.hostname, url.pathname, webOrigin)
  } catch {
    return null
  }
}

export async function getGiteeRepoRefForRemote(
  repoPath: string,
  remoteName: string,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GiteeRepoRef | null> {
  const runtimeKey = connectionId ?? `local:${localGitOptions.wslDistro ?? 'host'}`
  const cacheKey = `${runtimeKey}\0${repoPath}\0${remoteName}`
  if (repoRefCache.has(cacheKey)) {
    return repoRefCache.get(cacheKey)!
  }
  try {
    const sshGitProvider = connectionId ? getSshGitProvider(connectionId) : null
    if (connectionId && !sshGitProvider) {
      return null
    }
    const { stdout } = sshGitProvider
      ? await sshGitProvider.exec(['remote', 'get-url', remoteName], repoPath)
      : await gitExecFileAsync(['remote', 'get-url', remoteName], {
          cwd: repoPath,
          ...(localGitOptions.wslDistro ? { wslDistro: localGitOptions.wslDistro } : {})
        })
    const result = parseGiteeRepoRef(stdout)
    rememberRepoRefCacheEntry(cacheKey, result)
    return result
  } catch {
    if (connectionId) {
      // Why: SSH provider failures are often transient reconnect/tunnel states;
      // caching them as "not Gitee" would poison the repo for the session.
      return null
    }
    rememberRepoRefCacheEntry(cacheKey, null)
    return null
  }
}

export async function getGiteeRepoRef(
  repoPath: string,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GiteeRepoRef | null> {
  return getGiteeRepoRefForRemote(repoPath, 'origin', connectionId, localGitOptions)
}

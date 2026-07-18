import type { RawGiteePullRequest } from './pull-request-mappers'

export type GiteePullRequestPageFetcher = (page: number) => Promise<RawGiteePullRequest[] | null>

type GiteePullRequestScanEntry = {
  expiresAt: number
  expirationTimer: ReturnType<typeof setTimeout>
  pullRequests: RawGiteePullRequest[]
}

const SCAN_TTL_MS = 30_000
const FAILED_SCAN_RETRY_MS = 3_000
const MAX_SCAN_CACHE_ENTRIES = 32

const scanCache = new Map<string, GiteePullRequestScanEntry>()
const inFlightScans = new Map<string, Promise<RawGiteePullRequest[]>>()
const scanGenerations = new Map<string, number>()
const activeScanCounts = new Map<string, number>()

function removeScanCacheEntry(repoKey: string, expected?: GiteePullRequestScanEntry): void {
  const entry = scanCache.get(repoKey)
  if (!entry || (expected && entry !== expected)) {
    return
  }
  clearTimeout(entry.expirationTimer)
  scanCache.delete(repoKey)
}

function rememberScanCacheEntry(
  repoKey: string,
  pullRequests: RawGiteePullRequest[],
  ttlMs: number
): void {
  removeScanCacheEntry(repoKey)
  let entry!: GiteePullRequestScanEntry
  const expirationTimer = setTimeout(() => removeScanCacheEntry(repoKey, entry), ttlMs)
  expirationTimer.unref()
  entry = {
    expiresAt: Date.now() + ttlMs,
    expirationTimer,
    pullRequests
  }
  scanCache.set(repoKey, entry)
  while (scanCache.size > MAX_SCAN_CACHE_ENTRIES) {
    const oldestKey = scanCache.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    removeScanCacheEntry(oldestKey)
  }
}

function reusableScanCacheEntry(repoKey: string): GiteePullRequestScanEntry | null {
  const entry = scanCache.get(repoKey)
  if (!entry) {
    return null
  }
  if (Date.now() >= entry.expiresAt) {
    removeScanCacheEntry(repoKey, entry)
    return null
  }
  scanCache.delete(repoKey)
  scanCache.set(repoKey, entry)
  return entry
}

/**
 * Why: branch lookup may need to paginate /pulls when the head filter is
 * unavailable. Coalesce concurrent card refreshes so one listing serves many
 * worktrees for the same Gitee repo.
 */
export async function scanGiteePullRequests(
  repoKey: string,
  fetchPage: GiteePullRequestPageFetcher,
  pageLimit: number,
  maxPages: number
): Promise<RawGiteePullRequest[]> {
  const cached = reusableScanCacheEntry(repoKey)
  if (cached) {
    return cached.pullRequests
  }
  const running = inFlightScans.get(repoKey)
  if (running) {
    return running
  }
  const generation = scanGenerations.get(repoKey) ?? 0
  activeScanCounts.set(repoKey, (activeScanCounts.get(repoKey) ?? 0) + 1)
  const scan = (async () => {
    const pullRequests: RawGiteePullRequest[] = []
    let completed = true
    for (let page = 1; page <= maxPages; page++) {
      const list = await fetchPage(page)
      if (!list) {
        completed = false
        break
      }
      pullRequests.push(...list)
      if (list.length < pageLimit) {
        break
      }
    }
    if ((scanGenerations.get(repoKey) ?? 0) === generation) {
      rememberScanCacheEntry(repoKey, pullRequests, completed ? SCAN_TTL_MS : FAILED_SCAN_RETRY_MS)
    }
    return pullRequests
  })()
  inFlightScans.set(repoKey, scan)
  try {
    return await scan
  } finally {
    if (inFlightScans.get(repoKey) === scan) {
      inFlightScans.delete(repoKey)
    }
    const activeScans = (activeScanCounts.get(repoKey) ?? 1) - 1
    if (activeScans > 0) {
      activeScanCounts.set(repoKey, activeScans)
    } else {
      activeScanCounts.delete(repoKey)
      scanGenerations.delete(repoKey)
    }
  }
}

export function invalidateGiteePullRequestScan(repoKey: string): void {
  removeScanCacheEntry(repoKey)
  inFlightScans.delete(repoKey)
  if ((activeScanCounts.get(repoKey) ?? 0) > 0) {
    scanGenerations.set(repoKey, (scanGenerations.get(repoKey) ?? 0) + 1)
  } else {
    scanGenerations.delete(repoKey)
  }
}

export function _resetGiteePullRequestScanCache(): void {
  for (const repoKey of scanCache.keys()) {
    removeScanCacheEntry(repoKey)
  }
  inFlightScans.clear()
  scanGenerations.clear()
  activeScanCounts.clear()
}

export function _getGiteePullRequestScanCacheSize(): number {
  return scanCache.size
}

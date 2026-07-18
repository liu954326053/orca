export type RawGiteeIssueUser = {
  login?: string | null
  name?: string | null
}

export type RawGiteeLabel = {
  id?: number
  name?: string | null
  color?: string | null
}

export type RawGiteeIssue = {
  // Why: Gitee issue "number" is often an alphanumeric public id (e.g. IK1X2N),
  // not a GitHub-style integer. Accept both shapes from the API.
  number?: number | string
  title?: string | null
  state?: string | null
  body?: string | null
  html_url?: string | null
  created_at?: string | null
  updated_at?: string | null
  user?: RawGiteeIssueUser | null
  assignee?: RawGiteeIssueUser | null
  // Why: Gitee's /issues endpoint emits labels as objects or bare strings
  // depending on API scope; both forms must be handled.
  labels?: (RawGiteeLabel | string)[] | null
  comments?: number | null
  // Why: Gitee /issues list mixes real issues and pull requests; skip PR entries.
  pull_request?: unknown
}

export type RawGiteeComment = {
  id?: number
  body?: string | null
  user?: RawGiteeIssueUser | null
  created_at?: string | null
  updated_at?: string | null
}

/** Gitee v5 issue states; 'progressing' and 'rejected' are Gitee-only extensions. */
export type GiteeIssueState = 'open' | 'closed' | 'progressing' | 'rejected'

export type GiteeIssueInfo = {
  /** Public issue id for URLs/API (numeric string or alphanumeric like IK1X2N). */
  number: string
  title: string
  state: GiteeIssueState
  url: string
  labels: string[]
  body: string
  updatedAt: string
  author: string | null
}

export type GiteeLabelInfo = {
  id: number
  name: string
  color: string
}

export type GiteeCommentInfo = {
  id: number
  body: string
  author: string | null
  createdAt: string
  updatedAt: string
}

export function mapGiteeIssueState(raw: string | null | undefined): GiteeIssueState {
  const s = raw?.trim().toLowerCase()
  if (s === 'closed') {
    return 'closed'
  }
  if (s === 'progressing') {
    return 'progressing'
  }
  if (s === 'rejected') {
    return 'rejected'
  }
  return 'open'
}

function extractLabelName(label: RawGiteeLabel | string): string {
  return typeof label === 'string' ? label : (label.name ?? '')
}

export function normalizeGiteeIssueNumber(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value))
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  return null
}

export function mapGiteeIssue(raw: RawGiteeIssue): GiteeIssueInfo | null {
  const number = normalizeGiteeIssueNumber(raw.number)
  if (!number || !raw.title || !raw.html_url) {
    return null
  }
  // Why: Gitee /issues list mixes real issues and pull requests; skip PR entries.
  // Only drop rows with a real PR payload object — `null` means "this is an issue".
  if (raw.pull_request != null) {
    return null
  }
  return {
    number,
    title: raw.title,
    state: mapGiteeIssueState(raw.state),
    url: raw.html_url,
    labels: (raw.labels ?? []).map(extractLabelName).filter(Boolean),
    body: raw.body ?? '',
    updatedAt: raw.updated_at ?? '',
    author: raw.user?.login ?? raw.user?.name ?? null
  }
}

export function mapGiteeLabel(raw: RawGiteeLabel): GiteeLabelInfo | null {
  if (typeof raw.id !== 'number' || !raw.name) {
    return null
  }
  return {
    id: raw.id,
    name: raw.name,
    color: raw.color ?? ''
  }
}

export function mapGiteeIssueComment(raw: RawGiteeComment): GiteeCommentInfo | null {
  if (typeof raw.id !== 'number') {
    return null
  }
  const createdAt = raw.created_at ?? ''
  return {
    id: raw.id,
    body: raw.body ?? '',
    author: raw.user?.login ?? raw.user?.name ?? null,
    createdAt,
    // Why: Gitee comment payloads sometimes omit updated_at; fall back to
    // created_at so callers always have a non-empty timestamp.
    updatedAt: raw.updated_at ?? createdAt
  }
}

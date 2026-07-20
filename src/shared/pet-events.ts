// Why: wire contract + pure mapping for the external desktop-pet event stream
// (`pet.events.subscribe`, see docs/reference/pet-event-protocol.md). Kept in
// shared/ and Electron-free so the transition rules are unit-testable and the
// pet client can copy the types verbatim.
//
// Granularity contract (deliberately "medium"): process chatter is ambient
// only (`state`/`activity` — never a notification), assistant replies are
// sampled (`reply`, throttled latest-wins), and only completion / needs-input
// moments notify immediately.
import type { AgentStatusIpcPayload, AgentStatusState } from './agent-status-types'

/** How often the server flushes pending activity/reply candidates. */
export const PET_ACTIVITY_FLUSH_MS = 2_000
/** Max chars for human-readable message text on the wire. */
export const PET_MESSAGE_TEXT_MAX = 500
/** Max chars for the machine-readable AskUserQuestion JSON. */
export const PET_INTERACTIVE_PROMPT_MAX = 2_000
/** Default minimum interval between `reply` events for one pane. */
export const PET_REPLY_DEFAULT_MIN_INTERVAL_MS = 30_000
/** Subscriber-tunable bounds for the reply interval. */
export const PET_REPLY_MIN_INTERVAL_MIN_MS = 5_000
export const PET_REPLY_MIN_INTERVAL_MAX_MS = 300_000

export type PetAgentSnapshot = {
  paneKey: string
  state: AgentStatusState
  agentType?: string
  worktreeId?: string
  tabId?: string
  /** User's most recent prompt, truncated to PET_MESSAGE_TEXT_MAX. */
  prompt?: string
  toolName?: string
  toolInput?: string
  /** Latest assistant text, truncated to PET_MESSAGE_TEXT_MAX. */
  lastAssistantMessage?: string
  /** AskUserQuestion JSON, truncated to PET_INTERACTIVE_PROMPT_MAX. */
  interactivePrompt?: string
  interrupted?: boolean
  stateStartedAt: number
  /** Last status-event time (ms); pets apply their own staleness cutoff. */
  updatedAt: number
}

export type PetMessageKind = 'reply' | 'needs-input' | 'completed' | 'interrupted'

export type PetEvent =
  | { type: 'ready'; subscriptionId: string }
  | { type: 'snapshot'; agents: PetAgentSnapshot[] }
  | {
      type: 'state'
      paneKey: string
      state: AgentStatusState
      agentType?: string
      worktreeId?: string
      tabId?: string
      prompt?: string
      stateStartedAt: number
      updatedAt: number
    }
  | { type: 'activity'; paneKey: string; toolName?: string; toolInput?: string }
  | {
      type: 'message'
      paneKey: string
      kind: PetMessageKind
      text: string
      agentType?: string
      worktreeId?: string
      tabId?: string
      interactivePrompt?: string
    }
  | { type: 'clear'; paneKey: string }
  | { type: 'end' }

export type PetEventsSubscribeParams = {
  /** Set false to suppress `reply` messages entirely. Default true. */
  includeReplies?: boolean
  /** Minimum ms between `reply` events per pane; clamped to [5s, 300s]. */
  replyMinIntervalMs?: number
  /** Self-reported client identity (e.g. "MyPet 1.2") shown in Orca's
   *  Settings subscriber list so users can tell subscribers apart. */
  clientName?: string
}

/** One live entry in Orca's Settings → Pet event stream subscriber list. */
export type PetSubscriberInfo = {
  subscriptionId: string
  /** Self-reported `clientName` from the subscribe params; null when omitted. */
  clientName: string | null
  /** Timestamp (ms) when the subscription was established. */
  connectedAt: number
  /** Streaming frames delivered to this subscriber so far. */
  eventCount: number
}

export function truncatePetText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function clampReplyMinInterval(ms: number | undefined): number {
  if (typeof ms !== 'number' || Number.isNaN(ms)) {
    return PET_REPLY_DEFAULT_MIN_INTERVAL_MS
  }
  return Math.min(PET_REPLY_MIN_INTERVAL_MAX_MS, Math.max(PET_REPLY_MIN_INTERVAL_MIN_MS, ms))
}

export function toPetAgentSnapshot(p: AgentStatusIpcPayload): PetAgentSnapshot {
  return {
    paneKey: p.paneKey,
    state: p.state,
    agentType: p.agentType,
    worktreeId: p.worktreeId,
    tabId: p.tabId,
    prompt: p.prompt ? truncatePetText(p.prompt, PET_MESSAGE_TEXT_MAX) : undefined,
    toolName: p.toolName,
    toolInput: p.toolInput,
    lastAssistantMessage: p.lastAssistantMessage
      ? truncatePetText(p.lastAssistantMessage, PET_MESSAGE_TEXT_MAX)
      : undefined,
    interactivePrompt: p.interactivePrompt?.slice(0, PET_INTERACTIVE_PROMPT_MAX),
    interrupted: p.interrupted,
    stateStartedAt: p.stateStartedAt,
    updatedAt: p.receivedAt
  }
}

function stateEvent(next: PetAgentSnapshot): PetEvent {
  return {
    type: 'state',
    paneKey: next.paneKey,
    state: next.state,
    agentType: next.agentType,
    worktreeId: next.worktreeId,
    tabId: next.tabId,
    prompt: next.prompt,
    stateStartedAt: next.stateStartedAt,
    updatedAt: next.updatedAt
  }
}

function momentMessage(next: PetAgentSnapshot, kind: PetMessageKind): PetEvent {
  return {
    type: 'message',
    paneKey: next.paneKey,
    kind,
    text: next.lastAssistantMessage ?? '',
    agentType: next.agentType,
    worktreeId: next.worktreeId,
    tabId: next.tabId,
    interactivePrompt: next.interactivePrompt
  }
}

function replyCandidate(next: PetAgentSnapshot): PetEvent {
  return {
    type: 'message',
    paneKey: next.paneKey,
    kind: 'reply',
    text: next.lastAssistantMessage ?? '',
    agentType: next.agentType,
    worktreeId: next.worktreeId,
    tabId: next.tabId
  }
}

function activityCandidate(next: PetAgentSnapshot): PetEvent {
  return {
    type: 'activity',
    paneKey: next.paneKey,
    toolName: next.toolName,
    toolInput: next.toolInput
  }
}

function replyChanged(prev: PetAgentSnapshot | undefined, next: PetAgentSnapshot): boolean {
  return (
    next.lastAssistantMessage !== undefined &&
    (prev === undefined || next.lastAssistantMessage !== prev.lastAssistantMessage)
  )
}

/**
 * Maps a per-pane status update to pet events. `state` and completion/
 * needs-input `message` events are meant for immediate delivery; `reply` and
 * `activity` entries are candidates the caller throttles (latest-wins).
 */
export function derivePetEvents(
  prev: PetAgentSnapshot | undefined,
  next: PetAgentSnapshot
): PetEvent[] {
  const events: PetEvent[] = []

  if (prev === undefined || prev.state !== next.state) {
    events.push(stateEvent(next))
    if (next.state === 'blocked' || next.state === 'waiting') {
      events.push(momentMessage(next, 'needs-input'))
    } else if (next.state === 'done') {
      events.push(momentMessage(next, next.interrupted ? 'interrupted' : 'completed'))
    } else if (next.state === 'working' && replyChanged(prev, next)) {
      // Why: entering working, the first utterance of the new phase rides the
      // reply channel so the pet shows it promptly (throttle resets on state
      // changes). Completion moments above carry their own text instead.
      events.push(replyCandidate(next))
    }
  } else {
    // Why: a completion/needs-input moment can first arrive without text when
    // the Stop hook races the transcript flush. When a retried update brings
    // the text, re-send the moment message itself — not just a throttled reply
    // — so the subscriber's completed/interrupted/needs-input bubble does not
    // stay empty. The prev-undefined guard makes this fire exactly once.
    const momentResent =
      prev.lastAssistantMessage === undefined &&
      next.lastAssistantMessage !== undefined &&
      (next.state === 'done' || next.state === 'blocked' || next.state === 'waiting')
    if (momentResent) {
      events.push(
        momentMessage(
          next,
          next.state === 'done' ? (next.interrupted ? 'interrupted' : 'completed') : 'needs-input'
        )
      )
    }
    if (
      !momentResent &&
      (next.state === 'blocked' || next.state === 'waiting') &&
      next.interactivePrompt !== undefined &&
      next.interactivePrompt !== prev.interactivePrompt
    ) {
      // Why: the AskUserQuestion JSON can arrive one event after the transition
      // into blocked/waiting; re-notify so the pet never misses the question.
      events.push(momentMessage(next, 'needs-input'))
    }
    if (!momentResent && replyChanged(prev, next)) {
      events.push(replyCandidate(next))
    }
  }

  if (
    next.state === 'working' &&
    (next.toolName !== undefined || next.toolInput !== undefined) &&
    (prev === undefined || next.toolName !== prev.toolName || next.toolInput !== prev.toolInput)
  ) {
    events.push(activityCandidate(next))
  }

  return events
}

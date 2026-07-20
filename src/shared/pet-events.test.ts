import { describe, expect, it } from 'vitest'
import type { AgentStatusIpcPayload } from './agent-status-types'
import {
  PET_INTERACTIVE_PROMPT_MAX,
  PET_MESSAGE_TEXT_MAX,
  PET_REPLY_DEFAULT_MIN_INTERVAL_MS,
  PET_REPLY_MIN_INTERVAL_MAX_MS,
  PET_REPLY_MIN_INTERVAL_MIN_MS,
  clampReplyMinInterval,
  derivePetEvents,
  toPetAgentSnapshot,
  type PetAgentSnapshot,
  type PetEvent
} from './pet-events'

function ipcPayload(overrides: Partial<AgentStatusIpcPayload> = {}): AgentStatusIpcPayload {
  return {
    state: 'working',
    prompt: '',
    paneKey: 'tab1:leaf1',
    connectionId: null,
    receivedAt: 1000,
    stateStartedAt: 900,
    ...overrides
  }
}

function snapshot(overrides: Partial<PetAgentSnapshot> = {}): PetAgentSnapshot {
  return {
    paneKey: 'tab1:leaf1',
    state: 'working',
    stateStartedAt: 900,
    updatedAt: 1000,
    ...overrides
  }
}

function types(events: PetEvent[]): string[] {
  return events.map((e) => (e.type === 'message' ? `message:${e.kind}` : e.type))
}

describe('toPetAgentSnapshot', () => {
  it('maps identity, state, and timing fields', () => {
    const snap = toPetAgentSnapshot(
      ipcPayload({
        agentType: 'claude',
        worktreeId: 'wt1',
        tabId: 'tab1',
        prompt: 'fix the bug',
        toolName: 'Edit',
        toolInput: 'src/a.ts',
        lastAssistantMessage: 'looking into it',
        interrupted: false
      })
    )
    expect(snap).toEqual({
      paneKey: 'tab1:leaf1',
      state: 'working',
      agentType: 'claude',
      worktreeId: 'wt1',
      tabId: 'tab1',
      prompt: 'fix the bug',
      toolName: 'Edit',
      toolInput: 'src/a.ts',
      lastAssistantMessage: 'looking into it',
      interactivePrompt: undefined,
      interrupted: false,
      stateStartedAt: 900,
      updatedAt: 1000
    })
  })

  it('truncates human text with ellipsis and machine JSON by plain slice', () => {
    const snap = toPetAgentSnapshot(
      ipcPayload({
        prompt: 'p'.repeat(PET_MESSAGE_TEXT_MAX + 10),
        lastAssistantMessage: 'm'.repeat(PET_MESSAGE_TEXT_MAX + 10),
        interactivePrompt: 'j'.repeat(PET_INTERACTIVE_PROMPT_MAX + 10)
      })
    )
    expect(snap.prompt).toBe(`${'p'.repeat(PET_MESSAGE_TEXT_MAX)}…`)
    expect(snap.lastAssistantMessage).toBe(`${'m'.repeat(PET_MESSAGE_TEXT_MAX)}…`)
    expect(snap.interactivePrompt).toBe('j'.repeat(PET_INTERACTIVE_PROMPT_MAX))
  })

  it('omits empty prompt and absent optional fields', () => {
    const snap = toPetAgentSnapshot(ipcPayload({ prompt: '' }))
    expect(snap.prompt).toBeUndefined()
    expect(snap.toolName).toBeUndefined()
    expect(snap.lastAssistantMessage).toBeUndefined()
  })
})

describe('clampReplyMinInterval', () => {
  it('defaults on undefined/NaN and clamps to bounds', () => {
    expect(clampReplyMinInterval(undefined)).toBe(PET_REPLY_DEFAULT_MIN_INTERVAL_MS)
    expect(clampReplyMinInterval(Number.NaN)).toBe(PET_REPLY_DEFAULT_MIN_INTERVAL_MS)
    expect(clampReplyMinInterval(1)).toBe(PET_REPLY_MIN_INTERVAL_MIN_MS)
    expect(clampReplyMinInterval(10_000_000)).toBe(PET_REPLY_MIN_INTERVAL_MAX_MS)
    expect(clampReplyMinInterval(45_000)).toBe(45_000)
  })
})

describe('derivePetEvents', () => {
  it('new working pane emits state + reply + activity candidates', () => {
    const events = derivePetEvents(
      undefined,
      snapshot({ lastAssistantMessage: 'hi', toolName: 'Bash', toolInput: 'ls' })
    )
    expect(types(events)).toEqual(['state', 'message:reply', 'activity'])
  })

  it('new blocked pane emits state + needs-input, no reply/activity', () => {
    const events = derivePetEvents(
      undefined,
      snapshot({ state: 'blocked', lastAssistantMessage: 'ok?' })
    )
    expect(types(events)).toEqual(['state', 'message:needs-input'])
  })

  it('working → done emits state + completed and nothing else', () => {
    const prev = snapshot({ lastAssistantMessage: 'working on it', toolName: 'Bash' })
    const next = snapshot({ state: 'done', lastAssistantMessage: 'all fixed' })
    const events = derivePetEvents(prev, next)
    expect(types(events)).toEqual(['state', 'message:completed'])
    const message = events[1]
    expect(message.type === 'message' && message.text).toBe('all fixed')
  })

  it('working → done with interrupted flag emits interrupted kind', () => {
    const events = derivePetEvents(
      snapshot({ state: 'working' }),
      snapshot({ state: 'done', interrupted: true, lastAssistantMessage: 'stopped' })
    )
    expect(types(events)).toEqual(['state', 'message:interrupted'])
  })

  it('working → blocked attaches interactivePrompt to needs-input', () => {
    const events = derivePetEvents(
      snapshot({ state: 'working' }),
      snapshot({
        state: 'blocked',
        lastAssistantMessage: 'which one?',
        interactivePrompt: '{"questions":[]}'
      })
    )
    expect(types(events)).toEqual(['state', 'message:needs-input'])
    const message = events[1]
    expect(message.type === 'message' && message.interactivePrompt).toBe('{"questions":[]}')
  })

  it('same-state assistant message change yields a reply candidate', () => {
    const prev = snapshot({ lastAssistantMessage: 'step 1', toolName: 'Bash' })
    const next = snapshot({ lastAssistantMessage: 'step 2', toolName: 'Bash' })
    expect(types(derivePetEvents(prev, next))).toEqual(['message:reply'])
  })

  it('done → done with the missing text re-sends completed instead of a reply', () => {
    const prev = snapshot({ state: 'done' })
    const next = snapshot({ state: 'done', lastAssistantMessage: 'final answer' })
    const events = derivePetEvents(prev, next)
    expect(types(events)).toEqual(['message:completed'])
    const message = events[0]
    expect(message.type === 'message' && message.text).toBe('final answer')
  })

  it('done → done on an interrupted row re-sends interrupted with the late text', () => {
    const prev = snapshot({ state: 'done', interrupted: true })
    const next = snapshot({
      state: 'done',
      interrupted: true,
      lastAssistantMessage: 'stopped early'
    })
    const events = derivePetEvents(prev, next)
    expect(types(events)).toEqual(['message:interrupted'])
    const message = events[0]
    expect(message.type === 'message' && message.text).toBe('stopped early')
  })

  it('blocked → blocked with the missing text re-sends needs-input', () => {
    const prev = snapshot({ state: 'blocked' })
    const next = snapshot({ state: 'blocked', lastAssistantMessage: 'approve this?' })
    const events = derivePetEvents(prev, next)
    expect(types(events)).toEqual(['message:needs-input'])
    const message = events[0]
    expect(message.type === 'message' && message.text).toBe('approve this?')
  })

  it('done → done with text already present keeps the reply-only behavior', () => {
    const prev = snapshot({ state: 'done', lastAssistantMessage: 'first final' })
    const next = snapshot({ state: 'done', lastAssistantMessage: 'second final' })
    expect(types(derivePetEvents(prev, next))).toEqual(['message:reply'])
  })

  it('same-state tool change while working yields an activity candidate', () => {
    const prev = snapshot({ lastAssistantMessage: 'step 1', toolName: 'Bash', toolInput: 'ls' })
    const next = snapshot({ lastAssistantMessage: 'step 1', toolName: 'Edit', toolInput: 'a.ts' })
    expect(types(derivePetEvents(prev, next))).toEqual(['activity'])
  })

  it('re-notifies needs-input when interactivePrompt arrives after the transition', () => {
    const prev = snapshot({ state: 'blocked', lastAssistantMessage: 'ok?' })
    const next = snapshot({
      state: 'blocked',
      lastAssistantMessage: 'ok?',
      interactivePrompt: '{"questions":[1]}'
    })
    expect(types(derivePetEvents(prev, next))).toEqual(['message:needs-input'])
  })

  it('does not re-notify needs-input when nothing changed', () => {
    const prev = snapshot({
      state: 'blocked',
      lastAssistantMessage: 'ok?',
      interactivePrompt: '{"questions":[]}'
    })
    const next = snapshot({
      state: 'blocked',
      lastAssistantMessage: 'ok?',
      interactivePrompt: '{"questions":[]}'
    })
    expect(derivePetEvents(prev, next)).toEqual([])
  })

  it('transition into working without a new message yields no reply candidate', () => {
    const prev = snapshot({ state: 'blocked', lastAssistantMessage: 'same text' })
    const next = snapshot({ state: 'working', lastAssistantMessage: 'same text' })
    expect(types(derivePetEvents(prev, next))).toEqual(['state'])
  })

  it('activity outside working state is never emitted', () => {
    const prev = snapshot({ state: 'waiting', toolName: undefined })
    const next = snapshot({ state: 'waiting', toolName: 'Bash', toolInput: 'ls' })
    expect(types(derivePetEvents(prev, next))).toEqual([])
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { AgentStatusStreamEvent } from '../../../agent-hooks/server'
import type { AgentStatusIpcPayload } from '../../../../shared/agent-status-types'
import type { ParsedAgentStatusPayload } from '../../../../shared/agent-status-types'
import {
  PET_ACTIVITY_FLUSH_MS,
  type PetEvent,
  type PetSubscriberInfo
} from '../../../../shared/pet-events'
import { isStreamingMethod } from '../core'
import { PET_METHODS } from './pet-events'

function method(name: string) {
  const found = PET_METHODS.find((candidate) => candidate.name === name)
  if (!found) {
    throw new Error(`Missing method ${name}`)
  }
  return found
}

function streamingSubscribe() {
  const subscribe = method('pet.events.subscribe')
  if (!isStreamingMethod(subscribe)) {
    throw new Error('pet.events.subscribe must be a streaming method')
  }
  return subscribe
}

type MockRuntime = {
  runtime: OrcaRuntimeService
  emitStream: (event: AgentStatusStreamEvent) => void
  cleanupSubscription: ReturnType<typeof vi.fn>
  runRegisteredCleanup: () => void
  unsubscribeMock: ReturnType<typeof vi.fn>
  subscriberEntries: PetSubscriberInfo[]
  unregisterPetSubscriber: ReturnType<typeof vi.fn>
  isPetEventStreamEnabled: ReturnType<typeof vi.fn>
}

function makeRuntime(snapshot: AgentStatusIpcPayload[] = []): MockRuntime {
  let streamListener: ((event: AgentStatusStreamEvent) => void) | undefined
  let registeredCleanup: (() => void) | undefined
  const unsubscribeMock = vi.fn()
  const cleanupSubscription = vi.fn((_id: string) => {
    registeredCleanup?.()
  })
  const subscriberEntries: PetSubscriberInfo[] = []
  const unregisterPetSubscriber = vi.fn()
  const isPetEventStreamEnabled = vi.fn(() => true)
  const runtime = {
    getAgentStatusSnapshot: vi.fn(() => snapshot),
    onAgentStatusStream: vi.fn((listener: (event: AgentStatusStreamEvent) => void) => {
      streamListener = listener
      return unsubscribeMock
    }),
    registerSubscriptionCleanup: vi.fn((_id: string, cleanup: () => void) => {
      registeredCleanup = cleanup
    }),
    cleanupSubscription,
    isPetEventStreamEnabled,
    registerPetSubscriber: vi.fn((info: { subscriptionId: string; clientName?: string }) => {
      const entry: PetSubscriberInfo = {
        subscriptionId: info.subscriptionId,
        clientName: info.clientName ?? null,
        connectedAt: Date.now(),
        eventCount: 0
      }
      subscriberEntries.push(entry)
      return entry
    }),
    unregisterPetSubscriber
  } as unknown as OrcaRuntimeService
  return {
    runtime,
    emitStream: (event) => streamListener?.(event),
    cleanupSubscription,
    runRegisteredCleanup: () => registeredCleanup?.(),
    unsubscribeMock,
    subscriberEntries,
    unregisterPetSubscriber,
    isPetEventStreamEnabled
  }
}

function statusEvent(
  paneKey: string,
  payload: Partial<ParsedAgentStatusPayload> & { state: ParsedAgentStatusPayload['state'] }
): AgentStatusStreamEvent {
  return {
    kind: 'status',
    event: {
      paneKey,
      connectionId: null,
      payload: { prompt: '', ...payload },
      receivedAt: Date.now(),
      stateStartedAt: Date.now()
    }
  }
}

function emittedOfType<T extends PetEvent['type']>(emit: ReturnType<typeof vi.fn>, type: T) {
  return emit.mock.calls.map(([event]) => event as PetEvent).filter((e) => e.type === type)
}

describe('pet.events.subscribe', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits ready then snapshot seeded from the runtime', async () => {
    const seeded: AgentStatusIpcPayload = {
      state: 'working',
      prompt: 'seeded task',
      paneKey: 'p0',
      connectionId: null,
      receivedAt: 500,
      stateStartedAt: 400
    }
    const mock = makeRuntime([seeded])
    const emit = vi.fn()
    const running = streamingSubscribe().handler({}, { runtime: mock.runtime }, emit)

    expect(emit).toHaveBeenCalledWith({
      type: 'ready',
      subscriptionId: expect.stringMatching(/^pet-events-/)
    })
    expect(emittedOfType(emit, 'snapshot')).toEqual([
      {
        type: 'snapshot',
        agents: [
          expect.objectContaining({ paneKey: 'p0', state: 'working', prompt: 'seeded task' })
        ]
      }
    ])

    // Seeded prev suppresses a redundant state event for an unchanged update.
    emit.mockClear()
    mock.emitStream(statusEvent('p0', { state: 'working', prompt: 'seeded task' }))
    expect(emit).not.toHaveBeenCalled()

    mock.runRegisteredCleanup()
    await running
  })

  it('emits state immediately and throttles activity/reply to the flush timer', async () => {
    const mock = makeRuntime()
    const emit = vi.fn()
    const running = streamingSubscribe().handler({}, { runtime: mock.runtime }, emit)
    emit.mockClear()

    mock.emitStream(
      statusEvent('p1', {
        state: 'working',
        lastAssistantMessage: 'on it',
        toolName: 'Bash',
        toolInput: 'ls'
      })
    )
    expect(emittedOfType(emit, 'state')).toEqual([
      expect.objectContaining({ paneKey: 'p1', state: 'working' })
    ])
    expect(emittedOfType(emit, 'activity')).toEqual([])
    expect(emittedOfType(emit, 'message')).toEqual([])

    vi.advanceTimersByTime(PET_ACTIVITY_FLUSH_MS + 10)
    expect(emittedOfType(emit, 'activity')).toEqual([
      { type: 'activity', paneKey: 'p1', toolName: 'Bash', toolInput: 'ls' }
    ])
    // First reply of a pane goes out on the first flush (throttle starts cold).
    expect(emittedOfType(emit, 'message')).toEqual([
      expect.objectContaining({ type: 'message', kind: 'reply', paneKey: 'p1', text: 'on it' })
    ])

    mock.runRegisteredCleanup()
    await running
  })

  it('throttles replies per pane with latest-wins inside the min interval', async () => {
    const mock = makeRuntime()
    const emit = vi.fn()
    const running = streamingSubscribe().handler(
      { replyMinIntervalMs: 10_000 },
      { runtime: mock.runtime },
      emit
    )
    emit.mockClear()

    mock.emitStream(statusEvent('p1', { state: 'working', lastAssistantMessage: 'first' }))
    vi.advanceTimersByTime(PET_ACTIVITY_FLUSH_MS + 10)
    expect(emittedOfType(emit, 'message')).toHaveLength(1)

    // Two quick updates inside the interval: nothing emitted, latest wins.
    mock.emitStream(statusEvent('p1', { state: 'working', lastAssistantMessage: 'second' }))
    mock.emitStream(statusEvent('p1', { state: 'working', lastAssistantMessage: 'third' }))
    vi.advanceTimersByTime(PET_ACTIVITY_FLUSH_MS + 10)
    expect(emittedOfType(emit, 'message')).toHaveLength(1)

    vi.advanceTimersByTime(10_000)
    const replies = emittedOfType(emit, 'message')
    expect(replies).toHaveLength(2)
    expect(replies[1]).toEqual(expect.objectContaining({ kind: 'reply', text: 'third' }))

    mock.runRegisteredCleanup()
    await running
  })

  it('drops a pending reply when a decisive moment arrives', async () => {
    const mock = makeRuntime()
    const emit = vi.fn()
    const running = streamingSubscribe().handler({}, { runtime: mock.runtime }, emit)
    emit.mockClear()

    mock.emitStream(statusEvent('p1', { state: 'working', lastAssistantMessage: 'first' }))
    vi.advanceTimersByTime(PET_ACTIVITY_FLUSH_MS + 10)
    emit.mockClear()

    // New utterance pending, then the agent blocks before the interval elapses.
    mock.emitStream(statusEvent('p1', { state: 'working', lastAssistantMessage: 'second' }))
    mock.emitStream(
      statusEvent('p1', {
        state: 'blocked',
        lastAssistantMessage: 'need approval',
        interactivePrompt: '{"q":1}'
      })
    )
    const messages = emittedOfType(emit, 'message')
    expect(messages).toEqual([
      expect.objectContaining({
        kind: 'needs-input',
        text: 'need approval',
        interactivePrompt: '{"q":1}'
      })
    ])

    // The pending "second" reply must never surface afterwards.
    vi.advanceTimersByTime(60_000)
    expect(emittedOfType(emit, 'message')).toHaveLength(1)

    mock.runRegisteredCleanup()
    await running
  })

  it('emits completed on done and honours includeReplies:false', async () => {
    const mock = makeRuntime()
    const emit = vi.fn()
    const running = streamingSubscribe().handler(
      { includeReplies: false },
      { runtime: mock.runtime },
      emit
    )
    emit.mockClear()

    mock.emitStream(statusEvent('p1', { state: 'working', lastAssistantMessage: 'chatter' }))
    vi.advanceTimersByTime(60_000)
    expect(emittedOfType(emit, 'message')).toEqual([])

    mock.emitStream(statusEvent('p1', { state: 'done', lastAssistantMessage: 'finished' }))
    expect(emittedOfType(emit, 'message')).toEqual([
      expect.objectContaining({ kind: 'completed', text: 'finished' })
    ])

    mock.runRegisteredCleanup()
    await running
  })

  it.each([{}, { includeReplies: false }])(
    're-sends a non-empty completed when late text lands on a done pane (%o)',
    async (params) => {
      const mock = makeRuntime()
      const emit = vi.fn()
      const running = streamingSubscribe().handler(params, { runtime: mock.runtime }, emit)
      emit.mockClear()

      mock.emitStream(statusEvent('p1', { state: 'done' }))
      expect(emittedOfType(emit, 'message')).toEqual([
        expect.objectContaining({ kind: 'completed', text: '' })
      ])
      emit.mockClear()

      mock.emitStream(statusEvent('p1', { state: 'done', lastAssistantMessage: 'final answer' }))
      expect(emittedOfType(emit, 'message')).toEqual([
        expect.objectContaining({ kind: 'completed', text: 'final answer' })
      ])

      // The re-sent moment replaces the reply candidate: nothing follows.
      vi.advanceTimersByTime(60_000)
      expect(emittedOfType(emit, 'message')).toHaveLength(1)

      mock.runRegisteredCleanup()
      await running
    }
  )

  it('emits clear and forgets the pane', async () => {
    const mock = makeRuntime()
    const emit = vi.fn()
    const running = streamingSubscribe().handler({}, { runtime: mock.runtime }, emit)
    emit.mockClear()

    mock.emitStream(statusEvent('p1', { state: 'working', lastAssistantMessage: 'hi' }))
    emit.mockClear()
    mock.emitStream({ kind: 'cleared', paneKey: 'p1' })
    expect(emittedOfType(emit, 'clear')).toEqual([{ type: 'clear', paneKey: 'p1' }])

    // A later identical-status event is treated as a fresh pane again.
    mock.emitStream(statusEvent('p1', { state: 'working', lastAssistantMessage: 'hi' }))
    expect(emittedOfType(emit, 'state')).toHaveLength(1)

    mock.runRegisteredCleanup()
    await running
  })

  it('tears down via cleanupSubscription when the transport aborts', async () => {
    const mock = makeRuntime()
    const emit = vi.fn()
    const abort = new AbortController()
    const running = streamingSubscribe().handler(
      {},
      { runtime: mock.runtime, signal: abort.signal },
      emit
    )

    abort.abort()
    await running
    expect(mock.cleanupSubscription).toHaveBeenCalledWith(expect.stringMatching(/^pet-events-/))
    expect(emittedOfType(emit, 'end')).toEqual([{ type: 'end' }])
    expect(mock.unsubscribeMock).toHaveBeenCalledOnce()
  })

  it('rejects with pet_event_stream_disabled when the Settings toggle is off', async () => {
    const mock = makeRuntime()
    mock.isPetEventStreamEnabled.mockReturnValue(false)
    const emit = vi.fn()

    await expect(
      streamingSubscribe().handler({}, { runtime: mock.runtime }, emit)
    ).rejects.toMatchObject({ code: 'pet_event_stream_disabled' })
    expect(emit).not.toHaveBeenCalled()
    expect(mock.subscriberEntries).toEqual([])
  })

  it('registers the subscriber with clientName and counts emitted frames', async () => {
    const mock = makeRuntime()
    const emit = vi.fn()
    const running = streamingSubscribe().handler(
      { clientName: 'MyPet 1.2' },
      { runtime: mock.runtime },
      emit
    )

    expect(mock.subscriberEntries).toHaveLength(1)
    const entry = mock.subscriberEntries[0]!
    expect(entry.clientName).toBe('MyPet 1.2')
    // ready + snapshot frames.
    expect(entry.eventCount).toBe(2)

    mock.emitStream(statusEvent('p1', { state: 'working', lastAssistantMessage: 'hi' }))
    expect(entry.eventCount).toBe(3)

    mock.runRegisteredCleanup()
    await running
    expect(mock.unregisterPetSubscriber).toHaveBeenCalledWith(entry.subscriptionId)
  })
})

describe('pet.events.unsubscribe', () => {
  it('cleans up the named subscription', async () => {
    const unsubscribe = method('pet.events.unsubscribe')
    if (isStreamingMethod(unsubscribe)) {
      throw new Error('pet.events.unsubscribe must be a request method')
    }
    const mock = makeRuntime()
    await expect(
      unsubscribe.handler({ subscriptionId: 'pet-events-7' }, { runtime: mock.runtime })
    ).resolves.toEqual({ unsubscribed: true })
    expect(mock.cleanupSubscription).toHaveBeenCalledWith('pet-events-7')
  })
})

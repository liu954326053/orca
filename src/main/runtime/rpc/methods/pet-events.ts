import { z } from 'zod'
import { defineMethod, defineStreamingMethod, type RpcAnyMethod } from '../core'
import type { AgentStatusIpcPayload } from '../../../../shared/agent-status-types'
import {
  PET_ACTIVITY_FLUSH_MS,
  clampReplyMinInterval,
  derivePetEvents,
  toPetAgentSnapshot,
  type PetAgentSnapshot,
  type PetEvent
} from '../../../../shared/pet-events'

// Why: external desktop pets subscribe to this stream instead of Orca
// rendering its own pet overlay. Granularity is deliberately "medium" (see
// docs/reference/pet-event-protocol.md): state/activity are ambient, replies
// are throttled latest-wins, and only completion/needs-input moments notify
// immediately — so the pet is neither silent nor noisy.

let petEventsSubscriptionSeq = 0

const PetEventsSubscribeParams = z.object({
  includeReplies: z.boolean().optional(),
  replyMinIntervalMs: z.number().int().positive().optional(),
  clientName: z.string().trim().min(1).max(80).optional()
})

const PetEventsUnsubscribeParams = z.object({
  subscriptionId: z
    .unknown()
    .transform((value) => (typeof value === 'string' && value.length > 0 ? value : ''))
    .pipe(z.string().min(1, 'Missing subscriptionId'))
})

type PaneKey = string

export const PET_METHODS: readonly RpcAnyMethod[] = [
  defineStreamingMethod({
    name: 'pet.events.subscribe',
    params: PetEventsSubscribeParams,
    handler: async (params, { runtime, signal }, emit) => {
      // Why: the stream is an outward push channel and stays off until the
      // user explicitly enables it in Settings. The structured code lets pet
      // clients point the user at the switch.
      if (!runtime.isPetEventStreamEnabled()) {
        throw Object.assign(
          new Error(
            'External pet event stream is disabled. Enable it in Orca → Settings → Experimental → Pet event stream.'
          ),
          { code: 'pet_event_stream_disabled' }
        )
      }
      const includeReplies = params.includeReplies !== false
      const replyMinIntervalMs = clampReplyMinInterval(params.replyMinIntervalMs)

      await new Promise<void>((resolve) => {
        const seq = ++petEventsSubscriptionSeq
        const subscriptionId = `pet-events-${seq}`
        const subscriber = runtime.registerPetSubscriber({
          subscriptionId,
          clientName: params.clientName
        })
        const countingEmit = (event: PetEvent): void => {
          subscriber.eventCount += 1
          emit(event)
        }

        const prevByPaneKey = new Map<PaneKey, PetAgentSnapshot>()
        const pendingActivityByPaneKey = new Map<PaneKey, PetEvent>()
        const pendingReplyByPaneKey = new Map<PaneKey, PetEvent>()
        const lastReplyEmittedAtByPaneKey = new Map<PaneKey, number>()

        const agents = runtime.getAgentStatusSnapshot().map(toPetAgentSnapshot)
        for (const agent of agents) {
          prevByPaneKey.set(agent.paneKey, agent)
        }

        const dropPending = (paneKey: PaneKey): void => {
          pendingActivityByPaneKey.delete(paneKey)
          pendingReplyByPaneKey.delete(paneKey)
        }

        const flushTimer = setInterval(() => {
          const now = Date.now()
          for (const [paneKey, event] of pendingActivityByPaneKey) {
            pendingActivityByPaneKey.delete(paneKey)
            if (prevByPaneKey.get(paneKey)?.state === 'working') {
              countingEmit(event)
            }
          }
          for (const [paneKey, event] of pendingReplyByPaneKey) {
            const lastEmittedAt = lastReplyEmittedAtByPaneKey.get(paneKey) ?? 0
            if (now - lastEmittedAt < replyMinIntervalMs) {
              continue
            }
            pendingReplyByPaneKey.delete(paneKey)
            lastReplyEmittedAtByPaneKey.set(paneKey, now)
            countingEmit(event)
          }
        }, PET_ACTIVITY_FLUSH_MS)
        // Why: a pet subscription must not keep the main process alive.
        if (typeof flushTimer.unref === 'function') {
          flushTimer.unref()
        }

        const unsubscribe = runtime.onAgentStatusStream((streamEvent) => {
          if (streamEvent.kind === 'cleared') {
            prevByPaneKey.delete(streamEvent.paneKey)
            dropPending(streamEvent.paneKey)
            lastReplyEmittedAtByPaneKey.delete(streamEvent.paneKey)
            countingEmit({ type: 'clear', paneKey: streamEvent.paneKey })
            return
          }
          const enriched = streamEvent.event
          const ipcPayload: AgentStatusIpcPayload = {
            ...enriched.payload,
            paneKey: enriched.paneKey,
            launchToken: enriched.launchToken,
            tabId: enriched.tabId,
            worktreeId: enriched.worktreeId,
            connectionId: enriched.connectionId,
            receivedAt: enriched.receivedAt,
            stateStartedAt: enriched.stateStartedAt
          }
          const next = toPetAgentSnapshot(ipcPayload)
          const prev = prevByPaneKey.get(next.paneKey)
          const events = derivePetEvents(prev, next)
          if (prev === undefined || prev.state !== next.state) {
            // Why: decisive moments (state changes, completion, needs-input)
            // carry their own text — drop any pending reply to avoid a
            // duplicate bubble, and reset the reply throttle so the new
            // phase's first utterance goes out on the next flush.
            dropPending(next.paneKey)
            lastReplyEmittedAtByPaneKey.delete(next.paneKey)
          }
          prevByPaneKey.set(next.paneKey, next)
          for (const event of events) {
            if (event.type === 'activity') {
              pendingActivityByPaneKey.set(next.paneKey, event)
            } else if (event.type === 'message' && event.kind === 'reply') {
              if (includeReplies) {
                pendingReplyByPaneKey.set(next.paneKey, event)
              }
            } else {
              countingEmit(event)
            }
          }
        })

        runtime.registerSubscriptionCleanup(subscriptionId, () => {
          unsubscribe()
          clearInterval(flushTimer)
          runtime.unregisterPetSubscriber(subscriptionId)
          countingEmit({ type: 'end' })
          resolve()
        })

        // Why: the Unix-socket transport aborts this signal when the pet's
        // connection drops; routing through cleanupSubscription keeps one
        // teardown path for disconnect, explicit unsubscribe, and shutdown.
        if (signal) {
          if (signal.aborted) {
            runtime.cleanupSubscription(subscriptionId)
          } else {
            signal.addEventListener('abort', () => runtime.cleanupSubscription(subscriptionId), {
              once: true
            })
          }
        }

        countingEmit({ type: 'ready', subscriptionId })
        countingEmit({ type: 'snapshot', agents })
      })
    }
  }),
  defineMethod({
    name: 'pet.events.unsubscribe',
    params: PetEventsUnsubscribeParams,
    handler: async (params, { runtime }) => {
      runtime.cleanupSubscription(params.subscriptionId)
      return { unsubscribed: true }
    }
  })
]

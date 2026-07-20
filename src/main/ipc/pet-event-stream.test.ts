import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handleMock, removeHandlerMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  removeHandlerMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock, removeHandler: removeHandlerMock }
}))

import { registerPetEventStreamHandlers } from './pet-event-stream'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { PetSubscriberInfo } from '../../shared/pet-events'

const SUBSCRIBERS: PetSubscriberInfo[] = [
  { subscriptionId: 'pet-events-1', clientName: 'MyPet 1.0', connectedAt: 111, eventCount: 42 }
]

function makeRuntime() {
  let listener: ((subscribers: PetSubscriberInfo[]) => void) | undefined
  const unsubscribePush = vi.fn()
  const runtime = {
    listPetSubscribers: vi.fn(() => SUBSCRIBERS),
    onPetSubscribersChanged: vi.fn((next: (subscribers: PetSubscriberInfo[]) => void) => {
      listener = next
      return unsubscribePush
    })
  } as unknown as OrcaRuntimeService
  return {
    runtime,
    emitChange: (subscribers: PetSubscriberInfo[]) => listener?.(subscribers),
    unsubscribePush
  }
}

function makeWindow() {
  return { isDestroyed: () => false, webContents: { send: vi.fn() } }
}

function handlerFor(channel: string): () => unknown {
  // Why: re-registration (macOS re-attachment) stacks handle calls; the last
  // one is the live handler.
  const handler = handleMock.mock.calls.findLast((call) => call[0] === channel)?.[1]
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`)
  }
  return handler as () => unknown
}

function makeUserDataPath(): { userDataPath: string; endpoint: string; authToken: string } {
  const userDataPath = mkdtempSync(join(tmpdir(), 'orca-pet-stream-ipc-'))
  const endpoint = join(userDataPath, 'o-1-ab.sock')
  const authToken = 'aa'.repeat(24)
  writeFileSync(
    join(userDataPath, 'orca-runtime.json'),
    JSON.stringify({
      runtimeId: 'r1',
      pid: 123,
      transports: [{ kind: 'unix', endpoint }],
      authToken,
      startedAt: 1
    })
  )
  return { userDataPath, endpoint, authToken }
}

describe('registerPetEventStreamHandlers', () => {
  beforeEach(() => {
    handleMock.mockClear()
    removeHandlerMock.mockClear()
  })

  it('serves the subscriber list from the runtime registry', () => {
    const { runtime } = makeRuntime()
    registerPetEventStreamHandlers(runtime, () => null, '/nonexistent')
    expect(handlerFor('petEventStream:listSubscribers')()).toEqual(SUBSCRIBERS)
  })

  it('builds integration material with concrete paths and no secrets', () => {
    const { runtime } = makeRuntime()
    const { userDataPath, endpoint, authToken } = makeUserDataPath()
    registerPetEventStreamHandlers(runtime, () => null, userDataPath)

    const result = handlerFor('petEventStream:getIntegrationGuide')() as {
      metadataPath: string
      endpoint: string | null
      guideMarkdown: string
      agentPromptMarkdown: string
    }
    expect(result.metadataPath).toBe(join(userDataPath, 'orca-runtime.json'))
    expect(result.endpoint).toBe(endpoint)
    expect(result.guideMarkdown).toContain(result.metadataPath)
    expect(result.agentPromptMarkdown).toContain('pet.events.subscribe')
    expect(result.guideMarkdown + result.agentPromptMarkdown).not.toContain(authToken)
  })

  it('reports a null endpoint when no metadata file exists yet', () => {
    const { runtime } = makeRuntime()
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-pet-stream-ipc-'))
    registerPetEventStreamHandlers(runtime, () => null, userDataPath)
    const result = handlerFor('petEventStream:getIntegrationGuide')() as { endpoint: unknown }
    expect(result.endpoint).toBeNull()
  })

  it('pushes subscriber changes to the main window', () => {
    const { runtime, emitChange } = makeRuntime()
    const win = makeWindow()
    registerPetEventStreamHandlers(runtime, () => win as never, '/nonexistent')

    emitChange(SUBSCRIBERS)
    expect(win.webContents.send).toHaveBeenCalledWith(
      'petEventStream:subscribersChanged',
      SUBSCRIBERS
    )
  })

  it('re-registers cleanly on macOS window re-attachment', () => {
    const first = makeRuntime()
    const second = makeRuntime()
    registerPetEventStreamHandlers(first.runtime, () => null, '/nonexistent')
    registerPetEventStreamHandlers(second.runtime, () => null, '/nonexistent')

    for (const channel of [
      'petEventStream:listSubscribers',
      'petEventStream:getIntegrationGuide'
    ]) {
      expect(removeHandlerMock).toHaveBeenCalledWith(channel)
    }
    // The first registration's push subscription is replaced, not stacked.
    expect(first.unsubscribePush).toHaveBeenCalledOnce()
    expect(handlerFor('petEventStream:listSubscribers')()).toEqual(SUBSCRIBERS)
    expect(second.runtime.listPetSubscribers).toHaveBeenCalled()
  })
})

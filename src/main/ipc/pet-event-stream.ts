import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { readRuntimeMetadata } from '../runtime/runtime-metadata'
import { findTransport, getRuntimeMetadataPath } from '../../shared/runtime-bootstrap'
import { buildPetEventStreamGuide } from '../pet-event-stream-guide'
import { buildPetAgentIntegrationPrompt } from '../pet-agent-integration-prompt'

// Why: Settings → Experimental → Pet event stream surfaces the live
// subscriber list plus copyable integration material (guide + agent prompt).
// The pet protocol itself is the runtime RPC in
// src/main/runtime/rpc/methods/pet-events.ts; this module is only the
// renderer-facing read surface.

const PET_EVENT_STREAM_IPC_CHANNELS = [
  'petEventStream:listSubscribers',
  'petEventStream:getIntegrationGuide'
] as const

let currentGetMainWindow: (() => BrowserWindow | null) | null = null
let subscribersChangedUnsubscribe: (() => void) | null = null

export function registerPetEventStreamHandlers(
  runtime: OrcaRuntimeService,
  getMainWindow: () => BrowserWindow | null,
  userDataPath: string
): void {
  // Why: macOS re-activation re-runs attach-main-window-services with a new
  // window; ipcMain.handle throws on duplicate channels, so re-register.
  for (const channel of PET_EVENT_STREAM_IPC_CHANNELS) {
    ipcMain.removeHandler(channel)
  }
  currentGetMainWindow = getMainWindow
  subscribersChangedUnsubscribe?.()
  subscribersChangedUnsubscribe = runtime.onPetSubscribersChanged((subscribers) => {
    const win = currentGetMainWindow?.()
    if (win && !win.isDestroyed()) {
      win.webContents.send('petEventStream:subscribersChanged', subscribers)
    }
  })

  ipcMain.handle('petEventStream:listSubscribers', () => runtime.listPetSubscribers())

  ipcMain.handle('petEventStream:getIntegrationGuide', () => {
    const metadataPath = getRuntimeMetadataPath(userDataPath)
    const metadata = readRuntimeMetadata(userDataPath)
    const transport = metadata ? findTransport(metadata, 'unix', 'named-pipe') : null
    const input = { metadataPath, endpoint: transport?.endpoint ?? null }
    return {
      metadataPath,
      endpoint: input.endpoint,
      guideMarkdown: buildPetEventStreamGuide(input),
      agentPromptMarkdown: buildPetAgentIntegrationPrompt(input)
    }
  })
}

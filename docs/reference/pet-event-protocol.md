# Pet Event Protocol

Orca exposes a **local, streaming RPC subscription** so an external desktop pet can
replace the built-in pet overlay: the pet process receives live agent state
(working / blocked / waiting / done), a throttled sample of assistant replies, and
immediate completion / needs-input messages — then renders its own character,
animations, and bubbles.

The stream rides Orca's existing runtime RPC server (the same control plane the
`orca` CLI uses) over the **Unix domain socket / Windows named pipe** transport.
No pairing, no E2EE, no LAN exposure: connecting requires reading a
`0o600`-permissioned metadata file, i.e. being the same local user.

**The stream is off by default.** Enable it in Orca → Settings → Experimental →
**Pet event stream**. While the toggle is off, `pet.events.subscribe` fails with
`pet_event_stream_disabled`, and turning it off terminates live subscriptions
immediately. The same settings section shows the **live subscriber list** (each
subscriber's self-reported `clientName`, connect time, and delivered-frame
count) and offers copyable integration material: a quick-start **guide** and a
self-contained **agent prompt** you can paste into Cursor / Claude Code with
your pet project open. Neither contains secrets — the token is read from the
metadata file at runtime.

The canonical wire types live in [`src/shared/pet-events.ts`](../../src/shared/pet-events.ts);
this document is the prose contract for implementers in any language.

## Turning off the built-in pet

The two are independent. To use only your external pet:

- Settings → Experimental → **Pet** → off, or
- status bar pet menu → **Hide pet**.

Both are plain UI settings; the event stream below is always available while Orca runs.

## Connecting

1. Read `<userData>/orca-runtime.json`:
   - macOS: `~/Library/Application Support/orca/orca-runtime.json`
   - Windows: `%APPDATA%\orca\orca-runtime.json`
   - Linux: `${XDG_CONFIG_HOME:-~/.config}/orca/orca-runtime.json`
   - `ORCA_USER_DATA_PATH`, when set, overrides the directory (dev instances use e.g. `orca-dev`).
2. From the metadata pick the transport with `"kind": "unix"` (or `"named-pipe"` on
   Windows) and read `authToken`:

```json
{
  "runtimeId": "…",
  "pid": 12345,
  "transports": [{ "kind": "unix", "endpoint": "/…/o-12345-abcd.sock" }],
  "authToken": "48-hex-chars",
  "startedAt": 1718000000000
}
```

3. Connect to `endpoint` and speak newline-delimited JSON (one request per line,
   UTF-8, max 1 MiB per frame). Every request carries `id`, `authToken`, `method`,
   optional `params`. Every response frame is one JSON object per line:

```json
{"id":"req-1","ok":true,"streaming":true,"result":{ …event… },"_meta":{"runtimeId":"…"}}
```

- Subscription events arrive as repeated `ok: true` frames with `streaming: true`
  and the **same request id**; the event object is in `result`.
- `{"_keepalive":true}` frames keep the connection alive through the server's 30 s
  idle timeout. **Clients must ignore them** (they are not RPC responses).
- Treat `authToken` as a secret: anything that can read the file controls the runtime.

## Methods

### `pet.events.subscribe` (streaming)

```json
{"id":"1","authToken":"…","method":"pet.events.subscribe","params":{"includeReplies":true,"replyMinIntervalMs":30000}}
```

| Param | Default | Meaning |
|---|---|---|
| `clientName` | — | Self-reported identity (≤ 80 chars, e.g. `"MyPet 1.2"`) shown in Orca's Settings subscriber list. Always send one. |
| `includeReplies` | `true` | Set `false` to suppress `reply` messages entirely. |
| `replyMinIntervalMs` | `30000` | Minimum interval between `reply` messages per pane. Clamped to [5000, 300000]. |

If the response is `ok:false` with `error.code === "pet_event_stream_disabled"`,
the user must enable Orca → Settings → Experimental → Pet event stream first —
surface that instruction instead of retrying in a tight loop.

Events (`result` of each streaming frame):

| `type` | When | Payload |
|---|---|---|
| `ready` | First frame. | `{ subscriptionId }` |
| `snapshot` | Immediately after `ready`; all currently known agents. Seed your UI from this. | `{ agents: PetAgentSnapshot[] }` |
| `state` | A pane's state changed (`working`/`blocked`/`waiting`/`done`). Drives animations. | `{ paneKey, state, agentType?, worktreeId?, tabId?, prompt?, stateStartedAt, updatedAt }` |
| `activity` | Tool in use changed while `working`. Ambient "alive" signal — not a notification. | `{ paneKey, toolName?, toolInput? }` |
| `message` | See kinds below. The only events meant to be shown as bubbles/notifications. | `{ paneKey, kind, text, agentType?, worktreeId?, tabId?, interactivePrompt? }` |
| `clear` | The pane's status was cleared (terminal teardown, etc.). Best-effort — see staleness. | `{ paneKey }` |
| `end` | Stream is ending (unsubscribe / shutdown). | `{}` |

`message` kinds:

| `kind` | Trigger | Rate |
|---|---|---|
| `reply` | `lastAssistantMessage` changed within a state (the agent said something). | Throttled: latest-wins, at most one per `replyMinIntervalMs` per pane. The first utterance after a state change flushes promptly (within ~2 s). |
| `needs-input` | Agent entered `blocked`/`waiting`. `interactivePrompt`, when present, is the AskUserQuestion JSON (truncated to 2000 chars — tolerate parse failures). | Immediate. |
| `completed` | Agent entered `done` normally. `text` is the final assistant message. | Immediate. |
| `interrupted` | Agent entered `done` via user interrupt. | Immediate. |

Field notes:

- `paneKey` identifies one agent terminal pane (`<tabId>:<leafId>`); key all per-pane
  UI state by it. `worktreeId`/`tabId` let you group by workspace.
- `text` is truncated to 500 chars; `prompt` in `state`/`snapshot` likewise.
- `updatedAt` (ms epoch) is the last status-event time for that pane.
- `activity` flushes on a 2 s server-side timer, latest-wins per pane, only while
  the pane is `working`.

### `pet.events.unsubscribe` (one-shot)

```json
{"id":"2","authToken":"…","method":"pet.events.unsubscribe","params":{"subscriptionId":"pet-events-3"}}
```

→ `{"id":"2","ok":true,"result":{"unsubscribed":true}}`; the subscription receives a
final `end` event. Closing the socket works too — the server reaps the subscription
on disconnect. Multiple concurrent subscribers are fine.

## Client guidance

- **Staleness:** `clear` is best-effort (e.g. dismissing a dashboard row does not
  emit one). Mirror the desktop rule: treat a pane as gone when `updatedAt` is older
  than 30 minutes.
- **Reconnect:** on connection loss or Orca restart, re-read `orca-runtime.json`
  (the endpoint embeds the new pid), reconnect, and re-subscribe — the fresh
  `snapshot` replaces all prior state. Do not try to merge.
- **Window vs app:** the stream is tapped in the main process, so closing Orca's
  window does not end it; quitting Orca does.
- **Remote agents:** agents running over SSH/WSL relays report through the same
  pipeline; their events are included automatically (`connectionId` non-null is an
  internal detail you can ignore).
- **Compatibility:** unknown `type` values must be ignored — new event kinds are
  additive.

## Minimal Node client

```js
import { createConnection } from 'node:net'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const userData = process.env.ORCA_USER_DATA_PATH ?? join(homedir(), 'Library', 'Application Support', 'orca')
const meta = JSON.parse(readFileSync(join(userData, 'orca-runtime.json'), 'utf8'))
const endpoint = meta.transports.find((t) => t.kind === 'unix' || t.kind === 'named-pipe').endpoint

const socket = createConnection(endpoint)
let buffer = ''
socket.setEncoding('utf8')
socket.on('connect', () => {
  socket.write(JSON.stringify({
    id: 'pet-1',
    authToken: meta.authToken,
    method: 'pet.events.subscribe',
    params: { clientName: 'Example Pet 0.1', replyMinIntervalMs: 30000 }
  }) + '\n')
})
socket.on('data', (chunk) => {
  buffer += chunk
  let i
  while ((i = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, i).trim()
    buffer = buffer.slice(i + 1)
    if (!line) continue
    const frame = JSON.parse(line)
    if (frame._keepalive) continue
    if (!frame.ok) { console.error('error', frame.error); continue }
    const event = frame.result
    switch (event.type) {
      case 'snapshot': console.log('agents:', event.agents.length); break
      case 'state': console.log(`[${event.paneKey}] -> ${event.state}`); break
      case 'activity': console.log(`[${event.paneKey}] using ${event.toolName}: ${event.toolInput ?? ''}`); break
      case 'message': console.log(`[${event.paneKey}] (${event.kind}) ${event.text}`); break
      case 'clear': console.log(`[${event.paneKey}] cleared`); break
      case 'end': console.log('stream ended'); break
    }
  }
})
```

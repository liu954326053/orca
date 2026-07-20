// Why: concise quick-start markdown for the pet event stream, copied from
// Settings → Experimental → Pet event stream ("Copy integration guide"). The
// full contract lives in docs/reference/pet-event-protocol.md; this is the
// get-connected-in-five-minutes version with the machine's real paths filled
// in. Never includes secrets — the reader fetches the token from the
// 0o600 metadata file themselves.

export type PetEventStreamGuideInput = {
  metadataPath: string
  endpoint: string | null
}

export function buildPetEventStreamGuide({
  metadataPath,
  endpoint
}: PetEventStreamGuideInput): string {
  const endpointLine = endpoint
    ? `Current endpoint on this machine: \`${endpoint}\``
    : 'Orca is not advertising a local endpoint right now — start the Orca app first.'
  return `# Orca pet event stream — integration guide

Subscribe your desktop pet to Orca's live agent events: state changes
(working / blocked / waiting / done), a throttled sample of assistant replies,
and immediate completion / needs-input messages. Local-only, no pairing.

## 1. Discover the runtime

Read this JSON file (0600, same-user only — treat its \`authToken\` as a secret):

\`\`\`
${metadataPath}
\`\`\`

${endpointLine}

If the file is missing or stale, Orca is not running (or you are on a dev
instance — then \`ORCA_USER_DATA_PATH\` points elsewhere). On other machines the
file lives under the platform userData dir:
- macOS: \`~/Library/Application Support/orca/orca-runtime.json\`
- Windows: \`%APPDATA%\\orca\\orca-runtime.json\`
- Linux: \`\${XDG_CONFIG_HOME:-~/.config}/orca/orca-runtime.json\`

Pick the transport with \`"kind": "unix"\` (or \`"named-pipe"\` on Windows) and
connect to its \`endpoint\`.

## 2. Speak NDJSON + auth

One JSON object per line, UTF-8, max 1 MiB per frame. Every request carries
\`id\`, \`authToken\`, \`method\`, optional \`params\`. Responses are one JSON
object per line; subscription events arrive as repeated
\`{"id":…,"ok":true,"streaming":true,"result":{ …event… }}\` frames.

Ignore \`{"_keepalive":true}\` frames — they keep the connection alive through
the server's 30 s idle timeout.

## 3. Subscribe

\`\`\`json
{"id":"1","authToken":"<token from the metadata file>","method":"pet.events.subscribe","params":{"clientName":"MyPet 1.0","replyMinIntervalMs":30000}}
\`\`\`

- \`clientName\` shows up in Orca's Settings subscriber list — always send one.
- \`replyMinIntervalMs\` (default 30000, clamp 5000–300000) throttles assistant
  reply messages per pane; \`includeReplies:false\` turns them off.

If you get \`{"ok":false,"error":{"code":"pet_event_stream_disabled"}}\`, the
user must enable Orca → Settings → Experimental → Pet event stream first.

## 4. Handle events (\`result\` of each frame)

| type | meaning |
|---|---|
| \`ready\` | subscription established; keep the \`subscriptionId\` |
| \`snapshot\` | all currently known agents — seed your UI from this |
| \`state\` | pane state changed (\`working\`/\`blocked\`/\`waiting\`/\`done\`) → animation |
| \`activity\` | tool in use changed while working (ambient, ~2 s latest-wins) |
| \`message\` | bubble-worthy text; kinds: \`reply\` (throttled sample), \`needs-input\`, \`completed\`, \`interrupted\` (all immediate) |
| \`clear\` | pane status cleared (best-effort) → back to idle |
| \`end\` | stream ending |

Key per-pane UI state by \`paneKey\`. Treat panes as gone when \`updatedAt\` is
older than 30 minutes (\`clear\` does not fire for every disappearance).

## 5. Disconnect / reconnect

Send \`pet.events.unsubscribe\` with the \`subscriptionId\`, or just close the
socket — Orca reaps the subscription either way. On connection loss or Orca
restart: re-read the metadata file (the endpoint embeds the new pid),
reconnect, re-subscribe, and replace all state from the new \`snapshot\`.

Full protocol reference: \`docs/reference/pet-event-protocol.md\` in the Orca repo.
`
}

// Why: self-contained prompt copied from Settings → Experimental → Pet event
// stream ("Copy agent prompt") and pasted into an agent tool (Cursor, Claude
// Code, …) that has the user's pet project open. It must carry the ENTIRE
// protocol spec, because the agent cannot see Orca's repo. Security rule: it
// never embeds the authToken — the generated code must read the 0o600
// metadata file at runtime.

export type PetAgentIntegrationPromptInput = {
  metadataPath: string
  endpoint: string | null
}

export function buildPetAgentIntegrationPrompt({
  metadataPath,
  endpoint
}: PetAgentIntegrationPromptInput): string {
  const endpointLine = endpoint
    ? `The current endpoint on this machine is \`${endpoint}\` (it changes on every Orca restart — always discover it at runtime, never hardcode it).`
    : 'Orca is not running right now, so there is no live endpoint yet — discover it at runtime from the metadata file.'
  return `# Task: integrate this desktop-pet project with Orca's pet event stream

You are working inside a desktop-pet project. Integrate it with **Orca** (the
Electron app running on this machine) so the pet renders Orca's live agent
activity: state changes drive the pet's animation, and noteworthy agent
messages appear as bubbles/dialogs. Read this entire prompt before writing
code, then implement the integration in this project's own language, style,
and dependency conventions. Ask before adding new dependencies.

## Hard constraints

- **Secrets:** the RPC auth token lives in a 0600-permissioned JSON metadata
  file. Read it **at runtime** on every connect. Never hardcode it, never
  commit it, never print it to logs.
- **Local only:** the channel is a Unix domain socket (macOS/Linux) or named
  pipe (Windows) on loopback — no TCP, no pairing, no TLS.
- Do not modify Orca itself; this project is a *client* of Orca.

## 1. Runtime discovery

On this machine the metadata file is:

\`\`\`
${metadataPath}
\`\`\`

${endpointLine}

For portable code, resolve the path per platform (and honor the
\`ORCA_USER_DATA_PATH\` override when set):
- macOS: \`~/Library/Application Support/orca/orca-runtime.json\`
- Windows: \`%APPDATA%\\orca\\orca-runtime.json\`
- Linux: \`\${XDG_CONFIG_HOME:-~/.config}/orca/orca-runtime.json\`

The file contains \`transports[]\`, \`authToken\`, \`pid\`, \`startedAt\`. Pick the
transport whose \`kind\` is \`"unix"\` (or \`"named-pipe"\` on Windows) and connect
to its \`endpoint\`. If the file is missing or connect fails, Orca is not
running — retry discovery with backoff (e.g. 2 s, 5 s, 15 s, then every 60 s).

## 2. Wire protocol

Newline-delimited JSON (NDJSON), UTF-8, one object per line, max 1 MiB/frame.

Request:
\`\`\`json
{"id":"<unique per request>","authToken":"<from metadata>","method":"<name>","params":{…}}
\`\`\`

Every response line is a full JSON object:
\`\`\`json
{"id":"…","ok":true,"streaming":true,"result":{ …event… },"_meta":{"runtimeId":"…"}}
\`\`\`

- Subscription events arrive as many \`ok:true\` frames with \`"streaming":true\`
  and the same request id; the event object is in \`result\`.
- \`{"_keepalive":true}\` lines are NOT responses — skip them silently. They
  reset the server's 30 s idle timeout, so a quiet stream stays alive.
- \`ok:false\` frames carry \`error.code\`/\`error.message\`.

## 3. Subscribe

\`\`\`json
{"id":"sub-1","authToken":"…","method":"pet.events.subscribe","params":{"clientName":"<this project's name + version>","replyMinIntervalMs":30000,"includeReplies":true}}
\`\`\`

- \`clientName\` (≤80 chars): REQUIRED for this integration — Orca shows it in
  Settings → Experimental → Pet event stream so the user can see who is
  subscribed. Use e.g. \`"MyPet 1.2.0"\`.
- \`replyMinIntervalMs\`: min interval between \`reply\` messages per pane
  (default 30000, clamped to [5000, 300000]).
- \`includeReplies\`: set false to suppress \`reply\` messages entirely.

If the response is \`ok:false\` with \`error.code === "pet_event_stream_disabled"\`,
the user must enable the toggle: Orca → Settings → Experimental → Pet event
stream. Surface that instruction to the user (do not retry in a tight loop).

## 4. Event catalog (\`result\` of each streaming frame)

| \`type\` | When | Payload |
|---|---|---|
| \`ready\` | first frame | \`{ subscriptionId }\` — keep it for unsubscribe |
| \`snapshot\` | right after \`ready\` | \`{ agents: PetAgentSnapshot[] }\` — REPLACE all local state with this |
| \`state\` | a pane's state changed | \`{ paneKey, state, agentType?, worktreeId?, tabId?, prompt?, stateStartedAt, updatedAt }\` |
| \`activity\` | tool changed while working (2 s latest-wins flush) | \`{ paneKey, toolName?, toolInput? }\` |
| \`message\` | bubble-worthy text (kinds below) | \`{ paneKey, kind, text, agentType?, worktreeId?, tabId?, interactivePrompt? }\` |
| \`clear\` | pane status cleared | \`{ paneKey }\` |
| \`end\` | stream ending (unsubscribe/shutdown) | \`{}\` |

\`state\` values: \`working\` | \`blocked\` | \`waiting\` | \`done\`.

\`message.kind\` values:
- \`reply\` — an assistant text update during a turn. Already throttled
  server-side (latest-wins, ≥\`replyMinIntervalMs\` apart per pane): safe to show
  every one as a bubble/status line.
- \`needs-input\` — agent entered \`blocked\`/\`waiting\`. \`interactivePrompt\`, when
  present, is AskUserQuestion JSON (≤2000 chars, may be truncated mid-JSON —
  tolerate parse failure). Notify the user prominently.
- \`completed\` — agent finished (\`done\`). \`text\` is the final message.
- \`interrupted\` — agent finished via user cancel.

Field notes: \`paneKey\` = one agent terminal pane; key all per-pane state by it.
\`text\`/\`prompt\` are truncated to 500 chars. \`updatedAt\` is ms-epoch of the
pane's last event. Unknown \`type\` values must be ignored (forward-compat).

## 5. Required behavior

1. **Connection module:** discover → connect → subscribe → NDJSON parse loop,
   with reconnect. On ANY disconnect or Orca restart: re-read the metadata
   file (endpoint/authToken may have changed), reconnect, re-subscribe, and
   rebuild all state from the new \`snapshot\` (do not merge with old state).
2. **Animation mapping** (suggested): \`working\` → active/run;
   \`blocked\`/\`waiting\` → attention-seeking; \`done\` → celebrate/review then
   settle; \`clear\` or staleness → idle. Use \`activity\` as a subtle status line
   ("Using Edit: src/foo.ts"), never as a notification.
3. **Bubbles/dialogs:** show \`reply\` briefly; keep \`needs-input\` visible until
   the next \`state\` for that pane; show \`completed\`/\`interrupted\` as a
   completion notice with \`text\`.
4. **Staleness:** \`clear\` is best-effort. Locally expire any pane whose
   \`updatedAt\` is older than 30 minutes → idle.
5. **Lifecycle:** on app quit, send \`pet.events.unsubscribe\` with the saved
   \`subscriptionId\` (or just close the socket — Orca reaps it either way).
6. **Robustness:** skip \`_keepalive\`; ignore unknown event types; survive
   malformed lines (log and continue); tolerate Orca not running for long
   periods without spamming logs.

## 6. Acceptance test

1. Ensure the Orca toggle is on (Settings → Experimental → Pet event stream).
2. Run this project; confirm the subscription appears in Orca's subscriber
   list under the \`clientName\` you sent.
3. In Orca, run any agent (e.g. ask Claude to edit a file). Verify: a \`state\`
   event (\`working\`) arrives → pet animates; \`activity\` lines trickle; when the
   agent finishes, a \`completed\` message arrives with its summary.
4. Toggle the setting OFF: the pet must handle the stream ending gracefully
   (it receives \`end\` or the socket closes) and must show the enable-toggle
   instruction on the next subscribe attempt.

Implement this now, keeping the diff minimal and idiomatic for this codebase.
`
}

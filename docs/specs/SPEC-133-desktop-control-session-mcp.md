# SPEC-133: Desktop Control Session MCP (Windows)

## Metadata

| Field | Value |
| --- | --- |
| Status | Contract frozen (P0, 2026-10-29); implementation in progress under PLAN-126 |
| Owner | Platform Desktop integration |
| Reviewer | Product owner, Runtime and Bots maintainers |
| Baseline | Platform `9159757e`; 2026-10-29 |
| Plan | [PLAN-126](../plans/PLAN-126-desktop-control-session-mcp.md) |
| Governing decisions | [ADR-141](../decisions/141-host-a-consented-desktop-control-mcp-for-provider-sessions.md); ADR-126 session configuration; Runtime SPEC-035 / SPEC-039 |

## Summary

Let provider sessions that Cats starts observe and operate native Windows apps, with the
owner's consent, through a Platform-provided session MCP server named `cats-desktop`. The
server lives on the Desktop-managed Platform server; the actual OS calls go to a native
helper that Desktop packages. Tools come in two phases, A (observe) and B (act); phase B is
implemented only after phase A passes native acceptance.

Cats Bots implements the same capability separately in
[Bots SPEC-006](../../../cats-bots/docs/specs/SPEC-006-desktop-control-session-mcp.md).
Both follow the [cross-implementation contract](#cross-implementation-contract) below.

## Goals and User Stories

- After the owner turns desktop control on in Desktop and enables it for a conversation,
  that conversation's Cat can list, capture and read the windows of apps the owner granted.
- The owner grants each app individually in Cats' own UI; a provider approval or "allow for
  this session" cannot stand in for that.
- In phase B, the Cat can click, type, press keys, scroll and use the clipboard. Every action
  goes through the provider's `tool_approval`, and the owner can stop at any time.
- The capability panel shows whether desktop control is available and injected, and why not
  when it is not.

## Non-Goals

- macOS and Linux.
- The Bots implementation; [Bots SPEC-006](../../../cats-bots/docs/specs/SPEC-006-desktop-control-session-mcp.md)
  implements it against this document's cross-implementation contract.
- Turns started by remote ingress, Mobile, Telegram, the life loop, schedules or Cat-to-Cat
  delegation.
- Drag, hover, full-screen capture, display switching and hiding other windows.
- Launching arbitrary programs or passing arguments; shell and process management.
- Operating UAC or the secure desktop, elevated windows, or typing into terminals, IDEs or
  browsers.
- Storing screenshots; integrating provider-native computer use.

## Architecture

```mermaid
flowchart LR
  CLI["Provider CLI"] -->|MCP, loopback HTTP| Endpoint["/api/internal/desktop-control/mcp\n(Platform server)"]
  Endpoint --> Gate["Eligibility, grants, hold state"]
  Gate -->|stdio JSON lines| Helper["cats-desktop-control-windows.exe"]
  Helper --> OS["UI Automation / Windows Graphics Capture / SendInput"]
  Host["Desktop host"] -.->|helper path env| Endpoint
  Gate --> UI["Renderer: settings, grant cards, indicator"]
  Host -.->|tray state, stop| Gate
```

- **Helper**: `desktop/native/windows-desktop-control/`, C# .NET. Like
  `desktop/native/windows-stt`, it is built, packaged and signed by
  `scripts/build-desktop-installer.mjs` and included in `scripts/verify-desktop-licenses.mjs`.
- **Helper path**: on Windows only, the Desktop host passes the path to the Platform server
  (`processSupervisor.ts`) in `CATS_DESKTOP_CONTROL_HELPER`.
- **Server module**: `src/platform/desktopControl/`, modeled on `cat-image-tools`. It serves
  the endpoint with `handleMcpHttpRequest` and issues session bearer tokens with
  `McpSessionGrantStore`.
- **Injection**: a `wrapClient` proxy around the shared (Chat) Runtime client, outermost in the
  composition in `src/app/server/index.ts`, like `catImageTools`. P0 found that
  `SessionMcpServerContributor`s are only consumed by the Code agent-tools wrapper, which injects
  only for Code sessions, so a contributor would never reach Chat. Phase A covers Chat
  conversations (`supervisionProduct: 'cats-chat'`); Code and Work follow separately.
- **Settings**: Platform preferences, beside "Claude in Chrome": `desktopControlEnabled`
  (default `false`) and `desktopControlConversations` (enabled channel ids). The general
  preferences update never changes them; only the owner API does, and Platform data reset
  turns them off.

## Requirements

### R1. Availability and settings

| ID | Requirement |
| --- | --- |
| DC-01 | Available only when the Desktop host started the Platform server, the platform is Windows, `CATS_DESKTOP_CONTROL_HELPER` is set and the helper's `hello` handshake succeeds (matching version and protocol). Otherwise settings show `unavailable` with the reason and the wrapper injects nothing |
| DC-02 | A global setting, off by default, that only the owner can change. Turning it off revokes all grants and control, cancels helper actions in progress and ends the helper process |
| DC-03 | A per-conversation switch, off by default and persisted. Turning it off revokes that conversation's grants and control |

### R2. Injection and turn scope

| ID | Requirement |
| --- | --- |
| DC-04 | The wrapper adds `cats-desktop` to a send only when DC-01 to DC-03 hold and `getSessionCapabilities(sessionId)` returns an observation where `interactions.host` exists and lists `tool_approval`, `policy.source` is `explicit`, `policy.requested` is `{ mode: 'explicit', approval: 'on-request' | 'untrusted' }`, and `policy.status` is `verified` or `not_observed`. `not_observed` is accepted because Runtime verifies the policy before it releases the first turn and fails the turn on a mismatch. A `mismatch` or `unsupported` status, `skip`, `never`, a missing snapshot or any error injects nothing (fail closed), and the capability panel shows why |
| DC-05 | Tools serve only turns the owner sent from the local Desktop window. The channel message route stamps `messageMetadata.desktopControlEntry = 'local'` on an owner message only for a local owner request (loopback socket and host, no forwarding headers, an owner or admin signed in with a browser cookie; the same test the provider controls use) whose transport is not `mobile`; it always removes a client-supplied value. Telegram inbound messages never carry it. A turn is owner-present when its send metadata has `supervisionProduct: 'cats-chat'`, `supervisionSurface: 'runtime-dispatch'` and a `sourceMessageId` whose message in channel `supervisionRunId` is a `user` message stamped `local`. Every other turn, including heartbeats, schedules and delegation, gets `not_owner_present`. Once a conversation qualifies, the descriptor is attached to all its sends and only the turn scope changes, which avoids the worker restart of SPEC-035 SMCP-08 |
| DC-06 | Session bearer tokens are never logged and are revoked when the session is removed, stopped or turned off |
| DC-07 | `/api/internal/desktop-control/` is added to `isInternalPlatformRoute`: reachable only from the internal listener and always refused through ingress |

### R3. App grants

| ID | Requirement |
| --- | --- |
| DC-08 | `request_app_access({apps, reason})` has the helper resolve names (including localized display names and exe names) to an executable identity: path, signing publisher and product name. Platform posts a grant card in the conversation, waits at most 60 seconds and returns `granted`, `denied` or `pending` per app. Only the owner acting on the card counts. Asking again for an app that already waits joins that request; an unanswered request is denied after 10 minutes, and a conversation holds at most 5 open requests |
| DC-09 | Grants match on executable path plus signing publisher, never on window title. They are scoped to that conversation's session and kept only in memory; removing the session, stopping, turning the feature off or restarting Platform clears them |
| DC-10 | The helper enforces an exclusion list. Cats Desktop and its helpers can never be granted. System security UI (such as `consent.exe`, `LogonUI.exe` and credential dialogs) can never be granted. Terminals and IDEs (such as Windows Terminal, conhost, PowerShell, cmd, VS Code, Visual Studio and JetBrains IDEs) and browsers (Chrome, Edge, Firefox, Brave, Opera) are observe only. The list has test coverage |

### R4. Phase A tools: observe

| Tool | Behavior |
| --- | --- |
| `request_app_access` | See DC-08 |
| `list_windows` | Visible top-level windows of granted apps: `windowId` (opaque, session-scoped), app, title, bounds, minimized or foreground |
| `screenshot_window({windowId, maxEdge?})` | Captures one window with `PrintWindow` and `PW_RENDERFULLCONTENT`, which renders the window itself rather than the screen, so overlapping windows never appear; never a screen region. Windows Graphics Capture is a follow-up, adopted only if `PrintWindow` returns blank frames for acceptance targets. The image is scaled to fit `maxEdge` (default 1568) and returned as MCP image content with a `snapshotId` bound to the window, its bounds, the time and the scale factor |
| `read_ui({windowId, maxNodes?})` | The window's UI Automation subtree: `elementId`, role, name, value, enabled, focused, bounds in window pixels and supported actions. 200 nodes by default, at most 1000. `IsPassword` elements never return a value |
| `open_app({appId})` | Starts a granted app from the executable path recorded at grant time, without arguments |

### R5. Phase B tools: act

Shared rules for input tools: the target window must be granted and not in an observe-only
category; the helper first brings it to the foreground with UIA `SetFocus` and confirms it;
when `GetLastInputInfo` shows owner input within 3 seconds, the tool returns
`operator_active` instead of taking focus; input into an elevated window returns
`elevated_target`.

| Tool | Behavior |
| --- | --- |
| `click({snapshotId, x, y, button?, count?})` | Applies the PR #336 guards: snapshot no older than 60 seconds, same window, not moved, point inside the snapshot, point not covered by a window the target does not own, no held keys, exact cursor landing, and swapped mouse buttons honored. Coordinates are converted with the `snapshotId` scale factor |
| `invoke_element({elementId, action})` | Operates through UIA patterns (invoke, toggle, select, expand); preferred over `click` |
| `type_text({windowId, text})` | The focused element must belong to the window and must not be `IsPassword`; at most 2000 characters, no control characters |
| `key({windowId, keys})` | Allowlist only: Enter, Esc, Tab, arrow keys, PageUp/PageDown, Home/End, Backspace, Delete, F1–F12 and Ctrl+A/C/V/X/Z/Y/S/F. Win-key combinations, Alt+Tab and Ctrl+Alt+Del are refused |
| `scroll({snapshotId, x, y, direction, amount})` | The same coordinate guards as `click`; amount 1–10 |
| `clipboard_read()` / `clipboard_write({text})` | Text only, at most 100,000 characters; a write is read back and compared |

### R6. Holding control, indicator and stop

| ID | Requirement |
| --- | --- |
| DC-11 | The first input action in a turn starts holding control, and the end of the turn releases it. While control is held, Desktop shows the tray state and a topmost notice (app name and "Stop"). The notice is a Cats window and cannot be operated |
| DC-12 | Stop is available from the notice, the tray and the conversation. It revokes the conversation's grants, releases control and cancels the helper action in progress; later calls return `stopped` until the owner grants again |
| DC-13 | While the screen is locked or the user session is switched (WTS notifications), every action returns `locked`. Actions in progress do not resume automatically after unlock |

### R7. Helper protocol

| ID | Requirement |
| --- | --- |
| DC-14 | stdio JSON lines: request `{id, op, params}`, response `{id, ok, result}` or `{id, ok: false, error: {code, message}}`. Ops: `hello`, `resolve_apps`, `list_windows`, `capture_window`, `read_ui`, `open_app`, `state`, `cancel`; phase B adds `click`, `invoke`, `type`, `key`, `scroll`, `clipboard_read` and `clipboard_write` |
| DC-15 | Runs as the current user, unelevated and per-monitor DPI aware v2; all coordinate conversion happens inside the helper |
| DC-16 | Started on first use and exits after 5 idle minutes. Only one input op runs at a time. If the process crashes, calls in progress return `executor_failed` and the next call restarts it; after more than 3 crashes within 5 minutes, calls return `unavailable` |

### R8. Privacy, logging and capability reporting

| ID | Requirement |
| --- | --- |
| DC-17 | Platform keeps no screenshot bytes, UIA values, typed text or clipboard content in its own stores, logs, debug traces or activity feed; activity shows a summary only, such as "Screenshot: Notepad" |
| DC-18 | The capability panel lists "Cats desktop control" with the state `unavailable` (with reason), `off`, `not_injected` (with reason), `injected`, `active_turn` or `holding`. Provider-native computer use is shown as Runtime reports it, separately |

### Error codes

`unavailable`, `not_owner_present`, `not_granted`, `excluded_app`, `observe_only`,
`operator_active`, `locked`, `stopped`, `stale_snapshot`, `window_changed`, `covered`,
`not_foreground`, `elevated_target`, `password_field`, `executor_failed`. Each error carries
one sentence for the model and never suggests another way around it.

## Frozen contract details (P0, 2026-10-29)

These details are part of the cross-implementation contract. Parameter names are camelCase.
Every tool returns `structuredContent` plus a one-line text summary; screenshots add one
`image` content item (`image/png`). Errors return `isError: true` with
`structuredContent: { "error": { "code": "<error code>", "message": "<one sentence>" } }`.

### Tool input schemas (all `additionalProperties: false`)

| Tool | Input | Result `structuredContent` |
| --- | --- | --- |
| `request_app_access` | `apps`: 1–5 strings, each 1–120 characters; `reason`: string, 1–500 characters | `results`: one entry per query: `{ query, status: 'granted' \| 'denied' \| 'pending' \| 'not_found' \| 'excluded', app?: { appId, name, path, publisher \| null, tier: 'full' \| 'observe_only' } }` |
| `list_windows` | none | `windows`: at most 50 `{ windowId, appId, title, bounds: { x, y, width, height }, minimized, foreground }` |
| `screenshot_window` | `windowId`; `maxEdge`: integer 256–2048, default 1568 | `{ snapshotId, windowId, width, height, scale, capturedAt }`, where `scale` is image pixels per window pixel |
| `read_ui` | `windowId`; `maxNodes`: integer 1–1000, default 200 | `{ windowId, nodes: [{ elementId, parentId \| null, role, name, value \| null, enabled, focused, bounds \| null, actions }], truncated }`; `bounds` are window pixels; `actions` lists `invoke`, `toggle`, `select`, `expand`, `collapse`, `value` |
| `open_app` | `appId` of a granted app | `{ opened: true }` |
| `click` (B) | `snapshotId`; `x`, `y`: integer image pixels; `button`: `left` \| `right` \| `middle`, default `left`; `count`: 1–3, default 1 | `{ done: true }` |
| `invoke_element` (B) | `elementId`; `action`: `invoke` \| `toggle` \| `select` \| `expand` \| `collapse` | `{ done: true }` |
| `type_text` (B) | `windowId`; `text`: 1–2000 characters, no control characters | `{ done: true }` |
| `key` (B) | `windowId`; `keys`: one allowlisted chord such as `enter` or `ctrl+s` | `{ done: true }` |
| `scroll` (B) | `snapshotId`; `x`, `y`; `direction`: `up` \| `down` \| `left` \| `right`; `amount`: 1–10 | `{ done: true }` |
| `clipboard_read` (B) | none | `{ text: string \| null }` |
| `clipboard_write` (B) | `text`: 1–100,000 characters | `{ done: true }` |

`appId`, `windowId`, `snapshotId` and `elementId` are opaque, server-issued and valid only in the
session that received them. Like every tool, `request_app_access` serves only owner-present turns.

### Helper protocol (stdio JSON lines, protocol 1)

| Op | Params | Result |
| --- | --- | --- |
| `hello` | `{ protocol: 1, selfProcessIds: number[], selfExecutables: string[] }` | `{ protocol: 1, version, platform: 'win32', dpiAwareness }` |
| `resolve_apps` | `{ queries: string[] }` | `{ matches: [{ query, candidates: [{ path, publisher \| null, productName, displayName, running, category: 'normal' \| 'observe_only' \| 'excluded' }] }] }`; sources are running processes with windows and Start menu shortcuts, so localized display names resolve |
| `list_windows` | `{ paths: string[] }` | `{ windows: [{ hwnd, pid, path, title, bounds, minimized, foreground }] }` |
| `capture_window` | `{ hwnd, maxEdge }` | `{ pngBase64, width, height, scale, bounds }` |
| `read_ui` | `{ hwnd, maxNodes }` | `{ nodes, truncated }` with helper-local element ids |
| `open_app` | `{ path }` | `{ pid }` |
| `state` | `{}` | `{ locked, idleMs }` |
| `cancel` | `{ id }` | `{ cancelled }` |

Helper error codes add `invalid_request`, `window_gone`, `capture_failed` and `not_found` to the
tool error codes; the server maps them to `window_changed`, `unavailable` or `not_granted`.

### Exclusion categories (DC-10), matched on executable file name, case-insensitive

- **Excluded**: every process in `hello.selfProcessIds` or `hello.selfExecutables` (Cats Desktop,
  its Platform server, its helpers), `consent.exe`, `LogonUI.exe`, `CredentialUIBroker.exe`,
  `LockApp.exe`.
- **Observe only, terminals and IDEs**: `WindowsTerminal.exe`, `OpenConsole.exe`, `conhost.exe`,
  `cmd.exe`, `powershell.exe`, `pwsh.exe`, `wsl.exe`, `bash.exe`, `mintty.exe`, `Code.exe`,
  `Code - Insiders.exe`, `Cursor.exe`, `Windsurf.exe`, `devenv.exe`, `idea64.exe`,
  `pycharm64.exe`, `webstorm64.exe`, `rider64.exe`, `clion64.exe`, `goland64.exe`,
  `rubymine64.exe`, `phpstorm64.exe`, `datagrip64.exe`, `studio64.exe`, `zed.exe`.
- **Observe only, browsers**: `chrome.exe`, `msedge.exe`, `firefox.exe`, `brave.exe`, `opera.exe`,
  `vivaldi.exe`, `arc.exe`, `iexplore.exe`.

### Platform owner API (Desktop only)

Owner-authenticated, internal listener only: `GET /api/desktop-control/state` (availability,
switches, pending grant requests, grants and hold state), `PUT /api/desktop-control/settings`
`{ enabled }`, `PUT /api/desktop-control/conversations/:channelId` `{ enabled }`,
`POST /api/desktop-control/grant-requests/:requestId` `{ decision: 'allow' | 'deny' }` and
`POST /api/desktop-control/stop` `{ channelId? }`. The Desktop host polls the state endpoint for
the tray while any conversation is enabled.

## Cross-implementation contract

Cats Desktop (this document) and Cats Bots
([SPEC-006](../../../cats-bots/docs/specs/SPEC-006-desktop-control-session-mcp.md)) implement
desktop control separately, but the following must match so the model and the owner see the
same behavior in both. A change on either side updates both SPECs on the same day, and each
implementation follows.

- **Name**: MCP server name `cats-desktop`.
- **Tools**: the tool names, parameters, returned fields, limits and guards in R4 and R5, and the
  schemas, result shapes and error format under "Frozen contract details".
- **Error codes**: the codes and meanings under "Error codes".
- **Injection and turns**: the policy condition in DC-04, and the meaning of DC-05: only turns
  the owner sends from a local surface; autonomous or remote turns always get
  `not_owner_present`.
- **Grants**: how grants are made and scoped (DC-08, DC-09) and the exclusion categories
  (DC-10) with the executable lists under "Frozen contract details". Each implementation also adds its own windows to the never-grantable list.
- **Holding control and stop**: the meaning of DC-11 to DC-13.
- **Privacy**: DC-17.
- **Capability states**: the state values in DC-18.

Each implementation decides for itself: where settings and switches live (DC-01 to DC-03),
the grant card and indicator UI, the endpoint and routing (DC-07), and the helper's
implementation, protocol and packaging (R7).

## Acceptance Criteria

| ID | Required evidence |
| --- | --- |
| A1 | Nothing is injected on non-Windows platforms, without the helper or after a failed handshake, and settings show the reason |
| A2 | Injection matrix: with the global switch off, the conversation switch off, `skip`, `never`, no interaction host, an ingress turn or a life loop turn, no tool can be used; a local owner turn with an explicit `on-request` policy is injected, and a real Claude Code run shows a `tool_approval` for every call |
| A3 | Grant cards: neither a provider approval nor "allow for this session" can grant an app; excluded apps are refused; grants are cleared after stop, turning the feature off and restart |
| A4 | Observation: with a known-color ungranted window laid over a granted one, the screenshot contains none of its pixels; `read_ui` contains no password values; the node count is bounded |
| A5 | Stop, lock and the pause while the owner is operating are verified on a real desktop |
| A6 | Helper handshake, crash restart and idle exit; the packaged build leaves no Defender detection |
| A7 | Phase B: guard fixtures for every input tool, plus native acceptance against a throwaway test window |
| A8 | Logs, telemetry and transcripts contain no screenshot bytes, typed text or clipboard content |

## Open Questions

- Whether Codex delivers MCP image content to the model is checked during A2. If it does
  not, that provider gets `read_ui` only.
- Whether stop needs a global hotkey is decided after phase A's UI acceptance.

*Created: 2026-10-29. Draft; implementation not authorized.*

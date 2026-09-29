# SPEC-123: Cats Code Agent Artifact Preview

> Let a strong provider agent in a Cats Code conversation open what it built
> (a static page, a dev-server app or a document) in a split canvas beside the
> conversation, without the user asking for a preview.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft; open questions 1–4 approved by the user 2026-09-29 |
| **Owner** | Claude |
| **Reviewer** | User |
| **Decision** | [ADR-126](../decisions/126-deliver-code-preview-tools-to-provider-agents-through-session-mcp.md) |
| **Related Plan** | [PLAN-116](../plans/PLAN-116-code-agent-artifact-preview-rollout.md) |

## Summary

The canvas pane, viewers, `show_in_canvas`, render intents and the live-preview
supervisor already exist
([SPEC-101](./SPEC-101-cats-code-artifact-canvas.md),
[SPEC-108](./SPEC-108-cats-code-live-preview-substrate.md)). The end-to-end
chain is broken in six places:

- The agent never receives the tools.
- The Code conversation route has no canvas.
- Static HTML cannot be served.
- Agent-declared pages cannot run scripts.
- The supervisor is not constructed.
- The agent has no rule for when to preview.

This spec closes those gaps. It amends SPEC-101 (a new surface and a new tool
input) and SPEC-108 (a static profile, agent-requested starts and host wiring)
by reference and does not replace either one.

**MVP acceptance:**

- Asked "做一個計算機" with no mention of preview, a Cat builds a plain HTML
  calculator. The canvas opens on the right and the calculator works.
- Asked for a Vite pomodoro timer, a Cat starts the dev server through Cats. The
  running timer appears on the right.
- A non-visual request, such as a CLI tool, opens no canvas.

## Goals

- Deliver preview tools natively to Claude Code and Codex sessions in Cats Code.
- Show static pages, dev-server apps, images, PDFs and text beside the Code
  conversation, with scripts enabled only for supervisor-owned origins.
- Give the agent a clear rule for when to preview and when not to, plus
  failure feedback it can act on.
- Keep every shown item an audited Core artifact with a URL-addressable canvas
  state, as ADR-098 requires.

## Non-Goals

- Public tunnels, non-loopback binding or remote runtimes.
- Raw shell strings in tool input, and automatic dependency installation.
- Markdown rendering, `.docx`/`.pptx`, canvas tabs and providers beyond Claude
  Code and Codex in the MVP. These are PLAN-116 M4.
- Replacing SPEC-122 App private-service supervision.

## Requirements

### Functional Requirements

| ID | Contract |
| --- | --- |
| CAP-01 | A Code conversation session whose provider supports session MCP servers receives the Platform-hosted `cats` MCP server (ADR-126). It is served by Platform's host-internal MCP module (official SDK, stateless Streamable HTTP, `src/platform/mcp/` guards; ADR-126 decision 7). App MCP servers are hosted independently by their Apps and are outside this contract. Tool calls execute in Platform and return results in the same turn. |
| CAP-02 | The grant is per runtime session and bound to the runtime session id, the Code conversation (channel) id, the workspace root and the Cat actor id. It requires a loopback caller and a bearer token, and it rejects any request that carries an `Origin` header. It is revoked on session close and on conversation deletion. It is never written to transcripts, Activity, URLs, logs or runtime session reads. |
| CAP-03 | The tool set is defined in [Tool Contract](#tool-contract). `declare_artifact` keeps its SPEC-092 input for artifacts that have no preview. `show_in_canvas` takes `path`, `url` or `artifactId`. The same-turn `declarationId` input is retired together with the observation path, along with the `artifactClaims[]` finalization gate that depends on it. The gate is inert today because no adapter emits claims. |
| CAP-04 | Paths may be workspace-relative or absolute. They are resolved through `realpath` and must stay inside the grant's workspace root. Symlink escapes and dot-segments (`.git`, `.env`, `.ssh`, …) are rejected. Rejections return a coded error to the agent. |
| CAP-05 | A static preview serves the directory of the HTML entry (or the given directory's `index.html`). It runs as a supervisor lease with an in-process static server on a port from the reserved `47100-47199` range. It checks the `Host` header, sends `Cache-Control: no-store`, reads files fresh on every request and serves only files under the lease root. |
| CAP-06 | Workspace images, PDFs and text/code files are shown through the same static lease, resolving to the existing `image` / `pdf` / `code` viewers. Markdown falls back to `code` until M4 adds a markdown viewer. |
| CAP-07 | `start_dev_preview` starts a package dev server through a reviewed profile. A Vite project, detected from its dependencies and `node_modules/vite`, uses the reviewed Vite profile. Other scripts use the `npm-script` profile, where `PORT`/`HOST` come from the environment and `{port}` is applied only where the framework adapter supports it. Missing `node_modules` returns `dependencies_missing` without spawning anything. Each conversation has at most one active dev preview; a restart replaces it. |
| CAP-08 | A dev preview is allowed only when the Cat session already has shell execution permission (permission mode `skip`, or a whitelist that includes a shell tool) and the workspace containment check passes. It also requires the Settings toggle "Cats may run preview servers", which defaults on (approved 2026-09-29). Turning the toggle off stops active dev previews and rejects new ones with `preview_servers_disabled`. As implemented (PLAN-116 D1), the toggle ships off until the user confirms enabling process spawning by default; the tool tells the Cat to point the user to Settings > Code. A whitelist grants shell permission when its allowed tools include a shell tool (`Bash`, `shell`, `exec_command`, `run_shell_command`, …). |
| CAP-09 | A readiness timeout, process exit or spawn failure returns a diagnostic code and a bounded tail of stdout/stderr (at most 200 lines) to the agent. `get_preview_status` returns the same data later. |
| CAP-10 | A new canvas surface kind `code_conversation` maps to `/code/chats/:channelId[/canvas/:artifactId[/view/:presentation]]`, and its Activity is anchored to the conversation. Every grant-originated show/clear intent targets this surface. |
| CAP-11 | Artifacts of kind `preview` backed by a supervisor lease resolve `auto` to `iframe` even when the URL ends in `.html`. Artifacts created for a static lease by `show_in_canvas(path)`, or by `start_dev_preview`, are materialized under the supervisor producer identity, as `livePreview/artifactMaterialization.ts` already does. That identity is in the default `scriptedPreviewProducerAllowlist`. The requesting Cat is recorded as the requester in metadata and Activity. `declare_artifact` and `show_in_canvas(url)` keep the agent producer and stay `static`, because `canUseScriptedArtifactCanvasPreview` denies the `agent` kind. |
| CAP-12 | The Code conversation top bar has a Preview control that reopens the most recent artifact shown for that conversation, sourced from `artifact_canvas_show_intent` Activity. A show call made while no tab is subscribed can still be reached, so dropped render intents are acceptable. |
| CAP-13 | Lifecycle: leases stop on conversation deletion, grant revocation, TTL expiry, explicit stop and Platform shutdown, and Platform startup sweeps orphans. The TTL renews while the canvas shows the lease. Reopening an expired static preview restarts its lease transparently. An expired dev preview offers a user-initiated Restart that reuses the recorded profile and parameters. As implemented (PLAN-116 D2): when a conversation's last grant is revoked, a delete stops its previews at once, and a close stops them after a 60-second grace so a replaced session keeps them. The orphan sweep stops only recorded processes that are alive and still hold their port. A restart keeps the artifact id and rebinds its lease. |
| CAP-14 | The canvas pane top bar shows lease status and offers Stop, Restart, Logs and Open externally for dev previews. As implemented (PLAN-116 D2), the controls sit in a product row under the canvas top bar. A static preview has no controls; it restarts transparently. |
| CAP-15 | The preview policy text (see [Agent Policy](#agent-policy)) is added to session instructions only when runtime reports `delivered` for that session (CAP-16). Provider-level support alone is not enough. The MCP server `instructions` and tool descriptions carry it too. |
| CAP-16 | Runtime session contract follows cats-runtime [ADR-044](https://github.com/cats-inc/cats-runtime/blob/main/docs/decisions/044-configure-session-mcp-servers-for-provider-clis.md) / [SPEC-035](https://github.com/cats-inc/cats-runtime/blob/main/docs/specs/SPEC-035-session-mcp-servers.md): `mcpServers?: { name, transport: 'http', url, auth }[]` on create, resume and send. v1 accepts loopback URLs with `bearer_env` or `none`; Code uses `bearer_env`. `oauth_ref` and `stdio` are reserved and rejected. Omission retains the current set; an empty array clears it. The CLI connects directly; Runtime never proxies MCP. Names use `cats` for the host, `app-<slug>` for Apps and plugin-derived slugs. Secrets stay in memory and child environment, never argv, persistence or diagnostics. Claude receives inline `--mcp-config` JSON with environment-variable expansion; `mcp__<name>` is added to `--allowedTools` in default/whitelist modes. Codex receives `-c mcp_servers.<name>.*` with `bearer_token_env_var` and approval for that server's tools only; elicitations remain declined. The report includes `status: delivered/unsupported/failed` and per-server `connection: connected/failed/unknown`. Delivered means the live worker has the current descriptors, not confirmed connectivity. Create/resume return the report; send emits it in `progress` metadata of kind `mcp_servers`. Changing descriptors on send recycles a supporting worker at the turn boundary. Recycling a worker does not close the logical session or revoke its Code grant/preview leases. After Runtime restart Platform must supply descriptors again on resume/create. Provider capability is also readable ahead of time. |

Integration checkpoint (2026-09-29): the concurrent Runtime implementation is
ahead of this Platform plan. Track its release/pin independently. CAP-15's policy
can describe configured tools when delivery succeeds; never label a connection
healthy solely from `delivered`. Code MCP remains internal even with a valid
session bearer at the public ingress. Internal preview ports are compatible with
SPEC-122's one public ingress; remote Canvas previews require separate serving
and isolation acceptance before a remote client receives a preview URL.

### Non-Functional Requirements

- **Security**:
  - Scripts run only on supervisor-leased loopback origins, never on the Cats
    shell origin.
  - The endpoint rejects any request carrying `Origin`, so preview pages cannot
    call the tool endpoint.
  - Platform APIs must not treat a `127.0.0.1:471xx` origin as trusted. This is
    verified in PLAN-116 P4.
  - No assistant-supplied command strings are accepted.
- **Reliability**: A stop is idempotent, and the process tree is cleaned up on
  every terminal path. A static server bind failure is reported immediately.
- **Latency**: A static preview is shown within 1 second of the tool call.
  Dev-preview readiness uses the profile timeout (Vite: 30 seconds).
- **Hygiene**: Tests and acceptance runs use temporary `CATS_PLATFORM_DIR` /
  `CATS_RUNTIME_DIR` / `CATS_DESKTOP_DIR`, temporary workspaces and non-default
  ports, never the user's dev state.

## Tool Contract

Claude sees these tools as `mcp__cats__<tool>`. Other providers see their own
prefixed form.

| Tool | Input | Result |
| --- | --- | --- |
| `show_in_canvas` | exactly one of `path`, `url` (https, or a URL returned by a Cats tool) or `artifactId`; optional `title`, optional `presentation` (`auto` / `iframe` / `image` / `pdf` / `code`) | `{ artifactId, canvasPath, presentation, previewId?, previewUrl? }` or `{ error: { code, message } }` |
| `start_dev_preview` | `directory` (workspace path containing `package.json`), optional `script` (default `dev`), optional `title` | on success, `{ previewId, artifactId, canvasPath, previewUrl, profileId }`, shown automatically; on failure, `{ error, logTail }` |
| `get_preview_status` | `previewId`, optional `logLines` (≤ 200) | `{ status, profileId, previewUrl?, diagnostics?, logTail }` |
| `stop_preview` | `previewId` | `{ status: 'stopped' }` (idempotent) |
| `clear_canvas` | none | `{ cleared: true }` |
| `declare_artifact` | SPEC-092 input | SPEC-092 result |

Resolution order for `path`:

1. A directory containing `index.html` becomes a static preview (iframe).
2. `.html` or `.htm` becomes a static preview (iframe) rooted at the file's
   directory.
3. An image or `.pdf` is served by a static lease and shown in the `image` or
   `pdf` viewer.
4. `.md` and text or code files use the `code` viewer. In M4, `.md` switches to
   `markdown`.
5. Anything else returns `presentation_unsupported`, with a hint to use
   `declare_artifact`.

## Agent Policy

This text goes in the session instructions, the MCP server `instructions` and
the tool descriptions. PLAN-116 M3 tunes it against the eval.

> Cats Code shows previews in a canvas beside this conversation. When your work
> produces something a person looks at (a web page or web app, an HTML file, a
> Markdown or PDF document, an image or SVG), finish it, check that it works,
> then open it. Use `show_in_canvas` with the file path for anything that needs
> no build step. Use `start_dev_preview` for projects that need a dev server or
> bundler (a `package.json` with a dev script); install dependencies first. If a
> start fails, read the returned log tail, fix the cause and try again. Do not
> open previews for command-line tools, libraries, backend-only services, tests
> or refactors without visible output. Static previews and hot-reloading dev
> servers pick up later edits by themselves, so call `show_in_canvas` again only
> to show a different item. Briefly say in your reply what you opened.

## Design Overview

```text
Cat (Claude Code / Codex) ──MCP tools/call──▶ Platform /api/code/agent-tools/mcp
   ▲  (runtime injected mcpServers                │ grant → {session, channel, workspace, actor}
   │   at spawn; result returns in-turn)          ├─ static: supervisor lease + in-process server
   │                                              ├─ dev: supervisor lease + Vite/npm-script profile
   └──────────── tool result ◀────────────────────┤
                                                  ├─ CoreArtifactRecord(kind=preview) + Activity
                                                  └─ render intent → /code/chats/:id/canvas/:artifactId
Renderer: WorkspaceAppRoutes chats route mounts withSharedViewerRoutes(code_conversation)
          → CanvasPane → IframeViewer (scripted-cross-origin via lease predicate)
```

## Dependencies

- A cats-runtime release that carries CAP-16. Platform then pins the new runtime
  and Desktop bundles it.
- SPEC-101 canvas, SPEC-108 supervisor and SPEC-092 materialization, all of which
  are already implemented as libraries.
- Node discovery for spawned dev servers in packaged Desktop, where
  `process.execPath` is Electron (see PLAN-116 risks).

## Open Questions

On 2026-09-29 the user approved the proposal in each of the four questions below. The proposal is now the contract; the alternatives are not taken.

- [x] **1. Execution posture.** This question closes PLAN-097 Task 5.1.
  SPEC-108 forbids assistant-chosen commands. A dev server runs code the agent
  wrote (the `vite.config`, the `package.json` scripts), with the user's
  privileges. That is the same privilege class as the agent's own shell in the
  same workspace. Proposal: allow it by default for sessions that already have
  shell execution permission (CAP-08), behind a Settings toggle "Cats may run
  preview servers" that defaults on. Alternative: default off, with an opt-in.
- [x] **2. Tool shape.** The research note kept canvas display artifact-bound,
  with two calls (declare, then show). Proposal: `show_in_canvas({ path | url })`
  materializes the artifact itself in one call, which keeps the audit record and
  is easier for the model to use correctly.
- [x] **3. Provider scope.** Proposal: Claude Code and Codex only for the MVP.
  Providers without MCP delivery (Antigravity, Grok, Devin, Cline, Muse) get no
  preview policy until their adapters gain a mapping.
- [x] **4. Dev-preview scope.** Proposal: Vite first (profile already reviewed).
  The generic `npm run <script>` profile follows once node/npm discovery works in
  packaged Desktop.

## References

- [SPEC-101](./SPEC-101-cats-code-artifact-canvas.md),
  [SPEC-108](./SPEC-108-cats-code-live-preview-substrate.md),
  [SPEC-092](./SPEC-092-code-artifact-declaration-contract.md)
- [Live preview operator guide](../live-preview-operator-guide.md)
- [Tool Call Registry](../tool-calls.md)

---

*Created: 2026-09-29*
*Author: Claude*
*Related Plan: [PLAN-116](../plans/PLAN-116-code-agent-artifact-preview-rollout.md)*

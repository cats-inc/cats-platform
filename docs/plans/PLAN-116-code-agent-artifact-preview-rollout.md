# PLAN-116: Cats Code Agent Artifact Preview Rollout

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In progress (2026-09-30). M1, M2 and M3 accepted. M4: F1, F2, F4 and F5 done; F3 (more Runtime providers) in progress. Open for the user: the P0 App/plugin MCP alignment review and the Settings > Code preview-server default (shipped off; the approved default is on) |
| **Owner** | Claude |
| **Reviewer** | User |

## Related Spec

[SPEC-123: Cats Code Agent Artifact Preview](../specs/SPEC-123-code-agent-artifact-preview.md),
governed by [ADR-126](../decisions/126-deliver-code-preview-tools-to-provider-agents-through-session-mcp.md).
This plan continues [PLAN-090](PLAN-090-cats-code-artifact-canvas-rollout.md) and
[PLAN-097](PLAN-097-cats-code-live-preview-substrate-rollout.md). Its P5 sign-off
closes PLAN-097 Task 5.1, and its isolated end-to-end check closes Task 5.4.

## Overview

Milestones follow the user's MVP:

- **M1 (calculator):** static HTML that the agent opens beside the Code
  conversation.
- **M2 (pomodoro):** a Vite dev server that the agent starts through Cats.
- **M3:** behavioral acceptance for Claude Code and Codex.
- **M4:** more viewer types and more providers.

The first link to build is tool delivery. Nothing downstream can be observed
until a real agent can call a Cats tool.

Cross-repo ownership:

- cats-runtime owns session MCP delivery (P1). That work happens in a cats-runtime
  worktree under `.claude/worktrees/`, with its own ADR-044 / SPEC-035 / PLAN-046.
- Platform owns tools, grants, canvas surfaces and the supervisor (P2 to P7).
- Wiring in `src/app/server/**` is integration-owned. As in PLAN-097, the plan
  owner acts as integrator and records it here.

## Implementation Phases

### P0: Decisions (documentation, this change)

- [x] Record the gap chain and the hang-point decision (ADR-126).
- [x] Define the tool contract, surface, policy text and acceptance (SPEC-123).
- [x] Get user sign-off on SPEC-123 open questions 1 to 4 (execution posture,
  tool shape, provider scope, Vite-first). All four proposals were approved on
  2026-09-29. This is the PLAN-097 Task 5.1 decision; implementation still
  records its security checks in D1.
- [x] Align with App and plugin MCP (ADR-126, "Relationship to App and Plugin
  MCP"). Apps host their MCP handlers independently behind Platform's shared
  transparent ingress/router, without Runtime or host-internal MCP domain handling.
  The shared MCP delivery pieces are runtime `mcpServers` as
  Cat-session configuration (never a traffic path) and a documented security
  baseline. `src/platform/mcp/` and its SDK pin are host-internal. Pointers were
  added to SPEC-122 and `docs/mcp-config.md`.
- [ ] Get user review of that alignment.
- [x] Correct `docs/tool-calls.md`. It said the onboarding block persists in a
  session-create system prompt, but CLI runtime actually re-sends it in every
  turn's user message. Record the `runtimeToolCatalog` delivery gap until P2
  retires the catalog. Add amendment pointers to SPEC-101, SPEC-108 and PLAN-097.

### P1: Runtime session MCP servers (cats-runtime, blocks M1)

- [x] R1 (#130): Add runtime ADR/SPEC/PLAN, framed as the SPEC-121 FR-02 MCP delivery
  mechanism with Code as its first consumer. Accept `mcpServers` on session
  create, resume and message send, using the `auth` kinds and the server-name namespace
  (SPEC-123 CAP-16). Accept `bearer_env` and `none`; Code requires the former.
  Reserve/reject `oauth_ref`.
  Validate names, `http` transport and loopback URLs. Keep secret
  values only in memory: exclude them from persistence, logs, session reads and
  diagnostics, and redact spawn arguments and environment. A changed set on send
  recycles a supported worker at the turn boundary without closing the logical
  session or revoking Code grants/preview leases. Create and resume responses, and the first
  send stream event (`progress` of kind `mcp_servers`), report per-session
  delivery as `delivered`, `unsupported` or `failed`, with separate per-server
  `connection` evidence. Delivered confirms configuration, not connectivity.
  Runtime worktree implementation is ahead of this integration plan; verify the
  release/pin before closing Platform gates.
- [x] R2 (#132): Claude adapter. Pass inline `--mcp-config` JSON using environment-variable
  expansion so the bearer never appears in argv. Runtime SPEC-035 records
  verification on Claude Code 2.1.284. Append
  `mcp__<name>` to `--allowedTools` in `default` and `whitelist` modes, because
  `-p` mode denies unapproved tools silently. Add spawn-argument unit tests that
  assert no secret appears in argv. Add an isolated live smoke that checks the
  tools are listed and a call reaches a stub server.
- [x] R3 (#134): Codex adapter. Add `-c mcp_servers.<name>.url=…` plus bearer
  environment configuration through the existing app-server override
  composition, and auto-approve tool calls for that server only; elicitations
  remain declined.
  **Verify** that the pinned Codex version supports streamable HTTP MCP. If it
  does not, record the minimum version or define the stdio fallback.
- [x] R4 (cats-runtime #140): Report `sessionMcpServers` support per provider in the provider
  capability read. Record the release boundary: an additive optional field within
  the current 0.x line. Choose the version at release time. This plan authorizes
  no bump. Runtime reads now carry `continuity.sessionMcpServers`: true only for
  native Claude Code and Codex CLI targets, and it uses the same check as delivery.
  Runtime 0.4.0 shipped R1–R3 only, so this field first ships in a later 0.4.x.

**Deliverables**: A runtime build in which Claude Code and Codex sessions can
call a Platform-hosted MCP tool and receive its result.

### P2: Platform agent tool server (M1)

- [x] A0: The Platform runtime client carries session MCP servers.
  - `mcpServers` is added to create and send inputs.
  - `resumeSession(id, { mcpServers })` sends a body.
  - The create/resume report is kept on `RuntimeSessionInfo`.
  - The leading Runtime-sourced `mcp_servers` stream event is kept on
    `RuntimeMessageResult`. Provider-sourced progress events are ignored.
  - Types live in `src/runtime/sessionMcpServers.ts`.
- [x] A1: Add a host-internal, dependency-free MCP module under
  `src/platform/mcp/` (`jsonRpcServer.ts`, `sessionGrants.ts`; ADR-126 decision 7
  as amended). The official SDK's transitive footprint was disproportionate.
  Claude Code and Codex were verified against the real module. Apps do not use
  the module.
  - Baseline: stateless Streamable HTTP, JSON-RPC errors, protocol negotiation,
    a 1 MiB body bound, `Origin` rejection, loopback-only peers and a bearer.
  - Grants are `issued` (valid for initialize/list while the CLI spawns) →
    `bound` (required for `tools/call`) → revoked. Only token hashes are kept.
  - The `cats` server (`src/products/code/agentTools/`) serves `declare_artifact`
    and `clear_canvas` for the grant's conversation.
  - It is mounted at `/api/code/agent-tools/mcp` before the router, like the
    knowledge bridge, because the Platform auth gate protects every other
    `/api/*` route.
  - Issuing grants on session create and revoking them on close/delete is part
    of the A2 client wrapper.
- [x] A2a: `show_in_canvas` (`path` / `url` / `artifactId`) on the `cats` server.
  - Workspace paths resolve through `realpath` inside the conversation
    workspace; hidden segments are refused.
  - Pages and directories open on one reused static lease per conversation,
    stamped with `attachArtifact`.
  - Images, PDFs and text use their viewers; unsupported types point to
    `declare_artifact`.
  - https URLs become agent-declared artifacts, which stay `static`.
  - `artifactId` re-shows through the shared projection, Activity and intent.
- [x] A2b: Retired the observation path in the same change:
  - the runtime tool catalog and onboarding block (`runtimeArtifactTooling.ts`)
  - the exact-name `tool_use` processors and the same-turn `declarationId`
    index (`runtimeArtifactExecution.ts`)
  - the `artifactClaims[]` finalization gate (`sessionFinalization.ts`), which
    no adapter fed

  The generic platform enricher, effect-processor and finalization-gate
  registries stay as extension points. Static-lease artifacts carry the
  supervisor producer identity. Grants do not yet carry the Cat actor
  (`actorId: null`), so Activity records no requester until the enricher can
  see the Cat.
- [x] A3: A secret-free enricher marker (`context.metadata.codeAgentTools`)
  identifies Code conversations. The Code runtime-client wrapper (inside the
  supervision boundary) handles grants and descriptors:
  - It issues the grant before create, binds it to the session and revokes it
    on close or delete.
  - It sends `mcpServers` on create, send and resume, and re-issues the grant
    on send after a Platform restart.
  - It adds `CODE_AGENT_PREVIEW_POLICY` to a turn only while the latest report
    is `delivered`. The same text is the `cats` server's MCP `instructions`.

  The Desktop runtime pin still has to move to a Runtime build that contains
  #130/#132/#134 at the next Desktop release; this is a release boundary, not
  a code change.

### P3: Canvas beside the Code conversation (M1)

- [x] B1: Add the `code_conversation` surface to the Artifact Canvas contracts,
  route registry, Activity anchor derivation, projection and iframe policy scope
  checks. Add round-trip tests.
- [x] B2a: Mount `withSharedViewerRoutes` on the `chats/:channelId` route of
  `WorkspaceAppRoutes` for Code only (`chatCanvasSurfaceKind`), so Work is
  unchanged. `useWorkspaceLocationState` now matches `/chats/:channelId/*`, so
  the channel stays selected on `/canvas/...` child routes. The surface ID is
  the channel ID; Activity and artifact anchoring translate it with
  `buildChatConversationId`.
- [x] B2b: Add the top-bar Preview control, which reopens the most recent
  artifact from show-intent Activity. This follows A-ii, once agent artifacts
  exist. Verify top-bar alignment with Playwright at 1024, 1249, 1600 and 1920 px
  in the isolated M1 acceptance instance.
  Measured in the M1 instance on 2026-09-29. The plain conversation route is
  unaffected. On `/code/chats/:channelId/canvas/:artifactId`:
  - `.channelTopBar` overlaps the canvas column by 6 px at all four widths.
    At 1920 px it also starts 156 px right of `main`.
  - The split is centered, leaving 55 px (1024 to 1600 px) to 210 px
    (1920 px) empty on the right.
  - The conversation opens scrolled to the top instead of the latest reply.

  Done on 2026-09-29:
  - `artifact-canvas.css` undoes the shell's gutter, scrollbar gutter and
    centering for `main.canvas:has(> .artifactCanvasSurfaceFrame)`. The frame
    takes the full width and height, and the page column
    (`.artifactCanvasSurfaceMain`) gets the 28px gutter, so the
    `.channelTopBar` bleed lands on the column. This applies to every canvas
    route.
  - `useTranscriptAutoScroll` scrolls the page column on canvas routes.
  - `ChatOperatorView.latestCanvasArtifactId` holds the newest
    `artifact_canvas_show_intent` of the conversation. Clear intents are
    ignored, so the last shown artifact stays reachable.
  - Code passes `CodeCanvasPreviewButton` through `renderTopBarExtraActions`.
    It opens that artifact on the canvas route and is hidden while that
    conversation's canvas is open.

  Verified in a fresh acceptance instance (Opus, Cat named `Builder Cat`):
  - At 1024, 1249, 1600 and 1920 px:
    - The frame spans `main`.
    - The top bar spans the page column's client box and ends at the resize
      handle.
    - Only the column scrolls, and it opens at the latest reply.
  - From the conversation, Preview opens the canvas and hides itself.
  - In the canvas, `2 + 3 =` shows `5`.
  - Close returns to the conversation, and Preview reappears.

  Findings:
  - Static leases are memory-only. After a Platform restart, a reopened
    preview shows an empty iframe until the agent shows it again. CAP-13
    requires a transparent lease restart, which is D2 lifecycle work.
  - Transcript text shows through the translucent composer chips when the
    list is scrolled up. This already happens on the plain conversation
    route and is not part of B2b.

### P4: Static preview lease (M1)

- [x] C1: Add an in-process static server adapter and a `static` profile to the
  supervisor. It serves the entry directory, checks `Host`, sends `no-store`,
  guards against traversal, dotfiles and symlinks, and binds with an immediate
  failure report. Test it with isolated temporary directories.
- [x] C2: Integration wiring. Construct the `LivePreviewSupervisor` at the host,
  with the static profile always available, and connect the lease store to the
  live-preview routes and canvas projection. Add the supervisor producer to the
  default scripted allowlist, and make `preview` artifacts resolve to `iframe`.
  Add a regression test showing that an agent-producer artifact on a valid lease
  still gets `static`. Supervisor `attachArtifact` stamps the lease with the
  artifact it shows, so later projections keep the scripted profile.
  Verified 2026-09-29 that Platform APIs do not trust preview origins:
  - Platform sends no CORS headers, so a preview cannot read API responses.
  - Cookie-authenticated mutations need `x-cats-csrf-token`, which triggers a
    preflight that fails without CORS.
  - With auth disabled, simple cross-origin POSTs are possible from any page.
    That is pre-existing and not specific to previews (see Risks).
- [x] **M1 acceptance** (isolated instance): Claude Code builds a calculator
  from "做一個計算機", the canvas opens with no preview wording in the prompt,
  and clicking `2 + 3 =` shows `5`.
  Passed on 2026-09-29 with Claude Code (Opus) on this branch:
  - The orchestrator handed the work to the Cat. The Cat wrote
    `calculator/index.html`, `style.css` and `script.js`, tested them, then
    called `show_in_canvas` without being asked.
  - Result: a `preview` artifact on a static lease at `127.0.0.1:47100`, and a
    `code_conversation` show intent resolved to `iframe` with
    `scripted-cross-origin`.
  - Headless Chromium on the canvas route: `2 + 3 =` shows `5`,
    `12 × 3 =` shows `36` and `5 ÷ 0 =` shows `錯誤`, with no console errors.

  Findings from the earlier runs:
  - The grant used the channel's `chatCwd`, which is null for repo-backed
    conversations, so `show_in_canvas` returned `workspace_unknown`. The grant
    now binds to the session cwd that Runtime resolved, falling back to
    `repoPath`.
  - A Cat whose name contains a space could not be reached by @mention, so
    this run named its Cat `Builder`. That is fixed in #204 (see Risks).

### P5: Dev preview (M2)

- [x] D1: Record sign-off on SPEC-123 question 1 (closes PLAN-097 Task 5.1).
  Implement `start_dev_preview`, `get_preview_status` and `stop_preview`: Vite
  detection mapped to the reviewed Vite profile, `dependencies_missing`, the
  CAP-08 permission gate, a log tail on failure and one dev preview per
  conversation. Resolve node for development (`process.execPath`) and for
  packaged Desktop (verify `ELECTRON_RUN_AS_NODE` or a discovered system node).
  Done:
  - The three tools are in `agentTools/devPreview.ts`, and the policy text
    names them.
  - The grant carries the session's shell posture
    (`agentTools/shellPermission.ts`).
  - The Settings > Code switch "Cats may run preview servers" is served by
    `/api/code/preview-settings`; turning it off stops dev previews.
  - The host's opt-in process adapter re-reads the switch before each spawn.
  - `node` resolves to `process.execPath`, with `ELECTRON_RUN_AS_NODE=1` under
    Electron.
  - Static leases no longer count toward the process limits, and the supervisor
    skips ports another program holds.
  - A real Vite smoke on Windows started Vite through the host, served module
    scripts, and on stop left neither Vite nor its esbuild child running.
  Deviation: the switch ships **off**. The approved default is on, but enabling
  process spawning by default was held back for the user's explicit
  confirmation; flipping it is a one-line change in `platformPreferences.ts`.
- [x] D2: Add canvas top-bar lease controls (status, Stop, Restart, Logs, Open
  externally), reusing the `LivePreviewPanel` pieces. Implement lifecycle: stop on
  conversation deletion and grant revocation, TTL renewal while the canvas is
  visible, shutdown stop and a startup orphan sweep.
  Done:
  - `CodePreviewCanvasControls` fills a new product slot under the canvas top
    bar (`canvasControls` on `withSharedViewerRoutes`). For a dev server it
    shows the status and Stop, Restart, Logs and Open in browser.
  - A static preview whose lease is gone restarts transparently on the same
    artifact, which fixes the M1/B2b blank iframe after a Platform restart.
  - The lease renews every 5 minutes while the canvas shows it.
  - `livePreview/conversationPreviews.ts` owns each conversation's leases and
    restarts. It records `artifactDirectory` in the preview metadata, restarts
    on the same artifact id and rebinds `previewId` and `path`.
  - Dev restarts need the Settings switch.
  - The Code runtime wrapper reports session start, close and delete:
    - deleting a conversation's last session stops its previews at once;
    - closing it stops them after 60 seconds, unless a new session starts first.
  - Running dev servers are recorded in
    `<platform>/state/code-live-preview-processes.json`. The next start stops
    every recorded process that is alive and still holds its port.
  - New Code API routes:
    - `GET /api/code/preview-artifacts/:id`;
    - `POST …/restart`;
    - `POST /api/code/live-previews/:id/renew`.
- [x] D3: Add the `npm-script` profile with framework port adapters once node/npm
  discovery is proven in packaged Desktop.
  Done:
  - `NPM_SCRIPT_LIVE_PREVIEW_PROFILES` run `{npmCli} run {script}`
    shell-free, with `PORT`, `HOST=127.0.0.1` and `BROWSER=none`.
  - Framework adapters pass the leased port after `--`: Vite-based, Astro,
    Next.js, Nuxt, webpack dev server and Parcel. Anything else reads `PORT`.
  - The last command of the script picks the adapter, since npm appends
    arguments there, so `tsc && vite` works.
  - `vite`/`vite dev` with Vite installed in the directory still uses the
    direct `vite` profile.
  - A hoisted `node_modules` in a parent inside the workspace counts as
    installed. A project without dependencies needs none. `vite build` is
    refused as not a server.
  - `findNpmCli` checks `npm_execpath`, the host runtime's own npm, and each
    PATH directory in the Windows and POSIX layouts. Without npm, the start
    returns `live_preview_npm_unavailable`.
  - The script is recorded on the lease and the preview metadata, so Restart
    runs it again.
  - Real smokes on Windows through the host:
    - a plain `node server.js` reading `PORT` served its page;
    - a hoisted Vite package in an npm-workspaces monorepo served the Vite page;
    - Stop ended npm, cmd, node and esbuild, and closed the port.
  - Packaged Desktop: Electron as Node ran `npm-cli.js run dev` (M2 notes).
    npm must still come from the user's installation, because Desktop bundles
    none.
- [x] **M2 acceptance** (isolated instance, closes PLAN-097 Task 5.4): a Vite
  pomodoro timer is started by the Cat and visibly counts down. Stopping it and
  quitting Platform leaves no orphan process.
  Passed on 2026-09-30 in an isolated instance (temporary Platform, Runtime and
  workspace directories; Runtime from main with R1–R4; Platform with D1 and D2):
  - Setup: Claude Code (Opus 5.5) as the Cat `Builder Cat`, and the Settings
    switch turned on through `/api/code/preview-settings`.
  - The prompt was 「用 Vite 做一個番茄鐘」.
  - The orchestrator planned `start_dev_preview` and handed off to
    `@Builder Cat`.
  - The Cat scaffolded a Vite 8 project, ran `npm install`, tested it and called
    `start_dev_preview`. The canvas opened with the scripted iframe profile.
  - Playwright on the canvas route:
    - the controls read 「開發伺服器 · 執行中」;
    - pressing 開始 counted down from 25:00 to 24:57;
    - Logs showed Vite's ready banner.
  - Stop ended the Vite process and closed port 47100. Restart started a new
    process on the same artifact, which counted down again. There were no
    console errors.
  - Graceful quit (the `cats.shutdown` IPC that Desktop sends) stopped Vite,
    closed the port and emptied the process registry.
  - After Platform started again, the canvas showed the dev server as stopped
    with Restart, which brought it back.
  - A hard kill of Platform on Windows also ended Vite: it exits once its
    output pipe closes. The next start cleared the registry, leaving no
    orphan.
  - The sweep's own kill path, which matters for POSIX process groups, is
    covered by `tests/code-preview-lifecycle.test.tsx`.
  - Electron as Node (`ELECTRON_RUN_AS_NODE=1`, Electron 41 / Node 24.14) served
    both `node_modules/vite/bin/vite.js` and `npm-cli.js run dev`, which covers
    the packaged-Desktop runtime path.

### P6: Behavioral acceptance and Codex parity (M3)

- [x] E1: Run the scenario matrix for Claude Code and Codex in an isolated
  instance, and record results in this plan:
  - calculator, static
  - pomodoro, Vite
  - negative: a CSV-to-JSON CLI opens no canvas
  - follow-up edit: "make the buttons bigger" updates the preview
  - self-repair: dependencies are missing, the Cat installs them and retries
  Run on 2026-09-30:
  - **Setup:** one isolated instance per provider, each with temporary
    Platform, Runtime and workspace directories.
    - Platform had D1 to D3, with the Settings switch turned on.
    - Runtime was on main; Codex ran again on the #142 build (see findings).
    - Each scenario had its own Code conversation, workspace and Cat, sent
      through the normal orchestrator.
  - **Pass criteria**, checked from Core and the Code API:
    - calculator: a `static` preview is shown and ready;
    - pomodoro: a `vite` or `npm-script` preview is shown and ready;
    - negative: no show intent and no preview artifact;
    - follow-up: the same preview is still ready and serves changed
      HTML/CSS/JS;
    - self-repair: `node_modules` was installed, and a dev preview is shown and
      ready.
  - **Claude Code** (Opus 5.5): 5/5.
    - calculator: static, 249 s.
    - pomodoro: `vite`, 770 s.
    - negative: no canvas, 315 s.
    - follow-up: served content changed on the same lease, 385 s.
    - self-repair: `vite` after `npm install`, 534 s.
  - **Codex** (`gpt-6-astra`): 5/5.
    - calculator: static, 722 s.
    - pomodoro: `vite`, 1,923 s.
    - negative: no canvas, 518 s.
    - follow-up: served content changed, 1,172 s.
    - self-repair: `vite`, 1,313 s. This run was addressed to the Codex Cat
      directly; see findings.
  - **Findings:**
    - Codex turns failed with `Runtime message stream idle timeout after
      120000ms` and, in Runtime, `Controller is already closed`: Codex can work
      for minutes without an event. Fixed in cats-runtime #142 (a 30-second
      heartbeat, and a turn that finishes after the client leaves). All Codex
      results above ran on that build.
    - The orchestrator hands build work to the Cat, but did the plain "run
      this project" self-repair request itself. That run is recorded
      separately. The Codex self-repair verdict comes from a run addressed with
      `@Builder Selfrepair`.
    - Codex's own sandbox on Windows blocked child processes in tests
      (`spawn EPERM`) and a recursive `Remove-Item`. The Cats adapted.
    - Two instances on one machine share the 47100–47199 range. Both
      self-repair runs started the same fixture at once and raced for one port;
      one Cat stopped the other instance's Vite and recovered. A single
      Platform does not race, because its probe and reservation are in one
      process.
    - Runtime's 10-session limit was reached after five conversations
      (orchestrator plus Cat each). Deleting finished conversations frees
      sessions.
- [x] E2: Tune the policy text and tool descriptions until both providers pass.
  Record the prompts and the provider/model versions.
  - Both providers passed with the policy and tool descriptions from D1–D3.
    No text tuning was needed; the one fix was Runtime's heartbeat (#142).
  - Prompts:
    - calculator: 「做一個計算機」
    - pomodoro: 「用 Vite 做一個番茄鐘」
    - negative: 「寫一個把 CSV 轉成 JSON 的命令列工具（Node.js），讀檔案、輸出到 stdout」
    - follow-up: 「做一個計算機」, then 「把按鈕做大一點」
    - self-repair: 「counter/ 這個專案已經寫好了，幫我把它跑起來讓我看看」, on a
      prepared Vite 6 project without `node_modules`
  - Versions:
    - Claude Code 2.1.284, which updated itself to 2.1.285 during the run,
      reporting `claude-opus-5-5`;
    - Codex CLI 0.158.0 with its default model `gpt-6-astra`;
    - cats-runtime main with #140, plus #142 for the Codex runs.

### P7: Breadth (M4)

- [x] F1: A sanitized markdown viewer (reusing the chat markdown renderer), with
  `.md` switched to `markdown`.
  Done:
  - `markdown` is a canvas presentation (input, resolved, `/view/markdown`
    routes and the `show_in_canvas` enum). `.md` and `.markdown` resolve to it
    under `auto`, also on a lease-backed preview. An explicit `code` still
    shows the source.
  - `MarkdownViewer` renders with react-markdown, `remark-gfm` and the chat
    renderer's exported link and image components
    (`MESSAGE_BODY_MARKDOWN_COMPONENTS`). Raw HTML shows as text, `javascript:`
    links become inert, remote images are not loaded and relative links stay
    inert. It omits `remark-breaks` and mentions, because documents are
    hard-wrapped.
  - Found while building it: the shell cannot read a static lease
    cross-origin (no CORS headers, confirmed in headless Chromium), so the
    `code` viewer could not show lease-served text files either. The canvas
    projection API now reads `code`/`markdown` text from the artifact's own
    live lease over loopback (at most 2 MiB) and returns it as `textContent`.
    No CORS was added to the static server.
  - The path branch of `show_in_canvas` now returns the resolved
    `presentation`, as SPEC-123 specifies.
  - Limits: text inlining follows the artifact the lease is currently
    attached to, the same rule as the scripted profile, so an older file on a
    reused lease needs a new `show_in_canvas`. An https Markdown URL renders
    only when its host allows cross-origin reads; otherwise use Open
    externally.
- [x] F2: Research `.docx`/`.pptx` presentation (server-side conversion to HTML
  or PDF), canvas tabs/stacking and reopening per artifact.
  Done: [research note](../research/2026-09-30-canvas-office-documents-and-tabs.md).
  - A probe converted a `.docx` with mammoth in about 150 ms, keeping
    headings and tables and escaping script text.
  - `.pptx` has no pure-JS renderer. It gets a text outline, or LibreOffice to
    PDF when that is installed; Cats does not bundle LibreOffice.
  - Recommended: one "Recent" switcher built from show Activity, not tabs.
    Implementation needs a SPEC-123 amendment first.
- [ ] F3: Add other providers once their runtime adapters map `mcpServers`
  (Antigravity/Gemini, Copilot, Cursor, …).
- [x] F4: Evaluate reuse of process supervision, file containment and leases with
  SPEC-122 App services. Browser trust policies differ: App HTML uses an opaque
  sandbox on shared transport ingress; Canvas uses its own scripted preview
  producer/lease predicate. Do not reuse `allow-same-origin` or that predicate
  for App documents. Remote viewing of loopback Canvas leases needs separate
  acceptance; this App ingress change does not make those URLs remotely usable.
  Done: [evaluation](../research/2026-09-30-canvas-preview-and-app-service-reuse.md).
  - Share the tree kill and the orphan registry. App stop currently ends only
    the direct child on Windows; that fix is a separate SPEC-122 item.
  - Share a contained-realpath primitive when a second caller changes.
  - Keep leases, sandbox profiles and routing separate, as above.
- [x] F5: When SPEC-121 plugin MCP or a user-granted App endpoint needs to reach
  a Cat, configure the Cat session through the same runtime `mcpServers`
  descriptor (`oauth_ref`, and `app-<slug>` or plugin-ID names). The CLI connects
  to the independently hosted server directly. Do not add a second
  session-configuration mechanism. App traffic uses Platform's transparent router,
  without Runtime or the host-internal MCP domain module interpreting its tools.
  Done:
  - `src/platform/mcp/sessionMcpServerContributions.ts` is the one path for
    further servers: `SessionMcpServerContributor`s return entries that
    `composeSessionMcpServers` joins to `cats` in the same Runtime descriptor.
  - Names are enforced per origin: `cats` for the host, `app-<slug>` for an App
    and `plugin-<slug>` for a plugin, with a hash suffix past Runtime's
    32-character limit. An App cannot claim `cats` or another origin's name.
  - The Code runtime wrapper applies contributors on create, send and resume.
    A contributor that throws or misnames a server is left out and reported,
    and `cats` still arrives.
  - There is no consumer yet: no plugin MCP or granted App endpoint reaches a
    Cat today. `oauth_ref` stays reserved in Runtime until the first
    OAuth-backed contributor.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `cats-runtime/src/http/routes/sessions.ts`, `messages.ts` | Modify | Accept and validate `mcpServers` |
| `cats-runtime/src/backends/cli/providers/claude.ts`, `codex.ts` | Modify | Per-provider mapping and approval |
| `src/platform/mcp/*` | Create | Host-internal MCP SDK wiring and guards (host-owned servers only) |
| `src/products/code/agentTools/*` | Create | Grant store, `cats` server, tool handlers |
| `src/products/code/api/index.ts` | Modify | Register the agent-tools route |
| `src/products/code/state/runtimeArtifactTooling.ts` | Modify | Send `mcpServers` plus the policy text; drop the catalog |
| `src/products/code/state/runtimeArtifactExecution.ts` | Modify / remove | Retire the observation processors |
| `src/products/shared/artifactCanvas/{contracts,projection,iframePolicy,activity}.ts` | Modify | `code_conversation`, preview resolution, allowlist default |
| `src/products/shared/renderer/WorkspaceAppRoutes.tsx`, `src/products/code/renderer/**` | Modify | Canvas on the Code chat route, Preview control |
| `src/products/code/livePreview/*` | Modify | Static adapter/profile, agent start, lifecycle |
| `src/app/server/dependencies.ts`, `requestRouter.ts` | Modify | Integration: supervisor construction, route wiring |
| `docs/tool-calls.md`, `docs/live-preview-operator-guide.md`, `docs/services.md` | Modify | Contract, operator and port documentation |
| `tests/code-agent-tools-*.test.tsx`, `tests/artifact-canvas-*` | Create / modify | See Testing Strategy |

## Technical Decisions

- Tools execute in Platform at call time (ADR-126), so results and diagnostics
  reach the agent in the same turn.
- Static previews use a supervisor lease rather than a Cats-served route. A
  distinct loopback origin is what makes the `scripted-cross-origin` profile safe.
- Static previews reuse the reserved `47100-47199` range. No new range is added.
- Vite comes first because its profile is already reviewed. The generic
  `npm-script` profile waits for Desktop node discovery.

## Testing Strategy

- **Unit**: grant binding and revocation; `Origin` and loopback rejection;
  path containment, symlinks and dot-segments; resolution of each tool input;
  Claude and Codex spawn arguments; header redaction; static server guards;
  Vite detection and `dependencies_missing`.
- **Integration**: MCP `tools/call` producing an artifact, Activity, render intent
  and result; `code_conversation` projection and canvas routes; the lease
  predicate granting `scripted-cross-origin` to static and dev leases; the
  observation path being gone.
- **End-to-end**: M1, M2 and M3 scenarios in an isolated instance (temporary
  `CATS_PLATFORM_DIR` / `CATS_RUNTIME_DIR` / `CATS_DESKTOP_DIR`, temporary
  workspaces, non-default ports), driven through the browser to assert iframe
  behavior. No writes to the user's dev state.
- **Scope**: Follow AGENTS.md Local Validation Scope for each PR. Required PR CI
  still gates every merge.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Pinned Codex lacks streamable HTTP MCP | High | R3 verification; minimum version or stdio fallback; Claude-first M1 |
| Claude `-p` denies MCP tools silently | High | R2 pre-authorizes `mcp__cats`; live smoke asserts a real call |
| Agent ignores the preview policy | High | Policy in three places; M3 matrix and text tuning |
| Node unavailable in packaged Desktop | High | D1 verification; Vite via `ELECTRON_RUN_AS_NODE`; npm profile deferred to D3 |
| Preview JS calls Platform APIs (CSRF) | High | `Origin` rejection on the tool endpoint; C2 audit of API origin trust |
| Grant token leaks through argv, runtime logs or reads | High | R1/R2: no secrets in argv (env expansion or owner-only file), in-memory secrets, redaction tests |
| Provider supports MCP but one spawn fails to load it | Medium | Delivery gates policy text; per-server connection evidence determines whether the UI can claim connectivity |
| Orphan dev servers | Medium | Process-tree stop, shutdown stop, startup sweep, M2 check |
| Dev server ignores the leased port | Medium | Readiness timeout with log tail; framework adapters in D3 |
| Second supervisor next to SPEC-122 | Medium | F4 convergence; no App-specific logic in the preview supervisor |
| Chat `chat_conversation` anchoring compares the raw channel ID with `conversation-channel-<id>` (`projection.ts`, `activity.ts`) | Low | Code uses `buildChatConversationId`; Chat is out of scope and recorded for its owner |
| With Platform auth disabled (local development), any page, including a preview, can send simple cross-origin POSTs to loopback APIs | Medium | Pre-existing and not introduced by previews. The MCP tool endpoint rejects `Origin` and requires a bearer. Review CSRF posture for auth-disabled mode separately |
| A Cat whose name contains a space could not be reached by @mention: the regex in `src/shared/mentionParsing.ts` stopped at whitespace, so an orchestrator hand-off to `@Builder Cat` resolved no target | Medium | Fixed in #204: the parser matches the room's known names first (SPEC-026 Mention Parsing). The B2b acceptance run verified an `@Builder Cat` hand-off live |
| Oversized PRs | Low | Phases split into R1–R4, A1–A3, B1–B2, C1–C2, D1–D3, each under about 400 lines |

## Progress Log

| Date | Update |
|------|--------|
| 2026-09-29 | Plan created from a gap audit of the Artifact Canvas, live preview and runtime delivery code. Documentation only, with no executable changes. Awaiting P0 sign-offs. |
| 2026-09-29 | User approved SPEC-123 questions 1–4. Aligned with the Ask App MCP (cats-apps ADR-003/SPEC-004 and the runtime probe), SPEC-122 App services and SPEC-121 plugin MCP. cats-apps documents are unchanged. |
| 2026-09-29 | Corrected the alignment after user review. Apps host MCP independently (Platform `8c8f44ae`, cats-apps `39ddcf7`). The Platform guard module and SDK pin are host-internal. Runtime `mcpServers` configures Cat sessions and never carries traffic. Only a documented security baseline is shared with Apps. |
| 2026-09-29 | cats-runtime R1 (#130) merged; R2 Claude (#132) and R3 Codex were verified with isolated live smokes. M1 order: A0 client prerequisite → B surface → C static lease → A-i endpoint → A-ii tools/Proxy/retirement → acceptance. The `mcpServers` field and policy text travel through a Code runtime-client wrapper, not the enricher, so secrets stay outside supervision evidence. |
| 2026-09-29 | R3 Codex (#134) merged, as were A0, B1, B2a, C1, C2, A1 and A2a. A2b and A3 wire the `cats` server into Code sessions and retire the observation path. M1 acceptance passed in an isolated instance. B2b now has measured layout defects to fix. |
| 2026-09-29 | A2b and A3 merged (#203) and the @mention fix merged (#204). B2b adds the Preview control, fixes the canvas-route layout and scroll, and was verified in a fresh acceptance instance. Next: M2. |
| 2026-09-30 | D1: dev preview tools, the shell-permission gate, the Settings > Code preview-server switch (shipped off pending user confirmation), node resolution, and port probing. Real Vite smoke passed on Windows. |
| 2026-09-30 | D2 (#216) with M2 acceptance, D3 (#217), F1 (#218), F2 and F4 notes (#219) and F5 (#220) merged; Runtime R4 (#140) and the message-stream heartbeat (#142) merged. M3: Claude Code 5/5 and Codex 5/5 with no policy tuning. Open: P0 user review of the App/plugin alignment, the Settings switch default, and F3 (Runtime providers). |

---

*Created: 2026-09-29*
*Author: Claude*

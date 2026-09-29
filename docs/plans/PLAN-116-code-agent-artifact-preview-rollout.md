# PLAN-116: Cats Code Agent Artifact Preview Rollout

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft. Planning only, and no executable work has started. SPEC-123 decisions approved 2026-09-29; App/plugin MCP alignment awaits review |
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

- [ ] R1: Add runtime ADR/SPEC/PLAN, framed as the SPEC-121 FR-02 MCP delivery
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
- [ ] R2: Claude adapter. Pass inline `--mcp-config` JSON using environment-variable
  expansion so the bearer never appears in argv. Runtime SPEC-035 records
  verification on Claude Code 2.1.284. Append
  `mcp__<name>` to `--allowedTools` in `default` and `whitelist` modes, because
  `-p` mode denies unapproved tools silently. Add spawn-argument unit tests that
  assert no secret appears in argv. Add an isolated live smoke that checks the
  tools are listed and a call reaches a stub server.
- [ ] R3: Codex adapter. Add `-c mcp_servers.<name>.url=…` plus bearer
  environment configuration through the existing app-server override
  composition, and auto-approve tool calls for that server only; elicitations
  remain declined.
  **Verify** that the pinned Codex version supports streamable HTTP MCP. If it
  does not, record the minimum version or define the stdio fallback.
- [ ] R4: Report `sessionMcpServers` support per provider in the provider
  capability read. Record the release boundary: an additive optional field within
  the current 0.x line. Choose the version at release time. This plan authorizes
  no bump.

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
- [ ] A2: Implement `show_in_canvas` (`path` / `url` / `artifactId`),
  `clear_canvas` and `declare_artifact` by calling the existing materialization,
  projection, Activity and render-intent functions. Static-lease and dev-preview
  artifacts use the supervisor producer identity, with the Cat recorded as the
  requester (SPEC-123 CAP-11). In the same PR, retire `runtimeToolCatalog`, the
  exact-name `tool_use` observation processors, the same-turn `declarationId`
  index and the `artifactClaims[]` finalization gate (`sessionFinalization.ts`)
  that is fed only by that path. Before deleting, confirm that no adapter emits
  claims, and update the tests.
- [ ] A3: Update the Code enricher. Send `mcpServers` on create, on every send
  and on resume after a Runtime restart, for providers that report support. Add
  the SPEC-123 policy text only when the session's latest report is
  `delivered`. Update the runtime pin.

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
- [ ] B2b: Add the top-bar Preview control, which reopens the most recent
  artifact from show-intent Activity. This follows A-ii, once agent artifacts
  exist. Verify top-bar alignment with Playwright at 1024, 1249, 1600 and 1920 px
  in the isolated M1 acceptance instance.

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
- [ ] **M1 acceptance** (isolated instance): Claude Code builds a calculator
  from "做一個計算機", the canvas opens with no preview wording in the prompt,
  and clicking `2 + 3 =` shows `5`.

### P5: Dev preview (M2)

- [ ] D1: Record sign-off on SPEC-123 question 1 (closes PLAN-097 Task 5.1).
  Implement `start_dev_preview`, `get_preview_status` and `stop_preview`: Vite
  detection mapped to the reviewed Vite profile, `dependencies_missing`, the
  CAP-08 permission gate, a log tail on failure and one dev preview per
  conversation. Resolve node for development (`process.execPath`) and for
  packaged Desktop (verify `ELECTRON_RUN_AS_NODE` or a discovered system node).
- [ ] D2: Add canvas top-bar lease controls (status, Stop, Restart, Logs, Open
  externally), reusing the `LivePreviewPanel` pieces. Implement lifecycle: stop on
  conversation deletion and grant revocation, TTL renewal while the canvas is
  visible, shutdown stop and a startup orphan sweep.
- [ ] D3: Add the `npm-script` profile with framework port adapters once node/npm
  discovery is proven in packaged Desktop.
- [ ] **M2 acceptance** (isolated instance, closes PLAN-097 Task 5.4): a Vite
  pomodoro timer is started by the Cat and visibly counts down. Stopping it and
  quitting Platform leaves no orphan process.

### P6: Behavioral acceptance and Codex parity (M3)

- [ ] E1: Run the scenario matrix for Claude Code and Codex in an isolated
  instance, and record results in this plan:
  - calculator, static
  - pomodoro, Vite
  - negative: a CSV-to-JSON CLI opens no canvas
  - follow-up edit: "make the buttons bigger" updates the preview
  - self-repair: dependencies are missing, the Cat installs them and retries
- [ ] E2: Tune the policy text and tool descriptions until both providers pass.
  Record the prompts and the provider/model versions.

### P7: Breadth (M4)

- [ ] F1: A sanitized markdown viewer (reusing the chat markdown renderer), with
  `.md` switched to `markdown`.
- [ ] F2: Research `.docx`/`.pptx` presentation (server-side conversion to HTML
  or PDF), canvas tabs/stacking and reopening per artifact.
- [ ] F3: Add other providers once their runtime adapters map `mcpServers`
  (Antigravity/Gemini, Copilot, Cursor, …).
- [ ] F4: Evaluate reuse of process supervision, file containment and leases with
  SPEC-122 App services. Browser trust policies differ: App HTML uses an opaque
  sandbox on shared transport ingress; Canvas uses its own scripted preview
  producer/lease predicate. Do not reuse `allow-same-origin` or that predicate
  for App documents. Remote viewing of loopback Canvas leases needs separate
  acceptance; this App ingress change does not make those URLs remotely usable.
- [ ] F5: When SPEC-121 plugin MCP or a user-granted App endpoint needs to reach
  a Cat, configure the Cat session through the same runtime `mcpServers`
  descriptor (`oauth_ref`, and `app-<slug>` or plugin-ID names). The CLI connects
  to the independently hosted server directly. Do not add a second
  session-configuration mechanism. App traffic uses Platform's transparent router,
  without Runtime or the host-internal MCP domain module interpreting its tools.

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
| Oversized PRs | Low | Phases split into R1–R4, A1–A3, B1–B2, C1–C2, D1–D3, each under about 400 lines |

## Progress Log

| Date | Update |
|------|--------|
| 2026-09-29 | Plan created from a gap audit of the Artifact Canvas, live preview and runtime delivery code. Documentation only, with no executable changes. Awaiting P0 sign-offs. |
| 2026-09-29 | User approved SPEC-123 questions 1–4. Aligned with the Ask App MCP (cats-apps ADR-003/SPEC-004 and the runtime probe), SPEC-122 App services and SPEC-121 plugin MCP. cats-apps documents are unchanged. |
| 2026-09-29 | Corrected the alignment after user review. Apps host MCP independently (Platform `8c8f44ae`, cats-apps `39ddcf7`). The Platform guard module and SDK pin are host-internal. Runtime `mcpServers` configures Cat sessions and never carries traffic. Only a documented security baseline is shared with Apps. |
| 2026-09-29 | cats-runtime R1 (#130) merged; R2 Claude (#132) and R3 Codex were verified with isolated live smokes. M1 order: A0 client prerequisite → B surface → C static lease → A-i endpoint → A-ii tools/Proxy/retirement → acceptance. The `mcpServers` field and policy text travel through a Code runtime-client wrapper, not the enricher, so secrets stay outside supervision evidence. |

---

*Created: 2026-09-29*
*Author: Claude*

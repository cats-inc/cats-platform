# ADR-126: Deliver Code Preview Tools to Provider Agents Through a Session MCP Server

## Status

Proposed, 2026-09-29. Not implemented. On 2026-09-29 the user approved the four
[SPEC-123](../specs/SPEC-123-code-agent-artifact-preview.md) decisions: execution
posture, one-call tool shape, Claude Code and Codex first, and Vite first. The
alignment with App and plugin MCP described in [Relationship to App and Plugin
MCP](#relationship-to-app-and-plugin-mcp) awaits review.
Delivery: [PLAN-116](../plans/PLAN-116-code-agent-artifact-preview-rollout.md).

## Context

Cats Code should behave like Manus: when a Cat (a provider CLI worker such as
Claude Code or Codex) finishes building something a person looks at, the Cat
opens it in a canvas beside the conversation. Most of the substrate exists, but
nothing connects the model to it:

- [SPEC-092](../specs/SPEC-092-code-artifact-declaration-contract.md) and
  [SPEC-101](../specs/SPEC-101-cats-code-artifact-canvas.md) implemented
  `declare_artifact`, `show_in_canvas` and `clear_canvas` as assistant-effect
  processors that watch `tool_use` segments by exact tool name
  (`src/products/code/state/runtimeArtifactExecution.ts`).
- The tool definitions are only placed in
  `context.metadata.codeArtifactDeclaration.runtimeToolCatalog`
  (`src/products/code/state/runtimeArtifactTooling.ts`). cats-runtime never reads
  that key. Its session create accepts `instructions`, `skills`, `context` and
  `allowedTools` only (`cats-runtime/src/http/routes/sessions.ts`). No CLI adapter
  passes MCP configuration (`cats-runtime/src/backends/cli/providers/claude.ts`
  `buildSpawnArgs`).
- For CLI providers, runtime prepends session instructions to every turn's
  user-message text (`cats-runtime/src/backends/cli/providers/prompt.ts`). The
  Code onboarding block therefore tells the model to call tools it does not have.
- Nothing returns a tool result to the agent (PLAN-081 Tasks 3.1a/3.1c are open),
  so even a delivered tool could not report a failure the agent could fix.
- The [SPEC-108](../specs/SPEC-108-cats-code-live-preview-substrate.md)
  supervisor is library code that the host never constructs, and the iframe
  policy gives agent-declared URLs `sandbox=""`, so scripted pages render blank.

As a result, no provider agent in Cats Code can open a preview today.

## Decision

1. **Platform hosts the tools.** Cats Code owns an MCP server named `cats`, served
   on the platform's own loopback listener. Its tools run inside Platform when
   the agent calls them and return structured results in the same turn,
   including diagnostics and log tails on failure. This is the only execution
   path for agent-initiated canvas and preview effects.
2. **Runtime delivers them generically.** cats-runtime gains a provider-neutral
   session capability: `mcpServers` descriptors on session create and message
   send. Each CLI adapter maps them to its native configuration, without putting
   secrets in argv, and pre-authorizes the named server's tools. Runtime reports
   which providers support this, and it reports per session whether the server
   was actually delivered. It does not interpret the tools. This is the
   agent-delivery mechanism that
   [SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md) FR-02 already
   assigns to Runtime (MCP/tools: transport, tool scope, auth reference,
   connection lifecycle), and Code preview is its first consumer. Runtime owns
   the delivery mechanism and Platform owns tool semantics, consistent with
   ADR-125 item 5.
3. **Session-scoped capability grant.** Every runtime session that receives the
   server gets a bearer grant bound to that runtime session, one Code
   conversation, its workspace root and the Cat actor. The endpoint accepts
   loopback callers only and rejects requests that carry an `Origin` header.
   It is internal-only: the shared public ingress rejects
   `/api/code/agent-tools/mcp` even with a valid grant. Tunnel upstream peers can
   be loopback; peer address and client-supplied forwarded headers are not proof
   of local entry. SPEC-122 keeps the public ingress listener separate from the
   internal listener, with the same Platform router behind an explicit boundary. The
   grant is revoked when the session closes or the conversation is deleted. It
   never appears in transcripts, Activity, URLs, logs or runtime session reads.
4. **Retire the dead path in the same change.** When MCP execution lands, remove
   the `runtimeToolCatalog` metadata and the exact-name `tool_use` observation
   processors. Keep the materialization, projection, Activity and render-intent
   functions: the MCP handlers call them directly. The pre-release policy forbids
   keeping both paths.
5. **Advertise only what is delivered.** Platform adds the preview policy to
   session instructions only when runtime confirms that the session received the
   server. The same policy appears in the MCP server `instructions` and in tool
   descriptions. A provider without support gets no preview instructions and no
   phantom tool names.
6. **Initial providers.** The first providers are Claude Code and Codex, the
   current `strong_agent` candidates. Other adapters join once their mapping is
   implemented and verified.
7. **Platform's MCP implementation is host-internal and dependency-free.**
   Platform's host-owned servers use a small stateless Streamable HTTP JSON-RPC
   module in `src/platform/mcp/`. It implements `initialize` (with version
   negotiation), `ping`, `tools/list` and `tools/call`, returns standard JSON-RPC
   errors, never issues `Mcp-Session-Id` and bounds request bodies. Its guards
   are `Origin` rejection, a loopback-only peer and bearer verification, and
   tool failures are returned as `isError` results that the agent can act on.

   *Amended 2026-09-29 (PLAN-116 A-i).* The official SDK was the first choice.
   Its 1.31 line pulls in express, hono, jose, ajv, cors and rate limiting, far
   too much for a five-method loopback endpoint shipped in Desktop. The module
   was verified directly against the pinned clients. Claude Code 2.1.284 first
   sends `server/discover` with protocol `2026-07-28`; it receives 400, falls
   back to `initialize` at `2025-06-18`, connects and completes `tools/call`.
   Codex 0.158.0 completes `initialize` → `tools/list` → `tools/call` and
   receives `structuredContent`.

   This module serves Platform's own servers only. Apps may not import Platform
   source (cats-apps SPEC-001 item 5), and they choose and version their own MCP
   stack. The Code handlers live in the Code product. The endpoint is mounted
   before the router because every other `/api/*` route is behind the Platform
   auth gate. No cross-product MCP URL namespace is introduced.

## Relationship to App and Plugin MCP

Four MCP efforts overlap: this ADR, the Ask App
([cats-apps ADR-003](https://github.com/cats-inc/cats-apps/blob/main/docs/decisions/003-delegate-personal-questions-to-first-party-assistants.md)),
App components ([ADR-125](125-own-multiple-frontends-and-backends-in-one-app.md),
[SPEC-122](../specs/SPEC-122-app-components-and-private-services.md)) and managed
plugins ([SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md)).

**Governing rule: an App hosts its MCP server independently.** The server runs
in the App's own service component, with its own SDK and version, its own
MCP connection credentials (ADR-125 items 3, 5 and 6). Under the shared-ingress
amendment, Platform mounts `/apps/<appId>/mcp` on the same listener/tunnel as
Platform, Mobile and other Apps. It transparently routes traffic and enforces
the hosting boundary; the App validates MCP connection/operation credentials
and interprets its domain tools. Runtime and Platform's host-internal MCP
module are not on that path. SPEC-122 assigns installation, supervision,
isolation, route authorization and shared ingress lifecycle to Platform.

**Shared (configuration and conventions only, not code or traffic):**

1. **Configuring Cat sessions.** Runtime session `mcpServers` is only the way a
   Runtime-spawned provider CLI is *told* which MCP servers to connect to. The
   CLI then connects to each server directly, and Runtime never proxies MCP
   traffic. The same descriptor covers the host-owned `cats` server,
   plugin-contributed servers (SPEC-121 FR-02), remote servers such as the X MCP
   found by the Ask probe, and an App endpoint if a user later grants a Cat
   access to it. An App endpoint never *requires* this path; it exists only for
   Cats that should use the endpoint. The descriptor uses
   `auth: { kind: 'bearer_env' | 'oauth_ref' | 'none' }` rather than raw headers.
   Only `bearer_env` is implemented first; the other kinds are reserved. Server
   names are namespaced: `cats` for the host, `app-<slug>` for Apps and a slug
   derived from the plugin ID for plugins (plugin IDs contain `/`).
   Platform implements this as `SessionMcpServerContributor`s composed by
   `composeSessionMcpServers` (`src/platform/mcp/sessionMcpServerContributions.ts`,
   PLAN-116 F5), which enforces each origin's name (`plugin-<slug>` for plugins).
2. **A documented security baseline, not a shared module.** The Ask probe's
   posture and SPEC-123 CAP-02 converge: stateless Streamable HTTP,
   `Origin`/`Host` checks, bounded bodies and rates, bearer or OAuth credentials
   and idempotent receipts. The baseline is recorded as a checklist that host
   servers and App servers each implement independently. A reusable helper may
   later ship through the public App SDK if Apps ask for one. It is not a
   precondition.

**Separate:**

1. **Hosting and ownership.** App MCP servers, handlers, API, data and external
   credentials belong to the App (ADR-125, cats-apps ADR-003 item 5, SPEC-004
   FR-10). This ADR's session grant store and `src/platform/mcp/` serve
   host-owned servers only. App MCP connection credentials remain App-owned;
   Platform separately issues/verifies frontend view grants under SPEC-122.
2. **Direction and audience.** A Cat session connects outbound and locally to
   servers it was configured with; its threat model is loopback. External
   clients reach App endpoints inbound over Platform-managed shared ingress.
   App lifecycle revokes its own routes without stopping that ingress. Session
   MCP and App MCP retain separate handlers/grants; neither passes through Runtime.
3. **Runtime's own `/mcp` facade.** This host/orchestrator surface, proxied at
   `/api/runtime/mcp`, is never injected into Cat sessions and never exposed as
   an App public entry.

## Consequences

### Positive

- Tools appear natively, with schemas the model can discover, and results come
  back to the agent. The agent can repair a failed dev-server start without the
  user relaying errors.
- One runtime mechanism serves host, plugin, App and remote MCP servers.
  Adding the Work tool surface (ADR-105), SPEC-121 plugin MCP or a user-granted
  App endpoint later needs no new runtime field.
- Host servers and App servers follow one documented MCP-over-HTTP security
  baseline without coupling App releases to Platform code or dependency pins.
- The SPEC-101 canvas, Activity audit, render intents and iframe policy stay the
  single presentation path.

### Negative

- It needs a cats-runtime release and a Platform runtime pin bump, plus a Desktop
  bundle that carries both.
- CLI flag drift: each provider's MCP configuration and approval behavior must be
  verified per pinned version. Codex HTTP MCP support depends on its version.
- Runtime and Platform must share a host, because loopback is required. A remote
  runtime cannot use the tools until a separate transport is designed.
- Runtime must exclude secret-bearing descriptors from persistence, logs and
  session reads.

### Neutral

- Apps keep hosting their MCP handlers independently. Their public traffic passes
  through Platform's shared transparent ingress/router, without Runtime or the
  host-internal MCP domain module handling App tools.
- ADR-105's Work decision-envelope surface is unchanged. It may migrate later.
- `declare_artifact` remains available for artifacts that have no preview.

## Alternatives Considered

### HTTP grant plus `curl` instructions (knowledge-bridge pattern)

- **Pros**: It works today for any provider that has a shell, with no runtime
  change.
- **Cons**: The token would appear in command lines, the transcript and the
  process list. There is no schema discovery, and quoting is fragile in Windows
  PowerShell.
- **Why rejected**: It cannot keep the grant secret. It may return later as a
  fallback for providers without MCP, with the token passed through an
  environment variable rather than prompt text.

### Codex `dynamicTools`

- **Pros**: There is a native precedent (runtime ADR-041).
- **Cons**: It is Codex-only and would still need a runtime-to-Platform callback.
- **Why rejected**: It is not a general mechanism.

### Keep `tool_use` observation and register tools natively in runtime

- **Cons**: A CLI provider cannot receive arbitrary native tools except through
  MCP. Observing a call after the fact returns no result to the agent.
- **Why rejected**: It cannot close the result loop.

### Let the agent run its own dev server and show that URL

- **Cons**: The process lives only as long as the CLI worker. A server with no
  supervisor lease falls to the static sandbox, and SPEC-101 rejects hostname
  alone as a trust signal.
- **Why rejected**: The preview would not survive the turn and could not run
  scripts.

### Stdio MCP shim instead of loopback HTTP

- **Pros**: More CLIs support stdio.
- **Cons**: It needs a Platform-shipped executable for each OS and Desktop layout.
- **Why rejected for v1**: The runtime contract reserves `transport: 'stdio'` for
  providers that lack HTTP MCP.

## References

- [SPEC-123: Cats Code Agent Artifact Preview](../specs/SPEC-123-code-agent-artifact-preview.md)
- [ADR-098: URL-driven canvas](098-url-driven-canvas-and-platform-shared-viewer.md)
- [ADR-104: Managed live-preview supervisor](104-adopt-managed-live-preview-supervisor-for-artifact-canvas.md)
- [ADR-105: Phase-scoped Work tool surface](105-adopt-phase-scoped-work-tool-surface.md)
- [ADR-125: App components and private services](125-own-multiple-frontends-and-backends-in-one-app.md)
- [Split-canvas research](../research/2026-04-30-cats-code-split-canvas-artifact-panel.md)
- [SPEC-121: Managed plugin capabilities](../specs/SPEC-121-managed-plugin-capabilities.md)
- [SPEC-122: App components and private services](../specs/SPEC-122-app-components-and-private-services.md)
- [cats-apps SPEC-004: Ask MVP](https://github.com/cats-inc/cats-apps/blob/main/docs/specs/SPEC-004-personal-assistant-questions-mvp.md)
- [cats-runtime Ask MCP probe](https://github.com/cats-inc/cats-runtime/blob/main/docs/research/2026-09-29-cats-ask-mcp-probe.md)

---

*Decision proposed: 2026-09-29*
*Decision makers: user (SPEC-123 decisions approved 2026-09-29); App/plugin
alignment pending user review; drafted by Claude*

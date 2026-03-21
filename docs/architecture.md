# System Architecture

> Technical architecture and design decisions for `Cats`.

## Overview

`Cats` is now both the current product-facing application layer and the
planning home for the shared Cats suite contracts. The current implementation
is still a split architecture: a Node server owns product and runtime-facing
APIs, and a React/Vite renderer owns the operator-facing shell. The accepted
next step is to add `Cats Core v1` so `Cats Chat` and `Cats Work` can launch on
the same shared domain model.

## Architecture Diagram

```text
┌───────────────────────────┐   ┌───────────────────────────┐
│       Cats Chat UI        │   │       Cats Work UI        │
│   chat-first operator     │   │ work views and inboxes    │
└──────────────┬────────────┘   └──────────────┬────────────┘
               │ HTTP / desktop host            │ HTTP / desktop host
               └──────────────┬─────────────────┘
                              ▼
┌────────────────────────────────────────────────────────────┐
│                     cats product server                    │
│  product APIs + suite orchestration + shared app services  │
└──────────────┬───────────────────────────────┬─────────────┘
               │                               │
               │ shared domain                  │ runtime access
               ▼                               ▼
┌───────────────────────────┐        ┌───────────────────────────┐
│       Cats Core v1        │        │       cats-runtime        │
│ actors + channels + tasks │        │ direct API + MCP facade   │
│ approvals + owner profile │        │ stable runtime boundary   │
└──────────────┬────────────┘        └──────────────┬────────────┘
               │                                    │
               │ operational / archive data         │ subprocess / local files / local APIs
               ▼                                    ▼
┌───────────────────────────┐        ┌───────────────────────────┐
│ DB + operational search   │        │ Claude / Codex / Gemini   │
│ archive metadata + RAG    │        │ Cursor / Kiro / OpenCode  │
└───────────────────────────┘        └───────────────────────────┘

Third-party transports such as Telegram and LINE route through the product
server and a single orchestrator-facing bot binding rather than talking
directly to individual workers.
```

## Components

## Current Suite-Host Code Layout

The current first-slice code layout now follows the suite-host split accepted
in ADR-025:

```text
src/
  app/
    server/
    renderer/
  core/
  products/
    chat/
    work/
    code/
  platform/
  shared/
```

Current ownership:

- `src/app/server/*` owns top-level HTTP composition
- `src/app/renderer/*` owns top-level suite routing
- `src/core/*` owns shared Cats Core contracts and persistence seams
- `src/products/chat/*` owns Chat-specific workspace, routing, and renderer
  behavior
- `src/products/work/*` owns Work placeholder surfaces and future Work-specific
  APIs/UI
- `src/products/code/*` owns Code placeholder surfaces and future
  project/preview/build APIs/UI
- `src/platform/*` owns runtime, persistence, and transport infrastructure

The product is still in a transitional state: top-level compatibility shims
remain at `src/server.ts`, `src/renderer/*`, and `src/workspace/*` so existing
tests and imports do not have to move all at once.

### Configuration Layer

- **Purpose**: Centralize environment parsing and defaults
- **Technology**: TypeScript + `process.env`
- **Responsibilities**: Resolve app port, host, and `cats-runtime` settings

### Presentation Surfaces

- **Purpose**: Expose product behavior through dedicated Chat, Work, and
  external transport experiences
- **Technology**: Shared React/Vite desktop renderer inside Electron; transport
  relays for Telegram and LINE; optional mobile companion later if needed
- **Responsibilities**: Render chat and work views, surface approvals,
  ownership, activity, and allow external transport messages to reach the
  orchestrator safely. For Chat, high-frequency actions such as adding a pal
  should stay in current-chat context, while reusable registry management lives
  under Settings.

### Cats Core v1

- **Purpose**: Provide the shared domain model used by both `Cats Chat` and
  `Cats Work`
- **Technology**: Shared TypeScript contracts plus a co-hosted product API and
  core-backed workspace store today, with room to grow into a stronger service
  boundary later
- **Responsibilities**:
  - identity and actor/resource records
  - conversation and channel records
  - bot bindings for Telegram or LINE entrypoints
  - task, run, approval, and escalation records
  - owner profile and preference memory
  - artifact and archive metadata

### Runtime Client and Runtime Boundary

- **Purpose**: Keep `cats-runtime` as the only execution boundary while
  supporting both product-controlled APIs and orchestrator-controlled tools
- **Technology**: Native `fetch` today; planned MCP facade exposed by
  `cats-runtime`
- **Responsibilities**:
  - direct product API calls for health, session lifecycle, routing, and
    operational control
  - planned MCP tool surface for orchestrator-style agents that need runtime
    capabilities without direct provider coupling
  - keep backend details out of higher layers

### HTTP Server

- **Purpose**: Publish the product API, host shared suite services, and serve
  built static assets
- **Technology**: Native `node:http`
- **Responsibilities**: Serve `/health`, `/api/app-shell`, shared-core product
  routes, Work/Code placeholder routes, runtime-facing routes, and built
  renderer files

### Workspace Store and Future Shared Storage

- **Purpose**: Persist the current workspace shell while preparing for a
  stronger operational store
- **Technology**: Core-backed JSON file inside `config/` today; operational DB
  plus archive/RAG pipelines planned
- **Responsibilities**: Load defaults, persist channels, workspace pals, channel
  assignments, transcript messages, execution targets, execution leases, pal
  memory checkpoints, and the derived `Cats Core v1` records that wrap the
  phase-2 workspace model

### Workspace Runtime Actions

- **Purpose**: Translate workspace-level channel actions into `cats-runtime`
  session calls
- **Technology**: Native `fetch` through the runtime client
- **Responsibilities**: Activate channel sessions, route mention-driven
  messages, and persist runtime outcomes back into local transcripts

### Renderer Shell

- **Purpose**: Present the first operator-facing shell that will later branch
  into dedicated Chat and Work experiences
- **Technology**: React + Vite
- **Responsibilities**: Render channels, runtime status, transcript composer,
  a preview-ready artifact pane, contextual pal assignment, settings-hosted
  pal management, channel setup, and global orchestrator editing

## Memory Layering Direction

`Cats` should treat memory as four product-facing layers above provider
continuity.

- **Provider-native continuity** stays behind `cats-runtime` and exists to help
  resume sessions correctly when a backend requires its own thread/session
  state.
- **Evidence transcript backup** is the canonical Cats-owned record for chats,
  worker traces, transport events, tool activity, and artifacts.
- **Working and durable memory** covers room summaries, sleep/wake checkpoints,
  Cat memory, owner preferences, and other structured cross-session context.
- **Archive/RAG projection** is a downstream retrieval surface for future
  `Cats Work` search and recall.

This means agent-native transcripts are useful, but they are not the only
durable memory of the product. The product should ingest, normalize, and own
its own memory layers even when a backend such as OpenClaw also keeps session
history.

### Workspace Shell Model

- **Purpose**: Describe the current product contract shared by server and
  renderer while a stronger suite-wide contract is designed
- **Technology**: Plain TypeScript data structures
- **Responsibilities**: Expose workspace, pal registry, pal assignment, message,
  session, and capability state

## Pal Identity and Execution

`Cats` now treats teammate identity and runtime execution as separate
concerns.

- `Workspace pal registry` covers reusable teammate identity, default execution
  settings, and long-lived memory
- `Channel pal assignment` covers whether a pal is active in one chat plus any
  channel-specific role or provider override
- `Execution target` covers which provider/model should be used in a given
  channel assignment
- `Execution lease` covers the currently active runtime session and its status
- `Memory checkpoint` covers product-owned summary data that should survive
  session restarts or provider changes

This boundary matters because the same pal may need different providers in
different channels, and cross-session continuity must belong to `cats`
rather than to any one provider's native thread model. See
[ADR-004](./decisions/004-separate-pal-identity-from-provider-execution.md)
and
[ADR-005](./decisions/005-use-workspace-pal-registry-and-channel-assignments.md).

Under the accepted suite direction, this existing pal model is expected to
evolve into the broader `Cats Core v1` actor/resource model rather than being
discarded outright.

## Cats Core v1 Shared Scope

The current accepted planning scope for `Cats Core v1` is intentionally small
and product-facing:

- identity
- actor/resource definitions
- permissions and policy
- conversation and channel records
- bot bindings for transport entrypoints
- task, run, approval, escalation, and takeover state
- owner profile and preference memory
- artifact and archive metadata

`Cats Core v1` is not the place for provider adapters, CLI process ownership,
or a full RAG engine implementation. Those stay behind `cats-runtime` or
adjacent archive services.

## Renderer Routing

The renderer uses `react-router-dom` for path-based client-side routing
([SPEC-010](./specs/SPEC-010-full-site-routing-and-url-driven-navigation.md) /
[PLAN-010](./plans/PLAN-010-full-site-routing-and-url-driven-navigation.md)).
The URL drives navigation — no hidden `useState` surface switches.

Active routes:

- `/` — redirect to `/setup` before initialization, otherwise redirect to `/new`
- `/setup` — setup wizard before initialization, otherwise redirect to `/new`
- `/new` — draft composer for a brand-new chat
- `/chats` — legacy alias that resolves to the last selected chat, or `/new`
- `/chats/:channelId` — individual chat view with deep-link support
- `/settings` — redirect to `/settings/general`
- `/settings/general` — general settings
- `/settings/cats` — cats registry

Persisted `channelId` values are opaque ids rather than title-derived slugs.

Reserved (not yet implemented): `/tools/*`.

`/work/*` and `/code/*` now resolve to dedicated suite placeholder surfaces
rather than inline placeholder JSX. These roots are intentionally minimal, but
they already give future Work and Code development their own renderer entry
points without colliding with Chat implementation files.

Browser back/forward and page refresh preserve the current surface. The server's
SPA fallback (`tryServeWebAsset`) serves `index.html` for extensionless paths,
enabling deep links in built mode.

## Current Compatibility Seams

The suite-host refactor is intentionally incremental. These seams are still
temporary and should not be treated as final ownership boundaries:

- `src/server.ts` is a shim that re-exports the real app-level assembler from
  `src/app/server/index.ts`
- `src/renderer/App.tsx` and `src/renderer/main.tsx` are shims that re-export
  the real suite renderer entry from `src/app/renderer/*`
- `src/workspace/*` is still a compatibility shim over
  `src/products/chat/workspace/*`
- `src/shared/app-shell.ts` is now a compatibility shim that re-exports
  `src/shared/suite-contract.ts` and `src/products/chat/api/contracts.ts`
- `src/products/chat/api/*` now owns Chat setup, legacy compatibility, and
  canonical/public Chat HTTP contracts, while `src/app/server/index.ts` stays
  assembly-only

## Current Chat Navigation Direction

The current planning direction for Chat information architecture is:

- keep `Add pal` as a current-chat action
- move the reusable pal registry under `Settings > Pals`
- use the left-panel account area as the entry to Settings

This keeps workspace resources global without making registry administration the
primary operator workflow. See
[ADR-009](./decisions/009-prefer-chat-contextual-pal-entry-and-settings-registry.md).

## Data Flow

1. In development, Vite serves the renderer and proxies `/api` to the Node
   server.
2. The product server asks the runtime client for current `cats-runtime`
   health.
3. The product server merges runtime health with persisted workspace or
   shared-core state.
4. `Cats Chat`, `Cats Work`, or a transport relay requests product actions
   through the same product server boundary.
5. If work needs execution, the product server can call `cats-runtime`
   directly, or an orchestrator can use the planned MCP facade for runtime
   tools.
6. The product server persists operational transcript, approval, actor, and
   artifact state to product-owned storage.
7. Archived data later flows into archive/RAG pipelines without replacing the
   operational DB or approval state.
8. In built mode, the server also serves the static renderer bundle.

## Planned Desktop Topology

The future desktop shape is now decided even though it is not implemented yet:

```text
Electron main
  ├─ tray + window lifecycle
  ├─ starts cats-runtime
  ├─ starts cats
  ├─ manages local onboarding and settings
  └─ loads Chat and Work windows from cats

BrowserWindow renderer
  └─ React/Vite Chat and Work UIs

cats
  ├─ product HTTP boundary over cats-runtime
  └─ co-hosted Cats Core v1 APIs or modules

cats-runtime
  ├─ direct runtime APIs
  └─ MCP facade for orchestrator tool use
```

This keeps subprocess-backed runtime work out of the renderer and preserves the
existing `cats -> cats-runtime` boundary for desktop packaging. See
[ADR-003](./decisions/003-electron-host-manages-local-services.md),
[ADR-007](./decisions/007-establish-cats-core-v1-for-chat-and-work.md), and
[ADR-008](./decisions/008-expose-cats-runtime-via-direct-api-and-mcp-facade.md).

## Current Implementation vs Planned Evolution

- Current implementation is still a phase-2 chat shell with file-backed state,
  global orchestrator settings, pal assignments, mention routing, and transcript
  export.
- `Cats Core v1` now exists as a first in-tree contract and read-only API
  surface derived from the current workspace model.
- `Cats Work` is a planned sibling surface, not a shipped UI in the current
  codebase.
- The current execution path keeps full Chat and Work desktop surfaces on the
  same React/TypeScript renderer stack under Electron.
- The current server now exposes a Telegram transport seam with dedicated
  status/webhook routes, durable dedupe state, and placeholder
  inbox-to-conversation mapping owned outside the chat transcript model.
- Flutter and Tauri are not part of the active implementation route.
- Paperclip-derived control-plane documents remain exploratory and are not the
  active implementation plan.

## Current Gaps

The main `agent-workspace-poc` parity gaps are now closed, but these areas are
still intentionally deferred:

- live streaming or push-based renderer updates
- split-view workspace panes beyond the current chat-first layout
- richer orchestrator automation than explicit runtime activation plus basic
  `@mention` routing
- shared-core write APIs, approval models, and stronger storage boundaries
- full Telegram/LINE outbound delivery, room-routing policy, escalation, and
  takeover behavior above the current relay seam
- desktop host lifecycle management and tray-driven UX implementation
- `Cats Work` product surfaces above the shared core
- any limited mobile companion scope, which is intentionally secondary to the
  desktop suite

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Renderer | React + Vite | Current Chat shell and future Chat/Work product UIs |
| Product app | Node.js + TypeScript | Product-facing backend shell and shared suite services |
| Shared contracts | TypeScript modules today | `Cats Core v1` actors, channels, approvals, owner profile, archive metadata |
| Runtime boundary | `cats-runtime` | Direct runtime APIs plus planned MCP facade |
| Testing | `node:test` | Lightweight smoke and integration tests |

## Design Patterns

- Hexagonal boundary at the runtime edge: `cats` depends on a runtime client
  interface, not `agent-fleet`
- Shared domain contracts before product-surface specialization
- Direct product APIs plus MCP tool access for orchestrators
- Dependency injection by constructor or factory parameter
- Explicit shell payloads over hidden process state
- Product-owned memory over provider-owned session continuity
- Operational DB plus archive/RAG split rather than using vector memory for
  every live workflow

## API Design

- See [api.md](./api.md)

## Key Decisions

- [ADR-001](./decisions/001-use-cats-runtime-boundary.md): use `cats-runtime`
  as the only runtime boundary
- [ADR-002](./decisions/002-react-vite-renderer-before-electron.md): use
  React/Vite before adding a desktop shell
- [ADR-004](./decisions/004-separate-pal-identity-from-provider-execution.md):
  keep pal identity separate from provider execution and memory leases
- [ADR-005](./decisions/005-use-workspace-pal-registry-and-channel-assignments.md):
  keep reusable pals at workspace scope and channel-specific overrides in assignments
- [ADR-007](./decisions/007-establish-cats-core-v1-for-chat-and-work.md):
  introduce `Cats Core v1` as the shared contract layer for `Cats Chat` and
  `Cats Work`
- [ADR-008](./decisions/008-expose-cats-runtime-via-direct-api-and-mcp-facade.md):
  keep direct product APIs while adding an MCP facade for orchestrators

---

*Last updated: 2026-03-21*

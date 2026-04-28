# System Architecture

> Technical architecture and design decisions for `Cats`.

## Overview

`Cats` remains the product-facing brand, while this repo targets the technical
host identity `cats-platform` and now uses the matching local monorepo folder
`cats-platform/`. The current implementation is still a split architecture: a
Node server owns product and runtime-facing APIs, and a React/Vite renderer
owns the operator-facing shell. The accepted next step is no longer "more chat
modes." It is a unified interaction core plus a structured materialization
layer so `Cats Chat`, `Cats Work`, and `Cats Code` can all project from the
same engine and provenance model.

## Unified Interaction and Materialization Direction

The current architectural north star is:

- one interaction core:
  - `Container`
  - `Conversation`
  - `Turn`
  - `Lane`
  - `Segment`
  - `Session`
- one materialization seam:
  - `mutation`
  - `artifact`
  - `reference`
  - `execution_result`
  - `governance_event`
- many product projections:
  - `Cats Chat`
  - `Cats Work`
  - `Cats Code`

This means:

- `+New chat`, `+Group chat`, `+Parallel chat`, and direct lanes are presets or
  compositions above one engine
- `concurrent` remains one-turn multi-lane fan-out inside one conversation,
  while `parallel` remains container composition across many child
  conversations
- `Chat`, `Work`, and `Code` do not get separate conversation lifecycles
- transcript bubbles are projections over canonical turn/lane state
- structured product state is materialized beside the transcript, not scraped
  back out of it later

Entry materialization is intentionally product-specific:

- `Cats Chat +New chat` is conversation-first. It creates the Interaction Core
  records needed for the chat and does not force a `Task`, `Run`, `Project`, or
  `WorkItem` at entry time. If the draft is submitted with a Code or Work
  `targetSurface`, it activates directly into that target product rather than
  creating a Chat-owned conversation first.
- `Cats Code +New code` is task-first conversation. It creates one primary
  coding `Conversation` and one primary Code-owned `Task`, but does not force
  `Project` / `WorkItem` planning anchors.
- `Cats Work +New work` is managed-work-first conversation. It creates one
  primary `Conversation`, `Project`, `WorkItem`, and `Task` linked through
  `WorkItem.taskId` so the Work Graph has Interaction, Planning, and Execution
  anchors from the start.
- `Run` is lazy for all three surfaces: it is created when the execution
  dispatcher / runtime bridge admits a concrete execution attempt, not merely
  because an entry was created. For Code this can happen during the first-send
  submit flow when an agent is auto-dispatched.

Task projection is shared across products. Work Graph surfaces render every
Core `Task` they know about and label task rows with a product binding:
`work`, `code`, `chat`, or `unbound`. `work` is derived only from a
`WorkItem.taskId` bridge; Work-flavored metadata without that bridge is an
incomplete Work claim, not managed Work. Code and Chat tasks do not receive
fake Project / WorkItem anchors just to make the Work UI tidy. When they have
no project lineage, Work groups them under `No project` and may sub-group by
product binding (`code`, `chat`, `unbound`). A real inbox-style project is
reserved for actual Work creation, not as a silent fallback for orphan Code /
Chat tasks.

Terminology rule:

- shared technical contracts should say `Conversation`, not `thread`
- product copy and UI may still say `thread` when that reads more naturally
- names such as `chat_thread`, `code_thread`, and `work_thread` remain
  `Conversation` kinds, not alternate durable record families

## Managed Work, Missions, Runs, and Transport Bindings

The unified interaction engine is not enough by itself. The platform also needs
one shared vocabulary for agent work, background automation, and external
entrypoints.

The current architectural direction therefore freezes these adjacent but
separate concepts:

- `Managed Work`
  - operator-visible durable planning state such as goals, projects,
    requirements, issues, backlog items, and tasks
  - canonically owned by `Cats Work`
- `Mission`
  - an agent-delegated unit of work that bridges user intent or managed work
    into execution
  - may exist even when no new Work task should be created
- `Run`
  - one execution attempt for a mission, tool invocation, review loop, or
    background analysis pass
- `Schedule / Trigger`
  - the policy or event that launches a mission or run
  - not a task by itself
- `Transport Binding`
  - the product-owned relation between an external thread/account and a
    canonical Cats entry path
  - distinct from bot binding, conversation identity, and runtime session

This split matters because:

- not every agent action deserves a durable Work task
- one Work task may spawn many missions and many runs
- companion and future agent automation should often stay below Work until an
  operator-visible outcome exists
- Telegram or future transports must keep thread identity stable even while
  conversations and runtime sessions change underneath

The practical ownership split is:

- `Chat`
  - interaction engine and transcript projections
- `Work`
  - canonical managed-work records and planning hierarchy
- `Code`
  - implementation artifacts, execution profiles, previews, reviews, and other
    code-adjacent resources
- shared platform/core layers
  - mission, run, schedule, provenance, and transport-binding seams

## Conversational and Operational Agent Projections

The platform also freezes a separate projection split for agent identity.

One shared `Agent` core may project into:

- `Conversational Agent`
  - chat-first
  - appears in `Cats Chat`, `My Cats`, direct lanes, companion surfaces, and
    transport-facing persona entrypoints
- `Operational Agent`
  - work-first
  - appears in `Cats Work` as a managed worker with assignments, missions,
    runs, schedules, approvals, and outcomes
- `Hybrid Agent`
  - one shared identity that can appear in both projections when the current
    product surface makes the posture explicit

This matters because OpenClaw-style long-lived workers are not the same thing
as every chat-visible Cat.

The current direction is therefore:

- `My Cats`
  - a chat projection and quick-access roster for conversational agents plus
    selected hybrid agents
  - not the universal registry or control plane for every worker agent
- `Cats Work`
  - the primary control plane for operational agents
  - the place where users manage assignments, missions, schedules, approvals,
    and follow-up
- `Cats Code`
  - the execution home for code-oriented missions, runs, artifacts, previews,
    and review loops
- platform/core layers
  - the canonical agent/entity registry beneath all projections

The same canonical agent may therefore be visible in Chat, manageable in Work,
and execution-capable in Code without forking identity.

## MY CATS as a Platform Home

`MY CATS` should now be treated as one platform-level navigation surface and
one stable agent-home concept.

It should not split into top-level product names such as:

- `Chat Cats`
- `Work Cats`
- `Code Cats`

Instead, `MY CATS` should expose lens-based projections over the same shared
agent registry:

- `Overview`
- `Chat`
- `Work`
- `Code`

This means:

- `MY CATS` remains the canonical home for inspecting an agent across the
  platform
- product-local Chat/Work/Code panels should be contextual subsets rather than
  alternate agent homes
- `MY CATS > Chat` may still preserve direct-lane and companion-first behavior
- `MY CATS > Work` may emphasize assignments, workload, schedules, and
  approvals
- `MY CATS > Code` may emphasize repo/worktree/run/review state

The same underlying identity should remain stable across all of these views.

## Concurrent, Parallel, and Code Presets

The platform now freezes these meanings:

- `concurrent`
  - one `Conversation`
  - one `Turn`
  - many active `Lane`s
- `parallel`
  - one `Container`
  - many child `Conversation`s

This distinction also drives the first `Cats Code` entry presets:

- `+New code`
  - one primary coding conversation
  - one primary Code-owned task
  - no required Project / WorkItem / Run at creation time; first send may
    immediately dispatch and emit the first Run
- `+Team code`
  - one shared multi-participant coding conversation
- `+Peer code`
  - one parallel branch/review container with child conversations

The product may still expose friendly entry labels, but those labels are
presets above one shared engine rather than separate workflow engines.

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
│                cats-platform product server                │
│  product APIs + platform orchestration + shared app services  │
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
server and explicit Cat-owned bot bindings rather than talking directly to
individual workers.
```

## Components

## Current Platform-Host Code Layout

The current first-slice code layout now follows the platform-host split accepted
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
- `src/app/renderer/*` owns top-level platform routing
- `src/core/*` owns shared Cats Core contracts and persistence seams
- `src/products/chat/*` owns Chat-specific state, routing, and renderer
  behavior
- `src/products/work/*` owns Work dashboard, inbox, task-detail, and future
  Work-specific APIs/UI
- `src/products/code/*` owns Code dashboards plus later
  project/preview/build APIs/UI
- `src/platform/*` owns runtime, orchestration contracts, persistence, and
  transport infrastructure

The product is still in a transitional state, but the temporary top-level
compatibility shims have now been removed. Host bootstrap resolves from
`src/app/server/index.ts`, renderer bootstrap resolves from `src/app/renderer/*`,
and shared contracts resolve from their owned modules directly.

Packaging and repo naming now follow this split:

- `Cats`: flagship product brand
- `cats-platform`: host repo/package target
- `cats-runtime`: runtime boundary
- `cats-can`: one-shot bootstrap installer target
- `cats`: persistent installed executable name for the host package

### Packaged Setup Boundary

The packaged setup path now has an explicit host-owned boundary:

- the Electron desktop host owns helper discovery, execution, persisted setup
  state, resume actions, and interruption recovery
- repo-owned packaged setup helpers live under `cats-platform/scripts/windows/*`
  and stage into `build/desktop-packaging/shared/setup-assets/windows/*`
- the staged installer contract now carries both
  `installer.providerSetup.helperCatalog` and
  `installer.providerSetup.localProviders`
- the current first packaged local-provider rollout is bounded to Claude Code,
  Cursor Agent, Goose, Junie, the WSL-backed Kiro helper, and Ollama
- the current packaged local-model prerequisite slice now includes a repo-owned
  Docker Desktop installer, engine warm-state recovery, and a repo-owned
  Ollama runtime helper
- broader expert-only local-model helpers and future capability packs remain
  outside the current packaged baseline instead of being treated as silently
  missing baseline work
- `environment-bootstrap` and `project-bootstrap` remain source knowledge only,
  not shipped runtime dependencies for packaged setup

### Configuration Layer

- **Purpose**: Centralize environment parsing and defaults
- **Technology**: TypeScript + `process.env`
- **Responsibilities**: Resolve app port, host, and `cats-runtime` settings

Telegram transport also supports a small transport-owned env surface that stays
below product orchestration policy:

- `CATS_TELEGRAM_WEBHOOK_SECRET`
- `CATS_TELEGRAM_WEBHOOK_MAX_BYTES`
- `CATS_TELEGRAM_BOT_TOKEN`

### Presentation Surfaces

- **Purpose**: Expose product behavior through dedicated Chat, Work, and
  external transport experiences
- **Technology**: Shared React/Vite desktop renderer inside Electron; transport
  relays for Telegram and LINE; optional mobile companion later if needed
- **Responsibilities**: Render chat and work views, surface approvals,
  ownership, activity, and allow external transport messages to reach the
  orchestrator safely. For Chat, high-frequency actions such as adding a cat
  should stay in current-chat context, `Recents` should remain the primary
  chat-thread sidebar surface, `MY CATS` should remain the platform-level
  agent home, Chat may expose a contextual subset for quick private-room
  entry, and reusable registry management lives under Settings.

### Telegram Transport Layer

- **Purpose**: Keep Telegram as a transport-owned Cat inbox seam, with
  `Boss Cat` as the default public identity, without leaking routing or reply
  policy into HTTP assembly
- **Technology**: `src/platform/transports/telegram/*`, a durable relay
  sidecar store, a transport-to-room bridge, and an optional Telegram Bot API
  delivery client
- **Responsibilities**:
  - harden webhook ingress with JSON checks, optional secret-token validation,
    and bounded body size
  - durably dedupe update ids and retain chat-to-conversation bindings outside
    the main transcript model
  - persist one transport binding per Telegram thread so external thread
    identity remains distinct from bot binding, room identity, and runtime
    session identity
  - normalize inbound message/media summaries for transport receipts and later
    system-layer consumers
  - link each Telegram inbox to one current canonical `Cats Chat` room while
    keeping the transport binding, dedupe window, and linked-room pointer in
    transport-owned state instead of general renderer state
  - route accepted Telegram messages through the existing chat/runtime flow and
    relay concise replies back to Telegram
  - expose transport-level status and diagnostics, including dedupe counters,
    bindings, and last ingress/delivery receipts
  - provide outbound `send` / `reply` / `edit` / `delete` delivery seams

The current server wiring stays intentionally thin: `src/app/server/index.ts`
only instantiates the relay, sidecar store, bridge dependencies, and optional
Bot API client. `src/server/routes/telegram.ts` owns the HTTP adapter, while
transport state stays in `src/platform/transports/telegram/*`.

### Cats Core v1

- **Purpose**: Provide the shared domain model used by both `Cats Chat` and
  `Cats Work`
- **Technology**: Shared TypeScript contracts plus a co-hosted product API and
  core-backed chat store today, with room to grow into a stronger service
  boundary later
- **Responsibilities**:
  - identity and actor/resource records
  - conversation and channel records
  - project and work-item records
  - bot bindings for Telegram or LINE entrypoints
  - task, run, approval-binding, and escalation records
  - core-owned recovery read models for approval-blocked dispatch,
    orchestrator replay, and workflow-continuation replay inspection
  - owner profile and preference memory
  - artifact, activity, and archive metadata

The chat product now also treats channel topology as a first-class concept:
`channelKind` (`boss_thread`, `direct_lane`, `multi_cat_room`) captures room
identity separately from `roomRouting.mode`, which remains the routing-policy
compatibility seam. Runtime wake/stream flows and renderer direct-lane chrome
therefore resolve from topology first rather than assuming every room has Boss
Cat/orchestrator infrastructure.

### Guide Cat and Participant Generalization

The platform now has an explicit architectural direction for two adjacent but
separate concepts:

- `Guide Cat`: the optional first helper created during setup
- reusable `assistant presets`: lightweight saved execution presets owned by
  `Settings > CATS > Assistants`
- generalized `entity` / `participant` modeling for future conversation work

`Guide Cat` is intentionally not the same thing as:

- the Chat `Boss Cat`
- the invisible orchestration system layer
- the only runtime-backed helper that may ever exist

The long-term domain shape is:

- reusable `entity` records with identity, prompt, memory, and execution
  defaults
- channel-scoped `participant` records with role, status, and lease state
- conversation topology such as direct, solo-thread, Cat-led thread, and group
- per-turn execution strategy such as default routing, explicit mention,
  compare, or future fan-out

Current Chat contracts still expose Cat-specific fields such as
`catAssignments`, `assignedCats`, `draftCatIds`, and `leadCatId`, but those are
now a compatibility seam rather than the intended final shared model.

Current platform settings behavior follows the same split:

- `Guide Cat` remains a platform-level helper record
- `Saved Assistants` are reusable lightweight presets with name, target, and
  optional role hint
- channel-only temporary participants stay inside the room and are not persisted
  into the global settings registry

The renderer and design layer now also carry a first settings-composition slice
under `src/design/components/settings/`:

- Settings-scoped tokens live beside the primitive composition layer rather
  than as scattered page-local CSS values
- shared primitives such as section, header, option row, action bar, status
  chip, and danger-zone now live in `src/design/` instead of app-local files
- migration remains incremental, page by page, so existing settings routes can
  adopt the shared contract without a flag-day rewrite of every page

`Guide Cat` is now also framed as an optional surface-assist capability.
Sidecar help, setup assistance, lobby suggestions, and composer prompt chips
should all be treated as projections of that capability rather than as
separate one-off widgets or special chat modes.

### Optional Capability Layers

The current architecture distinguishes optional capability layers from the core
interaction engine:

- `Boss Cat`
  - conversation-scoped coordinator capability
  - may be visible or hidden
  - may influence routing, scheduling, and privileged orchestration
- `Guide Cat`
  - surface-scoped assist capability
  - may be visible or hidden
  - may influence greetings, suggestions, helper copy, and explicit handoff
    affordances

Both are optional layers. Neither changes lane identity, session identity, or
canonical transcript projection rules by itself.

Guide Cat, Companion, and future background helpers should therefore be treated
as agent-powered capabilities that emit missions and runs. They are not
separate conversation engines and they do not become Work by default just
because they did something useful.

### Runtime Client and Runtime Boundary

- **Purpose**: Keep `cats-runtime` as the only execution boundary while
  supporting both product-controlled APIs and orchestrator-controlled tools
- **Technology**: Native `fetch` today; planned MCP facade exposed by
  `cats-runtime`, plus contract-first orchestration helpers in
  `src/platform/orchestration/*`
- **Responsibilities**:
  - direct product API calls for health, session lifecycle, routing, and
    operational control
  - product-owned plan/dispatch/execution-loop contracts for orchestrator
    consumers inside `cats`
  - checkpoint-driven execution-plan read models that project room workflow,
    approval state, and recovery actions without moving policy into runtime
  - MCP tool surface for orchestrator-style agents that need runtime
    capabilities without direct provider coupling
  - keep backend details out of higher layers

Guide Cat should also use this runtime boundary through an event-driven leased
session lifecycle:

- no always-on Guide Cat daemon is required
- the platform may wake Guide Cat on demand for entry suggestions or scoped help
- the platform may reuse a warm Guide Cat session briefly
- Guide Cat output such as starter ideas should be cacheable local product data
  so empty states do not depend on a live session

That cacheable product data should follow the structured platform-storage model
rather than ad hoc renderer constants. The current direction is:

- `~/.cats/platform/config/guide-cat-assist-config.json`
  - user- or product-owned Guide Cat assist policy and optional overrides
- `~/.cats/platform/state/guide-cat-assist-cache.local.json`
  - last-good assist bundles, freshness metadata, provenance, and refresh
    failures

Surfaces should read last-good bundles immediately and refresh them lazily
after app/runtime readiness or on surface-open when stale. Future recurring
refresh may use runtime wakeups, but the base product must not require a
cron-style helper daemon just to render greetings, chips, recap, or feature
guidance.

### Runtime Delivery Normalization

The platform now assumes heterogeneous runtime delivery capabilities.

Some runtime adapters can stream rich blocks, tool events, and status steps.
Others can stream plain text only. Others can produce only a final result.

The product must therefore normalize all runtime delivery into product-owned
events before transcript, repair, or materialization code consumes it.

That normalized contract preserves:

- `conversationId`
- `turnId`
- `laneId`
- `sessionId`
- lane-local segment correlation

but it does not require product `Segment` to equal a provider-native block or
chunk.

This keeps Chat/Work/Code projections stable even when different runtime
backends have different streaming richness.

### HTTP Server

- **Purpose**: Publish the product API, host shared platform services, and serve
  built static assets
- **Technology**: Native `node:http`
- **Responsibilities**: Serve `/health`, `/api/app-shell`, shared-core product
  routes, Work dashboard routes, Code dashboard routes, runtime-facing
  routes, and built renderer files

### Electron Host and Packaging Substrate

- **Purpose**: Own desktop-only lifecycle concerns without pushing shell or
  installer logic into the renderer
- **Technology**: `desktop/host/*` plus host-owned packaging scripts under
  `scripts/*`
- **Responsibilities**:
  - supervise local `cats-runtime` + `cats` sidecars
  - keep the bootstrap renderer sandboxed behind a narrow preload bridge
  - persist a host-readable bootstrap/remediation snapshot to desktop user data
  - keep a tray/background lifecycle for packaged runs
  - stage deterministic Windows/macOS/Linux packaging outputs under
    `build/desktop-packaging`
  - produce a Windows NSIS installer by bundling the Electron host plus staged
    app/runtime sidecars and by failing packaging when the runtime sidecar is
    missing
  - define the first installer/update contract without requiring a visible UI
    redesign

### Chat Store and Future Shared Storage

- **Purpose**: Persist the current chat shell while preparing for a
  stronger operational store
- **Technology**: Core-backed JSON file inside `config/` today; operational DB
  plus archive/RAG pipelines planned
- **Responsibilities**: Load defaults, persist channels, chat-global cats, channel
  assignments, transcript messages, execution targets, execution leases, cat
  memory checkpoints, room-workflow turn/event state, core-owned
  actor/conversation/project/work-item/task/run/trace/checkpoint/outcome/
  artifact/activity/approval-binding records, and the derived `Cats Core v1`
  records that wrap the phase-2 chat model

### Companion Box Sidecar

- **Purpose**: Keep per-Cat companion materials, response profiles, and
  direct-session hydration context product-owned without extending shared core
  or moving Cat-local storage into `cats-runtime`
- **Technology**: `src/products/chat/companion/*` plus
  `src/products/chat/state/companion-box/index.ts`
- **Responsibilities**:
  - persist one product-owned `CompanionBox` per Cat
  - retain raw source records, derived records, and curated companion memory
  - preserve storage-mode provenance (`uploaded_copy`, `imported_copy`,
    `linked_path`)
  - materialize copied/imported source payloads into a per-Cat sidecar storage
    layout
  - expose Cat-scoped ingest/read APIs and a normalized
    `CompanionSessionContext` seam for direct sessions
  - keep background ingest, extraction, and memory-refresh activity modeled as
    missions and runs by default, promoting only operator-visible outcomes into
    managed Work when needed

### Cats Memory Substrate

- **Purpose**: Own canonical durable memory extraction, retrieval assembly, and
  explicit flush seams inside `cats`
- **Technology**: `src/platform/memory/*` plus a file-backed sidecar derived
  from the chat-state path
- **Responsibilities**:
  - normalize canonical Cats-owned memory records for cat, owner, and channel
    scopes
  - promote only stable or curated companion signals into canonical durable
    memory, while leaving low-signal summaries/transcripts/captions as live or
    supporting evidence
  - preserve source lineage, replacement groups, and visibility metadata so
    source update/delete flows can converge stale retrieval cleanly
  - assemble retrieval context for direct companion sessions and route-level
    retrieval previews, including policy/exclusion annotations for
    owner-private vs shared-room vs transport-facing contexts
  - expose pre-reset / pre-compaction flush seams without treating runtime
    sandboxes as long-lived truth
  - expose machine-readable flush payloads that Team 5 runtime maintenance
    hooks can consume without re-implementing Cats memory rules
  - keep embedding/vector backends additive rather than a hard dependency

### Chat Runtime Actions

- **Purpose**: Translate chat-level channel actions into `cats-runtime`
  session calls
- **Technology**: Native `fetch` through the runtime client
- **Responsibilities**: Activate channel sessions, route mention-driven
  messages, run the continuation/fan-out/guard loop, maintain
  provider-agnostic room-workflow turn/event state, and persist runtime
  outcomes back into local transcripts

Direct companion sessions now attach additive product-owned hydration metadata
before runtime session create/send calls. The runtime receives a normalized
`companionSession` payload that includes:

- requested skill ids
- selected source, derived, and memory ids
- response profile
- owner notes and current lane constraints

This keeps the session informed by the Cat's box while preserving the
product/runtime boundary.

### Renderer Shell

- **Purpose**: Present the first operator-facing shell that will later branch
  into dedicated Chat and Work experiences
- **Technology**: React + Vite
- **Responsibilities**: Render channels, runtime status, transcript composer,
  a preview-ready artifact pane, contextual cat assignment, settings-hosted
  cat management, topic-first recents with Cat avatar markers, lightweight
  direct-chat entry for `My Cats`, channel setup, and global Boss Cat editing.
  `My Cats` opens Cat-scoped in-place direct lanes and does not materialize
  normal `Recents` threads as a side effect.

For Chat, event-driven app-shell refresh and direct-lane companion UI are now
treated as separate renderer responsibilities:

- chat-wide `/api/events/chat` refresh owns transcript/app-shell catch-up for
  solo, direct, and group rooms
- background runtime dispatch persistence must also publish `/api/events/chat`
  room updates for intermediate `session_started` / `assistant_turn_segment` states,
  not only the initial user-send acknowledgement
- direct-lane companion mode only owns `My Cats` companion UI state plus
  wake/sleep actions for `direct_lane` channels

Group chat and sequential-room rendering must not depend on the companion hook.

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

The first product-owned implementation slice now exists in `src/platform/memory/*`.
It keeps a local canonical-memory sidecar and a lexical/hybrid retrieval seam
inside `cats` so companion continuity does not depend on an external RAG
service.

### Chat Shell Model

- **Purpose**: Describe the current product contract shared by server and
  renderer while a stronger platform-wide contract is designed
- **Technology**: Plain TypeScript data structures
- **Responsibilities**: Expose chat state, cat registry, cat assignment, message,
  session, capability, room-routing resolution, and wake-request state

## Cat Identity and Execution

`Cats` now treats Cat identity/persona and runtime execution as separate
concerns.

- `Global cat registry` covers reusable Cat identity, default execution
  settings, and long-lived memory
- `Channel cat assignment` covers whether a cat is active in one chat plus any
  channel-specific role or provider override
- `Execution target` covers which provider/model should be used in a given
  channel assignment
- `Execution lease` covers the currently active runtime session and its status
- `Memory checkpoint` covers product-owned summary data that should survive
  session restarts or provider changes

This boundary matters because the same cat may need different providers in
different channels, and cross-session continuity must belong to `cats`
rather than to any one provider's native thread model. See
[ADR-004](./decisions/004-separate-cat-identity-from-provider-execution.md)
and
[ADR-005](./decisions/005-use-chat-cat-registry-and-channel-assignments.md).

Under the accepted platform direction, this existing cat model is expected to
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

- `/` — redirect to `/setup` before initialization, otherwise resolve to the
  last-used product when known or `/lobby` when no product has been launched yet
- `/setup` — setup wizard before initialization, otherwise redirect to `/`
- `/lobby` — platform-owned first landing route after setup
- `/new` — draft composer for a brand-new chat inside product-owned routes
- `/chats` — legacy alias that resolves to the last selected chat, or `/chat/new`
- `/chats/:channelId` — individual chat view with deep-link support
- `/settings` — redirect to `/settings/general`
- `/settings/general` — general settings
- `/settings/cats` — cats registry

Persisted `channelId` values are opaque ids rather than title-derived slugs.

Reserved (not yet implemented): `/tools/*`.

`/work/*` now resolves to a first Work dashboard route above shared-core task
reads, while `/code/*` still resolves to a dedicated placeholder surface.
These roots keep product ownership separate from Chat implementation files even
before the fuller Work/Code slices land.

Browser back/forward and page refresh preserve the current surface. The server's
SPA fallback (`tryServeWebAsset`) serves `index.html` for extensionless paths,
enabling deep links in built mode.

## Current Compatibility Seams

The platform-host refactor is intentionally incremental. These seams are still
temporary and should not be treated as final ownership boundaries:

- `src/products/chat/api/*` still owns Chat setup, legacy compatibility, and
  canonical/public Chat HTTP contracts
- `src/app/server/index.ts` stays assembly-only for host startup and route
  composition
- product and platform contracts are still mid-migration toward cleaner
  platform-owned read models and narrower product adapters

## Current Chat Navigation Direction

The current planning direction for Chat information architecture is:

- keep `Add cat` as a current-chat action
- move the reusable cat registry under `Settings > Cats`
- use the left-panel account area as the entry to Settings

This keeps chat-global resources reusable without making registry administration the
primary operator workflow. See
[ADR-009](./decisions/009-prefer-chat-contextual-cat-entry-and-settings-registry.md).

## Data Flow

1. In development, Vite serves the renderer and proxies `/api` to the Node
   server.
2. The product server asks the runtime client for current `cats-runtime`
   health.
3. The product server merges runtime health with persisted chat or
   shared-core state.
4. `Cats Chat`, `Cats Work`, or a transport relay requests product actions
   through the same product server boundary.
5. If work needs execution, the product server can call `cats-runtime`
   directly, or an orchestrator can use the runtime MCP facade for runtime
   tools.
6. Runtime-native events are normalized into product delivery events before
   transcript, artifact, or materialization projections consume them.
7. Transport relays persist transport-only dedupe, binding, and delivery
   diagnostics in sidecar state rather than hiding them inside room
   transcripts.
8. The product server persists operational transcript, approval, actor, and
   artifact state to product-owned storage.
9. Turns and lanes may also emit structured outputs that materialize into
   shared product records for Chat, Work, and Code.
10. The product server can flush companion, owner, and channel context into a
    Cats-owned canonical-memory projection and assemble retrieval context for
    direct companion sessions.
11. Archived data later flows into archive/RAG pipelines without replacing the
    operational DB, canonical memory, or approval state.
12. In built mode, the server also serves the static renderer bundle.

## Desktop Host Topology

The future desktop shape is now decided even though it is not implemented yet:

```text
Electron main
  ├─ tray + window lifecycle
  ├─ starts cats-runtime
  ├─ starts cats
  ├─ persists host-readable bootstrap/update state
  ├─ stages packaging/update manifests
  ├─ manages local onboarding and remediation handoff
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
existing `cats -> cats-runtime` boundary for desktop packaging. The current
implementation now includes the first tray/background lifecycle, structured
bootstrap snapshot, manual-check update skeleton, staged packaging-output
plan, and a Windows NSIS installer path, while signed installers for release
distribution and privileged provider-install execution remain follow-on work.
See
[ADR-003](./decisions/003-electron-host-manages-local-services.md),
[ADR-007](./decisions/007-establish-cats-core-v1-for-chat-and-work.md), and
[ADR-008](./decisions/008-expose-cats-runtime-via-direct-api-and-mcp-facade.md).

## Current Implementation vs Planned Evolution

- Current implementation is still a phase-2 chat shell with file-backed state,
  global orchestrator settings, cat assignments, a system-layer routing engine
  with continuation loop/fan-out/guards, a separate room-workflow read model,
  explicit route-resolution metadata, wake-request history, and transcript
  export.
- `src/products/chat/state/companion-box/index.ts` now adds a separate
  product-owned sidecar store for per-Cat companion boxes, derived companion
  knowledge, response profiles, and direct-session hydration context.
- `src/platform/memory/*` now adds a Cats-owned canonical-memory and retrieval
  substrate that flushes companion, owner, channel, project, and relationship
  context into local durable records and hydrates direct companion sessions or
  future core-owned consumers with retrieval context.
- `src/core/api/recordMemoryRoutes.ts` now exposes non-UI project and
  relationship durable-memory routes above that same substrate, so later Work
  or orchestration flows can manage scoped memory without depending on
  Chat-owned endpoints.
- `cats` now also exposes a small runtime-bridge layer for two cross-team seams:
  runtime session observe payloads can be proxied through product APIs, and
  runtime `memory_flush` maintenance hooks can trigger Cats-owned
  channel/companion flushes before reset or compaction.
- `src/platform/orchestration/*` now promotes the existing room-routing engine
  into a product-owned execution contract:
  - pre-dispatch plans expose initial dispatch, checkpoint-driven handoff, and
    outcome-report stages
  - post-dispatch snapshots expose executed target steps, continuation/fan-out
    milestones, approval actions, and retry/acknowledge recovery actions
  - pending owner approval now pauses `/api/orchestrator/dispatch` instead of
    silently bypassing the approval seam
- the orchestrator contract also freezes the Team 6 runtime MCP tool plane
  through product-owned metadata that points callers at `/api/runtime/mcp`
  rather than inventing a second runtime control surface
- `Cats Core v1` now exists as a first in-tree contract plus a minimal neutral
  write substrate for owner profile, actors, conversations, projects,
  work items, tasks, approvals, approval bindings, runs, traces, checkpoints,
  orchestration outcomes, artifacts, and activities.
- `src/products/chat/state/core-projection/index.ts` now makes the boundary explicit:
  chat-derived actors/conversations/tasks/archives are projections, while
  core-owned records survive chat sync and file-backed reload.
- Chat room-workflow turns, system events, checkpoints, and outcomes now
  project into core-backed run/trace/checkpoint/outcome records when chat
  state is persisted.
- Those projected task/run/checkpoint/outcome metadata records now carry
  machine-readable `governanceSummary`, `workflowSummary`, and
  `runtimeDeliveryManifest` skeletons so operator loops and future control-plane
  automation can consume approval/delivery/budget/workflow state without
  scraping transcript text.
- `Cats Work` now ships a first shared-core dashboard plus
  project/work-item/task detail surfaces above the same shared-core records,
  while broader team-operating-model surfaces still remain future work.
- `Cats Code` now ships a shared-core workspace above code-targeted tasks plus
  build/preview artifact output, including task detail, output detail, and
  dedicated code-task / code-artifact read models, while richer project and
  live builder-loop workspaces still remain future work.
- The current execution path keeps full Chat and Work desktop surfaces on the
  same React/TypeScript renderer stack under Electron.
- The current server now exposes a Telegram transport seam with dedicated
  status/webhook routes, durable dedupe state, and placeholder
  inbox-to-conversation mapping owned outside the chat transcript model.
- Flutter and Tauri are not part of the active implementation route.
- Paperclip-derived control-plane documents remain exploratory and are not the
  active implementation plan.

## Current Gaps

The main phase-2 chat-core gaps are now closed, but these areas are still
intentionally deferred:

- live streaming or push-based renderer updates
- split-view panes beyond the current chat-first layout
- richer control-plane semantics above the current minimal shared-core write API
  set, plus stronger storage boundaries beyond the current JSON-backed store
- richer branch/converge orchestration beyond the current event-driven room
  workflow loop
- full Telegram/LINE outbound delivery, room-routing policy, escalation, and
  takeover behavior above the current relay seam
- signed installer publication, provider-install privilege orchestration, and
  richer desktop remediation polish above the current host substrate
- richer `Cats Work` project/work-item and team-operating-model surfaces above
  the shared core
- any limited mobile companion scope, which is intentionally secondary to the
  desktop platform

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Renderer | React + Vite | Current Chat shell and future Chat/Work product UIs |
| Product app | Node.js + TypeScript | Product-facing backend shell and shared platform services |
| Shared contracts | TypeScript modules today | `Cats Core v1` actors, channels, approvals, owner profile, archive metadata |
| Runtime boundary | `cats-runtime` | Direct runtime APIs plus planned MCP facade |
| Testing | `node:test` | Lightweight smoke and integration tests |

## Design Patterns

- Hexagonal boundary at the runtime edge: `cats` depends on a runtime client
  interface, not `agent-fleet`
- Shared domain contracts before product-surface specialization
- One interaction core with many presets rather than many mode-specific engines
- Concurrent turn fan-out distinct from parallel container composition
- Structured materialization beside transcript projection
- Direct product APIs plus MCP tool access for orchestrators
- Dependency injection by constructor or factory parameter
- Explicit shell payloads over hidden process state
- Product-owned memory over provider-owned session continuity
- Optional capability layers with deterministic fallback (`Boss Cat` and
  `Guide Cat`)
- Operational DB plus archive/RAG split rather than using vector memory for
  every live workflow

## API Design

- See [api.md](./api.md)

## Key Decisions

- [ADR-001](./decisions/001-use-cats-runtime-boundary.md): use `cats-runtime`
  as the only runtime boundary
- [ADR-002](./decisions/002-react-vite-renderer-before-electron.md): use
  React/Vite before adding a desktop shell
- [ADR-004](./decisions/004-separate-cat-identity-from-provider-execution.md):
  keep cat identity separate from provider execution and memory leases
- [ADR-005](./decisions/005-use-chat-cat-registry-and-channel-assignments.md):
  keep reusable cats at chat-global scope and channel-specific overrides in assignments
- [ADR-007](./decisions/007-establish-cats-core-v1-for-chat-and-work.md):
  introduce `Cats Core v1` as the shared contract layer for `Cats Chat` and
  `Cats Work`
- [ADR-008](./decisions/008-expose-cats-runtime-via-direct-api-and-mcp-facade.md):
  keep direct product APIs while adding an MCP facade for orchestrators
- [ADR-059](./decisions/059-adopt-a-unified-conversation-turn-lane-engine.md):
  use one canonical interaction engine for direct, sequential, concurrent, and
  parallel flows
- [ADR-062](./decisions/062-separate-concurrent-turn-fan-out-from-parallel-container-composition.md):
  keep concurrent turn fan-out distinct from parallel container composition and
  map Code entry points onto shared presets
- [ADR-060](./decisions/060-normalize-heterogeneous-runtime-delivery-into-product-events.md):
  normalize mixed runtime delivery into one product contract
- [ADR-061](./decisions/061-treat-guide-cat-as-an-optional-surface-assist-capability.md):
  treat Guide Cat as an optional assist capability rather than a chat mode
- [ADR-063](./decisions/063-agent-missions-and-transport-bindings.md):
  separate managed work, agent missions, execution runs, and transport
  bindings
- [ADR-064](./decisions/064-project-conversational-agents-into-chat-and-operational-agents-into-work.md):
  project conversational agents into Chat and operational agents into Work
- [ADR-065](./decisions/065-keep-my-cats-as-one-platform-agent-home-with-lenses.md):
  keep `MY CATS` as one platform-level agent home with lens-based projections
- [ADR-066](./decisions/066-persist-guide-cat-assist-content-as-platform-owned-local-state.md):
  persist Guide Cat assist content as product-owned local cache/state rather
  than transcript or session state

---

*Last updated: 2026-04-19*

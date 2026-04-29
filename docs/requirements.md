# Requirements Specification

> Initial product and implementation requirements for `Cats`.

## Overview

`Cats` should become the shared platform foundation for the cats initiative.
It must do so on a Node.js/TypeScript stack, through `cats-runtime`, with one
shared interaction engine, and with structured materialization contracts that
can be reused by `Cats Chat`, `Cats Work`, and `Cats Code`.

## Functional Requirements

### FR-001: Runtime Boundary

- **Description**: The app shall talk to `cats-runtime` for runtime status and
  future session operations.
- **Priority**: High
- **Status**: Completed

### FR-002: Chat Shell Contract

- **Description**: The app shall expose an initial chat shell payload that
  makes future channels, orchestrator controls, and capability flags explicit.
- **Priority**: High
- **Status**: Completed

### FR-003: Product Rebuild Direction

- **Description**: The app shall define its product behavior directly in
  `cats` rather than inheriting architecture from earlier prototypes.
- **Priority**: High
- **Status**: Completed

### FR-004: Multi-Channel Chat

- **Description**: The product shall support many persistent channels under one
  chat shell model.
- **Priority**: High
- **Status**: Completed

### FR-005: Renderer Shell

- **Description**: The product shall provide a renderer shell that makes the
  multi-channel chat visible without forcing an Electron dependency yet.
- **Priority**: High
- **Status**: Completed

### FR-006: Local Chat Persistence

- **Description**: The product shall persist essential chat shell state
  locally so channel selection and local channel setup survive reloads.
- **Priority**: High
- **Status**: Completed

### FR-007: Channel Setup Flow

- **Description**: The product shall let operators create planned channels from
  the renderer before they choose to activate runtime-backed sessions.
- **Priority**: High
- **Status**: Completed

### FR-008: Runtime-Backed Channel Activation

- **Description**: The product shall create channel-scoped orchestrator and
  assigned cat sessions through `cats-runtime`.
- **Priority**: High
- **Status**: Completed

### FR-009: Transcript and Mention Routing

- **Description**: The product shall persist user, system, and runtime messages
  locally while using basic `@mention` routing to choose channel targets.
- **Priority**: High
- **Status**: Completed

### FR-010: Global Cat Management and Export

- **Description**: The product shall support a chat-global cat registry,
  channel-specific cat assignment or removal, and export the current channel
  transcript for later ingestion.
- **Priority**: High
- **Status**: Completed

### FR-011: Richer Orchestrator Automation

- **Description**: The product shall grow beyond explicit `@mention` routing
  into more capable orchestration patterns and operator assists.
- **Priority**: Medium
- **Status**: Planned

### FR-012: Productization Surfaces

- **Description**: The product shall add split-view, richer activity state, and
  desktop-safe integration seams without changing the `cats-runtime` boundary.
- **Priority**: Medium
- **Status**: Planned

### FR-013: Alternate Entrypoints

- **Description**: The product shall support desktop-host and non-web
  entrypoints such as Telegram once the core chat contract stabilizes.
- **Priority**: Medium
- **Status**: Planned

### FR-014: Provider-Agnostic Cat Execution

- **Description**: The product shall let a cat keep its identity and local
  memory while using different providers or models across channels and
  sessions.
- **Priority**: High
- **Status**: Completed

### FR-015: Shared Cats Core v1

- **Description**: The product shall define a shared `Cats Core v1` contract
  for identity, actors/resources, permissions, conversations, bot bindings,
  task or run approvals, owner profile, and archive metadata.
- **Priority**: High
- **Status**: Planned

### FR-016: Parallel Product Surfaces

- **Description**: `Cats Chat` and `Cats Work` shall reuse the same shared-core
  contracts instead of inventing separate schemas for shared entities.
- **Priority**: High
- **Status**: Planned

### FR-017: External Orchestrator Bot Entry Points

- **Description**: The product shall support Telegram and LINE style entry
  points where one or more Cat-bound bots relay and summarize work from hidden
  workers, while keeping one global `Boss Cat` as the default lead role.
- **Priority**: High
- **Status**: Planned

### FR-018: Human-in-the-Loop Escalation and Takeover

- **Description**: The product shall support escalation, approval, and takeover
  flows so an owner can review, redirect, or impersonate the orchestrator bot
  before important responses are sent externally.
- **Priority**: High
- **Status**: Planned

### FR-019: Owner Profile and Adaptive Memory

- **Description**: The product shall maintain a structured owner profile that
  captures preferences, tone, escalation thresholds, and decision style for
  orchestrators and workers.
- **Priority**: High
- **Status**: Planned

### FR-020: Interactive Delegation

- **Description**: The orchestrator shall be able to present options, cost or
  effort tradeoffs, and request approval before dispatching work to other
  workers.
- **Priority**: High
- **Status**: Planned

### FR-021: Direct Runtime API Plus MCP Tool Surface

- **Description**: The product shall keep direct `cats-runtime` APIs for app
  services while also planning an MCP facade for orchestrator-style agent tool
  use.
- **Priority**: High
- **Status**: Planned

### FR-022: Operational Search and Archive RAG Split

- **Description**: Live product search shall use product-owned operational
  storage, while archived transcripts and artifacts shall flow to a later
  archive/RAG pipeline.
- **Priority**: High
- **Status**: Planned

### FR-023: Desktop-First Packaged Experience

- **Description**: The product shall target a native-feeling desktop
  distribution that can start local services and guide onboarding for
  non-technical users.
- **Priority**: High
- **Status**: Planned

### FR-024: Unified Desktop Platform Shell

- **Description**: The full desktop surfaces for `Cats Chat` and `Cats Work`
  shall stay on one React/TypeScript renderer stack inside the Electron host
  selected for the current Node-sidecar topology.
- **Priority**: High
- **Status**: Planned

### FR-025: Mobile Companion Is Secondary

- **Description**: If a mobile client is added later, it shall begin as a
  limited companion scope for Chat notifications, quick replies, and approvals
  rather than a second full primary product shell.
- **Priority**: Medium
- **Status**: Planned

### FR-026: Chat-Contextual Add Cat Flow

- **Description**: The product shall make `Add cat to this chat` the primary
  cat-entry workflow inside the active chat surface rather than requiring a
  registry-first navigation step.
- **Priority**: High
- **Status**: Planned

### FR-027: Settings-Hosted Cat Registry

- **Description**: The product shall keep the reusable cat registry as a global
  management surface under `Settings > Cats`, reachable from the left-panel
  account menu, while still allowing direct `Create new` there.
- **Priority**: High
- **Status**: Planned

### FR-028: Multi-Layer Memory Ownership

- **Description**: The product shall separate provider-native continuity,
  evidence transcript backup, Cat/owner durable memory, and archive/RAG
  retrieval into distinct layers with explicit ownership between `cats` and
  `cats-runtime`.
- **Priority**: High
- **Status**: Planned

### FR-029: Optional Guide Cat Onboarding

- **Description**: After owner-name capture, the platform setup flow shall offer
  optional `Guide Cat` creation without requiring it for platform use.
- **Priority**: High
- **Status**: Planned

### FR-030: Minimal Guide Cat Setup Inputs

- **Description**: Setup shall collect only Guide Cat name plus runtime target
  information, and shall not ask for persona, skill-profile, or memory-profile
  authoring during setup.
- **Priority**: High
- **Status**: Planned

### FR-031: Guide Cat Entry Suggestions with Fallback

- **Description**: Entry surfaces such as `+New chat` and future `+Group chat`
  shall be able to consume Guide Cat-generated starter ideas while retaining a
  deterministic static fallback when Guide Cat is absent or unavailable.
- **Priority**: Medium
- **Status**: Planned

### FR-032: Generalized Participant Modeling

- **Description**: The platform shall evolve from Cat-only room assumptions to a
  generalized entity/participant model so conversation topology, routing, and
  per-turn execution strategy do not depend on every participant being a Cat.
- **Priority**: High
- **Status**: Planned

### FR-033: Unified Conversation-Turn-Lane Engine

- **Description**: The platform shall use one canonical
  `Container -> Conversation -> Turn -> Lane -> Segment -> Session` engine for
  direct, sequential, concurrent, and parallel interaction flows.
- **Priority**: High
- **Status**: Planned

### FR-034: Interaction-Core and Domain-Materialization Split

- **Description**: The platform shall let turns and lanes materialize durable
  product state such as tasks, specs, artifacts, test results, approvals, and
  references without making transcript prose the only durable source of truth.
- **Priority**: High
- **Status**: Planned

### FR-035: Heterogeneous Runtime Delivery Normalization

- **Description**: The platform shall normalize rich-streaming, text-streaming,
  and terminal-only runtime backends into one product-owned delivery contract
  before transcript, repair, replay, or materialization logic consume them.
- **Priority**: High
- **Status**: Planned

### FR-036: Guide Cat Optional Surface Assist

- **Description**: The platform shall treat Guide Cat as an optional
  surface-assist capability for setup, lobby, chat entry, composer, and later
  Work/Code surfaces, with deterministic fallback when Guide Cat is absent or
  unavailable.
- **Priority**: Medium
- **Status**: Planned

### FR-037: Concurrent vs Parallel Semantic Split

- **Description**: The platform shall treat `concurrent` as thread-internal
  multi-lane fan-out inside one conversation turn, and `parallel` as
  container-level composition of many child conversations.
- **Priority**: High
- **Status**: Planned

### FR-038: Code Entry Presets Over the Shared Engine

- **Description**: `Cats Code` shall expose `+New code`, `+Team code`, and
  `+Peer code` as product presets above the shared interaction engine rather
  than as separate workflow engines.
- **Priority**: High
- **Status**: Planned

### FR-039: Agent Mission and Run Vocabulary

- **Description**: The platform shall distinguish operator-visible managed work
  from agent missions, execution runs, and schedules/triggers so future Cats,
  Guide Cat, Companion, and other agents do not overload one `task` or `job`
  term for every layer of work.
- **Priority**: High
- **Status**: Planned

### FR-040: Transport Binding and External Thread Compatibility

- **Description**: The platform shall model external entrypoints such as
  Telegram through explicit transport bindings that stay distinct from bot
  binding identity, canonical conversation identity, and runtime session
  identity.
- **Priority**: High
- **Status**: Planned

### FR-041: Managed Work Canonical Ownership

- **Description**: `Cats Work` shall remain the canonical home for durable
  managed-work records such as goals, projects, requirements, backlog items,
  issues, and tasks, while `Chat` and `Code` may create or refine those records
  through the shared materialization seam.
- **Priority**: High
- **Status**: Planned

### FR-042: Background Agent Activity Promotion Rules

- **Description**: Background agent activity such as companion ingestion,
  memory extraction, scheduled assistance, and future helper automation shall
  default to missions and runs, and shall be promoted into managed Work only
  when operator-visible tracking, approval, or follow-up is required.
- **Priority**: Medium
- **Status**: Planned

### FR-043: Conversational vs Operational Agent Projection

- **Description**: The platform shall support one shared agent core that can
  project as `conversational`, `operational`, or `hybrid` depending on product
  surface and responsibility.
- **Priority**: High
- **Status**: Planned

### FR-044: My Cats as a Conversational Agent Surface

- **Description**: `My Cats` shall remain a chat-first roster for
  conversational agents and selected hybrid agents, rather than becoming the
  universal registry or control plane for every operational worker.
- **Priority**: Medium
- **Status**: Planned

### FR-045: Work as the Operational Agent Control Plane

- **Description**: `Cats Work` shall be the primary management surface for
  OpenClaw-style operational agents that need assignments, missions, runs,
  schedules, approvals, and follow-up outcomes.
- **Priority**: High
- **Status**: Planned

### FR-046: MY CATS as a Single Platform Agent Home

- **Description**: The platform shall expose one platform-level `MY CATS`
  surface rather than splitting agent-home navigation into separate top-level
  names such as `Chat Cats`, `Work Cats`, or `Code Cats`.
- **Priority**: High
- **Status**: Planned

### FR-047: MY CATS Lens-Based Projections

- **Description**: `MY CATS` shall support lens-based projections such as
  `Overview`, `Chat`, `Work`, and `Code`, while product-local panels remain
  contextual subsets over the same shared agent identity.
- **Priority**: Medium
- **Status**: Planned

### FR-048: Code Workspace and Artifact Navigation

- **Description**: `Cats Code` shall expose Code-owned `Workspaces` and
  `Artifacts` sidebar entries for execution-context navigation and durable
  output inspection, while `Cats Work` remains the canonical sidebar home for
  Projects, Work Items, Tasks, Runs, and Missions.
- **Priority**: High
- **Status**: Planned

### FR-049: Structured Code Artifact Declarations

- **Description**: `Cats Code` shall materialize Code artifacts from structured
  declarations submitted by agents, tools, system candidate detection, or user
  imports. The product server shall validate, normalize, stamp provenance, and
  write `CoreArtifactRecord` rows; cwd scanning and transcript JSON parsing
  shall not be authoritative artifact producer paths.
- **Priority**: High
- **Status**: Planned

## Non-Functional Requirements

### NFR-001: Explicit Boundaries

- `cats` MUST NOT source-import `agent-fleet` internals
- Runtime transport concerns should stay behind a dedicated client module

### NFR-002: Operator Visibility

- The first slices should prefer inspectable JSON and explicit state over hidden
  prompt-only logic

### NFR-003: Incremental Delivery

- Shared-core contracts should stabilize before Chat and Work implementations
  diverge
- Product surfaces should avoid frontend stack fragmentation while the platform
  foundation is still forming
- The default desktop path is Electron plus React/TypeScript while
  `cats-runtime` and `cats` remain Node-based local services

### NFR-004: Local Persistence Safety

- Chat shell persistence should use a simple local file path first
- The default persistence location should remain inside the project boundary

### NFR-005: Provider Portability

- Long-lived cat memory MUST remain product-owned rather than provider-owned
- Provider-native sessions should be replaceable without redefining cat
  identity

### NFR-006: Shared Contract Stability

- `Cats Chat` and `Cats Work` MUST share the same actor, conversation,
  approval, and owner-profile contracts
- `Cats Core v1` SHOULD stay minimal and avoid becoming a dumping ground for
  runtime internals or future-only business features

### NFR-007: Runtime Boundary Integrity

- Product services MUST continue to talk to `cats-runtime`, not provider CLIs
  directly

### NFR-008: Memory Layer Separation

- Provider-native transcripts SHOULD be treated as continuity aids rather than
  the only durable product memory
- Evidence transcript backup, durable Cat/owner memory, and archive/RAG
  retrieval MUST remain logically distinct even if they share storage
- MCP should supplement the runtime boundary for orchestrators, not replace the
  direct product API used by app services

### NFR-009: Transport Agnosticism

- External transport platforms such as Telegram and LINE SHOULD map to shared
  conversation and bot-binding records rather than separate one-off schemas

### NFR-010: Packaged Local Experience

- The first public packaging path SHOULD feel like native software rather than
  a manual dev stack
- Local onboarding SHOULD be able to capture model credentials, owner profile,
  and optional bot binding without requiring a terminal session
- Tauri or Flutter SHOULD NOT be introduced into the primary platform path unless
  the desktop Node-sidecar assumptions change materially

### NFR-011: Workflow Hierarchy

- High-frequency chat actions SHOULD stay in chat context instead of being
  displaced into management-first navigation
- Reusable resource management SHOULD remain available without becoming the
  default path for chat-time assignment tasks

### NFR-012: Setup Simplicity

- Setup SHOULD keep Guide Cat onboarding to one optional decision plus runtime
  target selection
- Setup SHOULD NOT require persona design, prompt authoring, or memory curation
  before the platform becomes usable

### NFR-013: Helper Session Efficiency

- Guide Cat SHOULD use an event-driven leased session lifecycle instead of an
  always-on background session
- Entry suggestions SHOULD be cacheable local data so empty states remain
  usable without live runtime work

### NFR-014: One Engine, Many Presets

- Product entry points such as direct lane, group chat, and parallel chat MUST
  remain presets or compositions above one shared interaction engine rather
  than separate core chat modes

### NFR-015: Runtime Capability Heterogeneity

- Product correctness MUST remain stable across runtimes that expose rich
  block streaming, plain-text streaming, or terminal-only results
- Product renderers and rebuild paths MUST consume normalized product delivery
  events rather than provider-specific payloads directly

### NFR-016: Materialization Traceability

- Structured outputs and durable artifacts MUST retain provenance back to
  conversation, turn, lane, participant, and session context where relevant
- Replay and repair SHOULD rebuild both transcript and structured projections
  from canonical state rather than scrape prose

### NFR-017: Optional Assist With Deterministic Fallback

- Guide Cat MUST remain optional at the platform and per-surface level
- Surfaces that consume Guide Cat SHOULD degrade into deterministic fallback
  instead of losing baseline usability

### NFR-018: Concurrent and Parallel Must Stay Layer-Separated

- `Concurrent` MUST remain a one-conversation, one-turn, multi-lane concept
- `Parallel` MUST remain a container-of-conversations concept
- Renderers, APIs, and tests MUST NOT collapse those meanings into one generic
  "many agents at once" abstraction

### NFR-019: Code Presets Must Bind Execution Profiles Explicitly

- Code entry presets SHOULD persist runtime-affecting setup such as `cwd`,
  worktree policy, permissions, and tool/skill bindings as first-class
  contracts
- These inputs MUST NOT exist only as ad hoc renderer form state

### NFR-020: Vocabulary Separation

- The platform MUST NOT treat `task`, `job`, `mission`, `run`, and `schedule`
  as interchangeable terms across Chat, Work, Code, and runtime surfaces
- Operator-facing product surfaces SHOULD prefer precise terms so planning,
  execution, and automation remain legible

### NFR-021: Transport and Session Identity Separation

- External thread identity MUST remain stable across reconnects, reroutes, and
  runtime session changes
- A transport binding MUST NEVER be redefined implicitly by a new session id or
  by a renderer-local heuristic

### NFR-022: Agent Projection Clarity

- Users SHOULD be able to tell whether they are chatting with an agent,
  managing its work, or inspecting its execution without identity forks across
  surfaces
- Product surfaces MUST preserve one shared agent identity beneath
  conversational, operational, and hybrid projections

### NFR-023: Single Agent-Home Naming

- The platform SHOULD keep one stable `MY CATS` concept instead of renaming
  the same registry into product-specific top-level surfaces
- Product-local Chat/Work/Code subsets MUST remain legible as projections of
  that one home rather than shadow registries

## User Stories

### US-001: Runtime-Aware Operator

**As an** operator,
**I want to** see whether the app can reach `cats-runtime`,
**So that** I can tell whether chat actions are safe to start.

**Acceptance Criteria**:
- [x] `/health` reports local service status
- [x] `/health` includes runtime reachability

### US-002: Product Team Bootstrap

**As a** product developer,
**I want to** see the intended chat shell contract early,
**So that** later UI work does not collapse back into a single-room chat model.

**Acceptance Criteria**:
- [x] `/api/app-shell` returns chat and orchestrator metadata
- [x] The payload names future capabilities explicitly

### US-003: Operator Chat Shell

**As an** operator,
**I want to** see channels, orchestrator state, and runtime health in one UI,
**So that** I can reason about the current chat state while richer
automation is still evolving.

**Acceptance Criteria**:
- [x] Renderer shows a multi-channel sidebar
- [x] Renderer shows runtime health and orchestrator notes
- [x] Renderer persists selected channel changes across reloads

### US-004: Operator Creates a Channel

**As an** operator,
**I want to** create a new planned chat channel locally,
**So that** I can shape the chat before deciding when to activate runtime
sessions.

**Acceptance Criteria**:
- [x] Renderer exposes a channel setup form
- [x] New channels persist across reloads
- [x] Newly created channels become the current selection

### US-005: Operator Activates a Channel

**As an** operator,
**I want to** start runtime sessions for the orchestrator and assigned cats,
**So that** channel work moves beyond local setup into real execution.

**Acceptance Criteria**:
- [x] Channel activation creates runtime sessions through `cats-runtime`
- [x] Session metadata is persisted back into the chat store

### US-006: Operator Routes Work with Mentions

**As an** operator,
**I want to** send a channel message and mention specific teammates,
**So that** work can be routed explicitly without leaving the chat.

**Acceptance Criteria**:
- [x] User messages are persisted to the transcript
- [x] Basic `@mention` parsing resolves orchestrator and active assigned cats
- [x] Runtime responses are persisted with usage metadata

### US-007: Operator Exports a Transcript

**As an** operator,
**I want to** export a channel transcript and setup bundle,
**So that** later offline normalization or ingestion can happen without replaying the UI.

**Acceptance Criteria**:
- [x] Export returns orchestrator metadata plus full channel history
- [x] Export is available through a stable HTTP route

### US-008: Operator Needs Better Runtime Visibility

**As an** operator,
**I want to** see richer activity and channel lifecycle state,
**So that** I can tell what the chat is doing without relying only on
request completion banners.

**Acceptance Criteria**:
- [ ] The product exposes richer runtime or activity state than the current
  request/response flow
- [ ] The UI can surface those states without manual transcript inspection

### US-009: Stakeholder Talks to the Orchestrator Bot

**As a** stakeholder,
**I want to** talk to one visible bot in Telegram or LINE,
**So that** I can interact with the owner's digital team without seeing the
internal worker topology.

**Acceptance Criteria**:
- [ ] One external bot can map to one explicit bot binding
- [ ] One environment can support multiple bot bindings without requiring
      multiple Boss Cats
- [ ] Worker detail can be summarized or relayed without exposing every worker
  as a public participant

### US-010: Owner Reviews Before Dispatch

**As an** owner,
**I want to** review options before the orchestrator dispatches real work,
**So that** I can guide tradeoffs instead of only reacting afterward.

**Acceptance Criteria**:
- [ ] The orchestrator can present at least one explicit approval or option step
- [ ] The system can persist approval state before worker execution begins

### US-011: Owner Needs Escalation and Takeover

**As an** owner,
**I want to** be notified when a request needs human judgment and optionally
reply as the bot,
**So that** I can control sensitive external interactions without breaking the
automation flow.

**Acceptance Criteria**:
- [ ] The system can escalate an external request into an owner-facing channel
- [ ] The owner can choose between approve, redirect, or takeover actions

### US-012: Teams Share the Same Core Contracts

**As a** parallel Chat or Work developer,
**I want to** build against the same core contracts,
**So that** the two products do not fork their actor or conversation models.

**Acceptance Criteria**:
- [ ] `Cats Core v1` scope is documented in accepted planning docs
- [ ] Chat and Work requirements point to the same shared entities

### US-013: Owner Preferences Improve Collaboration

**As an** owner,
**I want to** teach the orchestrator my decision style and preferences,
**So that** future plans and summaries feel more aligned with how I work.

**Acceptance Criteria**:
- [ ] A structured owner profile exists in the shared product model
- [ ] Orchestrators can consume that profile without depending on archive RAG

### US-014: Owner Uses Chat and Work on the Same Desktop Platform

**As an** owner,
**I want to** move between Chat and Work on desktop without a jarring framework
shift,
**So that** the platform feels like one product family instead of unrelated apps.

**Acceptance Criteria**:
- [ ] Full desktop Chat and Work surfaces share one Electron-hosted
  React/TypeScript renderer path
- [ ] Tray, windowing, and local packaging behave consistently across the platform

### US-015: Operator Adds an Existing Cat from the Current Chat

**As an** operator,
**I want to** add an existing cat from inside the active chat,
**So that** I can keep working in context instead of switching to a registry
screen first.

**Acceptance Criteria**:
- [ ] The active chat exposes a visible `Add cat` entry point
- [ ] The default add flow lets the operator choose an existing chat-global cat
- [ ] Successful assignment updates the current chat roster without requiring a
      separate registry visit

### US-016: Operator Manages the Registry from Settings

**As an** operator,
**I want to** manage reusable cats from Settings,
**So that** the registry stays global without crowding the main chat workflow.

**Acceptance Criteria**:
- [ ] A `Settings` entry is reachable from the left-panel account menu
- [ ] `Settings > Cats` exposes the reusable registry
- [ ] `Settings > Cats` still supports direct `Create new`

### US-017: Owner Optionally Creates a Guide Cat During Setup

**As an** owner,
**I want to** decide during setup whether I want a `Guide Cat`,
**So that** I can opt into help without being forced into a more complex setup.

**Acceptance Criteria**:
- [ ] Setup asks whether the owner wants a Guide Cat after owner-name capture
- [ ] Setup completes successfully with or without a Guide Cat
- [ ] Guide Cat setup asks only for name plus runtime target

### US-018: Owner Sees Helpful Starter Ideas Before the First Chat

**As an** owner,
**I want to** see helpful starter ideas in `+New chat` before I send my first
message,
**So that** the platform feels prepared rather than empty.

**Acceptance Criteria**:
- [ ] Entry surfaces can show Guide Cat-generated starter ideas when available
- [ ] Static fallback suggestions remain available when Guide Cat is absent or
      unavailable

### US-019: Developers Build Against Generalized Participants

**As a** platform developer,
**I want to** distinguish reusable entities, channel participants, conversation
topology, and turn strategy,
**So that** I do not need Cat-only special cases to explain every room mode.

**Acceptance Criteria**:
- [ ] Docs define `entity`, `participant`, `conversation topology`, and
      `turn strategy` as separate concepts
- [ ] New setup and conversation work references those concepts consistently

### US-020: Mixed Runtime Backends Still Feel Like One Product

**As a** user,
**I want to** see consistent transcript and artifact behavior even when
different Cats use runtimes with different streaming richness,
**So that** product correctness does not depend on one CLI family.

**Acceptance Criteria**:
- [ ] Rich-streaming, text-streaming, and terminal-only runtimes all project
      through the same turn/lane model
- [ ] Repair and replay do not require provider-native payload parsing

### US-021: Chat Can Materialize Code and Work State

**As an** owner,
**I want to** use chat-driven turns to create or refine durable Code/Work
artifacts,
**So that** useful structured state survives beyond the transcript.

**Acceptance Criteria**:
- [ ] Turns can emit structured outputs such as mutations, artifacts, or
      references
- [ ] Durable records preserve provenance back to the originating interaction

### US-022: Guide Cat Helps Without Becoming Required

**As an** owner,
**I want to** see contextual helper prompts and starter ideas when Guide Cat is
available,
**So that** the platform feels helpful without becoming unusable when Guide Cat
is missing.

**Acceptance Criteria**:
- [ ] Lobby or entry surfaces can use runtime-backed or cached Guide Cat assist
- [ ] Deterministic fallback remains available when Guide Cat output is absent

### US-023: Concurrent Compare and Parallel Branches Feel Different

**As a** user,
**I want to** see one-turn concurrent compare clusters and multi-thread parallel
containers presented differently,
**So that** I can tell whether I am comparing replies inside one conversation
or navigating independent branches.

**Acceptance Criteria**:
- [ ] Concurrent turns render as one-turn response clusters
- [ ] Parallel surfaces render as child conversations inside a container

### US-024: Code Entry Surfaces Match Different Working Styles

**As a** code user,
**I want to** choose between solo, shared-team, and peer-review entry points,
**So that** I can start the right workflow without reconfiguring everything by
hand after creation.

**Acceptance Criteria**:
- [ ] `+New code` maps to one primary coding conversation
- [ ] `+Team code` maps to one shared multi-participant coding conversation
- [ ] `+Peer code` maps to one parallel branch/review container

## Constraints

- The stack for this subproject is Node.js/TypeScript
- `cats-runtime` is the mandatory runtime boundary
- `crew-chat-poc` remains the reference for `cats-runtime` integration style
- cat identity and cat memory must not be modeled as permanent provider-bound
  records
- `Cats Chat` and `Cats Work` are expected to launch from shared contracts,
  not from two unrelated product schemas
- The current product path keeps the full desktop platform on Electron plus
  React/TypeScript, with mobile treated as later companion scope

---

*Last updated: 2026-04-14*

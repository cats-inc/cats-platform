# Requirements Specification

> Initial product and implementation requirements for `Cats`.

## Overview

`Cats` should become the shared platform foundation for the cats initiative.
It must do so on a Node.js/TypeScript stack, through `cats-runtime`, and with
shared `Cats Core v1` contracts that can be reused by both `Cats Chat` and
`Cats Work`.

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

*Last updated: 2026-04-04*

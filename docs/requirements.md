# Requirements Specification

> Initial product and implementation requirements for `cats-inc`.

## Overview

`cats-inc` should become the flagship product application for the cats
initiative. It will rebuild the useful product behavior from
`agent-workspace-poc`, but it must do so on a new Node.js/TypeScript stack and
through `cats-runtime`.

## Functional Requirements

### FR-001: Runtime Boundary

- **Description**: The app shall talk to `cats-runtime` for runtime status and
  future session operations.
- **Priority**: High
- **Status**: Completed

### FR-002: Workspace Shell Contract

- **Description**: The app shall expose an initial workspace shell payload that
  makes future channels, orchestrator controls, and capability flags explicit.
- **Priority**: High
- **Status**: Completed

### FR-003: Product Rebuild Direction

- **Description**: The app shall treat `agent-workspace-poc` as a behavior
  reference rather than a long-term product base.
- **Priority**: High
- **Status**: Completed

### FR-004: Multi-Channel Workspace

- **Description**: The product shall support many persistent channels under one
  workspace model.
- **Priority**: High
- **Status**: Completed

### FR-005: Renderer Shell

- **Description**: The product shall provide a renderer shell that makes the
  multi-channel workspace visible without forcing an Electron dependency yet.
- **Priority**: High
- **Status**: Completed

### FR-006: Local Workspace Persistence

- **Description**: The product shall persist essential workspace shell state
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
  member sessions through `cats-runtime`.
- **Priority**: High
- **Status**: Completed

### FR-009: Transcript and Mention Routing

- **Description**: The product shall persist user, system, and runtime messages
  locally while using basic `@mention` routing to choose channel targets.
- **Priority**: High
- **Status**: Completed

### FR-010: Participant Management and Export

- **Description**: The product shall support member add/remove flows and export
  the current channel transcript for later ingestion.
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
  entrypoints such as Telegram once the core workspace contract stabilizes.
- **Priority**: Medium
- **Status**: Planned

### FR-014: Provider-Agnostic Pal Execution

- **Description**: The product shall let a pal keep its identity and local
  memory while using different providers or models across channels and
  sessions.
- **Priority**: High
- **Status**: In Progress

## Non-Functional Requirements

### NFR-001: Explicit Boundaries

- `cats-inc` MUST NOT source-import `agent-fleet` internals
- Runtime transport concerns should stay behind a dedicated client module

### NFR-002: Operator Visibility

- The first slices should prefer inspectable JSON and explicit state over hidden
  prompt-only logic

### NFR-003: Incremental Delivery

- Desktop packaging should be deferred until the renderer and workflow model
  are stable

### NFR-004: Local Persistence Safety

- Workspace shell persistence should use a simple local file path first
- The default persistence location should remain inside the project boundary

### NFR-005: Provider Portability

- Long-lived pal memory MUST remain product-owned rather than provider-owned
- Provider-native sessions should be replaceable without redefining pal
  identity

## User Stories

### US-001: Runtime-Aware Operator

**As an** operator,
**I want to** see whether the app can reach `cats-runtime`,
**So that** I can tell whether workspace actions are safe to start.

**Acceptance Criteria**:
- [x] `/health` reports local service status
- [x] `/health` includes runtime reachability

### US-002: Product Team Bootstrap

**As a** product developer,
**I want to** see the intended workspace shell contract early,
**So that** later UI work does not collapse back into a single-room chat model.

**Acceptance Criteria**:
- [x] `/api/app-shell` returns workspace and orchestrator metadata
- [x] The payload names future capabilities explicitly

### US-003: Operator Workspace Shell

**As an** operator,
**I want to** see channels, orchestrator state, and runtime health in one UI,
**So that** I can reason about the current workspace state while richer
automation is still evolving.

**Acceptance Criteria**:
- [x] Renderer shows a multi-channel sidebar
- [x] Renderer shows runtime health and orchestrator notes
- [x] Renderer persists selected channel changes across reloads

### US-004: Operator Creates a Channel

**As an** operator,
**I want to** create a new planned workspace channel locally,
**So that** I can shape the workspace before deciding when to activate runtime
sessions.

**Acceptance Criteria**:
- [x] Renderer exposes a channel setup form
- [x] New channels persist across reloads
- [x] Newly created channels become the current selection

### US-005: Operator Activates a Channel

**As an** operator,
**I want to** start runtime sessions for the orchestrator and members,
**So that** channel work moves beyond local setup into real execution.

**Acceptance Criteria**:
- [x] Channel activation creates runtime sessions through `cats-runtime`
- [x] Session metadata is persisted back into the workspace store

### US-006: Operator Routes Work with Mentions

**As an** operator,
**I want to** send a channel message and mention specific teammates,
**So that** work can be routed explicitly without leaving the workspace.

**Acceptance Criteria**:
- [x] User messages are persisted to the transcript
- [x] Basic `@mention` parsing resolves orchestrator and active members
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
**So that** I can tell what the workspace is doing without relying only on
request completion banners.

**Acceptance Criteria**:
- [ ] The product exposes richer runtime or activity state than the current
  request/response flow
- [ ] The UI can surface those states without manual transcript inspection

## Constraints

- The stack for this subproject is Node.js/TypeScript
- `cats-runtime` is the mandatory runtime boundary
- `agent-workspace-poc` remains the reference for product behavior
- `crew-chat-poc` remains the reference for `cats-runtime` integration style
- pal identity and pal memory must not be modeled as permanent provider-bound
  records

---

*Last updated: 2026-03-13*

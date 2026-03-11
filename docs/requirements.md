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
- **Status**: In Progress

### FR-002: Workspace Shell Contract

- **Description**: The app shall expose an initial workspace shell payload that
  makes future channels, orchestrator controls, and capability flags explicit.
- **Priority**: High
- **Status**: In Progress

### FR-003: Product Rebuild Direction

- **Description**: The app shall treat `agent-workspace-poc` as a behavior
  reference rather than a long-term product base.
- **Priority**: High
- **Status**: Planned

### FR-004: Multi-Channel Workspace

- **Description**: The product shall support many persistent channels under one
  workspace model.
- **Priority**: High
- **Status**: In Progress

### FR-005: Renderer Shell

- **Description**: The product shall provide a renderer shell that makes the
  multi-channel workspace visible without forcing an Electron dependency yet.
- **Priority**: High
- **Status**: In Progress

### FR-006: Local Workspace Persistence

- **Description**: The product shall persist essential workspace shell state
  locally so channel selection survives reloads.
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
**So that** I can reason about the future product shape before persistence lands.

**Acceptance Criteria**:
- [x] Renderer shows a multi-channel sidebar
- [x] Renderer shows runtime health and orchestrator notes
- [x] Renderer persists selected channel changes across reloads

## Constraints

- The stack for this subproject is Node.js/TypeScript
- `cats-runtime` is the mandatory runtime boundary
- `agent-workspace-poc` remains the reference for product behavior
- `crew-chat-poc` remains the reference for `cats-runtime` integration style

---

*Last updated: 2026-03-11*

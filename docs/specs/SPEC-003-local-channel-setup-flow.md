# SPEC-003: Local Channel Setup Flow

## Summary

Add the first writable channel-setup path to `cats-inc` so operators can create
planned channels from the renderer and persist them locally.

## Goals

- Let the workspace grow beyond hard-coded default channels
- Keep setup behavior behind the existing Node server boundary
- Persist created channels before runtime-backed session flows exist

## Requirements

### Functional Requirements

- Renderer exposes a form for creating a planned channel
- Server accepts channel-creation requests through a workspace API
- Local workspace storage persists newly created channels and selects them

### Non-Functional Requirements

- Preserve the `cats-runtime` boundary and keep creation local for now
- Reuse the existing app-shell payload shape instead of adding a second bootstrap
- Keep the implementation compatible with future desktop packaging

## Out of Scope

- Runtime-backed session creation
- Participant/team provisioning
- Transcript persistence
- Mention routing

## Acceptance Criteria

- `POST /api/workspace/channels` returns an updated app-shell payload
- Reloading the app preserves created channels
- Renderer can create and select a new planned channel without manual JSON edits

---

*Last updated: 2026-03-11*

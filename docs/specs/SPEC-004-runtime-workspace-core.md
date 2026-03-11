# SPEC-004: Runtime Workspace Core

## Summary

Close the main product gap with `agent-workspace-poc` by adding runtime-backed
channel activation, routed messaging, participant management, orchestrator
editing, and transcript export to `cats-inc`.

## Goals

- Keep `cats-runtime` as the only runtime boundary
- Persist the full local workspace state as inspectable JSON
- Support channel setup, member management, and transcript export in one product shell

## Requirements

### Functional Requirements

- Channel activation creates orchestrator and member sessions through `cats-runtime`
- User messages persist locally and route to targets using basic `@mentions`
- Operators can add and remove channel members
- The global orchestrator surface is editable from the renderer
- Channels can export transcript plus orchestrator metadata as JSON

### Non-Functional Requirements

- Local workspace state remains human-inspectable
- Runtime-specific details stay behind the runtime client
- The renderer remains desktop-host compatible

## Out of Scope

- Split-view preview canvas
- Telegram orchestration entrypoint
- Rich streaming UI over WebSocket
- Automatic offline normalization or RAG ingestion

## Acceptance Criteria

- `npm test` covers activation, messaging, member management, and export
- `npm run build` succeeds for both server and renderer
- Operators can perform the core workspace loop from one renderer surface

---

*Last updated: 2026-03-11*

# SPEC-004: Runtime Chat Core

## Summary

Close the main phase-2 product gap by adding runtime-backed channel activation,
routed messaging, cat management, orchestrator editing, and transcript export
to `cats`.

## Goals

- Keep `cats-runtime` as the only runtime boundary
- Persist the full local chat state as inspectable JSON
- Support channel setup, chat-global cat management, and transcript export in one product shell

## Requirements

### Functional Requirements

- Channel activation creates orchestrator and assigned cat sessions through `cats-runtime`
- User messages persist locally and route to targets using basic `@mentions`
- Operators can define chat-global cats and assign or remove them per channel
- The global orchestrator surface is editable from the renderer
- Channels can export transcript plus orchestrator metadata as JSON

### Non-Functional Requirements

- Local chat state remains human-inspectable
- Runtime-specific details stay behind the runtime client
- The renderer remains desktop-host compatible

## Out of Scope

- Split-view preview canvas
- Telegram orchestration entrypoint
- Rich streaming UI over WebSocket
- Automatic offline normalization or RAG ingestion

## Acceptance Criteria

- `npm test` covers activation, messaging, cat management, and export
- `npm run build` succeeds for both server and renderer
- Operators can perform the core chat loop from one renderer surface

---

*Last updated: 2026-03-13*








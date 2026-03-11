# SPEC-002: Workspace Renderer Shell

## Summary

Add the first operator-facing renderer for `cats-inc` using React/Vite, fed by
the existing app-shell API.

## Goals

- Make the multi-channel workspace visible
- Keep `cats-runtime` behind the Node server boundary
- Avoid premature Electron packaging

## Requirements

### Functional Requirements

- Renderer fetches `/api/app-shell`
- UI shows channel sidebar, runtime status, and orchestrator notes
- Built server can serve the static renderer bundle

### Non-Functional Requirements

- Keep the Node server tests working
- Preserve future desktop-host compatibility
- Keep the renderer dependency surface small

## Out of Scope

- Persistent storage
- Real message composition
- Session creation and streaming
- Electron host integration

## Acceptance Criteria

- `npm run build` builds both server and renderer
- The renderer loads through Vite in development
- Built server can serve the static UI

---

*Last updated: 2026-03-11*

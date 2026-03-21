# ADR-002: Use a React/Vite Renderer Before Adding Electron

## Status

Accepted

## Context

`cats` will likely become a desktop-installable product later, but the UI
and workflow model are not stable enough to justify an Electron shell yet.
What the project needs now is a renderer that can express the multi-channel
chat model quickly while keeping future desktop packaging possible.

## Decision

`cats` will use a React/Vite renderer for the current chat shell. The
Node server remains the runtime-facing boundary. Electron is deferred until tray
behavior, sidecar lifecycle, and installer concerns are concrete enough to
validate.

## Consequences

- The product gets a real UI shell sooner
- The Node server can remain the future desktop-safe integration boundary
- Desktop packaging is still possible later without throwing away the renderer
- The project avoids premature packaging complexity while the workflow model is
  still moving

## Alternatives Considered

### Add Electron Immediately

Rejected because it shifts focus from product workflow design to packaging and
host-process concerns too early.

### Stay on Server-Only JSON

Rejected because Phase 2 needs a real chat shell to pressure-test the
product shape.

---

*Decision date: 2026-03-11*




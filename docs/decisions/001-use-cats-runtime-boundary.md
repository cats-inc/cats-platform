# ADR-001: Use `cats-runtime` as the Only Runtime Boundary

## Status

Accepted

## Context

`cats-inc` is intended to become the flagship product shell for the cats
initiative. The prior `agent-workspace-poc` proved valuable product behavior,
but it was built directly on top of `agent-fleet`. The monorepo direction now
requires upper-layer product apps to depend on `cats-runtime` instead.

## Decision

`cats-inc` will call `cats-runtime` for runtime status and future session
operations. It will not import `agent-fleet` internals or expose
backend-specific routes in its public contract.

## Consequences

- `cats-inc` stays aligned with the monorepo migration direction
- Runtime backends can evolve behind `cats-runtime`
- Product APIs must be designed around stable app-level needs, not backend
  transport details
- In phase 1, `cats-inc` still indirectly depends on `agent-fleet` because
  `cats-runtime` does

## Alternatives Considered

### Direct `agent-fleet` Integration

Rejected because it would keep the product app tightly coupled to a phase-1
backend implementation and work against the stated migration path.

### Delay Implementation Until `cats-runtime` Grows Further

Rejected because `crew-chat-poc` already demonstrates the intended boundary and
`cats-inc` can start with a thin health and shell contract immediately.

---

*Decision date: 2026-03-11*

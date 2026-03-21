# ADR-008: Expose cats-runtime via Direct API and MCP Facade

> Keep `cats-runtime` as the runtime boundary for product services while adding
> MCP as a tool surface for orchestrator-style agents.

## Status

Accepted

## Context

`cats-runtime` is already the accepted runtime boundary for `cats`.
However, the suite now needs two different ways to use runtime capabilities:

- product services need stable, explicit, app-controlled APIs for health,
  session lifecycle, routing, cancellation, and operational state
- orchestrator-style agents need a tool-oriented interface so they can
  coordinate workers without coupling directly to provider adapters or CLI
  details

If MCP becomes the only interface, product services inherit tool-host
complexity they do not need. If direct APIs remain the only interface,
orchestrator agents lose a clean tool boundary.

## Decision

`cats-runtime` will support two complementary access modes:

1. **Direct product API**
   - used by `cats`, `Cats Chat`, `Cats Work`, desktop host processes, and
     other product-owned services
2. **MCP facade**
   - used by orchestrator-style agents as a tool surface when they need runtime
     capabilities

Additional rules:

1. MCP does not replace the direct product API.
2. Product services must not depend on provider-specific adapters or CLI
   process details.
3. External transports such as Telegram or LINE route through product services
   and shared-core records first; they do not talk directly to workers.
4. Permissions, approvals, owner profile, and conversation state remain
   product-owned above the runtime layer.

## Consequences

### Positive

- Product APIs stay explicit and testable.
- Orchestrators gain a clean tool boundary for worker dispatch and runtime
  introspection.
- The runtime boundary remains stable even if orchestrator implementations vary.

### Negative

- The team must define and maintain two aligned access surfaces.
- Some operations will need careful ownership rules to avoid duplicating logic
  between product APIs and MCP tools.

### Neutral

- The current app still uses only direct APIs today.
- The MCP facade can be introduced incrementally as orchestrator capabilities
  grow.

## Alternatives Considered

### Alternative 1: Make MCP the only runtime interface

- **Pros**: One interface to document.
- **Cons**: Pushes tool-host assumptions into product services.
- **Why rejected**: Product services need a simpler operational API.

### Alternative 2: Keep only direct APIs

- **Pros**: Simpler initial implementation.
- **Cons**: Orchestrator agents lack a clean tool boundary.
- **Why rejected**: The orchestrator product model benefits from MCP-style tool
  use.

## References

- [ADR-001](./001-use-cats-runtime-boundary.md)
- [ADR-007](./007-establish-cats-core-v1-for-chat-and-work.md)
- [Architecture](../architecture.md)
- [mcp-config](../mcp-config.md)

---

*Accepted: 2026-03-16*
*Accepted by: user direction captured through Codex*

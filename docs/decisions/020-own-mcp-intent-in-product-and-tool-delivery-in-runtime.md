# ADR-020: Own MCP Intent in Product and Tool Delivery in Runtime

> Keep `cats` responsible for which tool capabilities a Cat should get,
> while `cats-runtime` remains responsible for tool registry, provider
> adaptation, and lazy activation of the actual tool surface.

## Status

Accepted

## Context

`cats` already carries `mcpProfile` as a product-side field, and
`cats-runtime` already carries the first real execution-time tool machinery:

- runtime-hosted local tools
- provider-facing tool schemas for API/local backends
- `allowedTools` and tool whitelists for some CLI backends
- runtime `toolProfile` handling in the local tool runtime

This creates a familiar boundary question:

- who decides which tools a given Cat should have?
- who decides how those tools are actually loaded, exposed, and constrained for
  each provider/backend?
- who ensures CLI-based providers do not pay the cost of loading every
  available tool at startup?

The current architecture already gives a strong hint:

- product services should use direct `cats-runtime` APIs
- MCP is an orchestrator/tool surface, not the primary product API boundary
- product roles, room modes, transport contexts, and approvals remain
  product-owned

That means MCP/tool management needs the same split as skills:

- product owns capability intent
- runtime owns execution delivery

## Decision

`cats` will own MCP/tool intent, and `cats-runtime` will own actual tool
delivery, provider adaptation, and lazy activation.

1. `cats` owns `mcpProfile` as a product concept.
   - which Cats or room modes need which tool capability class
   - which transport contexts require tighter or looser tool access
   - which product policies constrain tool use

2. `cats-runtime` owns the executable tool surface.
   - tool registry
   - MCP server registry and lifecycle when applicable
   - local tool runtime
   - provider-specific adaptation
   - `allowedTools` enforcement
   - lazy activation strategy

3. `cats` should not directly manage MCP server processes or provider tool
   bootstrap.
   - it should request tool intent through stable profiles or manifests
   - it should not become a second runtime or process supervisor

4. `cats-runtime` should not decide product role policy on its own.
   - runtime should not infer "PM vs coder vs Boss Cat" by itself
   - it should consume product-provided intent and realize it efficiently

5. Tool loading should be demand-aware.
   - the system should avoid loading every tool and server eagerly for every
     session
   - the first execution path should prefer the smallest useful tool set
   - additional tool groups or servers may activate lazily when the runtime or
     provider actually needs them

6. Provider-specific tool controls are runtime-owned translations.
   - CLI flags such as `--allowedTools` or provider-native trust settings are
     runtime concerns
   - API/local tool schemas are runtime concerns
   - `cats` should not encode those backend-specific shapes

## Consequences

### Positive

- Product role design stays in `cats`.
- Runtime efficiency and provider adaptation stay in `cats-runtime`.
- CLI-backed providers can avoid wasteful eager tool loading.
- One `mcpProfile` can map to different backend/provider realizations without
  leaking low-level flags into product code.

### Negative

- The product/runtime contract needs another explicit manifest layer.
- Teams must keep product `mcpProfile` names aligned with runtime-understood
  tool capabilities.
- Lazy activation adds lifecycle complexity inside runtime.

### Neutral

- This ADR does not require every backend to support the same tool depth.
- This ADR does not require shipping the full MCP facade immediately.
- This ADR does not replace the existing skill profile split; it complements it.

## Alternatives Considered

### Alternative 1: Let `cats` manage MCP servers directly

- **Pros**: product can see and control everything
- **Cons**: turns product shell into process/runtime manager
- **Why rejected**: runtime process ownership belongs in `cats-runtime`

### Alternative 2: Let `cats-runtime` decide all tool policy from provider
defaults

- **Pros**: less product configuration
- **Cons**: loses role-aware product control and makes tool policy opaque
- **Why rejected**: role and room policy are product concerns

### Alternative 3: Eagerly load every available tool for every session

- **Pros**: simpler runtime logic
- **Cons**: poor performance, larger context, unnecessary process startup, more
  accidental tool exposure
- **Why rejected**: tool activation should scale by need, not by maximum
  availability

## References

- [ADR-008](./008-expose-cats-runtime-via-direct-api-and-mcp-facade.md)
- [ADR-018](./018-separate-product-skill-intent-from-runtime-skill-hosting.md)
- [SPEC-015](../specs/SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md)
- [cats-runtime SPEC-002](../../../cats-runtime/docs/specs/SPEC-002-local-tool-runtime.md)
- [cats-runtime API](../../../cats-runtime/docs/api.md)

---

*Accepted: 2026-03-19*
*Accepted by: user direction captured through Codex*

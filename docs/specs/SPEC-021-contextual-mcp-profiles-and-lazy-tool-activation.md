# SPEC-021: Contextual MCP Profiles and Lazy Tool Activation

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Pending Review) |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

`cats` should decide which tool capability set a Cat needs in a given
product context, while `cats-runtime` should efficiently realize that request
without eagerly loading every available tool or MCP server at session start.

This spec defines that split.

## Goals

- make `mcpProfile` a real product-owned capability selector
- keep runtime tool delivery and provider adaptation inside `cats-runtime`
- support efficient CLI usage by avoiding eager load of all tools
- preserve room mode, transport context, and role-aware tool selection

## Non-Goals

- implementing the full MCP facade in this document alone
- exposing backend-specific tool flags in `cats`
- requiring all providers to support identical tool behavior
- turning the product into a direct MCP process manager

## User Stories

- As a product designer, I want `Boss Cat` in Telegram to get a different tool
  posture from a coder Cat in a direct lane.
- As a runtime maintainer, I want one place to translate product tool intent
  into provider-specific tool controls.
- As an operator, I want fast startup and minimal unnecessary tool exposure
  instead of every session loading every tool.

## Requirements

### Functional Requirements

1. `cats` shall support product-owned `mcpProfile` selection for Cats,
   channels, and contextual overrides.
2. `mcpProfile` resolution should consider at least:
   - Cat identity or role
   - room mode
   - transport context
   - optional channel override
3. `cats` shall resolve product context into a runtime-facing tool request
   or tool manifest before session create or wake.
4. The runtime-facing request should express tool intent without encoding
   provider-specific CLI flags or transport details.
5. `cats-runtime` shall translate the tool request into backend-specific tool
   realization.
6. `cats-runtime` shall remain responsible for:
   - tool registry lookup
   - tool schema exposure
   - MCP server lifecycle
   - local tool runtime policy
   - provider-specific allow/trust translation
7. `cats-runtime` should support lazy tool activation where meaningful.
8. Lazy activation should aim to avoid starting every possible MCP server or
   tool capability during initial session bootstrap.
9. The first activation pass should prefer a minimal viable tool set for the
   resolved profile.
10. When later turns need additional tool groups, runtime may activate them on
    demand if policy allows.
11. Runtime should keep enough observability metadata to report:
    - requested profile or manifest
    - realized tool set
    - lazy activations
    - warnings or unsupported capabilities
12. Product services in `cats` should continue to use direct runtime APIs.
    MCP remains an orchestrator/tool surface, not the primary app API path.

### Non-Functional Requirements

- **Boundary integrity**: product chooses intent; runtime chooses execution
- **Efficiency**: startup should not assume all tools are needed immediately
- **Safety**: tool allowlists and permission enforcement remain runtime-owned
- **Extensibility**: new profiles and tool groups should be addable without
  changing product UI assumptions

## Conceptual Model

### Product Layer

- `mcpProfile`
  - product-owned capability posture
- `ToolIntentManifest`
  - resolved runtime-facing expression of desired tool access

### Runtime Layer

- `ToolRegistry`
  - known tool capabilities and groups
- `ToolActivationPlan`
  - minimal eager set plus lazy groups
- `ProviderToolRealization`
  - backend/provider-specific translation such as schema lists, allowlists, or
    CLI flags

## Flow

```text
cats context
  (cat + room mode + transport + overrides)
        |
        v
resolve mcpProfile
        |
        v
tool intent manifest
        |
        v
cats-runtime tool registry + activation planner
        |
        +--> minimal eager tool realization
        +--> lazy groups available for later activation
        |
        v
provider-specific tool delivery
```

## Recommended Manifest Shape

Illustrative product-to-runtime request:

```ts
interface ToolIntentManifest {
  profileId?: string;
  allowedTools?: string[];
  requiredCapabilities?: string[];
  lazyGroups?: string[];
  context?: {
    catId?: string;
    roomMode?: 'chat_channel' | 'direct_message';
    transport?: 'telegram' | 'line' | 'web' | null;
  };
  strict?: boolean;
}
```

Notes:

- `allowedTools` should remain stable logical names, not provider flags
- `requiredCapabilities` and `lazyGroups` leave room for MCP-backed tool bundles
- runtime may ignore unsupported fields but should surface warnings

## Product Rules

### Boss Cat

- `Boss Cat` should usually get narrower tools in transport contexts than in
  trusted local web-room contexts.
- `Boss Cat` in Telegram should not implicitly load every coding or filesystem
  tool.

### Specialist Cats

- specialist Cats may request broader or narrower profiles depending on room
  mode
- a coder Cat in `direct_message` may start with a stronger tool set than that
  same Cat inside a summary-oriented transport flow

### Efficiency Rule

- initial session bootstrap should not assume every possible tool or server is
  needed
- runtime should realize the smallest useful tool surface first
- later expansion is acceptable when driven by actual need and policy

## Design Notes

- `cats-runtime` already has real tool machinery: `toolProfile`,
  `allowedTools`, local tool runtime, and provider-specific allow/trust
  translation. This spec raises that into an explicit product/runtime boundary
  contract.
- The first slice can be pragmatic: `cats` may resolve to a narrow
  `allowedTools` list plus profile id, while runtime handles the rest.
- Full lazy MCP server lifecycle may arrive incrementally; the ownership split
  should be fixed now even if realization starts with simpler caching.

## Dependencies

- [SPEC-015](./SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md)
- [SPEC-018](./SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [SPEC-019](./SPEC-019-product-skill-profiles-and-runtime-skill-manifests.md)
- [ADR-008](../decisions/008-expose-cats-runtime-via-direct-api-and-mcp-facade.md)
- [ADR-020](../decisions/020-own-mcp-intent-in-product-and-tool-delivery-in-runtime.md)
- [cats-runtime SPEC-002](../../../cats-runtime/docs/specs/SPEC-002-local-tool-runtime.md)

## Open Questions

- [ ] Should the first runtime-facing manifest be only `allowedTools`, or
      should `requiredCapabilities` and `lazyGroups` ship in the first slice?
- [ ] Which tool groups deserve eager activation versus lazy activation first?
- [ ] How much lazy activation state should become visible in `cats`
      activity or debug surfaces?

## References

- [terminology.md](../terminology.md)
- [Architecture](../architecture.md)
- [mcp-config.md](../mcp-config.md)

---

*Created: 2026-03-19*
*Author: Codex*

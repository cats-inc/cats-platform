# SPEC-013: Provider Catalog Consumption and Truthful Selector UI Seam

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Revised Direction) |
| **Owner** | Codex |
| **Reviewer** | User / provider-catalog workstream |

## Summary

`cats-platform` should stop mixing three different concepts in one dropdown:

- product-supported provider catalogs
- runtime-configured provider topology
- execution targets that are truly usable right now

Setup and in-product provider/model selectors must consume a truthful
runtime-backed selector contract. If the runtime has no usable target, the UI
must say so explicitly instead of filling the picker with static fallback
catalog entries.

Product-supported catalogs may still exist for documentation, recommendations,
or future settings surfaces, but they are not valid execution pickers.

## Goals

- expose a stable product API for truthful execution-target selectors
- keep the renderer off direct `cats-runtime` HTTP calls
- reuse the same selector contract in setup and in-product target pickers
- preserve a separate place for informational product-supported catalogs when
  needed
- stop static fallback behavior from leaking into execution selection UI

## Non-Goals

- making `cats-platform` the owner of runtime discovery or provider health
- requiring the renderer to call `cats-runtime` directly
- hiding runtime warnings or recovery states from the user
- preventing informational provider catalogs from existing elsewhere in the
  product
- solving every future provider-management screen in this one spec

## User Stories

- As a setup user, I want the Guide Cat provider/model picker to show only
  choices that can actually be used right now.
- As a product user, I want later provider/model selectors to follow the same
  rule instead of showing theoretical or broken options.
- As a product server, I want a runtime-backed selector contract that tells me
  whether usable targets exist, rather than forcing me to guess from fallback
  catalogs.
- As a maintainer, I want product-supported catalogs and runtime-usable
  execution choices to stay separate so the UX stays honest.

## Requirements

### Functional Requirements

1. `cats-platform` shall expose a product-owned selector API used by setup and
   in-product provider/model execution pickers.
2. That selector API shall return only currently usable runtime targets. It
   shall not return product-catalog-only providers as selectable execution
   options.
3. When the runtime is reachable but no usable targets exist, the selector API
   shall return an explicit machine-readable state such as
   `no_usable_targets`, not an empty success with fallback catalog entries.
4. When the runtime is unreachable, the selector API shall return an explicit
   machine-readable state such as `runtime_unreachable`, not a fake usable
   provider list.
5. Selector responses may include provider family, backend, default instance,
   instance list, default model hint, model-catalog provenance, and warnings,
   but only for usable runtime targets.
6. `cats-platform` shall keep the renderer off direct `cats-runtime` calls.
7. `GET /api/providers/{provider}/models` and
   `GET /api/providers/{provider}/models/advanced` when used by execution
   selectors shall only proxy runtime catalogs for resolved usable targets.
8. Product execution selectors shall not fall back to curated static model
   lists when runtime lookup fails. They shall surface recovery state or
   warnings instead.
9. When the runtime only has a trustworthy default-model hint for a usable
   target, selector UI shall present that default or `Provider default`; it
   shall not invent a larger hardcoded model list.
10. Unknown providers or invalid selector context shall return a client error
    instead of silently fabricating options.
11. `cats-platform` may keep a separate informational provider-catalog route or
    read model for documentation, recommendation, or install guidance, but that
    surface shall not be reused as an execution picker.
12. Setup and in-product execution pickers shall share one renderer seam and
    one product API contract so truthfulness does not drift by surface.

### Non-Functional Requirements

- **Truthfulness**: execution pickers must prefer omission and recovery prompts
  over misleading fallback options
- **Boundary ownership**: runtime discovery and availability remain inside
  `cats-runtime`
- **Consistency**: setup and in-product selectors must tell the same story
- **Graceful recovery**: selector routes should return explicit recovery states
  rather than forcing the UI to infer them from generic transport failures

## API Shape

### `GET /api/providers`

For execution-selector usage, this route should behave like a truthful selector
read model, not a generic product catalog.

Illustrative response when usable targets exist:

```json
{
  "state": "ready",
  "providers": [
    {
      "id": "claude",
      "label": "Claude",
      "defaultModel": "claude-sonnet-4-6",
      "defaultInstance": "native",
      "defaultBackend": "cli",
      "instances": [
        {
          "id": "native",
          "label": "cli/native",
          "target": "cli/native",
          "backend": "cli",
          "default": true
        }
      ],
      "modelsPath": "/api/providers/claude/models"
    }
  ]
}
```

Illustrative response when runtime is reachable but no usable targets exist:

```json
{
  "state": "no_usable_targets",
  "providers": [],
  "recovery": {
    "openRuntimeSetupPath": "/runtime/setup"
  }
}
```

Illustrative response when runtime is unreachable:

```json
{
  "state": "runtime_unreachable",
  "providers": [],
  "recovery": {
    "retryable": true
  }
}
```

### `GET /api/providers/{provider}/models`

Illustrative response:

```json
{
  "catalog": {
    "provider": "claude",
    "backend": "cli",
    "instance": "native",
    "defaultModel": "claude-sonnet-4-6",
    "source": "dynamic",
    "cache": {
      "servedFromCache": true,
      "cachedAt": "2026-04-07T10:00:00.000Z",
      "ttlSec": 60
    },
    "models": [
      { "id": "claude-sonnet-4-6", "label": "sonnet 4.6", "default": true }
    ],
    "warnings": []
  }
}
```

Selector-specific notes:

- this route is only valid after the product has already established that the
  target is currently usable
- `source` tells the caller where the model metadata came from, not whether the
  target is healthy on its own
- when lookup fails, execution-selector callers should receive an explicit
  error/recovery state rather than static fallback options

## Design Notes

- Product-supported provider catalogs and runtime-usable execution targets are
  different read models and must remain separate.
- The product server may compose runtime availability plus runtime model
  catalog reads, but the renderer should not.
- If the current `GET /api/providers` route name is kept, its selector usage
  semantics must be updated to match this spec. If that route name becomes too
  overloaded, a dedicated selector endpoint is acceptable.
- Setup and in-product selector UIs should reuse one extracted renderer seam so
  a fallback fix in one place benefits the other.

## Dependencies

- [cats-runtime SPEC-004](../../../cats-runtime/docs/specs/SPEC-004-provider-model-catalog-and-discovery.md)
- [cats-runtime SPEC-023](../../../cats-runtime/docs/specs/SPEC-023-verified-advanced-provider-catalogs-and-manual-refresh-discovery.md)
- [SPEC-049](./SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)
- [PLAN-040](../plans/PLAN-040-simplify-setup-wizard-and-decouple-runtime-bootstrap.md)

## Open Questions

- [ ] Keep `GET /api/providers` as the selector route name, or introduce a new
      dedicated selector endpoint to avoid overloading the old catalog meaning?
- [ ] Which non-execution product surfaces still need a separate informational
      provider catalog, and should that be a new route or static server-owned
      data?
- [ ] Should selector responses expose the runtime's current availability
      reason/warning text directly, or normalize them into product-owned
      categories first?

## References

- [ADR-008](../decisions/008-expose-cats-runtime-via-direct-api-and-mcp-facade.md)
- [PLAN-040](../plans/PLAN-040-simplify-setup-wizard-and-decouple-runtime-bootstrap.md)
- [SPEC-049](./SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)

---

*Created: 2026-03-19*
*Revised: 2026-04-07*
*Author: Codex*

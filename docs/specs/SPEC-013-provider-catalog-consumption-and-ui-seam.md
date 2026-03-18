# SPEC-013: Provider Catalog Consumption and UI Seam

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Ready for Specialist Handoff) |
| **Owner** | Codex |
| **Reviewer** | User / provider-catalog workstream |

## Summary

`cats-inc` should stop treating renderer-maintained provider/model tables as the
authoritative source of model availability.

`cats-runtime` now owns provider-model catalog discovery. `cats-inc` should
consume that catalog server-side, expose a stable product API for the renderer,
and isolate provider/model form rendering behind a dedicated UI seam so the
provider workstream does not need to keep editing the full chat shell.

## Goals

- align `cats-inc` with the runtime-owned provider catalog direction
- expose a stable product API for provider list and provider-model reads
- keep the renderer off direct runtime HTTP calls
- extract provider/model form UI out of `App.tsx`
- allow static fallback when runtime catalog lookups are unavailable
- treat `cats-inc` static provider/model data as transitional fallback only,
  not as the long-term source of truth

## Non-Goals

- making `cats-inc` the owner of model discovery
- requiring a runtime aggregate provider-model endpoint in the first slice
- rewriting every existing provider/model form to use live async fetching in the
  same commit
- solving provider health or credential validation in this slice

## Requirements

### Functional Requirements

1. `cats-inc` shall expose `GET /api/providers`.
2. `GET /api/providers` shall return the product-supported provider families
   that can be shown in setup and cat-creation flows.
3. `cats-inc` shall expose `GET /api/providers/{provider}/models`.
4. `GET /api/providers/{provider}/models` shall call `cats-runtime`
   server-side when the runtime catalog route is available.
5. The renderer shall not be required to call `cats-runtime` directly.
6. When runtime model lookup fails for transport or availability reasons,
   `cats-inc` may fall back to a curated static product list for that provider
   and include warnings.
7. Unknown provider families shall return a client error instead of an empty
   success response.
8. The provider/model form UI shall live in an extracted renderer component
   rather than being duplicated inline across setup and cat-creation screens.

### Non-Functional Requirements

- **Boundary ownership**: runtime discovery remains in `cats-runtime`
- **Compatibility**: existing dropdown behavior should continue working while
  the provider workstream migrates toward live product-API reads
- **Parallel delivery**: provider UI changes should primarily touch extracted
  provider files, not the entire chat shell
- **Fallback discipline**: `src/shared/providerCatalog.ts` may keep a curated
  static fallback during transition, but new renderer-only model hardcodes
  should not be introduced

## API Shape

### `GET /api/providers`

Illustrative response:

```json
{
  "providers": [
    {
      "id": "claude",
      "label": "Claude-CLI",
      "defaultModel": "claude-opus-4-6",
      "modelsPath": "/api/providers/claude/models"
    }
  ]
}
```

This route is product-owned. It tells the renderer which provider families
`cats-inc` supports in its UI.

### `GET /api/providers/{provider}/models`

Illustrative response:

```json
{
  "catalog": {
    "provider": "claude",
    "backend": "cli",
    "instance": "default",
    "defaultModel": "claude-opus-4-6",
    "source": "config",
    "cache": null,
    "models": [
      { "id": "claude-opus-4-6", "label": "opus 4.6", "default": true }
    ],
    "warnings": []
  }
}
```

The product route may proxy the runtime result directly or fall back to curated
static product data when runtime discovery is unavailable.

## Design Notes

- The product server composes per-provider runtime calls because the first
  runtime slice does not require an aggregate catalog endpoint.
- The extracted provider/model UI component is a seam, not the final async UI.
  It gives the provider workstream one place to update once it switches to
  product-API-fed options.
- Static fallback is a safety net, not the future source of truth.
- `src/shared/providerCatalog.ts` is a transitional compatibility layer. The
  long-term goal is to shrink duplicated model tables until `cats-inc` no
  longer maintains its own authoritative provider-model copy.

## Dependencies

- [cats-runtime SPEC-004](../../../cats-runtime/docs/specs/SPEC-004-provider-model-catalog-and-discovery.md)
- [cats-runtime PLAN-005](../../../cats-runtime/docs/plans/PLAN-005-provider-model-catalog-and-discovery.md)
- [ADR-014](../decisions/014-freeze-parallel-delivery-boundaries-for-provider-telegram-and-chat-workstreams.md)

## Open Questions

- [ ] Should `GET /api/providers` eventually return runtime-backed configured
      instances after the aggregate product flow is proven?
- [ ] Should product fallback warnings be shown directly in setup UI or only in
      advanced settings?
- [ ] Should the remaining static fallback eventually collapse to a minimal
      emergency catalog or be replaced by a runtime-fed persisted snapshot?

## References

- [ADR-008](../decisions/008-expose-cats-runtime-via-direct-api-and-mcp-facade.md)
- [ADR-012](../decisions/012-keep-cat-naming-in-product-apis-and-neutral-terms-in-system-apis.md)
- [PLAN-014](../plans/PLAN-014-parallel-workstream-ownership-and-integration-seams.md)

---

*Created: 2026-03-19*
*Author: Codex*

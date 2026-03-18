# PLAN-014: Parallel Workstream Ownership and Integration Seams

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Ready for Specialist Handoff) |
| **Owner** | Codex |
| **Assigned To** | Parallel workstreams A/B/C |
| **Reviewer** | User |

## Related Specs

- [SPEC-013](../specs/SPEC-013-provider-catalog-consumption-and-ui-seam.md)
- [SPEC-014](../specs/SPEC-014-telegram-boss-cat-relay-mvp.md)
- [SPEC-015](../specs/SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md)

## Overview

This plan turns the new provider, Telegram, and capability directions into a
parallelizable work map for `cats-inc`.

The main rule is simple:

- new provider logic should land in provider seam files
- new Telegram logic should land in transport seam files
- new chat/capability logic should land in capability and chat files
- `src/server.ts` and `src/renderer/App.tsx` should only absorb minimal wiring

## Workstream Ownership

| Workstream | Primary Scope | Files / Areas |
|------------|---------------|---------------|
| A | Provider catalog consumption and UI | `src/shared/providerCatalog.ts`, `src/server/routes/providers.ts`, `src/runtime/client.ts`, `src/renderer/components/ProviderModelFields.tsx`, renderer provider API helpers |
| B | Telegram Boss Cat bridge | `src/transports/telegram/**`, `src/server/routes/telegram.ts`, bot-binding integration seams |
| C | Chat behavior and capability mapping | chat routing/behavior files, capability registry files, skill/MCP mapping files |

## Phases

### Phase 1: Freeze Docs and Seams

- [ ] Land ADR/spec/plan set for the three workstreams
- [ ] Add extracted provider/model UI seam
- [ ] Add server route seam files for provider and Telegram work
- [ ] Add Telegram transport skeleton files

### Phase 2: Provider Catalog Consumption

- [ ] Keep curated product provider families in a shared product seam
- [ ] Add `GET /api/providers`
- [ ] Add `GET /api/providers/{provider}/models`
- [ ] Call `cats-runtime` server-side for per-provider model catalog reads
- [ ] Preserve static fallback with warnings while runtime adoption rolls out,
      but keep it confined to `src/shared/providerCatalog.ts`
- [ ] Migrate provider forms from inline markup toward product-API-fed options
- [ ] Stop adding new renderer-only provider/model hardcodes once the product
      API seam is in place

### Phase 3: Telegram Relay MVP

- [ ] Add Telegram relay status route
- [ ] Add Telegram webhook ingress route
- [ ] Persist update dedupe state and Telegram chat mapping through the relay
- [ ] Bind Telegram ingress to the `Boss Cat` as the single visible identity
- [ ] Keep worker cats internal to orchestration

### Phase 4: Capability Registry and Multi-Cat Validation

- [ ] Define capability registry structure for cats
- [ ] Map product capability profiles to runtime-managed skills and MCP profiles
- [ ] Validate multi-cat conversation flow using explicit capability metadata
- [ ] Keep capability-to-runtime mapping out of provider and Telegram seams

### Phase 5: Integration and Follow-Ons

- [ ] Update product forms to consume product provider APIs by default
- [ ] Reduce duplicated provider/model fallback data once runtime-backed reads
      are stable enough to stop treating `cats-inc` as a second catalog owner
- [ ] Add real Telegram conversation/channel mapping
- [ ] Add capability-aware assignment heuristics for `Boss Cat`
- [ ] Update docs and tests once all three workstreams converge

## Hotspot Rules

- `src/server.ts`
  - allowed changes: route registration, dependency wiring
  - discouraged changes: new route-local business logic
- `src/renderer/App.tsx`
  - allowed changes: component composition, existing screen wiring
  - discouraged changes: new provider domain logic or transport-specific logic

## Verification

- provider routes covered by server tests
- Telegram status/webhook seam covered by server tests
- build/typecheck/test remain green after seam extraction

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-19 | Plan created to coordinate provider, Telegram, and capability workstreams after cats-runtime catalog direction landed |

---

*Created: 2026-03-19*
*Author: Codex*

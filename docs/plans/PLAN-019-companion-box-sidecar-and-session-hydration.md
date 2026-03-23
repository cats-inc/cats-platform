# PLAN-019: Companion Box Sidecar and Session Hydration

> Implement the first product-owned companion-box slice in `cats` with a
> Cat-scoped sidecar store, ingestion/read APIs, and a direct-session hydration
> seam for runtime execution.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress (First Slice Landed) |
| **Owner** | Codex |
| **Assigned To** | Codex |
| **Reviewer** | User |

## Related Spec

[SPEC-029: Companion Boxes, Ingestion, and Response Profiles](../specs/SPEC-029-companion-boxes-ingestion-and-response-profiles.md)

## Overview

The first implementation slice keeps companion data product-owned inside
`cats`, not `cats-runtime`, and deliberately avoids visible UI changes. The
initial landing focuses on:

- a per-Cat companion sidecar store
- Cat-scoped ingest/read routes for sources, derived records, memory, and
  response profiles
- a normalized `CompanionSessionContext` seam attached to direct companion
  runtime session create/send calls

## Implementation Phases

### Phase 1: Contracts and Sidecar Store

- [x] Define `CompanionBox`, source, derived, memory, response-profile, and
      session-context contracts
- [x] Implement a Cat-scoped in-memory/file-backed companion sidecar store
- [x] Materialize copied/imported source metadata into a per-Cat storage layout

**Deliverables**: stable product-owned companion records that persist
independently of core chat state.

### Phase 2: API Surface

- [x] Add `POST /api/cats/{catId}/companion-box/sources`
- [x] Add Cat-scoped reads for summary, sources, derived, memory, and response
      profile
- [x] Add a read seam for `GET /api/cats/{catId}/companion-box/session-context`

**Deliverables**: a minimal public ingestion/read API for companion data.

### Phase 3: Runtime Hydration

- [x] Attach normalized companion-session metadata to direct companion session
      create/wake/send flows
- [x] Keep runtime skill selection profile-driven instead of moving Cat-local
      data into runtime skill hosting
- [ ] Let runtime-side consumers actively interpret the new hydration payload

**Deliverables**: a stable additive hydration seam for later runtime work.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/companion/*` | Create | Companion contracts, validation, ingestion, and hydration helpers |
| `src/products/chat/state/companionBoxStore.ts` | Create | File-backed and in-memory companion sidecar persistence |
| `src/products/chat/api/companionBoxRoutes.ts` | Create | Cat-scoped companion-box HTTP routes |
| `src/products/chat/state/runtimeActions.ts` | Modify | Attach companion hydration metadata during session create/send |
| `src/app/server/index.ts` | Modify | Minimal wiring for default companion-store construction |
| `tests/companion-box-*.test.js` | Create | Persistence, API, and hydration regression coverage |

## Technical Decisions

- Use a product-owned sidecar store derived from `chatStatePath` instead of
  extending shared core or `cats-runtime`.
- Keep companion hydration additive by attaching `companionSession` inside
  runtime invocation metadata and runtime skill-manifest context.
- Keep copied/imported first-slice materialization lightweight by persisting a
  JSON payload per ingested source; binary/file-copy workflows can extend this
  later without redefining the record schema.

## Testing Strategy

- **Unit Tests**: companion store persistence, derived-record generation, and
  session-context assembly
- **Integration Tests**: server routes for ingest/read/update flows plus direct
  runtime hydration on message dispatch
- **Manual Testing**: create a companion Cat, ingest note/article/path/media
  metadata, open a direct lane, and confirm runtime create/send requests carry
  `companionSession`

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Companion metadata grows too large for runtime metadata payloads | Medium | Keep hydration to recent/selected sources and active memory only |
| Sidecar storage drifts from chat/core persistence | Medium | Keep the sidecar explicitly separate and document the ownership boundary |
| Future binary/media copy semantics differ from first slice | Low | Use storage-mode metadata and a stable storage layout now, keep copy pipeline extensible |

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-23 | Plan created after first sidecar/API/hydration slice landed |
| 2026-03-23 | Contracts, sidecar store, Cat-scoped routes, and runtime hydration metadata implemented |

---

*Created: 2026-03-23*
*Author: Codex*

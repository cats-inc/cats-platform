# PLAN-020: Cats Memory Retrieval and Flush Substrate

> Implement the first Cats-owned memory extraction, canonical-memory, and
> retrieval slice inside `cats`, with explicit flush seams for companion,
> owner, and channel scopes.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress (First Slice Landed) |
| **Owner** | Codex |
| **Assigned To** | Codex |
| **Reviewer** | User |

## Related Spec

- [SPEC-022: Cats Memory Layering and Ownership](../specs/SPEC-022-cats-memory-layering-and-ownership.md)
- [SPEC-029: Companion Boxes, Ingestion, and Response Profiles](../specs/SPEC-029-companion-boxes-ingestion-and-response-profiles.md)

## Overview

The first slice keeps memory product-owned inside `cats`. It does not call
`personal-rag-system`, and it does not turn `cats-runtime` into the long-lived
owner of companion or durable memory.

The initial landing focuses on:

- Cats-owned canonical memory records for companion, owner, and channel scopes
- a local file-backed canonical-memory sidecar derived from the chat-state path
- extraction and flush helpers for companion boxes, owner profile, and channel
  working memory
- retrieval-context assembly that can hydrate direct companion sessions and
  give Team 4 an explicit pre-reset / pre-compaction seam

## Implementation Phases

### Phase 1: Canonical Contracts and Storage

- [x] Define canonical Cats memory record, flush-result, and retrieval-context
      contracts
- [x] Implement in-memory and file-backed canonical-memory stores
- [x] Keep persistence local to `cats` by deriving a sidecar path from the
      chat-state path

**Deliverables**: stable product-owned canonical memory records that survive
provider and runtime changes.

### Phase 2: Extraction and Flush

- [x] Extract durable memory from companion sources, derived records, curated
      companion memory, and response profiles
- [x] Extract owner-profile memory from shared core owner data
- [x] Extract channel working-memory checkpoints into canonical records
- [x] Expose explicit flush reasons including `pre_reset` and
      `pre_compaction`

**Deliverables**: a flush seam that upstream runtime/session work can call
without redefining memory ownership.

### Phase 3: Retrieval and Companion Re-entry

- [x] Assemble retrieval context from canonical records plus live companion
      records
- [x] Hydrate direct companion session context with additive retrieval payloads
- [x] Expose retrieval preview routes for cat and channel scopes

**Deliverables**: a stable retrieval seam that does not require a separate RAG
service to exist first.

### Phase 4: Validation and Docs

- [x] Add regression coverage for flush, retrieval, and runtime hydration
- [x] Update API, architecture, README, PROGRESS, and plan indexes
- [ ] Extend the substrate with vector/embedding backends once the product
      needs deeper semantic recall

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/platform/memory/*` | Create | Canonical-memory contracts, extraction, retrieval, stores, and service layer |
| `src/products/chat/companion/contracts.ts` | Modify | Add additive retrieval payload to `CompanionSessionContext` |
| `src/products/chat/companion/hydration.ts` | Modify | Build session context with retrieval support |
| `src/products/chat/api/memoryRoutes.ts` | Modify | Add canonical-memory, flush, and retrieval routes |
| `src/products/chat/api/shared.ts` | Modify | Inject Cats memory service into chat API dependencies |
| `src/app/server/index.ts` | Modify | Minimal wiring for default memory store/service and memory-aware companion store |
| `tests/memory-substrate.test.js` | Create | Canonical-memory and retrieval regression coverage |
| `tests/companion-box-routes.test.js` | Modify | Route and hydration assertions for retrieval/flush seams |

## Technical Decisions

- Keep canonical memory separate from both shared core and raw companion-box
  records; this slice is a product-owned projection layer.
- Use a local file-backed sidecar plus in-memory test store rather than an
  external retrieval service.
- Keep the first retrieval slice lexical/hybrid over canonical records and live
  companion records so the embedding/vector seam can stay additive.
- Treat pre-reset and pre-compaction as explicit flush reasons rather than
  hidden runtime side effects.

## Testing Strategy

- **Unit Tests**: extraction, retrieval scoring, canonical store persistence
- **Integration Tests**: chat memory routes, session-context hydration, and
  companion flush/retrieval round trips
- **Acceptance Check**: `npm test` for the whole `cats` package

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Canonical memory duplicates too much live companion data | Medium | Keep records deduped by stable ids and keep retrieval additive rather than replacing source records |
| Retrieval stays too shallow for future semantic recall | Medium | Keep the service boundary local and additive so embedding/index backends can plug in later |
| Runtime sandboxes get mistaken for product truth | High | Only flush Cats-owned companion, owner, and channel records; do not treat runtime session files as canonical memory |

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-23 | Plan created after the first Cats-owned canonical-memory and retrieval slice landed |
| 2026-03-23 | Canonical-memory storage, extraction/flush routes, and direct companion retrieval hydration implemented |

---

*Created: 2026-03-23*
*Author: Codex*

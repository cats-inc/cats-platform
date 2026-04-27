# SPEC-088: Companion Memory Bridge Contract Placeholder

> Track the future contract that reconciles companion-box memory with canonical
> `Settings > My Cats` durable memory without exposing duplicate memory ledgers.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Placeholder |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

SPEC-085 intentionally keeps the companion side-panel `Memory` surface backed by
`CompanionMemoryRecord` in v1. `Settings > My Cats` may continue to expose
`DurableMemoryItem`. Those two shapes are not equivalent:

- `CompanionMemoryRecord` carries companion-box lineage, curation state,
  lifecycle state, and replacement linkage.
- `DurableMemoryItem` is the canonical settings-side durable memory summary
  shape.

This placeholder reserves the follow-up bridge contract so the product does not
silently grow two competing memory systems.

## Required Future Decisions

- Source of truth between `CompanionMemoryRecord` and `DurableMemoryItem`.
- One-way projection, two-way sync, or migration path.
- Conflict behavior when both records are edited.
- Mapping for `category`, `status`, `curatedBy`, `confidence`, `sourceIds`, and
  `replacedById`.
- Whether Settings can deep-link into companion memory details or only show a
  normalized summary.
- Retrieval/indexing implications for SPEC-022 and SPEC-031.

## Binding Constraint Until This Spec Is Expanded

The companion profile shall not render `CompanionMemoryRecord` and
`DurableMemoryItem` as two separate editable memory ledgers. SPEC-085 remains
authoritative for v1: companion side-panel `Memory` uses `CompanionMemoryRecord`
only.

## Dependencies

- [SPEC-022](./SPEC-022-cats-memory-layering-and-ownership.md)
- [SPEC-029](./SPEC-029-companion-boxes-ingestion-and-response-profiles.md)
- [SPEC-031](./SPEC-031-built-in-memory-extraction-durable-sync-and-retrieval-context.md)
- [SPEC-085](./SPEC-085-companion-profile-feed-and-library-ia.md)
- [ADR-084](../decisions/084-adopt-companion-profile-ia-and-shareable-content-references.md)
- [PLAN-077](../plans/PLAN-077-companion-profile-and-share-preview-rollout.md)

---

*Created: 2026-04-28*
*Author: Codex*

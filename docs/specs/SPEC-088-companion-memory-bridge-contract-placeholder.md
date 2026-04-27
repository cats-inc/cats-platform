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

## Expansion Triggers

This placeholder must be expanded before any of these changes ship:

- Companion UI reads from or writes to `DurableMemoryItem`.
- `Settings > My Cats` shows, edits, deletes, or deep-links into
  `CompanionMemoryRecord`.
- Memory sync/import/export crosses product data scopes or devices.
- Retrieval starts treating `DurableMemoryItem` and `CompanionMemoryRecord` as
  one merged corpus.
- Either schema changes in a way that requires cross-ledger mapping.

Target phase: revisit immediately after PLAN-077 Phase 2 read-model work lands,
and before any Settings/companion memory sync work begins.

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

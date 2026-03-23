# SPEC-031: Built-In Memory Extraction, Durable Sync, and Retrieval Context

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Pending Review) |
| **Owner** | Codex |
| **Reviewer** | User / memory workstream |

## Summary

`cats` already owns the canonical product memory boundary, and the first local
memory slice is landed. What remains unclear is how transcript evidence,
companion-box sources, curated notes, and owner-profile signals should promote
into durable memory and then assemble back into retrieval context.

This specification defines the product-owned pipeline for:

- source ingestion
- derived extraction
- durable-memory promotion
- source-scoped replacement and deletion
- retrieval-context assembly for companion, orchestrator, and future shared
  product flows

The goal is not to bolt `cats` onto an external RAG service. The goal is to
make Cats-owned memory strong enough that later archive/vector systems become
downstream accelerators rather than the canonical source of truth.

## Context

`SPEC-022` already defines the layered memory model and ownership split:

- provider/runtime continuity is auxiliary
- evidence transcripts are mandatory
- durable product memory is canonical
- archive/vector retrieval is downstream

`SPEC-029` already defines `CompanionBox` as product-owned storage for per-Cat
sources, derived records, durable memory, and response profiles.

What is still missing is the concrete promotion and retrieval contract that a
memory workstream can implement without guessing:

- what gets extracted from which sources
- what becomes durable memory versus remaining derived evidence
- how replacement and delete behavior keep retrieval honest
- how retrieval payloads are assembled for runtime hydration and future
  orchestration

## Goals

- define a Cats-owned extraction and durable-sync pipeline
- make retrieval-context assembly explicit and machine-readable
- support companion, owner-profile, channel, relationship, and project memory
  scopes without forcing all of them into one flat corpus
- preserve source lineage so durable-memory updates and deletes remove stale
  retrieval hits
- provide a stable pre-reset/pre-compaction flush payload that later runtime
  maintenance flows can call

## Non-Goals

- choosing a long-term vector database vendor
- shipping a visible memory debugger or inspector UI in this spec
- defining every extraction prompt in final wording
- turning `cats` into a networked RAG microservice
- replacing transcript backup with summary-only memory

## User Stories

- As a companion owner, I want uploaded notes, chat logs, and media-derived
  observations to become durable memory for the right Cat.
- As a Boss Cat operator, I want the system to recall owner preferences,
  working context, and known facts without replaying entire transcripts.
- As a maintainer, I want memory deletes and updates to stop stale facts from
  surfacing in retrieval.
- As a runtime maintainer, I want a product-owned memory flush payload that can
  run before reset, compaction, or worktree discard.

## Requirements

### Functional Requirements

1. `cats` shall own the canonical extraction and durable-sync pipeline for
   companion, owner, and channel memory.
2. The pipeline shall support promotion from these source classes at minimum:
   - transcript evidence
   - companion-box notes
   - companion-box conversation logs
   - companion-box article imports
   - companion-box media-derived records
   - curated owner notes
3. The pipeline shall distinguish between:
   - raw source records
   - derived records
   - durable-memory records
   - retrieval-context payloads
4. Durable-memory promotion shall preserve lineage to the source or derived
   records that justified it.
5. Update and delete behavior shall be source-scoped and replacement-aware so
   stale durable-memory items stop appearing in retrieval after source changes.
6. The pipeline shall support at least these memory scopes:
   - `cat`
   - `owner`
   - `channel`
   - `relationship`
   - `project` (reserved first slice even if sparsely populated)
7. The pipeline shall support scope-aware privacy controls so owner-private
   memory does not automatically hydrate shared or transport-facing sessions.
8. The system shall provide a deterministic retrieval-context assembly
   operation that can take:
   - target Cat identity
   - channel/session metadata
   - owner/profile metadata
   - optional orchestration intent or execution goal
9. Retrieval-context assembly shall be able to return:
   - selected durable-memory items
   - supporting evidence references
   - scope and policy annotations
   - selection/exclusion reasons
10. The first slice shall support lexical and structured retrieval without
    requiring a vector backend.
11. The design shall leave room for later archive/vector augmentation without
    changing Cats-owned canonical record ownership.
12. The system shall provide a machine-readable memory-flush payload suitable
    for runtime maintenance hooks before reset, delete, worktree discard, or
    later compaction flows.
13. Memory flush shall be additive and best-effort; runtime maintenance must
    still succeed when no memory delta is produced.
14. Retrieval-context assembly shall not assume a visible product UI; it must
    be usable from companion hydration, orchestrator planning, and later Work
    flows.

### Non-Functional Requirements

- **Canonical ownership**: durable-memory truth remains inside `cats`
- **Traceability**: every durable-memory item should retain source lineage
- **Replaceability**: archive/vector backends may augment retrieval, but not
  redefine canonical memory ownership
- **Scope safety**: retrieval decisions must remain policy-aware
- **Interoperability**: flush and retrieval payloads must be consumable by
  runtime maintenance and future orchestration seams

## Conceptual Model

```text
source record
   |
   v
derived extraction
   |
   +--> working/diagnostic only
   |
   +--> durable-memory promotion
           |
           v
     canonical durable records
           |
           v
   retrieval-context assembly
```

## Canonical Record Families

### Source Records

The first slice should keep source records close to their origin and preserve
storage-mode details such as uploaded copy, imported copy, or linked path.

Examples:

- companion text note
- external conversation log
- imported article
- media item plus extracted metadata
- curated owner note
- transcript slice

### Derived Records

Derived records are intermediate structured outputs extracted from one or more
sources.

Examples:

- candidate traits
- factual claims
- event summaries
- owner preference candidates
- relationship cues
- media captions/transcripts/tags

Derived records may remain transient or diagnostic if they are not promoted.

### Durable-Memory Records

Durable-memory records are the canonical long-lived memory objects used for
cross-session recall.

Illustrative families:

- `cat_fact`
- `owner_preference`
- `relationship_fact`
- `channel_context_note`
- `project_fact`
- `operating_heuristic`

Each durable-memory record should carry:

- stable id
- scope
- owning subject (`catId`, `owner`, `channelId`, etc.)
- summary/content
- supporting-source references
- provenance timestamps
- confidence or curation metadata
- replacement group or source lineage token

## Promotion Rules

The first slice should explicitly support three outcomes from extraction:

1. **discard**
   - insufficient confidence or relevance
2. **derived-only**
   - useful for later inspection or reprocessing, but not stable enough for
     durable recall
3. **promote-to-durable**
   - worthy of canonical long-lived memory

Promotion should prefer:

- curated owner notes
- curated companion notes
- repeated or corroborated transcript signals
- stable preference/fact patterns

Promotion should be conservative for:

- one-off speculative guesses
- ambiguous emotional inferences
- noisy media-only guesses with weak support

## Durable Sync and Replacement

Durable-memory sync must be source-aware.

When a source is updated or deleted:

- the system shall locate durable-memory items whose lineage depends on that
  source or its derived records
- the system shall either replace, retract, or downgrade those items
- retrieval shall stop surfacing stale items after the sync completes

The key requirement is:

- **source updates must converge retrieval output**

not merely append more records forever.

## Retrieval-Context Assembly

Retrieval-context assembly should return a machine-readable payload that later
hydration and orchestration layers can consume without scraping prose.

Illustrative shape:

```ts
interface RetrievalContext {
  scope: {
    catId?: string;
    owner?: boolean;
    channelId?: string;
    relationshipIds?: string[];
    projectIds?: string[];
  };
  selectedMemories: MemoryRecordRef[];
  supportingEvidence?: EvidenceRef[];
  excludedMemories?: Array<{
    id: string;
    reason: string;
  }>;
  policy: {
    visibility: 'owner_private' | 'channel_private' | 'shared_room' | 'transport';
  };
}
```

The exact wire shape may change, but the first slice should preserve:

- selection reasons
- scope metadata
- policy annotations
- durable-memory references separate from supporting evidence

## Runtime Maintenance Hook

`cats` should expose a product-owned memory-flush seam for runtime maintenance.

That seam should be able to produce a payload from:

- pending transcript deltas
- companion-box updates
- owner-note changes
- channel working-memory changes

Typical callers include:

- session reset
- worktree discard
- delete session/channel flows
- future compaction boundaries

This spec does not require runtime to understand memory internals. Runtime only
needs a stable hook and payload contract.

## Dependencies

- [SPEC-022](./SPEC-022-cats-memory-layering-and-ownership.md)
- [SPEC-029](./SPEC-029-companion-boxes-ingestion-and-response-profiles.md)
- [ADR-030](../decisions/030-own-per-cat-companion-boxes-in-product-and-hydrate-runtime-sessions.md)

## Open Questions

- [ ] Which durable-memory families should be curated-only versus
      extraction-promotable in the first slice?
- [ ] Should relationship and project memory ship as empty-first-class scopes
      now, or remain reserved schema only until Work uses them?
- [ ] When archive/vector augmentation arrives, should lexical-first retrieval
      remain the deterministic fallback path for maintenance hooks?

## References

- [SPEC-022: Cats Memory Layering and Ownership](./SPEC-022-cats-memory-layering-and-ownership.md)
- [SPEC-029: Companion Boxes, Ingestion, and Response Profiles](./SPEC-029-companion-boxes-ingestion-and-response-profiles.md)
- [OpenClaw memory benchmark](../research/2026-03-19-openclaw-memory-layering-benchmark.md)
- [OpenClaw chat/runtime gap analysis](../research/2026-03-20-openclaw-chat-runtime-gap-analysis.md)

---

*Created: 2026-03-24*
*Author: Codex*

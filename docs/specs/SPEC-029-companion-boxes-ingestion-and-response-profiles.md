# SPEC-029: Companion Boxes, Ingestion, and Response Profiles

> Make each `My Cats` entry feel like a per-Cat Pandora box by introducing a
> product-owned companion box, structured ingestion, per-Cat response modes,
> and runtime session hydration for companion conversations.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress (First Slice Landed) |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

`cats` already supports direct Cat chat and a runtime-hosted `companion`
skill. That is a useful base, but it is not yet enough to make `My Cats` feel
like a real per-Cat companion surface.

The intended product experience is stronger:

- each Cat should be able to accumulate owner-provided materials
- those materials may be uploaded files, linked filesystem paths, text notes,
  conversation logs, and articles
- the product should preserve both raw source material and structured derived
  knowledge
- each Cat should be able to respond through a configurable companion style
  rather than one fixed text-only behavior

This spec introduces a product-owned `CompanionBox` concept that sits above
`cats-runtime`.

The runtime still hosts the reusable `companion` skill, but the per-Cat box,
response profile, and long-lived companion context remain product-owned.

## Implementation Snapshot

The current first slice now lands these product-owned seams:

- a Cat-scoped sidecar store under `src/products/chat/state/companion-box/index.ts`
- Cat-scoped source ingest/read, derived read, memory read/write,
  response-profile read/update, and session-context read APIs
- additive direct-session hydration through normalized `companionSession`
  metadata on runtime create/send calls
- Cats-owned canonical-memory flush and retrieval-context seams under
  `src/platform/memory/*` and `src/products/chat/api/memory/index.ts`

Visible companion-specific UI remains intentionally deferred.

## Goals

- make each `My Cats` entry capable of owning a persistent companion box
- support ingestion of multimodal and text-based source material per Cat
- keep raw sources, derived knowledge, durable memory, and response settings as
  distinct product-owned layers
- hydrate direct companion sessions from product-owned companion context rather
  than from one giant prompt block
- preserve the `cats -> cats-runtime` boundary while still reusing the runtime
  `companion` skill

## Non-Goals

- shipping the full visible companion UI in this slice
- choosing the final image/video/audio analysis providers in this spec
- implementing a full vector/RAG memory engine in the first slice
- making `cats-runtime` the owner of long-lived per-Cat companion storage
- finalizing the full TTS or audio-clip generation stack in the first slice

## User Stories

- As an owner, I want each Cat to accumulate photos, videos, music, articles,
  logs, and notes that describe that Cat or matter to that Cat's identity.
- As an owner, I want a Cat's direct chat to feel informed by that Cat's own
  box rather than by a generic shared companion prompt.
- As an operator, I want the system to preserve raw companion inputs while also
  deriving more usable summaries, traits, and memories from them.
- As a runtime integrator, I want the runtime to receive a normalized
  companion-session context without becoming the long-term owner of the box.

## Requirements

### Functional Requirements

#### Companion box ownership

1. `cats` shall introduce a product-owned `CompanionBox` per Cat.
2. A `CompanionBox` shall remain distinct from runtime session state,
   provider-native continuity, and temporary session sandboxes.
3. `cats-runtime` shall not be treated as the canonical long-term store for a
   Cat's companion box.

#### Companion box layers

4. A `CompanionBox` shall support at least these logically distinct layers:
   - `sources`
   - `derived`
   - `memory`
   - `responseProfile`
5. `sources` shall represent raw owner-provided or referenced material.
6. `derived` shall represent product-owned extracted metadata, summaries,
   transcripts, tags, or traits derived from sources.
7. `memory` shall represent more durable companion-facing knowledge that is
   intentionally preserved across sessions.
8. `responseProfile` shall represent how that Cat prefers to respond in
   companion mode.

#### Source ingestion

9. The companion box shall support at least these source kinds:
   - `note`
   - `conversation_log`
   - `article`
   - `image`
   - `video`
   - `audio`
   - `path_ref`
10. A source record shall retain provenance metadata, including at least:
    - source kind
    - creation time
    - owner-supplied title or note when available
    - storage mode
    - original or linked path metadata when applicable
11. The product shall support at least these storage modes for source material:
    - `uploaded_copy`
    - `imported_copy`
    - `linked_path`
12. `linked_path` shall not require that the product duplicate the referenced
    filesystem content immediately.
13. The product shall preserve enough metadata to explain whether a source is a
    copied file, an imported file, or a linked path reference.

#### Derived records and durable memory

14. The product shall support derived records produced from one or more
    companion sources.
15. Derived records should be able to represent at least:
    - summaries
    - transcripts
    - captions or media descriptions
    - tags
    - traits
    - events
    - relationship notes
    - owner notes normalized from free text
16. Durable companion memory shall remain distinct from raw source records and
    from purely mechanical derived metadata.
17. Durable companion memory should support correction, replacement, or manual
    curation without requiring raw sources to be deleted.

#### Response profile

18. Each Cat shall be able to retain a per-Cat `CompanionResponseProfile`.
19. The response profile shall distinguish how the Cat expresses itself from
    how output is delivered.
20. The first product-owned response-profile contract shall support at least:
    - `expressionMode`
      - `animalistic`
      - `anthropomorphic`
      - `mixed`
    - `outputMode`
      - `text`
      - `audio_clip`
      - `tts`
      - `mixed`
21. The first slice may deliver some response modes as metadata or placeholders
    before every output mode is fully executable.

#### Runtime integration

22. Direct companion conversations shall resolve to a product-owned
    `CompanionSessionContext` before runtime session creation, wake, or resume.
23. `CompanionSessionContext` shall be allowed to include at least:
    - requested runtime skills
    - selected source references
    - selected derived records
    - selected durable memory items
    - response profile
    - owner-facing notes or constraints for the current session
    - additive retrieval context assembled inside `cats`
24. The reusable runtime `companion` skill shall remain a shared skill package,
    not a per-Cat data store.
25. The product shall request the runtime `companion` skill by stable
    runtime-facing identity rather than by Cat-local filesystem path.
26. Session sandboxes or working directories may receive copied companion
    material when needed for execution, but those locations shall not become
    the canonical long-term source of truth.

#### API direction

27. The first product API slice should support a Cat-scoped ingestion route
    such as:
    - `POST /api/cats/{catId}/companion-box/sources`
28. The first product API slice should support Cat-scoped reads for:
    - companion box summary
    - source records
    - derived records
    - durable memory records
    - response profile
    - session context preview
29. The product may expose additive Cats-owned canonical-memory flush and
    retrieval-preview routes for cat, owner, and channel scope as long as the
    companion box remains product-owned.
30. The first product API slice may ingest binary media through uploaded-copy
    routes and text/log/article payloads through JSON bodies, as long as the
    resulting records converge on one companion-box schema.

#### Privacy and scope

30. Companion-box memory shall be scope-aware and product-owned.
31. The system shall preserve room- and transport-aware privacy rules so
    companion information that is safe in a private direct chat does not
    silently leak into other rooms or public transports.

### Non-Functional Requirements

- **Boundary integrity**: `cats` owns the per-Cat companion box and response
  semantics; `cats-runtime` owns execution-time skill delivery and session
  execution.
- **Auditability**: raw sources and derived memory should remain inspectable and
  distinguishable.
- **Portability**: the companion box should survive runtime/provider swaps.
- **Extensibility**: richer media analysis, semantic retrieval, and audio
  output should be addable without redefining the box model.
- **Privacy**: companion memory recall must be scope-aware and Cat-aware.

## Conceptual Model

### Product-Owned Records

- `CompanionBoxRecord`
  - one per Cat
- `CompanionSourceRecord`
  - raw input or referenced source
- `CompanionDerivedRecord`
  - extracted/transformed knowledge
- `CompanionMemoryRecord`
  - durable curated memory
- `CompanionResponseProfile`
  - expression/output defaults for that Cat
- `CompanionSessionContext`
  - the current session hydration payload

## Illustrative Product Shapes

```ts
type CompanionSourceKind =
  | 'note'
  | 'conversation_log'
  | 'article'
  | 'image'
  | 'video'
  | 'audio'
  | 'path_ref';

type CompanionSourceStorageMode =
  | 'uploaded_copy'
  | 'imported_copy'
  | 'linked_path';

type CompanionExpressionMode =
  | 'animalistic'
  | 'anthropomorphic'
  | 'mixed';

type CompanionOutputMode =
  | 'text'
  | 'audio_clip'
  | 'tts'
  | 'mixed';

interface CompanionResponseProfile {
  expressionMode: CompanionExpressionMode;
  outputMode: CompanionOutputMode;
  voiceProfileId?: string | null;
  notes?: string | null;
}

interface CompanionSourceRecord {
  id: string;
  catId: string;
  kind: CompanionSourceKind;
  storageMode: CompanionSourceStorageMode;
  title?: string | null;
  summary?: string | null;
  linkedPath?: string | null;
  storedPath?: string | null;
  mimeType?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface CompanionSessionContext {
  catId: string;
  boxId: string;
  hydratedAt: string;
  requestedSkills: string[];
  sourceIds: string[];
  derivedIds: string[];
  memoryIds: string[];
  responseProfile: CompanionResponseProfile;
  ownerNotes: string[];
  constraints: string[];
  retrieval?: {
    query: string;
    hits: Array<{
      recordId: string;
      score: number;
    }>;
    facts: string[];
    ownerProfileHints: string[];
    openLoops: string[];
  } | null;
}
```

## Design Overview

```text
owner input
  (upload / linked path / article / log / note)
        |
        v
product ingestion route
        |
        v
CompanionBox
  ├─ sources
  ├─ derived
  ├─ memory
  └─ responseProfile
        |
        v
direct companion chat starts or wakes
        |
        v
CompanionSessionContext
        |
        v
runtime skill manifest
  + companion context
        |
        v
cats-runtime session execution
```

## Dependencies

- [ADR-017](../decisions/017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
- [ADR-018](../decisions/018-separate-product-skill-intent-from-runtime-skill-hosting.md)
- [ADR-030](../decisions/030-own-per-cat-companion-boxes-in-product-and-hydrate-runtime-sessions.md)
- [SPEC-015](./SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md)
- [SPEC-018](./SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [SPEC-019](./SPEC-019-product-skill-profiles-and-runtime-skill-manifests.md)
- [SPEC-022](./SPEC-022-cats-memory-layering-and-ownership.md)
- [cats-runtime SPEC-005](../../../cats-runtime/docs/specs/SPEC-005-runtime-managed-skills-v0.md)

## Open Questions

- [x] Should the first slice store companion-box records inside the shared core
      store, a Cat-scoped sidecar store, or a hybrid projection?
      Answer: the first slice now uses a Cat-scoped sidecar store and keeps
      companion data outside shared core.
- [ ] Which derived-record types should be first-class in the first slice:
      transcripts/captions only, or also traits/events/relationship notes?
- [ ] Should `audio_clip` responses be modeled first as static asset selection,
      or wait until a broader media-output pipeline exists?
- [ ] Should linked paths support one-time scan/import only, or later optional
      watch/reconcile behavior?

## References

- [Architecture](../architecture.md)
- [terminology.md](../terminology.md)
- [pandora-box README](../../../pandora-box/README.md)

---

*Created: 2026-03-23*
*Author: Codex*
*Related Plan: [PLAN-019](../plans/PLAN-019-companion-box-sidecar-and-session-hydration.md)*

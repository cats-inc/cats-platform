# SPEC-022: Cats Memory Layering and Ownership

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Pending Review) |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

The Cats suite needs a memory architecture that spans both `cats` and
`cats-runtime` without confusing provider-native continuity, product transcript
backup, cross-session Cat memory, and future archive/RAG retrieval.

This specification defines a Cats-specific multi-layer memory model, benchmarked
against OpenClaw's layered separation of transcript persistence, compaction,
durable memory files, and retrieval.

The key rule is:

- provider-native or agent-native transcript/session state is useful
- runtime-normalized evidence transcripts are mandatory
- product-owned durable memory is the canonical cross-session memory layer
- archive/RAG corpora are downstream retrieval projections, not the live source
  of truth

## Goals

- define a suite-wide memory layering model for `cats` and `cats-runtime`
- preserve full chat/session backups independent of any one agent backend
- let the same Cat keep memory across sessions, channels, and provider changes
- prepare `Cats Work` for all-session archive search and RAG without coupling
  live product behavior directly to vector storage
- clarify when provider-native transcripts should be trusted and when they are
  only auxiliary continuity

## Non-Goals

- implementing the full storage engine in this spec
- choosing one final database vendor for all phases
- replacing provider-native thread/session support where it is beneficial
- designing the full `Cats Work` search UI
- defining every ingestion prompt or summarization template in detail

## User Stories

- As a product operator, I want every chat and worker interaction backed up even
  if the underlying agent runtime changes.
- As a Cat designer, I want one Cat to retain memory across many sessions
  without being tied to one provider's thread model.
- As a future `Cats Work` user, I want historical sessions and artifacts to be
  searchable through archive/RAG services.
- As a runtime maintainer, I want provider-native session continuity to remain
  useful without making it the only source of truth.
- As a reviewer, I want a clear answer to whether agent-native transcripts are
  canonical, auxiliary, or disposable.

## Requirements

### Functional Requirements

1. The Cats suite shall treat memory as a multi-layer system rather than one
   transcript store.
2. `cats` shall own canonical product transcript backup for user-visible and
   transport-visible conversations.
3. `cats-runtime` shall emit or persist normalized runtime evidence for session
   execution, including turn events, tool activity, artifacts, and provider
   continuity metadata.
4. The system shall preserve full session/chat backups independent of
   provider-native or agent-native transcript stores.
5. The system shall support Cat-scoped durable memory that persists across many
   sessions and remains portable across providers.
6. The system shall support channel/session-scoped working memory that can be
   refreshed from evidence transcripts and product state.
7. The system shall support an asynchronous archive projection for future
   all-session search and RAG.
8. Archive/RAG ingestion shall read from Cats-owned transcript and memory
   projections rather than directly from provider-native transcript files.
9. Provider-native transcript/session state shall be treated as an auxiliary
   continuity layer unless explicitly promoted into a Cats-owned projection.
10. The system shall support privacy and scope controls so memory that is safe
    for a direct owner chat does not automatically leak into shared rooms,
    external inboxes, or specialist sessions.
11. Sleep/wake, handoff, and session-close flows shall produce explicit memory
    checkpoints rather than relying on raw transcript replay alone.
12. The system shall keep owner-profile memory, Cat memory, and archive
    retrieval logically distinct even when they share lower-level storage.

### Non-Functional Requirements

- **Boundary integrity**: `cats` remains the product owner of durable memory
  semantics; `cats-runtime` remains the runtime boundary for execution.
- **Portability**: long-lived Cat memory must survive provider swaps.
- **Auditability**: evidence transcripts must preserve enough detail for replay,
  debugging, and export.
- **Layer clarity**: retrieval corpora must not silently become the canonical
  live-memory source.
- **Privacy**: recall policies must be scope-aware and transport-aware.

## Memory Layers

### Layer 0: Provider-native continuity

Examples:
- OpenClaw `sessionKey` / gateway session state
- provider thread ids
- model/provider compaction state
- agent-native transcript files

Purpose:
- preserve backend-specific resume semantics
- optimize continuity where transcript replay is insufficient

Ownership:
- runtime/backend-owned

Rule:
- **auxiliary continuity only**
- may be imported, mirrored, or referenced
- must not be the sole durable record of a Cats conversation

### Layer 1: Evidence transcript

Examples:
- normalized turn log
- ingress and egress transport events
- worker trace events
- tool calls/results
- artifacts and output references
- provider metadata snapshots
- compaction/checkpoint records

Purpose:
- canonical backup, audit, replay, and reprocessing surface

Ownership:
- product-visible conversation backup is Cats-owned
- runtime execution evidence is emitted by `cats-runtime` and stored in
  Cats-owned session history surfaces

Rule:
- append-first, immutable-by-default, exportable

### Layer 2: Session/channel working memory

Examples:
- current room summary
- open tasks and decisions
- sleep snapshot
- wake bootstrap bundle
- current participants and responsibilities
- unresolved questions

Purpose:
- reduce prompt bloat and support efficient session continuation

Ownership:
- product-owned derived state with runtime inputs

Rule:
- mutable and refreshable from evidence + domain state
- optimized for live operation, not final audit

### Layer 3: Durable Cat and owner memory

Examples:
- Cat profile memory
- owner tone and preference memory
- relationship and project facts
- escalation thresholds
- decision-style notes
- reusable operating heuristics

Purpose:
- preserve cross-session, cross-channel continuity that belongs to the Cats
  system itself

Ownership:
- product-owned structured memory

Rule:
- curated, versioned, and policy-aware
- should not be overwritten blindly by every transcript summary

### Layer 4: Archive and retrieval memory

Examples:
- `Cats Work` historical search corpus
- vector index over archived transcripts and artifacts
- keyword index over tasks, approvals, and reports
- long-horizon recall collections

Purpose:
- support later search, retrieval, analytics, and RAG

Ownership:
- archive subsystem fed from Cats-owned exports/projections

Rule:
- asynchronous downstream projection
- useful for recall, never the only source of product truth

## Source-of-Truth Model

| Concern | Canonical Owner | Supporting Layers |
|---------|-----------------|-------------------|
| Live runtime continuity | Provider/runtime session state | evidence transcript, working memory |
| Product chat backup | evidence transcript | provider-native continuity |
| Cat cross-session memory | durable Cat memory | session/channel working memory, archive recall |
| Owner profile and preferences | durable owner memory | archive recall, selected session evidence |
| Historical search / RAG | archive projection | evidence transcript, durable memory |

## Recommended Flow

```text
User / transport message
        |
        v
cats conversation + routing layer
        |
        v
cats-runtime session execution
        |
        +--> Layer 0: provider continuity updated
        +--> Layer 1: normalized evidence events emitted
        |
        v
product post-turn pipeline
        |
        +--> Layer 2: working summary refreshed
        +--> Layer 3: durable Cat/owner memory selectively updated
        +--> Layer 4: archive export queued asynchronously
```

## Product/Runtime Boundary

### `cats-runtime` responsibilities

- manage provider-native continuity and session affinity
- emit normalized runtime evidence and artifact metadata
- persist runtime-visible history sufficient for execution debugging and resume
- expose checkpoint-worthy metadata to upstream products
- avoid claiming ownership of long-lived product memory semantics

### `cats` responsibilities

- own product transcript backup across chats, rooms, transports, and worker
  traces
- own Cat-scoped and owner-scoped durable memory models
- own privacy policy and recall scope rules
- decide which memory layers are injected into wake/bootstrap flows
- own archive export policy for `Cats Work` and future RAG/search systems

## Working Rule for Agent-Native Transcripts

Agent-native transcripts should be treated as:

1. **resume aids** when the backend requires them
2. **debug evidence** when they expose provider-native detail
3. **import sources** when Cats needs to mirror or normalize them
4. **never the only durable product memory** for important conversations

In other words: agent-native transcripts are not useless, but for Cats they are
**supporting continuity surfaces**, not the canonical memory model.

## Recommended Data Shapes

Illustrative conceptual model:

```ts
interface EvidenceEvent {
  id: string;
  conversationId: string;
  sessionId: string;
  layer: 'evidence';
  actor: 'owner' | 'cat' | 'worker' | 'system' | 'tool' | 'transport';
  kind: 'message' | 'tool_call' | 'tool_result' | 'artifact' | 'checkpoint' | 'metadata';
  timestamp: string;
  payload: Record<string, unknown>;
}

interface WorkingMemoryCheckpoint {
  id: string;
  conversationId: string;
  sessionId?: string;
  summary: string;
  openQuestions: string[];
  activeTasks: string[];
  generatedAt: string;
}

interface DurableMemoryRecord {
  id: string;
  subjectType: 'cat' | 'owner' | 'relationship' | 'project';
  subjectId: string;
  category: 'preference' | 'fact' | 'policy' | 'style' | 'relationship' | 'lesson';
  content: string;
  confidence?: number;
  sourceRefs: string[];
  updatedAt: string;
}

interface ArchiveExportJob {
  id: string;
  conversationId: string;
  sourceEventIds: string[];
  artifactRefs: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
}
```

## Technology Guidance

The most suitable contemporary technical pattern for Cats is:

1. **append-only evidence storage**
   - JSONL or event-table style logging
   - best for full backup, replay, re-indexing, and audit
2. **structured durable memory storage**
   - relational/document records for Cat, owner, project, and preference memory
   - best for governed long-lived memory that should survive provider changes
3. **hybrid retrieval archive**
   - keyword + vector indexing over exported transcripts and artifacts
   - best for `Cats Work` all-session recall
4. **provider-native continuity cache**
   - keep it when it helps, but do not let it become the only truth

## Dependencies

- [cats Architecture](../architecture.md)
- [cats Requirements](../requirements.md)
- [ADR-007: Establish Cats Core v1 for Chat and Work](../decisions/007-establish-cats-core-v1-for-chat-and-work.md)
- [ADR-008: Expose cats-runtime via direct API and MCP facade](../decisions/008-expose-cats-runtime-via-direct-api-and-mcp-facade.md)
- [cats-runtime Architecture](../../../cats-runtime/docs/architecture.md)
- [cats-runtime ADR-006: Introduce an agent backend and shared runtime contracts](../../../cats-runtime/docs/decisions/006-agent-backend-and-shared-runtime-contracts.md)
- [OpenClaw memory layering benchmark](../research/2026-03-19-openclaw-memory-layering-benchmark.md)

## Open Questions

- [ ] Should durable Cat memory updates be fully automated at turn-end, or gated
      through confidence thresholds and review queues for some categories?
- [ ] Which working-memory checkpoints belong in `cats-runtime` history versus
      only in `cats` product stores?
- [ ] When `Cats Work` launches, should archive retrieval be one shared corpus
      or segmented by chat, transport, or privacy domain?
- [ ] What is the first implementation slice: transcript normalization,
      Cat-memory store, or archive export pipeline?

## References

- [OpenClaw memory](https://docs.openclaw.ai/concepts/memory)
- [OpenClaw compaction](https://docs.openclaw.ai/concepts/compaction)
- [OpenClaw session management deep dive](https://docs.openclaw.ai/reference/session-management-compaction)
- [OpenClaw hooks](https://docs.openclaw.ai/automation/hooks)

---

*Created: 2026-03-19*
*Author: Codex*

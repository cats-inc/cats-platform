# OpenClaw Memory Layering Benchmark

Date: 2026-03-19
Topic: OpenClaw memory layering, transcript ownership, and session compaction patterns
Source:
- https://docs.openclaw.ai/concepts/memory
- https://docs.openclaw.ai/concepts/compaction
- https://docs.openclaw.ai/reference/session-management-compaction
- https://docs.openclaw.ai/automation/hooks
- https://docs.openclaw.ai/reference/templates/AGENTS
Summary:
- OpenClaw separates several concerns that are often mixed together in agent products:
  - provider/session transcript persistence (`*.jsonl`) owned by the gateway session system
  - compacted session summaries persisted back into transcript history
  - file-based durable memory (`MEMORY.md`, `memory/YYYY-MM-DD.md`)
  - optional semantic recall over durable memory and sanitized session exports through QMD
  - hook-driven memory flushes before `/new` or compaction boundaries
- This is a strong reference pattern because it avoids treating one transcript as the only memory surface.
- OpenClaw still centers the gateway-owned session model. That is correct for a runtime, but it is not enough for the Cats suite because `cats-inc` must also preserve product-level channel transcripts, cross-session Cat memory, external transport archives, and future `Cats Work` RAG corpora.
Relevance:
- The Cats suite needs a memory model that spans both `cats-inc` and `cats-runtime`.
- The design should borrow OpenClaw's layered separation, but move canonical ownership of user/product memory into Cats-owned stores rather than leaving it inside any single provider or runtime transcript.
Action Items:
- Define a Cats memory architecture spec that separates evidence transcripts, derived memory, and retrieval corpora.
- Record a runtime ADR that treats provider-native transcript/session state as auxiliary continuity rather than the only source of truth.

## Key Takeaways from OpenClaw

### 1. Transcript persistence is not the same thing as memory

OpenClaw persists session history in JSONL and also persists compaction summaries
inside that history. This is useful for continuity and replay, but it does not
replace durable memory files or semantic retrieval.

**Cats implication**: `cats-runtime` should preserve normalized evidence
transcripts, but `cats-inc` should own the durable product memory models that
survive backend swaps, transport changes, and session resets.

### 2. Durable memory should be explicitly written, not assumed to exist in context

OpenClaw's guidance around `MEMORY.md` and daily memory files is blunt and
correct: if something matters across sessions, write it to a durable memory
surface instead of assuming the model will keep it.

**Cats implication**: cross-session Cat memory, owner preferences, channel
handoff notes, and operational checkpoints must be written into explicit
Cats-owned stores. They should not live only in provider-native threads,
OpenClaw session JSONL, or prompt summaries.

### 3. Compaction is a working-memory optimization, not long-term memory

OpenClaw auto-compacts older context into summary entries when context windows
fill up. That helps keep a live session usable, but it remains session-scoped.

**Cats implication**: we should distinguish:
- working-memory compaction for live sessions
- durable cross-session memory for a Cat or owner
- archive/RAG ingestion for later recall across many sessions

### 4. Retrieval should be fed from sanitized, intentionally exported material

OpenClaw can export sanitized session transcripts into a separate QMD-backed
collection so semantic recall does not have to read directly from the internal
session index.

**Cats implication**: `Cats Work` RAG should be built from a dedicated archive
projection of transcripts and artifacts, not by querying raw provider-native
session stores directly.

### 5. Hooks or background jobs should flush memory before session resets

OpenClaw uses hooks such as `session-memory` and can perform pre-compaction
memory flushes.

**Cats implication**: Cats needs explicit lifecycle jobs for:
- end-of-turn session snapshots
- sleep/wake checkpoints
- channel handoff summaries
- archive export after session close or inactivity

## Where Cats Must Go Further than OpenClaw

OpenClaw primarily solves runtime- and agent-workspace-centric continuity. The
Cats suite has broader product obligations:

1. **Full product transcript backup**
   - We need complete chat/session backup independent of whichever agent backend
     is currently executing.
   - This includes web rooms, future Telegram/LINE inboxes, direct Cat chats,
     and worker traces.

2. **Cross-session Cat memory**
   - The same Cat must preserve stable memory across many sessions and possibly
     across provider changes.
   - This memory needs stronger structure than a raw transcript.

3. **Whole-product archive retrieval**
   - `Cats Work` will need search and RAG across many sessions, artifacts,
     approvals, and tasks.
   - This should be an archive/retrieval layer, not the live runtime store.

4. **Owner-profile and policy memory**
   - The system must remember owner preferences, escalation thresholds, and
     decision style in a structured and governable way.

5. **Transport-aware privacy boundaries**
   - Some memory should be safe for one-on-one product chat, while other memory
     must not leak into shared rooms or external transport replies.

## Recommended Cats Layering Pattern

### L0. Provider-native continuity layer

Examples:
- OpenClaw `sessionKey` / remote session state
- provider thread ids
- runtime-managed compaction state
- agent-native transcript files

Role:
- optimize resume and local working continuity
- preserve provider-specific semantics the runtime cannot fully reconstruct

Rule:
- **auxiliary only** for Cats product memory

### L1. Evidence transcript layer

Examples:
- normalized turn/event log
- transport ingress/egress events
- tool calls and artifacts
- worker trace references
- compaction snapshots and runtime metadata

Role:
- canonical audit, replay, backup, and export surface

Owner:
- `cats-inc` owns product transcript semantics
- `cats-runtime` emits normalized runtime evidence for session execution

### L2. Session and channel working-memory layer

Examples:
- rolling room summary
- unresolved questions
- active tasks and approvals
- sleep/wake checkpoint
- current handoff bundle

Role:
- keep live interactions efficient without reloading whole transcripts

Rule:
- mutable and refreshable; derived from evidence transcripts plus product state

### L3. Cat and owner durable memory layer

Examples:
- Cat profile memory
- owner preferences and tone
- stable relationship facts
- long-lived project context
- escalation preferences

Role:
- cross-session continuity that belongs to Cats, not to a provider

Rule:
- structured, curated, versioned, and policy-aware

### L4. Archive and retrieval layer

Examples:
- search indexes
- vector collections
- keyword corpora
- artifact metadata projections
- `Cats Work` historical memory

Role:
- recall across all sessions, channels, artifacts, and work items

Rule:
- populated asynchronously from evidence + durable-memory projections

## Recommended Technology Shape for Cats

### Near-term local-first stack

- **Evidence log**: append-only JSONL or relational event table plus filesystem
  artifact storage
- **Working summaries + durable memory**: relational tables/document records in
  the product store
- **Archive retrieval**: hybrid keyword + vector indexing, populated
  asynchronously

### Why this mix is the best fit

- raw transcripts are best for audit and reprocessing
- structured stores are best for durable identity and preference memory
- hybrid retrieval is best for broad archive recall
- provider-native transcripts remain useful, but only as resume hints and
  backend-specific continuity caches

## Recommendation

The Cats suite should adopt OpenClaw's separation instinct, but not its exact
ownership model.

- `cats-runtime` should keep provider-native continuity and normalized runtime
  transcript evidence.
- `cats-inc` should own the canonical multi-layer product memory system.
- Future archive/RAG flows should ingest from Cats-owned transcript and memory
  projections, not directly from provider-native transcript stores.
- Agent/provider transcripts should be treated as **supporting continuity
  surfaces**, not the only durable memory of the product.

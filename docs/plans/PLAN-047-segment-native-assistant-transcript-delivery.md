# PLAN-047: Segment-Native Assistant Transcript Delivery

> Replace the flattened single-response assistant model with a segment-native
> assistant-turn architecture across runtime delivery, persistence, workflow,
> and transcript rendering.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

- [SPEC-056: Segment-Native Assistant Transcript Delivery](../specs/SPEC-056-segment-native-assistant-transcript-delivery.md)
- [ADR-057: Adopt Segment-Native Assistant Transcript Delivery](../decisions/057-adopt-segment-native-assistant-transcript-delivery.md)

## Overview

This plan treats the current single-bubble assistant architecture as a root
design flaw, not as a renderer bug.

The implementation will:

- stop flattening runtime output into one `content` string
- replace singular-response persistence with segment-aware assistant turns
- make routing/recovery depend on canonical turn aggregates
- make live and durable transcript share one segment model
- remove compatibility aliases for `previewText`-first rendering and singular
  `runtime_response` assumptions

## Implementation Phases

### Phase 1: Redesign the Runtime-to-Product Contract

- [ ] Task 1.1: Replace flattened `RuntimeMessageResult.content`-centric
      delivery with a segment-aware contract that exposes ordered assistant
      turn events plus final usage/completion metadata.
- [ ] Task 1.2: Retire the client-side NDJSON concatenation path that rebuilds
      one assistant response string from all text events.
- [ ] Task 1.3: Define the canonical segment/turn aggregate shape used by Chat
      state and renderer code.
- [ ] Task 1.4: Confirm `cats-runtime` emits the necessary text/tool/status
      segment boundaries for all supported providers; tighten runtime projection
      where the current stream is insufficient.

**Deliverables**: one canonical segment-native runtime delivery model with no
flattened-response fallback as the primary path

### Phase 2: Replace Singular Dispatch/Workflow Response Semantics

- [ ] Task 2.1: Change chat dispatch execution state so one dispatch can own
      multiple persisted assistant response messages.
- [ ] Task 2.2: Replace singular `responseMessageId` contracts in routing and
      workflow state with segment-aware response identity.
- [ ] Task 2.3: Introduce or derive a canonical full-turn aggregate text used
      by continuation routing, recommendation parsing, and mention parsing.
- [ ] Task 2.4: Rewrite repair/recovery/startup logic to reconstruct segment
      turns without relying on one final `runtime_response`.
- [ ] Task 2.5: Remove obsolete compatibility helpers and type shapes tied to
      the singular-response model.

**Deliverables**: segment-aware dispatch/workflow state and recovery logic with
no singular-response canonical path

### Phase 3: Persist Assistant Segments Truthfully

- [ ] Task 3.1: Persist assistant text segments incrementally as multiple chat
      messages within the same turn.
- [ ] Task 3.2: Decide and implement the durable treatment for tool/status
      segments so segment order remains truthful.
- [ ] Task 3.3: Publish `room_updated` / transcript invalidation after each
      persisted segment, not only at final completion.
- [ ] Task 3.4: Ensure app-shell/read-model refresh paths do not collapse or
      drop intermediate segments.

**Deliverables**: durable multi-segment assistant turns visible without manual
refresh

### Phase 4: Rebuild Live Transcript Rendering on the Same Model

- [ ] Task 4.1: Replace `previewText`-first simplified rendering with
      segment/content-block-driven rendering in Chat transcript surfaces.
- [ ] Task 4.2: Keep assistant-owned dots/tool waits between same-speaker text
      segments at the correct insertion point.
- [ ] Task 4.3: Make `Show live progress details` control extra detail density
      only; segmentation must remain visible in both settings states.
- [ ] Task 4.4: Remove obsolete renderer branches and helpers that only exist
      for the flattened-response model.

**Deliverables**: live transcript that shows real segment cadence instead of a
single synthetic assistant bubble

### Phase 5: Verification and Migration

- [ ] Task 5.1: Add unit/integration coverage for single-assistant
      `text -> tool wait -> text` turns.
- [ ] Task 5.2: Add regression coverage proving persisted transcript contains
      multiple assistant messages for one turn where appropriate.
- [ ] Task 5.3: Add routing/recovery tests proving continuation logic still
      consumes the full assistant turn correctly.
- [ ] Task 5.4: Add migration/repair coverage for older rooms or snapshots, if
      migration is required.
- [ ] Task 5.5: Manually smoke-check solo, direct, group sequential, and group
      concurrent rooms against the new segment-native model.

**Deliverables**: validated segment-native assistant delivery with no reliance
on legacy single-response semantics

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/runtime/client.ts` | Modify | Replace flattened send-message contract with a segment-aware one |
| `src/runtime/clientStreams.ts` | Modify | Stop concatenating NDJSON text into one final response string |
| `src/shared/liveIndicator.ts` | Modify | Retire `previewText`-centric assumptions and align live state with segment order |
| `src/shared/roomRouting.ts` | Modify | Replace singular response references with segment-aware turn response state |
| `src/products/chat/api/contracts.ts` | Modify | Update chat API contracts for segment-native assistant turns |
| `src/products/chat/state/runtime-dispatch/execution.ts` | Modify | Consume segment-aware runtime delivery and persist segments incrementally |
| `src/products/chat/state/runtime-dispatch/results.ts` | Modify | Finalize dispatches/targets against segment-aware response state |
| `src/products/chat/state/runtime-dispatch/repair.ts` | Modify | Repair and recovery for segment-native turns |
| `src/products/chat/state/runtimeTargeting.ts` | Modify | Remove singular-response assumptions in bootstrap/visibility helpers |
| `src/products/chat/api/resources/channelRoutes.ts` | Modify | Publish updates after each persisted segment |
| `src/products/chat/api/resources/channelRuntimeRoutes.ts` | Modify | Keep stream and persisted updates aligned with segment-native delivery |
| `src/products/chat/renderer/components/chat-view/LiveTranscriptIndicator.tsx` | Modify | Render segment/content-block order directly |
| `src/products/shared/renderer/components/chat-view/ChatTranscriptSurface.tsx` | Modify | Share the same segment-native live rendering model |
| `src/products/shared/renderer/components/chat-view/liveTranscriptIndicatorSupport.ts` | Modify or remove | Retire flattened preview helpers that no longer fit the model |
| `tests/live-indicator.test.tsx` | Modify | Cover segment-native live rendering and assistant-owned waits |
| `tests/chat-view-participants.test.tsx` | Modify | Cover transcript rendering across segment boundaries |
| `tests/chat-view-support.test.tsx` | Modify | Cover user/assistant handoff rules under the new model |
| `tests/server.test.js` | Modify | Cover incremental persistence and room updates per segment |
| `tests/runtime-dispatch-room-routing-merge.test.js` | Modify | Cover segment-aware dispatch/workflow persistence |
| `../cats-runtime/src/http/routes/observe.ts` | Modify (dependency) | Ensure observed stream exposes segment boundaries truthfully |
| `../cats-runtime/src/core/runtime/contentBlocks.ts` | Modify (dependency) | Tighten projection if needed for canonical segment boundaries |

## Technical Decisions

- Decision 1: This work requires an ADR because it intentionally reshapes
  shared chat contracts and retires the old singular-response architecture.
- Decision 2: The correct migration target is one truthful model; do not retain
  long-lived aliases for `runtime_response`, `responseMessageId`, or
  `previewText`-driven rendering.
- Decision 3: Continuation/workflow logic must read canonical turn aggregates,
  not whichever assistant message happened to be appended last.
- Decision 4: Live and durable transcript semantics must converge even if that
  forces store/schema migration work.

## Testing Strategy

- **Unit Tests**: segment projection, turn aggregation, renderer ordering, and
  same-speaker wait-state rules
- **Integration Tests**: incremental persistence, room updates after each
  segment, routing/recommendation parsing from aggregated turn text, and repair
  flows
- **Manual Testing**:
  - solo chat: first segment lands, assistant dots persist between later
    segments, final transcript keeps multiple assistant bubbles
  - direct chat: same behavior without orchestrator leakage
  - group sequential: same-speaker segmentation plus next-speaker handoff
  - group concurrent: multiple active assistant lanes preserve independent
    segment cadence

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Shared contract churn breaks multiple readers at once | High | Land the redesign as one intentional contract migration, with targeted test coverage for every known `runtime_response` reader |
| Continuation parsing changes behavior when the last bubble no longer contains the whole answer | High | Introduce an explicit turn aggregate and point all routing/recommendation parsing at it |
| Migration from older snapshots corrupts existing rooms | High | Add read-time migration/repair tests and make the new model the only post-migration truth |
| Runtime/provider differences produce inconsistent segment boundaries | Medium | Tighten `cats-runtime` projection rules and verify with targeted provider-session probes |
| Renderer and persisted transcript diverge again during rollout | High | Share one segment model and remove flattened preview helpers instead of layering new wrappers on top |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-12 | Plan created for a full segment-native assistant transcript redesign across live and persisted paths |

---

*Created: 2026-04-12*
*Author: Codex*

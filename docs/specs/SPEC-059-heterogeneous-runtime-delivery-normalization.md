# SPEC-059: Heterogeneous Runtime Delivery Normalization

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-060](../decisions/060-normalize-heterogeneous-runtime-delivery-into-product-events.md) |

## Summary

`cats-runtime` backends do not all emit the same delivery granularity.

Some can stream rich block- or tool-level events. Others can stream only plain
text. Others can only return one final result.

This spec defines one product-owned normalization contract so Chat, Code, and
Work can consume runtime output through the unified turn/lane engine without
depending on provider-specific payload structure.

## Goals

- support fine-grained and coarse-grained runtimes in one product contract
- make transcript and artifact projection independent of provider-native event
  schemas
- let richer runtimes enrich the UX without becoming the only supported shape
- make repair and replay depend on normalized product events instead of raw
  provider payloads

## Non-Goals

- forcing every runtime backend to expose identical provider-native events
- removing provider-specific diagnostics entirely
- standardizing every internal `cats-runtime` adapter detail in this spec
- promising token-level streaming for backends that cannot supply it

## User Stories

- As a user, I want the same chat/thread semantics even when different Cats use
  runtimes with different streaming capabilities.
- As a maintainer, I want replay and repair to work without parsing
  provider-specific payloads.
- As a product developer, I want to build transcript and artifact surfaces once
  against a normalized contract instead of branching by CLI family.

## Requirements

### Functional Requirements

1. The platform shall define a runtime capability profile that can describe at
   least:
   - structured block streaming
   - plain-text streaming
   - tool/status event streaming
   - terminal-only result delivery
2. The capability profile shall be informative for product behavior and
   diagnostics, but transcript correctness shall not depend on any specific
   capability combination.
3. The product shall define a normalized delivery-event contract above runtime
   adapters.
4. The normalized event contract shall support at least:
   - session lifecycle state
   - lane-scoped activity state
   - segment begin/update/seal
   - normalized status/tool updates when available
   - synthesized terminal delivery when only final results exist
5. A normalized event shall preserve correlation to at least:
   - `conversationId`
   - `turnId`
   - `laneId`
   - `sessionId`
   - lane-local ordinal or equivalent stable segment correlation
6. Product `Segment` shall be a normalized product unit and shall not be
   required to equal a provider-native block or chunk.
7. Fine-grained runtimes may map multiple native events into one or more
   normalized segments.
8. Terminal-only runtimes shall be able to synthesize one or more terminal
   normalized segments or artifacts from a final result payload.
9. Chat, Code, and Work renderers shall consume the normalized delivery-event
   contract rather than provider-native event payloads directly.
10. Session-start gating, cluster-ready barriers, waiting states, and similar
    product rules shall operate on normalized events rather than provider-native
    payload assumptions.
11. The platform shall support normalized status-only progress even when no
    text segments have started.
12. Tool/status updates from fine-grained runtimes shall remain optional
    enrichments, not mandatory prerequisites for transcript correctness.
13. Repair and replay paths shall rebuild transcript and projection state from
    normalized events or canonical state, not from provider-native payload
    parsing.
14. The normalized contract shall support reconnecting and session replacement
    without changing lane identity.
15. Coarse runtimes shall still participate in the same lane lifecycle:
    - `pending`
    - `connecting`
    - `running`
    - `streaming or final-only`
    - `sealed/failed/cancelled`
16. Normalized delivery shall support structured artifacts or execution results
    in addition to transcript-visible text.
17. The product shall allow runtime adapters to preserve provider-specific
    diagnostics separately from the normalized contract when helpful for debug
    or support flows.
18. The contract shall be compatible with the interaction/materialization split
    so normalized runtime outputs can also feed structured materialization.

### Non-Functional Requirements

- **Provider independence**: product correctness must not depend on one
  runtime family having the richest streaming contract
- **Extensibility**: new runtime adapters must be able to join by implementing
  the normalization seam
- **Replay safety**: durable rebuilds must rely on product-owned normalized
  contracts
- **Graceful degradation**: coarse runtimes should lose richness, not correctness

## Design Overview

```text
runtime backend
  -> adapter-specific native events
  -> runtime capability profile
  -> normalized product delivery events
  -> unified turn/lane/segment engine
  -> transcript + artifact + materialization projections
```

### Normalized Event Families

The first normalized vocabulary should distinguish:

- `session_event`
  - attach/start/end/error style lifecycle
- `lane_event`
  - waiting/running/failed/cancelled style state
- `segment_event`
  - begin/update/seal for text/tool/status segments
- `result_event`
  - final coarse result that may synthesize segments or artifacts

### Capability Profiles

The first profile vocabulary should allow the product to know whether a backend
is:

- `rich_streaming`
- `text_streaming`
- `terminal_only`

without making product behavior branch into separate transcript models.

## Dependencies

- [ADR-057](../decisions/057-adopt-segment-native-assistant-transcript-delivery.md)
- [ADR-058](../decisions/058-adopt-lane-native-concurrent-group-transcript-delivery.md)
- [ADR-059](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md)
- [ADR-060](../decisions/060-normalize-heterogeneous-runtime-delivery-into-product-events.md)
- [SPEC-058](./SPEC-058-interaction-core-and-domain-materialization.md)

## Open Questions

- [ ] What the smallest stable normalized event vocabulary should be for the
      first rollout.
- [ ] Whether terminal-only runtimes should synthesize exactly one segment or
      may emit a small normalized segment bundle.
- [ ] How much provider-specific diagnostic metadata should be preserved in the
      first product contract versus kept debug-only.

## References

- [ADR-060](../decisions/060-normalize-heterogeneous-runtime-delivery-into-product-events.md)
- [ADR-059](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md)

---

*Created: 2026-04-14*
*Author: Codex*
*Related Plan: [PLAN-051](../plans/PLAN-051-heterogeneous-runtime-delivery-normalization.md)*

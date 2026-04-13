# ADR-060: Normalize Heterogeneous Runtime Delivery Into Product Events

> Treat provider- and CLI-specific streaming differences as adapter concerns by
> mapping all runtime output into one product-owned delivery contract before
> transcript, repair, or product projections consume it.

## Status

Proposed

## Context

`cats-runtime` does not expose one uniform delivery granularity.

Different backends can currently behave very differently:

- some stream structured content blocks and tool/status updates
- some stream plain text only
- some emit one opaque final result after long work
- some can expose intermediate tool or execution states while others cannot

The Chat core re-architecture cannot assume that every backend will eventually
match the finest-grained CLI surface.

If product code keeps depending directly on backend-native payload shapes, the
same core problems will keep recurring:

- renderer logic that assumes token or block streaming exists
- repair and replay paths that depend on provider-native event structure
- product features that work only for one CLI family
- transcript projection rules that change depending on which runtime adapter
  happened to run the lane

The unified conversation-turn-lane engine therefore needs a runtime-delivery
contract that is more abstract than any individual provider or CLI.

## Decision

`cats-platform` should normalize all runtime delivery into a product-owned
event contract before live rendering, repair, replay, or materialization logic
consume it.

### 1. Runtime granularity is a capability profile, not a product assumption

Each runtime/backend adapter may advertise a capability profile such as:

- structured block streaming
- plain text streaming
- status/tool event streaming
- terminal-only result delivery

The product may use that profile for optimization or diagnostics, but it must
not make transcript correctness depend on the richest profile being available.

### 2. Product segments are normalized, not provider-native

`Segment` in the unified engine is a product-normalized unit.

It is not guaranteed to be identical to:

- a provider-native content block
- a CLI-native stdout chunk
- a tool-event payload
- a raw final response object

Fine-grained runtimes may map many native events into lane-local segments.
Coarse runtimes may synthesize one final text or artifact segment at seal time.

### 3. Renderers must consume normalized product events only

Chat, Code, and Work renderers must depend on the normalized delivery contract,
not on provider-specific event payloads.

This means renderers may rely on normalized concepts such as:

- lane/session lifecycle
- segment begin/update/seal
- normalized tool/status delivery
- terminal result synthesis

They may not rely on a particular provider's private event schema.

### 4. Terminal-only runtimes are first-class citizens

If a runtime can only return a coarse final result:

- the lane still participates in the same turn/lane lifecycle
- the product still projects waiting/connecting/running/sealed states
- the final result is synthesized into normalized product segments or artifacts

The product must not treat terminal-only runtimes as second-class or
unsupported by the core transcript model.

### 5. Fine-grained runtimes remain additive

If a runtime can emit:

- text deltas
- tool start/update/complete events
- status steps
- structured block events

those should enrich the same normalized lane timeline rather than define a
separate transcript model.

### 6. Repair and replay rebuild from normalized event/state, not provider-native payloads

Repair, replay, and durable transcript reconstruction must depend on normalized
product events and canonical state only.

They must not require access to raw provider-native event payloads to rebuild
correct transcript structure.

### 7. Session-start gating and concurrent barriers remain product-owned

Product rules such as:

- session-start gating
- cluster-ready barriers
- lane visibility/reconnect behavior

remain product semantics layered above normalized delivery events. They are not
delegated to provider-specific streaming behavior.

## Consequences

### Positive

- Chat core can support coarse and fine runtimes with one transcript engine
- product features stop depending on one specific CLI family
- replay and repair become more stable because they depend on product events
- future runtime adapters can be added without re-architecting transcript logic

### Negative

- adapters must do more normalization work up front
- some provider-native nuance may need explicit mapping instead of being passed
  straight through
- initial implementation may expose capability gaps more clearly than before

### Neutral

- runtimes may still expose provider-specific diagnostics separately
- richer runtimes will still feel more alive in the UI, but they no longer get
  a different core contract

## Alternatives Considered

### Alternative 1: Let each product surface read provider-native events directly

- **Pros**: less adapter work initially
- **Cons**: every renderer and repair path becomes provider-aware
- **Why rejected**: it duplicates logic and makes correctness depend on the
  richest runtime payload shape

### Alternative 2: Standardize on the finest-grained block model everywhere

- **Pros**: elegant when every backend can comply
- **Cons**: unrealistic for coarse runtimes that can only emit final results
- **Why rejected**: the platform must support mixed-capability backends

### Alternative 3: Treat terminal-only runtimes as unsupported for live projection

- **Pros**: simplifies live transcript logic
- **Cons**: makes the core engine incompatible with valid runtime backends
- **Why rejected**: AI-first product posture requires provider diversity, not
  only one idealized CLI contract

## References

- [ADR-057](./057-adopt-segment-native-assistant-transcript-delivery.md)
- [ADR-058](./058-adopt-lane-native-concurrent-group-transcript-delivery.md)
- [ADR-059](./059-adopt-a-unified-conversation-turn-lane-engine.md)
- [SPEC-058](../specs/SPEC-058-interaction-core-and-domain-materialization.md)

---

*Proposed: 2026-04-14*
*Proposed by: Codex*

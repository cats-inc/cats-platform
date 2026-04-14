# ADR-064: Project Conversational Agents Into Chat and Operational Agents Into Work

## Status

Proposed

## Context

The platform now has one shared agent-capable core, plus a unified
conversation-turn-lane engine and a shared managed-work / mission / run
vocabulary.

That still leaves one major product question unresolved:

- where should agents primarily appear to the operator?
- should every agent live under `My Cats` because agents can chat?
- or should every agent live under `Work` because many agents do long-running
  work?

This becomes important once the platform needs to support both:

- conversational/companion/direct-lane Cats that the owner talks to directly
- OpenClaw-style operational agents that take missions, run in the background,
  use schedules/triggers, and need a control plane

If the platform forces both families into one surface:

- `My Cats` becomes overloaded with every worker, scheduler, and daemon-like
  helper
- `Work` loses its role as the control plane for durable, managed automation
- the same agent identity gets modeled differently in every surface

The product needs a stable projection rule.

## Decision

The platform will keep one shared agent core, but project agents into products
through two primary roles:

1. `Conversational Agent`
   - chat-first
   - optimized for direct interaction, companion behavior, transport-facing
     identity, and visible persona
   - primary surface: `Cats Chat`
   - primary quick-access roster: `My Cats`

2. `Operational Agent`
   - work-first
   - optimized for managed work, assignments, missions, schedules, approvals,
     retries, and outputs
   - primary surface: `Cats Work`

3. `Hybrid Agent`
   - one shared agent identity that intentionally supports both projections
   - may appear in both Chat and Work
   - product surfaces must remain explicit about which projection is active

Further rules:

4. `My Cats` is a chat projection over the shared agent/entity registry. It is
   not the universal control plane for every operational worker.
5. `Cats Work` is the primary management surface for OpenClaw-style agents and
   similar long-running or scheduled workers.
6. The platform-owned agent/entity registry remains the canonical home for
   reusable agent identity and capability metadata.
7. `Settings > Cats` and `My Cats` may remain product-facing projections over
   that registry, but they do not need to list every operational agent.
8. A conversational agent may still create or update managed work through the
   shared materialization seam.
9. An operational agent may still have a chat surface for briefing, inspection,
   escalation, or human conversation.
10. Product entry must preserve this separation:
    - Chat = interaction home
    - Work = management/control home
    - Code = implementation execution home

## Consequences

### Positive

- `My Cats` stays understandable and companion-friendly.
- `Work` becomes the natural control plane for mission-oriented agents.
- The same agent can support both interaction and automation without forcing one
  surface to absorb the other's responsibilities.
- OpenClaw-style agent behavior gets a clear home without redefining Chat as a
  workboard.

### Negative

- The platform must maintain explicit cross-links between Chat and Work for
  hybrid agents.
- Some agents will appear in more than one surface, so product copy and badges
  must explain projection clearly.
- The platform needs one canonical registry plus many projections instead of
  only one simple list.

## Rejected Alternatives

### Put Every Agent in `My Cats`

Rejected because it would turn a chat-first roster into a universal control
plane for background workers, schedules, and mission queues.

### Put Every Agent in `Work`

Rejected because it would hide direct-lane, companion, and transport-facing
agent relationships behind a management surface when many agents are primarily
experienced through conversation.

### Create Separate Agent Engines for Chat and Work

Rejected because it would duplicate identity, mission, provenance, and routing
semantics that should stay shared.

## Follow-On Work

- Define agent projection metadata in the shared registry model.
- Decide which hybrid agents should appear in both `My Cats` and Work by
  default.
- Add clear navigation bridges:
  - `Open in Chat`
  - `Open in Work`
  - `Promote to Work`
  - `Open agent briefing thread`

## Related

- [ADR-059](./059-adopt-a-unified-conversation-turn-lane-engine.md)
- [ADR-061](./061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [ADR-063](./063-agent-missions-and-transport-bindings.md)
- [SPEC-062](../specs/SPEC-062-agent-missions-and-transport-bindings.md)

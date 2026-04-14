# SPEC-063: Conversational vs Operational Agents and Surface Projections

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-064](../decisions/064-project-conversational-agents-into-chat-and-operational-agents-into-work.md) |

## Summary

The platform should not treat every agent as either:

- "just a Cat in chat"
- or "just a worker in Work"

It needs one shared agent core with explicit product projections.

This spec defines three projection classes:

- `Conversational Agent`
- `Operational Agent`
- `Hybrid Agent`

and freezes how they should appear across:

- `Cats Chat`
- `Cats Work`
- `Cats Code`
- `MY CATS`

including:

- `MY CATS`
- direct lanes
- companion behavior
- transport-facing bots
- OpenClaw-style mission-oriented agents

## Goals

- keep one shared agent core while making product surfaces legible
- prevent `My Cats` from becoming a universal list of every background worker
- make `Cats Work` the natural control plane for operational agents
- preserve direct interaction and companion affordances for conversational
  agents
- allow hybrid agents without splitting the core identity model

## Non-Goals

- defining every final registry schema field for all future agents
- deciding every default badge or visual treatment in the UI
- requiring every operational agent to have a visible chat persona
- removing Cats branding from conversational agents

## User Stories

- As an owner, I want companion-style or direct-lane agents to feel native in
  Chat instead of buried in a control-plane view.
- As an operator, I want OpenClaw-style agents to be managed in Work where I
  can see assignments, missions, schedules, approvals, and outcomes.
- As a hybrid-agent user, I want to brief an agent in chat and still see its
  mission history and automation state in Work.
- As a maintainer, I want one agent registry and one mission/run vocabulary,
  not separate Chat-agent and Work-agent models.

## Requirements

### Functional Requirements

1. The platform shall define one shared agent/entity registry as the canonical
   home for reusable agent identity and capability metadata.
2. The platform shall support at least these projection classes:
   - `conversational`
   - `operational`
   - `hybrid`
3. A `Conversational Agent` shall be optimized for direct interaction,
   transport-facing identity, companion behavior, or visible persona.
4. An `Operational Agent` shall be optimized for assignments, managed work,
   missions, runs, schedules, approvals, and outputs.
5. A `Hybrid Agent` shall be able to expose both projections without forking
   the canonical agent identity.
6. `Cats Chat` shall be the primary interaction home for conversational
   agents.
7. `MY CATS` shall remain one platform-level agent home over the shared agent
   registry.
8. `MY CATS > Chat` shall be treated as the chat-oriented lens and quick-access
   roster for conversational and selected hybrid agents.
9. `MY CATS` shall not be required to list every operational agent in every
   lens by default.
10. `Cats Work` shall be the primary management and control-plane surface for
   operational agents.
11. `Cats Work` shall be able to show:
    - assignments
    - missions
    - runs
    - schedules/triggers
    - approvals
    - outputs
    for operational and hybrid agents.
12. `Cats Code` shall remain the primary execution surface for code-oriented
    missions and runs, but not the canonical owner of every agent or planning
    record.
13. The platform shall allow a conversational agent to create or update managed
    work through the shared materialization seam.
14. The platform shall allow an operational agent to expose a linked chat
    surface for briefing, status inspection, escalation, or follow-up.
15. The platform shall support explicit cross-links between projections such as:
    - `Open in Chat`
    - `Open in Work`
    - `Promote to Work`
    - `Open agent briefing thread`
16. A transport-facing Cat/Agent may be conversational or hybrid, but its
    transport presence shall not force it to become the canonical Work control
    plane.
17. Guide Cat shall remain an optional low-privilege assist capability and
    shall not be redefined as the universal operational-agent manager.
18. Companion-style agents shall default to the conversational projection even
    when they also perform background missions and runs.
19. OpenClaw-style or Hermes-style long-running agents shall default to the
    operational projection even when they also expose a chat briefing surface.
20. Product policy may choose whether a hybrid agent appears in both `MY CATS`
    and Work by default, but that choice shall not fork the underlying agent
    identity.
21. The canonical vocabulary shall keep these distinctions explicit:
    - managed work
    - mission
    - run
    - schedule / trigger
    - transport binding
    - conversation
    - session

### Non-Functional Requirements

- **Surface clarity**: users should be able to tell whether they are chatting
  with an agent or managing that agent's work.
- **Registry integrity**: Chat and Work projections must not fork agent
  identity.
- **Cross-surface continuity**: linked Chat/Work/Code views should preserve
  provenance and navigation.
- **Extensibility**: future agent families should be classifiable without
  re-architecting the product.

## Design Overview

```text
Shared Agent Core
  Agent / Entity registry
  projection class
  capability metadata

Chat Projection
  MY CATS
  Chat lens
  direct lanes
  companion / transport-facing interaction

Work Projection
  assignments
  missions
  runs
  schedules
  approvals
  outcomes

Code Projection
  code missions
  workspaces
  reviews / previews / tests
```

## Product Mapping

### Conversational Agents

Expected examples:

- companion Cats
- direct-lane specialists
- Telegram-bound visible Cats
- helper personas that are primarily experienced through chat

Primary surfaces:

- `Cats Chat`
- `MY CATS`
  - direct lane
  - transport-bound chat entry

### Operational Agents

Expected examples:

- OpenClaw-style agents
- long-running worker agents
- scheduled automation agents
- background mission-oriented agents

Primary surfaces:

- `Cats Work`
- mission/assignment control plane
- schedule and approval views

### Hybrid Agents

Expected examples:

- an agent with both a visible chat persona and a durable mission queue
- an agent that can be briefed in chat but spends most of its time doing
  work-first automation

Primary surfaces:

- both Chat and Work
- with explicit navigation and status context instead of hidden coupling

## Boundaries

### What belongs in Chat

- direct interaction
- briefing threads
- companion behavior
- transport-facing persona
- quick-access conversational roster

### What belongs in Work

- durable assignments
- mission queue visibility
- schedule/trigger management
- approvals and governance
- progress, retries, blockers, and outputs

### What belongs in Code

- code execution context
- workspaces
- code missions and runs
- previews, reviews, builds, and tests

### What must not happen

- `MY CATS` becoming the universal list of every background worker
  - `Work` becoming the only place an agent can be talked to
  - Chat and Work forking the same agent into unrelated identities
  - transport bindings or sessions being used as substitutes for agent identity

## Dependencies

- [ADR-059](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md)
- [ADR-061](../decisions/061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [ADR-063](../decisions/063-agent-missions-and-transport-bindings.md)
- [ADR-064](../decisions/064-project-conversational-agents-into-chat-and-operational-agents-into-work.md)
- [SPEC-060](./SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [SPEC-062](./SPEC-062-agent-missions-and-transport-bindings.md)
- [SPEC-064](./SPEC-064-my-cats-platform-home-and-lens-projections.md)

## Open Questions

- [ ] Which hybrid agents should appear in both `MY CATS` and Work by default?
- [ ] Whether `Settings > Cats` should remain a conversational-only registry
      projection or later expose broader agent classification.
- [ ] How strongly the UI should differentiate `conversational` vs
      `operational` badges in first rollout.

## References

- [ADR-064](../decisions/064-project-conversational-agents-into-chat-and-operational-agents-into-work.md)
- [SPEC-062](./SPEC-062-agent-missions-and-transport-bindings.md)
- [Architecture](../architecture.md)
- [terminology.md](../terminology.md)

---

*Created: 2026-04-14*
*Author: Codex*
*Related Plan: [PLAN-055](../plans/PLAN-055-conversational-and-operational-agent-projections.md)*

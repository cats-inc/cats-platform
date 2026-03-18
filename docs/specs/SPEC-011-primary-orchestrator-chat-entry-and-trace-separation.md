# SPEC-011: Primary Orchestrator Chat Entry and Trace Separation

Status: Approved

## Summary

`cats-inc` now has enough chat, routing, and Cats registry structure to decide
how the orchestrator should appear in the product.

The agreed direction is:

- one `Primary Orchestrator Cat` acts as the default public entry identity
- `+ New Chat` starts a conversation with that Cat
- orchestration mechanics remain real system capabilities, but they are not a
  second user-visible character
- orchestration details belong in a dedicated activity or trace surface rather
  than flooding the main transcript

This spec defines the product behavior and UI expectations around that model.

Terminology rule:

- `Primary Orchestrator Cat` is the formal product and domain term
- `Boss Cat` is the preferred user-facing UI label

## Goals

- Give every new chat a clear visible entry identity.
- Keep the app chat-first instead of dashboard-first.
- Preserve a separate system model for orchestration runs, events, and logs.
- Keep the transcript readable while still exposing advanced orchestration
  detail when needed.
- Support future internal active orchestrators without complicating the initial
  public UX.

## Non-Goals

- Shipping Telegram or LINE@ transport relays in this slice
- Defining the full approval, escalation, or takeover workflow in this slice
- Designing a multi-public-orchestrator picker
- Turning the activity panel into a full developer console
- Replacing the current Cats registry model

## User Stories

- As an operator, I want `+ New Chat` to immediately open a conversation with a
  known orchestrator identity so that the app feels like a chat product.
- As an operator, I want to see orchestration progress without turning every
  conversation into a debug log.
- As an advanced operator, I want trace details available when the orchestrator
  dispatches or retries work.

## Requirements

### Functional Requirements

- `Settings > Cats` shall expose a `Boss Cat` section distinct from the general
  Cats registry list.
- The operator shall be able to assign an existing Cat as the
  `Primary Orchestrator Cat`.
- The operator shall be able to create a new Cat and assign it as the
  `Primary Orchestrator Cat` in the same settings flow.
- Exactly one `Primary Orchestrator Cat` shall be active as the default public
  orchestrator per `cats-inc` environment.
- Public bot bindings such as Telegram and LINE@ shall attach to that primary
  orchestrator identity.
- `+ New Chat` and equivalent draft-chat entry flows shall start a conversation
  whose implicit lead participant is the `Primary Orchestrator Cat`.
- The initial chat UX shall not require the user to choose among multiple
  public orchestrators before starting a conversation.
- Other Cats shall remain assignable as specialists or collaborators inside the
  chat.
- The product shall persist orchestration state separately from visible chat
  messages.
- The renderer shall expose an `Activity` or `Trace` side panel for
  orchestration runs and events.
- The transcript may include short system notes summarizing important
  orchestration milestones, but it shall not show the full raw event stream by
  default.
- Future internal active orchestrators may exist, but the first product UX
  shall frame them as internal or non-public rather than as competing primary
  chat entry identities.

### Non-Functional Requirements

- The primary user mental model should remain "I am talking to one orchestrator
  Cat" rather than "I am submitting work into a hidden system."
- Trace visibility should help operators reason about work without requiring
  them to read raw logs in the main conversation.
- The design should remain compatible with `Cats Core v1`, product-owned
  approvals, and the existing `cats-inc -> cats-runtime` boundary.
- The initial UI should prefer simple explicit labels over abstract system
  jargon.

## Design Overview

```text
User / Telegram / LINE@
          |
          v
Primary Orchestrator Cat
  - visible chat identity
  - default new-chat entry
          |
          v
Orchestration System Layer
  - runs
  - events
  - retries
  - diagnostics
          |
          v
Assigned Cats / cats-runtime

Main transcript: user-facing dialogue
Side panel: orchestration activity / trace
Optional transcript notes: short milestone summaries only
```

## UI Direction

### Settings > Cats

The settings surface should contain a dedicated `Primary Orchestrator` section
above or beside the general Cats registry.

In UI copy, that section should be labeled `Boss Cat`.

That section should be able to show:

- current Boss Cat name
- current status such as `Active`, `Warming`, or `Offline`
- whether transport bindings exist
- whether keep-warm or auto-start behavior is enabled once those controls exist

### New Chat

`+ New Chat` should no longer feel like creating an empty room with no explicit
counterparty.

Instead, it should create a new conversation addressed to the
`Primary Orchestrator Cat`.

The orchestrator should be the implicit lead participant in that chat even if
the operator later adds specialist Cats.

### Transcript vs Activity

The main transcript should contain:

- user messages
- orchestrator replies
- specialist replies when intentionally surfaced into the conversation
- short system notes only when they materially help the operator understand
  what just happened

The activity or trace panel should contain:

- dispatch events
- blocked or waiting state
- retries
- run status
- lightweight diagnostics and trace breadcrumbs

## Dependencies

- [ADR-007](../decisions/007-establish-cats-core-v1-for-chat-and-work.md)
- [ADR-008](../decisions/008-expose-cats-runtime-via-direct-api-and-mcp-facade.md)
- [ADR-009](../decisions/009-prefer-chat-contextual-pal-entry-and-settings-registry.md)
- [ADR-011](../decisions/011-model-primary-orchestrator-as-visible-cat.md)
- current chat routing and settings surfaces

## Open Questions

- Should the side panel be labeled `Activity`, `Trace`, or a two-level model
  where `Activity` is default and `Trace` is more advanced?
- Should the product auto-start the primary orchestrator whenever the app
  launches, or only when a first chat or transport event needs it?
- How should future internal active orchestrators be shown in settings without
  looking like additional public chat entry identities?

## References

- [Architecture](../architecture.md)
- [Requirements](../requirements.md)
- [ADR-011](../decisions/011-model-primary-orchestrator-as-visible-cat.md)
- [PLAN-011](../plans/PLAN-011-primary-orchestrator-chat-entry-and-trace-separation.md)

---

*Last updated: 2026-03-19*

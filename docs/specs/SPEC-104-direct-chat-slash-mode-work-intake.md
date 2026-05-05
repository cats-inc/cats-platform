# SPEC-104: Direct Chat Slash-Mode Work Intake

> Define the MVP where Telegram or Web direct messages can switch between
> chat, work, and code intent; a strong direct audience Cat can clarify and
> create durable work anchors; weak or unknown Cats require a human gate.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-101](../decisions/101-use-direct-audience-cat-for-slash-mode-work-intake.md) |
| **Related Plan** | [PLAN-092](../plans/PLAN-092-direct-chat-slash-mode-work-intake-rollout.md) |

## Summary

The first slash-mode work intake MVP starts from a `direct_message` with one
audience Cat. The owner can type `/chat`, `/work`, or `/code` from Telegram or
Web Chat to set the current product posture. If the addressed Cat resolves to a
`strong_agent` capability profile, that same Cat may ask clarifying questions,
create a durable Work/Code anchor, and later follow up through supervised
task/run execution. If the addressed Cat is `weak_worker` or `unknown`, the
system must not autonomously create durable work records; it asks the human to
confirm or create them.

This spec intentionally avoids adding new Chat channel kinds, entry-preset
labels, runtime labels, or a second model-strength classifier.

## Goals

- support `/chat`, `/work`, and `/code` as product-intent commands in direct
  Telegram and Web Chat lanes
- keep the domain topology as `direct_message`; slash intent changes posture,
  not channel taxonomy
- use the existing provider capability profile and supervision policy to decide
  whether the direct Cat may create durable work
- let a strong direct Cat proactively ask clarification questions and create a
  Work Item or Code-bound task/run anchor when ready
- require a human gate for weak or unknown direct Cats before durable work
  objects are created
- keep the same direct lane as the follow-up surface after Work/Code anchors
  are created

## Non-Goals

- no multi-Cat hand-off inside the direct-message MVP
- no group, parallel, or room-orchestration redesign
- no new provider/model capability classifier
- no standalone `/work/intake` route revival
- no Telegram mini-app or custom rich transport UI
- no automatic escalation from weak Cat to another Cat
- no UI layout redesign in this spec

## User Stories

- As an owner, I want to message one Cat on Telegram, type `/work`, and have
  that same Cat ask follow-up questions before creating a Work Item.
- As an owner, I want `/code` to tell Cats that the request is coding work
  without leaving the direct conversation.
- As an owner, when the Cat is not capable enough to own work intake, I want the
  system to ask me to confirm or manually create the Work Item instead of
  pretending the Cat can do it.
- As a maintainer, I want direct slash commands to reuse existing Chat routing,
  provider capability, and Work/Code supervision boundaries.

## Requirements

### Functional Requirements

#### Command recognition and posture

1. The product shall recognize `/chat`, `/work`, and `/code` as direct-message
   product-intent commands for both Telegram-origin and Web-origin messages.
2. Product-intent commands shall be evaluated before normal assistant dispatch
   for that inbound turn.
3. `/chat` shall clear or set the lane posture to ordinary direct chat.
4. `/work` shall set the lane posture to direct work intake.
5. `/code` shall set the lane posture to direct code intake.
6. These commands shall not create a new persistent channel kind. The channel
   remains `direct_message`.
7. Transport-control commands such as `/start`, `/help`, `/commands`, and
   `/status` remain separate from product-intent commands.
8. The existing `/mode` Telegram command from SPEC-038 shall not be overloaded
   for product switching in this MVP.

#### Direct audience resolution

9. The MVP shall apply only when the current channel is `direct_message`.
10. The direct lane shall resolve exactly one audience Cat before work-intake
    behavior is allowed.
11. If no direct audience Cat can be resolved, the system shall reject the
    intake action and ask the human to choose a Cat.
12. If more than one audience is present, the flow is out of MVP scope and shall
    not silently pick a Cat.

#### Capability gating

13. The direct audience Cat shall resolve to an execution target using the
    existing Cat identity / execution-target boundary.
14. The execution target shall resolve through the existing provider capability
    profile mechanism.
15. The product shall not infer `strong_agent` or `weak_worker` from provider
    names, model labels, runtime availability, or provider delivery events.
16. `strong_agent` is required before autonomous durable Work/Code anchor
    creation.
17. `weak_worker` and `unknown` shall be treated as not strong for autonomous
    durable work creation.

#### Strong direct Cat behavior

18. In `/work` posture, a `strong_agent` direct Cat may ask clarification
    questions before creating a Work Item.
19. The clarification loop shall be Cat-initiated when required; the user shall
    not need to fill a separate intake form for the MVP.
20. The Cat shall create a durable Work Item only when it has enough information
    to produce at least a title, summary, current unknowns, and proposed next
    action.
21. After Work Item creation, the same direct Cat remains the follow-up agent
    for that item in the direct lane.
22. The Cat may start or request supervised task/run execution only through
    existing Work/Code supervision boundaries, approval gates, and budgets.
23. In `/code` posture, a `strong_agent` direct Cat may create a Code-bound
    task/run intent. If the request needs operator-visible tracking or
    requirement clarification, it may create or link a Work Item as the planning
    anchor before starting Code execution.
24. In `/chat` posture, the Cat shall answer as ordinary direct chat unless the
    user explicitly changes posture again.

#### Weak / unknown direct Cat behavior

25. In `/work` or `/code` posture, a `weak_worker` or `unknown` direct Cat
    shall not autonomously create Work Items, Tasks, Runs, or Code execution.
26. The system shall present a human-gated create/confirm path when available.
27. If a human-gated create UI is unavailable, the system shall explain that a
    human must create the durable work object or switch to a stronger Cat.
28. Weak/unknown Cats may continue clarifying the request conversationally, but
    their output remains advisory until a human confirms durable work creation.
29. Weak/unknown behavior shall not auto-escalate to another Cat in the MVP.

#### Durable records and follow-up

30. Work Item creation shall use the current Core / Work product record
    contracts; this spec does not add a new canonical record family.
31. The created Work Item shall preserve the source direct conversation and
    direct audience Cat as traceable context.
32. A created task/run shall link back to the Work Item or Code-bound planning
    anchor when such an anchor exists.
33. Follow-up status and clarification shall be visible in the originating
    direct lane and in the relevant Work/Code product surfaces.
34. Product posture changes shall be auditable enough to explain why a later
    Work/Code anchor was created from a direct conversation.

#### Boundary and naming

35. This flow shall not reintroduce retired prototype route/control labels.
36. The canonical domain split remains `direct_message` vs `chat_channel`.
37. Entry UI labels such as default/group/parallel shall not be used to decide
    model strength or durable work permissions.
38. Strong/weak resolution shall be deterministic policy lookup, not an LLM
    self-assessment.

### Non-Functional Requirements

- **Safety**: weak/unknown Cats fail closed for durable work creation.
- **Auditability**: durable Work/Code anchors created from direct chat carry
  enough source context for later review.
- **Transport parity**: Telegram and Web direct lanes share the same product
  intent semantics after transport command parsing.
- **Layering**: Chat owns direct-lane routing; supervision owns capability and
  policy gates; Work/Code own durable product records and run projection.
- **Pre-release cleanup**: no compatibility aliases for retired prototype
  modes are added.

## Design Overview

```text
Telegram/Web inbound direct message
  -> product-intent slash parser
      /chat -> direct chat posture
      /work -> direct work-intake posture
      /code -> direct code-intake posture
  -> resolve direct audience Cat
  -> resolve Cat execution target
  -> resolve provider capability profile
      strong_agent:
        same Cat asks clarifying questions
        same Cat creates Work/Code anchor when ready
        same Cat follows up through supervised task/run boundary
      weak_worker / unknown:
        no autonomous durable work creation
        ask human to confirm/create or switch Cat
```

### Minimal Work Item Draft

Before a strong Cat creates a Work Item from direct chat, it should be able to
produce:

- title
- summary
- source conversation reference
- direct audience Cat reference
- current unknowns or assumptions
- proposed next action
- target product hint (`work` or `code`)

The exact storage fields should reuse existing Core/Work metadata conventions.

### Product-Intent Command Result

The command handler should produce a machine-readable result such as:

```ts
interface DirectIntentCommandResult {
  posture: 'chat' | 'work' | 'code';
  channelKind: 'direct_message';
  audienceCatId: string;
  capabilityProfileKind: 'strong_agent' | 'weak_worker' | 'unknown';
  durableAction:
    | { kind: 'not_requested' }
    | { kind: 'allowed'; reason: string }
    | { kind: 'human_gate_required'; reason: string };
}
```

The implementation does not have to use this exact name, but tests should cover
these semantics.

## Dependencies

- [ADR-004: Separate Cat Identity from Provider Execution](../decisions/004-separate-cat-identity-from-provider-execution.md)
- [ADR-082: Recast the Orchestrator as a Capability Shell with Policy-Dial Supervision](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [ADR-091: Retire `composerMode` in Favor of Channel Intent](../decisions/091-retire-composer-mode-cat-led-in-favor-of-recipient-state.md)
- [ADR-101: Use the Direct-Audience Cat for Slash-Mode Work Intake](../decisions/101-use-direct-audience-cat-for-slash-mode-work-intake.md)
- [SPEC-038: Telegram Bot Commands and Transport Control Surface](./SPEC-038-telegram-bot-commands-and-transport-control-surface.md)
- [SPEC-082: Cats Work Agent Supervision and Tool Boundary](./SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
- [PLAN-080: Provider Capability Bootstrap Config Rollout](../plans/PLAN-080-provider-capability-bootstrap-config-rollout.md)

## Acceptance Criteria

- `/chat`, `/work`, and `/code` are recognized as product-intent commands in a
  direct lane without changing the persisted channel kind.
- Telegram transport commands still behave according to SPEC-038 and are not
  confused with product-intent commands.
- Direct work-intake rejects channels without exactly one audience Cat.
- Capability gating uses the existing provider capability profile resolver.
- Tests prove unconfigured/unknown providers do not get autonomous durable work
  creation.
- Tests prove configured `strong_agent` direct Cats may enter the clarification
  and Work/Code anchor creation path.
- Tests prove `weak_worker` direct Cats require a human gate.
- Created Work/Code anchors preserve source conversation and audience Cat
  context.
- No retired route/control labels are introduced in storage, API contracts,
  docs, or tests.

## Open Questions

- [ ] Should `/work` immediately acknowledge posture change in the transcript,
      or should the next Cat clarification message be the only visible signal?
- [ ] What is the smallest human-gated create UI for weak/unknown Cats: toast,
      modal, inline action, or route to Work Item creation?
- [ ] Should `/code` always create a Work Item first, or only when
      requirement clarification/follow-up tracking is needed?
- [ ] Which exact Core/Work metadata fields should carry the source direct
      conversation and audience Cat references?

## References

- [PLAN-092: Direct Chat Slash-Mode Work Intake Rollout](../plans/PLAN-092-direct-chat-slash-mode-work-intake-rollout.md)
- [PLAN-075: Real Provider Orchestrator Integration](../plans/PLAN-075-real-provider-orchestrator-integration.md)
- [PLAN-085: Mission Cancel and Run Stop Rollout](../plans/PLAN-085-mission-cancel-and-run-stop-rollout.md)

---

*Created: 2026-05-06*
*Author: Codex*
*Related Plan: [PLAN-092](../plans/PLAN-092-direct-chat-slash-mode-work-intake-rollout.md)*

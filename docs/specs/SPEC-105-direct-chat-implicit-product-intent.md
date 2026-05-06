# SPEC-105: Direct Chat Implicit Product Intent Confirmation

> Define the follow-up MVP where ordinary direct-chat messages can be detected
> as likely Work or Code intent, but require explicit human confirmation before
> switching posture or creating durable anchors.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-101](../decisions/101-use-direct-audience-cat-for-slash-mode-work-intake.md) |
| **Related Plan** | [PLAN-093](../plans/PLAN-093-direct-chat-implicit-product-intent-rollout.md) |

## Summary

SPEC-104 covers explicit slash commands: `/chat`, `/work`, and `/code`.
This spec covers the next layer: when the owner sends ordinary text in a
`direct_message` lane and the platform believes the message is really a work or
code request, Cats may suggest a product switch. The suggestion is only a
candidate. It must not change posture, create a Work Item, start a Task, or
start Code execution until the owner confirms.

After confirmation, the flow must enter the same product-intent intake path as
SPEC-104. Confirmation of a Work candidate is equivalent to `/work <original
message>`. Confirmation of a Code candidate is equivalent to `/code <original
message>`.

## Goals

- detect likely Work or Code intent from ordinary direct-chat text
- preserve ordinary chat as the default when confidence is low or the owner
  ignores/declines the suggestion
- require explicit human confirmation before posture changes or durable product
  actions
- reuse the SPEC-104 direct slash-mode intake pipeline after confirmation
- keep source context and audit metadata tied to the original owner message
- support both Web direct chat and Telegram ordinary-text ingress

## Non-Goals

- no automatic Work Item, Task, Run, or Code execution from classifier output
- no group, parallel, or multi-audience implicit intent support in this MVP
- no replacement for explicit `/chat`, `/work`, or `/code`
- no new channel kind, room mode, or retired prototype label
- no hidden escalation from weak or unknown Cats to another Cat
- no UI layout redesign beyond the confirmation affordance

## User Stories

- As an owner, I can tell a Cat "please fix the parser tests" without typing
  `/work`, and Cats can ask whether I want to turn that into Work.
- As an owner, I can describe a coding request in Telegram and confirm that it
  should become Code work without learning the slash command first.
- As an owner, casual conversation should stay casual. Cats should not keep
  nagging me to turn normal chat into Work.
- As a maintainer, I want implicit detection to reuse the explicit slash-mode
  pipeline so the two paths do not drift.

## Requirements

### Functional Requirements

#### Candidate detection

1. The platform shall run implicit product-intent detection only for ordinary
   text messages in `direct_message` lanes.
2. The detector shall produce one of `none`, `work`, or `code`.
3. The detector shall not produce durable product records. It only produces a
   candidate suggestion.
4. The detector shall not reinterpret explicit `/chat`, `/work`, or `/code`
   commands. Those remain owned by SPEC-104.
5. The detector shall not run for non-direct channels in this MVP.
6. The detector shall keep ordinary chat as the default. Low-confidence or
   ambiguous messages shall return `none`.
7. The detector shall be shared by Web and Telegram ordinary-text ingress, not
   duplicated per transport.

#### Confirmation gate

8. A Work or Code candidate shall require explicit owner confirmation before
   any posture change.
9. Declining or ignoring the suggestion shall leave the lane in ordinary chat
   with no durable Work/Code state change.
10. Confirming a Work candidate shall invoke the same product-intent intake
    semantics as `/work <original message>`.
11. Confirming a Code candidate shall invoke the same product-intent intake
    semantics as `/code <original message>`.
12. Confirmation shall preserve the original owner message id as source context.
13. Confirmation shall be idempotent for the same candidate. Repeating the
    confirmation must not create duplicate anchors.
14. The confirmation UI shall make the product target visible without exposing
    internal classifier or provider terminology.

#### Capability and posture behavior

15. After confirmation, capability gating shall use the same direct audience
    Cat and provider capability profile behavior as SPEC-104.
16. Strong direct Cats may enter the same Work Item anchor and chat-only
    Concierge path as slash-mode intake.
17. Weak or unknown direct Cats shall remain human-gated and shall not
    autonomously create Work Items, Tasks, Runs, or Code execution.
18. The platform shall not infer Cat strength from the implicit classifier.
    Product intent and capability are separate decisions.
19. Confirmed implicit Work/Code intent shall not introduce new product modes
    beyond SPEC-104 posture values.

#### Audit and metadata

20. Candidate detection shall write auditable metadata that records the original
    message id, source transport, candidate target, confidence/reason signal,
    and candidate status.
21. Confirmation metadata shall link the confirmation event back to the
    original candidate and message id.
22. Work Items created from confirmed implicit intent shall preserve the
    original message source context in the same durable fields used by SPEC-104,
    with an additional metadata marker identifying the source as implicit.
23. The original user transcript shall remain the user's ordinary text. The
    platform shall not rewrite it as if the user typed a slash command.
24. If a later projection needs a slash-equivalent command, it shall be derived
    metadata, not replacement transcript text.

#### Anti-nag and false-positive controls

25. The platform shall avoid repeatedly suggesting Work/Code conversion for the
    same message or same unresolved candidate.
26. The platform shall provide a cooldown or equivalent suppression mechanism
    for repeated false positives in the same lane.
27. A declined candidate shall not be immediately re-suggested unless the owner
    sends a materially new message.
28. Tests shall cover obvious false positives such as greetings, short casual
    replies, and ordinary direct questions.

### Non-Functional Requirements

- **Safety**: no durable product action occurs without explicit owner
  confirmation.
- **Auditability**: confirmed implicit intent can be traced back to the
  original owner message and candidate event.
- **Transport parity**: Web and Telegram use the same detection contract and
  confirmation semantics after ingress.
- **Layering**: Chat owns detection and confirmation; SPEC-104 owns the
  confirmed intake path; Work/Code own durable records and execution.
- **Localization**: visible suggestion, confirmation, decline, and human-gate
  copy shall come from the shared i18n catalog.

## Design Overview

```text
ordinary direct message
  -> implicit product-intent detector
      none -> ordinary direct chat dispatch
      work/code -> write candidate metadata and show confirmation
  -> owner confirms
      work -> SPEC-104 equivalent: /work <original message>
      code -> SPEC-104 equivalent: /code <original message>
  -> SPEC-104 direct audience capability gating
      strong_agent -> draft anchor + chat-only Concierge reply
      weak_worker/unknown -> human gate
```

### Candidate Metadata

The implementation may choose the exact TypeScript name, but the durable shape
should preserve these semantics:

```ts
interface ImplicitProductIntentCandidateMetadata {
  version: 1;
  source: {
    messageId: string;
    channelId: string;
    conversationId: string;
    transport: 'web' | 'telegram';
  };
  candidate: {
    targetProduct: 'work' | 'code';
    confidence: 'low' | 'medium' | 'high';
    reasonCode: string;
  };
  status: 'suggested' | 'confirmed' | 'declined' | 'expired';
}
```

### Confirmation Semantics

Confirmation is a bridge into SPEC-104, not a parallel intake implementation.
The confirmed command name and `argumentText` are derived from the original
message, while the transcript keeps the original ordinary text. Tests should
assert that confirmed implicit Work/Code follows the same durable anchor,
capability, active-anchor, and human-gate behavior as explicit slash commands.

## Dependencies

- [ADR-101: Use the Direct-Audience Cat for Slash-Mode Work Intake](../decisions/101-use-direct-audience-cat-for-slash-mode-work-intake.md)
- [SPEC-104: Direct Chat Slash-Mode Work Intake](./SPEC-104-direct-chat-slash-mode-work-intake.md)
- [SPEC-082: Cats Work Agent Supervision and Tool Boundary](./SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
- [SPEC-038: Telegram Bot Commands and Transport Control Surface](./SPEC-038-telegram-bot-commands-and-transport-control-surface.md)

## Acceptance Criteria

- Ordinary Web direct-chat text can produce a Work/Code candidate suggestion
  without changing posture.
- Ordinary Telegram direct-chat text can produce the same candidate suggestion
  through the shared detector contract.
- No Work Item, Task, Run, Code execution, or active-anchor state is created
  before owner confirmation.
- Confirming a Work candidate enters the same behavior as `/work <original
  message>`.
- Confirming a Code candidate enters the same behavior as `/code <original
  message>`.
- Declining or ignoring a candidate leaves the lane as ordinary chat.
- Weak/unknown direct Cats remain human-gated after confirmation.
- Non-direct channels do not run implicit detection in this MVP.
- Candidate and confirmation metadata preserve original message source context.
- False-positive tests prove casual chat does not nag the owner.
- No retired route/control labels are introduced.

## Open Questions

- [ ] Should the first detector be deterministic heuristic, provider-backed
      classifier, or a hybrid with a strict confidence threshold?
- [ ] What exact Web confirmation UI should ship first: inline message choices,
      composer chip, or side-panel affordance?
- [ ] What exact Telegram confirmation UI should ship first: reply keyboard,
      deep link, or text command confirmation?
- [ ] What cooldown should suppress repeated false positives in one direct lane?
- [ ] Should candidate history be visible in Work/Code projections, or only in
      Chat transcript metadata?

## References

- [PLAN-093: Direct Chat Implicit Product Intent Rollout](../plans/PLAN-093-direct-chat-implicit-product-intent-rollout.md)
- [PLAN-092: Direct Chat Slash-Mode Work Intake Rollout](../plans/PLAN-092-direct-chat-slash-mode-work-intake-rollout.md)

---

*Created: 2026-05-06*
*Author: Codex*
*Related Plan: [PLAN-093](../plans/PLAN-093-direct-chat-implicit-product-intent-rollout.md)*

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
- no mobile implicit-intent UI in this MVP
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
8. Detector v1 shall be deterministic and local. It shall not call a provider,
   runtime session, or LLM classifier for every ordinary direct message.

#### Confirmation gate

9. A Work or Code candidate shall require explicit owner confirmation before
   any posture change.
10. Declining or ignoring the suggestion shall leave the lane in ordinary chat
   with no durable Work/Code state change.
11. Confirming a Work candidate shall invoke the same product-intent intake
    semantics as `/work <original message>`.
12. Confirming a Code candidate shall invoke the same product-intent intake
    semantics as `/code <original message>`.
13. Confirmation shall preserve the original owner message id as source context.
14. Confirmation shall be idempotent for the same candidate. Repeating the
    confirmation must not create duplicate anchors.
15. The confirmation UI shall make the product target visible without exposing
    internal classifier or provider terminology.
16. Candidate suggestions, confirmations, declines, and expirations shall be
    represented as append-only message-stream system segments. The
    implementation shall not rely on mutating the original user message as the
    audit source of truth.

#### Capability and posture behavior

17. After confirmation, capability gating shall use the same direct audience
    Cat and provider capability profile behavior as SPEC-104.
18. Strong direct Cats may enter the same Work Item anchor and chat-only
    Concierge path as slash-mode intake.
19. Weak or unknown direct Cats shall remain human-gated and shall not
    autonomously create Work Items, Tasks, Runs, or Code execution.
20. The platform shall not infer Cat strength from the implicit classifier.
    Product intent and capability are separate decisions.
21. Confirmed implicit Work/Code intent shall not introduce new product modes
    beyond SPEC-104 posture values.

#### Audit and metadata

22. Candidate detection shall write auditable metadata that records the original
    message id, source transport, candidate target, confidence/reason signal,
    and candidate status.
23. Confirmation metadata shall link the confirmation event back to the
    original candidate and message id.
24. Work Items created from confirmed implicit intent shall preserve the
    original message source context in the same durable fields used by SPEC-104,
    with an additional metadata marker identifying the source as implicit.
25. The original user transcript shall remain the user's ordinary text. The
    platform shall not rewrite it as if the user typed a slash command.
26. If a later projection needs a slash-equivalent command, it shall be derived
    metadata, not replacement transcript text.
27. Confirmed implicit Work/Code shall synthesize product-intent command
    metadata for routing, with `argumentText` set to the trimmed original owner
    message body and `productIntentArgumentProvided: true`.
28. Confirmed implicit Work/Code shall not set `rawCommandToken` to a fake
    slash token such as `/work` or `/code`. If the current command metadata
    contract requires `rawCommandToken: string`, Phase 4 shall widen that field
    before implementing implicit confirmation.
29. Confirmed implicit Work/Code command metadata shall carry
    `implicitConfirmed: true`, `originalCandidateId`, and `originalMessageId`
    or equivalent additive fields so downstream readers can distinguish it from
    owner-typed slash commands.
30. The SPEC-104 empty-argument marker path does not apply to confirmed
    implicit Work/Code. The ordinary message itself is the argument.

#### Anti-nag and false-positive controls

31. The platform shall avoid repeatedly suggesting Work/Code conversion for the
    same message or same unresolved candidate.
32. The platform shall provide a cooldown or equivalent suppression mechanism
    for repeated false positives in the same lane.
33. A declined candidate shall not be immediately re-suggested unless the owner
    sends a materially new message.
34. Tests shall cover obvious false positives such as greetings, short casual
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
- **Cost**: detector v1 is deterministic and local. Any future provider-backed
  detector must be opt-in or guarded by a per-lane budget/cooldown before it can
  run on ordinary chat traffic.

## Design Overview

```text
ordinary direct message
  -> implicit product-intent detector
      none -> ordinary direct chat dispatch
      work/code -> ordinary direct chat dispatch still proceeds
                   write candidate system segment and show confirmation
  -> owner confirms
      work -> SPEC-104 equivalent: /work <original message>
      code -> SPEC-104 equivalent: /code <original message>
  -> SPEC-104 direct audience capability gating
      strong_agent -> draft anchor + chat-only Concierge reply
      weak_worker/unknown -> human gate
```

### Detector v1 Baseline

Detector v1 is a conservative deterministic heuristic. It is intentionally
allowed to miss marginal Work/Code requests because the owner can still type the
explicit slash command from SPEC-104. It is not allowed to create costly false
positives on casual direct chat.

The baseline detector:

- normalizes whitespace and case, and ignores recognized slash commands before
  matching
- returns `none` for greetings, one-word replies, pure social chat, and short
  questions without action cues
- requires at least one owner-action cue such as "please", "help me",
  "can you", "fix", "build", "write", "implement", "debug", "plan", "draft",
  "summarize", "請", "幫我", or "麻煩"
- requires at least one product cue:
  - Code cue examples: "code", "test", "parser", "bug", "repo", "commit",
    "PR", "component", "API", "refactor", "修 code", "測試", "程式"
  - Work cue examples: "work item", "task", "plan", "milestone", "scope",
    "schedule", "requirement", "deliverable", "需求", "任務", "排程", "規劃"
- prefers `code` over `work` when code-specific cues are present
- returns `high` when the message has an action cue plus two product cues or
  one product cue with an explicit implementation/fix verb
- returns `medium` when the message has an action cue plus one product cue and
  is long enough to be actionable
- treats `low` and ambiguous results as `none` in v1

Provider-backed or hybrid classifiers are future work. They need a separate
budget, opt-out, and observability decision before they can run on ordinary
direct-chat traffic.

### Candidate-Stage Cat Behavior

Candidate detection does not decide whether the Cat should answer. In v1, the
ordinary direct-chat dispatch proceeds normally, and the product suggestion is
an additional system/UI sidecar attached to the same owner turn. This keeps the
Cat responsive and avoids a separate detector LLM call. If the owner confirms,
the SPEC-104 intake runs on a later confirmation event and may produce the
Concierge reply for Work/Code intake.

### Candidate Metadata

Candidate suggestions are append-only system segments. The original user
message may carry a lightweight reference, but the system segment is the audit
source of truth. The implementation may choose the exact TypeScript name, but
the durable shape should preserve these semantics:

```ts
interface ImplicitProductIntentCandidateMetadata {
  version: 1;
  candidateId: string;
  event: 'suggested';
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
  expiresAt: string;
}
```

`candidateId` is the idempotency key and is derived from the original message
id, target product, and metadata version. A practical v1 format is
`implicit-product-intent:v1:<messageId>:<targetProduct>`.

### Confirmation Transcript Shape

Confirm, decline, and expire transitions are also append-only system segments.
They do not mutate the candidate system segment as the audit source.

```ts
interface ImplicitProductIntentCandidateTransitionMetadata {
  version: 1;
  candidateId: string;
  event: 'confirmed' | 'declined' | 'expired';
  sourceMessageId: string;
  targetProduct: 'work' | 'code';
  idempotencyKey: string;
  confirmedCommand?: {
    sourceKind: 'implicit_confirmation';
    command: 'work' | 'code';
    argumentText: string;
    rawCommandToken: null;
    botSuffix: null;
    implicitConfirmed: true;
    originalCandidateId: string;
    originalMessageId: string;
  };
}
```

Repeating confirmation for the same `candidateId` is a no-op: it must not write
a second Work Item anchor, and it may return or surface the already-confirmed
state. Decline after confirmation is ignored or rejected as stale. Confirm after
decline requires a new candidate from a materially new owner message.

### Confirmation Semantics

Confirmation is a bridge into SPEC-104, not a parallel intake implementation.
The confirmed command name and `argumentText` are derived from the original
message, while the transcript keeps the original ordinary text. Tests should
assert that confirmed implicit Work/Code follows the same durable anchor,
capability, active-anchor, and human-gate behavior as explicit slash commands.

For routing, confirmed implicit intent synthesizes command metadata with:

- `command = 'work'` or `'code'`
- `posture = command`
- `targetProduct = command`
- `argumentText = originalMessage.body.trim()`
- `productIntentArgumentProvided = true`
- `rawCommandToken = null` or an equivalent non-slash sentinel
- `botSuffix = null`
- `implicitConfirmed = true`
- `originalCandidateId` and `originalMessageId`

The implementation shall not create a fake transcript message containing
`/work ...` or `/code ...`.

### Confirmation UX Baseline

Web v1 uses inline message choices on the candidate system segment. Telegram v1
uses an inline keyboard with `callback_data` carrying the `candidateId` and the
requested transition (`confirm` or `decline`). Reply keyboards and free-form
text confirmation are out of v1 because they conflict with multiple outstanding
candidates in the same chat.

### Suppression Model v1

Candidate suppression is lane-local:

- a suggested candidate expires after 15 minutes if the owner does not confirm
  or decline it
- switching the lane to explicit `/chat` expires outstanding suggested
  candidates
- declining any Work/Code candidate starts a five-minute detector cooldown in
  that lane
- during cooldown, detector hits return `none` instead of creating another
  suggestion
- "materially new" means a different normalized owner message after at least
  one later owner turn; v1 does not need semantic similarity scoring

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
- Candidate, confirm, decline, and expire transitions are written as
  append-only system segments with stable candidate idempotency keys.
- Confirming a Work candidate enters the same behavior as `/work <original
  message>`.
- Confirming a Code candidate enters the same behavior as `/code <original
  message>`.
- Confirmed implicit command metadata uses the original message body as
  `argumentText`, sets `productIntentArgumentProvided: true`, and does not fake
  a slash `rawCommandToken`.
- Declining or ignoring a candidate leaves the lane as ordinary chat.
- Weak/unknown direct Cats remain human-gated after confirmation.
- Non-direct channels do not run implicit detection in this MVP.
- Candidate and confirmation metadata preserve original message source context.
- False-positive tests prove casual chat does not nag the owner.
- No retired route/control labels are introduced.

## Open Questions

- [ ] Should candidate history be visible in Work/Code projections, or only in
      Chat transcript metadata?
- [ ] Should a future provider-backed detector exist behind an explicit opt-in
      budget, or should natural-language intent remain deterministic only?

## References

- [PLAN-093: Direct Chat Implicit Product Intent Rollout](../plans/PLAN-093-direct-chat-implicit-product-intent-rollout.md)
- [PLAN-092: Direct Chat Slash-Mode Work Intake Rollout](../plans/PLAN-092-direct-chat-slash-mode-work-intake-rollout.md)

---

*Created: 2026-05-06*
*Author: Codex*
*Related Plan: [PLAN-093](../plans/PLAN-093-direct-chat-implicit-product-intent-rollout.md)*

# SPEC-105: Direct Chat Cat-Proposed Product Intent Confirmation

> Define the no-slash direct-chat flow where a strong Cat can propose turning
> ordinary conversation into Work or Code intake, but the owner must confirm
> before any durable product state is created.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADRs** | [ADR-101](../decisions/101-use-direct-audience-cat-for-slash-mode-work-intake.md), [ADR-102](../decisions/102-use-cat-authored-product-intent-proposals.md) |
| **Related Plan** | [PLAN-094](../plans/PLAN-094-cat-proposed-product-intent-rollout.md) |
| **Historical Plan** | [PLAN-093](../plans/PLAN-093-direct-chat-implicit-product-intent-rollout.md) |

## Summary

SPEC-104 covers explicit product commands in direct chat: `/chat`, `/work`, and
`/code`. Those commands are platform-owned control inputs.

This spec covers the no-slash path. When the owner sends ordinary direct-chat
text, Cats should not rely on a platform-owned keyword detector to infer
meaning. Instead, the ordinary message is dispatched to the addressed direct
Cat. If that Cat is capability-gated as strong and natural-language suggestions
are enabled, the platform may expose a proposal-only tool. The Cat can call that
tool to ask the owner whether the current request should become Work or Code.

The proposal is only a candidate. It must not change posture, create a Work
Item, start a Task, create a Run, or start Code execution until the owner
confirms. After confirmation, the flow enters the same SPEC-104 slash-mode
intake path as `/work <source>` or `/code <source>`, while preserving the
original owner message and Cat proposal as source context.

## Goals

- keep explicit `/chat`, `/work`, and `/code` deterministic and platform-owned
- let the addressed strong Cat own natural-language semantic interpretation
- avoid platform keyword lists as the default multilingual strategy
- require explicit owner confirmation before posture changes or durable product
  actions
- reuse the SPEC-104 direct slash-mode intake pipeline after confirmation
- keep source context and audit metadata tied to the original owner message and
  Cat proposal
- support Web and Telegram direct-chat ingress through the same proposal and
  confirmation contract
- provide deployment and owner settings for natural-language suggestions

## Non-Goals

- no automatic Work Item, Task, Run, or Code execution from ordinary text
- no platform-owned semantic classifier as the default no-slash path
- no group, parallel, or multi-audience proposal support in this MVP
- no replacement for explicit `/chat`, `/work`, or `/code`
- no hidden escalation from weak or unknown Cats to another Cat
- no mobile implicit-intent UI in this MVP
- no UI layout redesign beyond proposal confirmation affordances

## Requirements

### Functional Requirements

#### Explicit command baseline

1. The platform shall continue to handle `/chat`, `/work`, and `/code`
   deterministically through SPEC-104.
2. `/chat` shall mean ordinary conversational posture. It is valid inside a
   lane that has Work context; it does not close an established Work Item or
   erase source context. For an unconfirmed draft intake, `/chat` may abandon
   that draft to avoid orphan records.
3. Explicit commands shall not depend on the natural-language proposal setting.
   The owner can always type `/work` or `/code` manually.

#### Cat-authored proposal

4. Natural-language product suggestions shall be created by an addressed direct
   Cat through a structured proposal tool, not by a default platform semantic
   detector.
5. The proposal tool shall be exposed only in effective direct lanes. Effective
   direct-lane membership follows SPEC-104:
   `channelKind === 'direct_message'` or
   `roomRouting.mode === 'direct_message'`.
6. The proposal tool shall be exposed only when the addressed direct Cat is
   capability-gated as `strong_agent`.
7. The proposal tool shall be exposed only when both deployment policy and
   owner settings allow natural-language product suggestions.
8. Weak or unknown direct Cats shall not receive the proposal tool. They may
   continue ordinary chat. Their system prompt may include a soft hint that
   they can suggest the owner type `/work` or `/code` when they perceive
   Work/Code intent, but the platform does not enforce or validate that
   conversational hint.
9. A proposal tool call shall write an append-only candidate/proposal system
   segment. It shall not create a Work Item, Task, Run, active anchor, or Code
   execution.
10. The proposal shall identify `targetProduct: 'work' | 'code'`, source
    message context, the proposing Cat, and a short owner-facing rationale.

#### Confirmation gate

11. A Work or Code proposal shall require explicit owner confirmation before
    any posture change.
12. Declining or ignoring the proposal shall leave the lane in ordinary chat
    with no durable Work/Code state change.
13. Confirming a Work proposal shall invoke the same product-intent intake
    semantics as `/work <source>`.
14. Confirming a Code proposal shall invoke the same product-intent intake
    semantics as `/code <source>`.
15. Confirmation shall preserve the original owner message id and proposal id
    as source context.
16. Confirmation shall be idempotent for the same proposal. Repeating the
    confirmation must not create duplicate anchors.
17. Proposal, confirm, decline, and expire events shall be represented as
    append-only message-stream system segments. The implementation shall not
    rely on mutating the original user message as the audit source of truth.

#### Configuration

18. Deployment config shall provide
    `CATS_CHAT_NATURAL_PRODUCT_INTENT_MODE=off|cat_tool|heuristic_prefilter`.
19. `off` shall disable no-slash product suggestions while leaving explicit
    slash commands available.
20. `cat_tool` shall expose proposal tools to eligible strong direct Cats.
21. `heuristic_prefilter` may temporarily enable the previous deterministic
    detector as an experimental detector-only backstop. In this mode, the
    proposal tool is not exposed and the v1 detector candidate path is the only
    no-slash suggestion path. It shall not be the default mode.
22. Until the Cat proposal tool path ships, the deployment default shall be
    `off`. After that path ships, the deployment default may become `cat_tool`,
    but it shall not default to `heuristic_prefilter`.
23. Owner settings shall provide a user-facing "Suggest Work/Code from chat"
    control stored at the owner-profile level. One switch covers all direct
    lanes for that owner; per-lane and per-Cat overrides are out of v1. The
    deployment gate can force the feature off even if the owner setting is on.
24. The effective natural-intent mode shall be `off` if either the deployment
    gate or owner setting is off. Otherwise, the effective mode is the
    deployment mode.

#### Audit and metadata

25. Proposal metadata shall record the original message id, channel id,
    conversation id, transport, proposing Cat id, target product, rationale,
    created timestamp, expiry timestamp, and status.
26. Confirmation metadata shall link the confirmation event back to the
    original proposal and owner message id.
27. Work Items created from confirmed proposals shall preserve the original
    message and proposal context in the same durable source fields used by
    SPEC-104, with an additional marker identifying the source as a Cat-authored
    proposal.
28. The original user transcript shall remain the user's ordinary text. The
    platform shall not rewrite it as if the user typed a slash command.
29. If a later projection needs a slash-equivalent command, it shall be derived
    metadata, not replacement transcript text.

### Non-Functional Requirements

- **Safety**: no durable product action occurs without explicit owner
  confirmation.
- **Auditability**: confirmed proposals can be traced back to the owner message,
  proposing Cat, and proposal event.
- **Transport parity**: Web and Telegram use the same proposal and confirmation
  semantics after ingress.
- **Layering**: Cats own natural-language semantic proposals; Chat owns
  proposal persistence and confirmation; SPEC-104 owns confirmed intake; Work
  and Code own durable records and execution.
- **Localization**: visible proposal, confirmation, decline, and human-gate copy
  shall come from the shared i18n catalog.
- **Cost**: no hidden classifier call shall run for every ordinary chat message
  by default.
- **Provider compatibility**: providers without tool-call support do not get a
  structured-output bridge in v1. Strong Cats backed by such providers do not
  surface natural-language proposals; the owner can still use explicit `/work`
  or `/code`.

## Design Overview

```text
ordinary direct message
  -> ordinary direct Cat dispatch
      no proposal tool call -> ordinary chat only
      proposal tool call -> append proposal system segment
  -> owner confirms
      work -> SPEC-104 equivalent: /work <source>
      code -> SPEC-104 equivalent: /code <source>
  -> SPEC-104 direct audience capability gating
      strong_agent -> draft anchor + chat-only Concierge reply
      weak_worker/unknown -> human gate
```

### Proposal Tool Contract

The implementation may choose exact provider-facing tool names, but the
semantic contract should be one of:

- one tool: `proposeProductIntake`
- two narrow tools: `proposeWorkIntake` and `proposeCodeIntake`

The single-tool shape is preferred unless provider tooling strongly benefits
from separate names:

```ts
interface ProposeProductIntakeInput {
  targetProduct: 'work' | 'code';
  sourceMessageId?: string;
  title?: string;
  summary: string;
  rationale: string;
  suggestedNextQuestion?: string;
}
```

Validation rules:

- `targetProduct` must be `work` or `code`.
- `summary` and `rationale` must be non-empty.
- `sourceMessageId`, when present, must belong to the same direct lane.
- The platform may default `sourceMessageId` to the current owner turn when the
  tool call happens during that turn.
- The tool result is a proposal segment, not a Work Item.

The `proposeProductIntake` grant is subject to ADR-101's per-turn tool-chain
separation. Within a single assistant turn, the Cat shall not also receive
`createWorkItem`, `createTask`, or `createRun` tool grants once those become
agent-callable tools. The Cat shall not call `proposeProductIntake` more than
once per assistant turn. Both rules are platform-enforced policy gates, not
prompt-only suggestions.

### Proposal Metadata

Proposal suggestions are append-only system segments. The original user message
may carry a lightweight reference, but the proposal system segment is the audit
source of truth.

```ts
interface CatProductIntentProposalMetadata {
  version: 2;
  proposalId: string;
  event: 'proposed';
  source: {
    messageId: string;
    channelId: string;
    conversationId: string;
    transport: 'web' | 'telegram';
  };
  proposedBy: {
    catId: string;
    actorId: string;
    capabilityProfileKind: 'strong_agent';
  };
  proposal: {
    targetProduct: 'work' | 'code';
    title?: string;
    summary: string;
    rationale: string;
    suggestedNextQuestion?: string;
  };
  createdAt: string;
  expiresAt: string;
}
```

`proposalId` is the idempotency key. A practical v2 format is
`cat-product-intent:v2:<messageId>:<catId>:<targetProduct>`.

Proposal metadata is stored on the proposal system segment under
`metadata.catProductIntentProposal`. Confirm, decline, and expire transitions
are stored on later system segments under
`metadata.catProductIntentProposalTransition`. These keys are deliberately
distinct from PLAN-093's `metadata.implicitProductIntentCandidate` and
`metadata.implicitProductIntentTransition` so v1 and v2 segments can coexist
during the migration window.

### Confirmation Transcript Shape

Confirm, decline, and expire transitions are also append-only system segments.
They do not mutate the proposal system segment as the audit source.

```ts
interface CatProductIntentProposalTransitionMetadata {
  version: 2;
  proposalId: string;
  event: 'confirmed' | 'declined' | 'expired';
  sourceMessageId: string;
  proposedByCatId: string;
  targetProduct: 'work' | 'code';
  idempotencyKey: string;
  confirmedCommand?: {
    sourceKind: 'cat_product_intent_proposal';
    command: 'work' | 'code';
    argumentText: string;
    rawCommandToken: '(cat-proposal-confirmation)';
    botSuffix: null;
    proposalConfirmed: true;
    originalProposalId: string;
    originalMessageId: string;
  };
}
```

Repeating confirmation for the same `proposalId` is a no-op: it must not write a
second Work Item anchor. Decline after confirmation is ignored or rejected as
stale. Confirm after decline requires a new proposal.

### Confirmation Semantics

Confirmation is a bridge into SPEC-104, not a parallel intake implementation.
The confirmed command name and `argumentText` are derived from the source owner
message and Cat proposal. The transcript keeps the original ordinary text.

For routing, confirmed Cat proposals synthesize command metadata with:

- `command = 'work'` or `'code'`
- `posture = command`
- `targetProduct = command`
- `argumentText = proposal.summary.trim()` when non-empty; otherwise fall back
  to `originalMessage.body.trim()` for defensive legacy/migration handling
- `productIntentArgumentProvided = true`
- `rawCommandToken = '(cat-proposal-confirmation)'`
- `botSuffix = null`
- `proposalConfirmed = true`
- `originalProposalId` and `originalMessageId`

The implementation shall not create a fake transcript message containing
`/work ...` or `/code ...`.

### Suppression Model v2

Proposal suppression is lane-local and platform-enforced:

- a proposal expires after 15 minutes if the owner does not confirm or decline
  it
- switching the lane to explicit `/chat` expires outstanding proposals but does
  not close established Work Items
- when a new ordinary owner message arrives in the same lane, the platform
  expires any existing unresolved proposal before allowing a new proposal
- repeating the same `proposalId` tool call is an idempotent no-op, not a new
  proposal
- declining any Work/Code proposal starts a five-minute lane cooldown
- during cooldown, the server rejects later proposal tool calls in that lane
  with `{ rejected: true, reason: 'cooldown_active' }`; this is not a prompt
  suggestion

### Heuristic Detector Status

The deterministic detector from PLAN-093 is superseded as the default
natural-language path. During migration it may remain behind
`CATS_CHAT_NATURAL_PRODUCT_INTENT_MODE=heuristic_prefilter`, but:

- it must be off unless explicitly selected;
- it is detector-only: the proposal tool is not exposed in this mode, and the
  v1 detector candidate path is the only no-slash suggestion path;
- it must still require owner confirmation;
- it must not create durable product records;
- it must be removable without changing SPEC-104;
- new language support must not be implemented by expanding keyword lists as
  the primary strategy.

## Acceptance Criteria

- Explicit `/chat`, `/work`, and `/code` continue to work regardless of natural
  suggestion settings.
- `/chat` inside Work context behaves as ordinary conversational posture and
  does not close established Work Items.
- Strong direct Cats can create Work/Code proposal segments only through the
  proposal tool and only when the feature is enabled.
- Weak/unknown Cats never receive the proposal tool.
- Providers without tool-call support do not receive a structured-output
  proposal fallback in v1.
- No Work Item, Task, Run, Code execution, or active-anchor state is created
  before owner confirmation.
- Confirming a Work proposal enters the same behavior as `/work <source>`.
- Confirming a Code proposal enters the same behavior as `/code <source>`.
- Declining or ignoring a proposal leaves the lane as ordinary chat.
- Declining a proposal starts server-side cooldown, and proposal tool calls
  during cooldown are rejected with `cooldown_active`.
- Explicit `/chat` expires outstanding proposals without closing established
  Work Items.
- Proposal and confirmation metadata preserve original owner message context
  and proposing Cat context.
- Proposal and transition metadata use `metadata.catProductIntentProposal` and
  `metadata.catProductIntentProposalTransition`.
- The old heuristic detector is disabled unless explicitly selected by
  deployment config.
- UI-visible proposal copy is localized; semantic classification is not
  localized through platform keyword lists.

## Open Questions

- [ ] Should the owner setting default to off for the first proposal-tool
      release, or can it default on when the deployment mode is `cat_tool`?
- [ ] Should proposal history appear in Work/Code projections, or only in Chat
      transcript metadata?

## References

- [ADR-101: Use the Direct-Audience Cat for Slash-Mode Work Intake](../decisions/101-use-direct-audience-cat-for-slash-mode-work-intake.md)
- [ADR-102: Use Cat-Authored Product Intent Proposals for Natural-Language Intake](../decisions/102-use-cat-authored-product-intent-proposals.md)
- [PLAN-094: Cat-Proposed Product Intent Rollout](../plans/PLAN-094-cat-proposed-product-intent-rollout.md)
- [PLAN-093: Direct Chat Implicit Product Intent Rollout](../plans/PLAN-093-direct-chat-implicit-product-intent-rollout.md)
- [SPEC-104: Direct Chat Slash-Mode Work Intake](./SPEC-104-direct-chat-slash-mode-work-intake.md)
- [SPEC-082: Cats Work Agent Supervision and Tool Boundary](./SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)

---

*Created: 2026-05-06*
*Updated: 2026-05-06*
*Author: Codex*
*Related Plan: [PLAN-094](../plans/PLAN-094-cat-proposed-product-intent-rollout.md)*

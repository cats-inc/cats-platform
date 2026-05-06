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
create a durable Work Item anchor, and later follow up through supervised
task/run execution. `/code` uses the same Work Item anchor with a Code target
hint; it does not bypass Work Item creation in the MVP. If the addressed Cat is
`weak_worker` or `unknown`, the system must not autonomously create durable work
records; it asks the human to confirm or create them.

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
  Work Item anchor when ready
- require a human gate for weak or unknown direct Cats before durable work
  objects are created
- keep the same direct lane as the follow-up surface after Work Item anchors
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

1. The product shall recognize `/chat`, `/work`, and `/code` through one shared
   pure parser used by both Telegram-origin and Web-origin messages.
2. The parser shall live in Chat-owned shared product code, return a structured
   command result, strip Telegram bot suffixes such as `/work@botname`, trim
   surrounding whitespace, and keep any post-command argument text as structured
   `argumentText` rather than letting transports parse it differently.
3. Product-intent commands shall be evaluated before normal assistant dispatch
   for that inbound turn.
4. `/chat` shall set the lane posture to ordinary direct chat.
5. `/work` shall set the lane posture to direct work intake.
6. `/code` shall set the lane posture to direct code intake with
   `targetProduct: 'code'`.
7. These commands shall not create a new persistent channel kind. The channel
   remains `direct_message`.
8. Transport-control commands such as `/start`, `/help`, `/commands`, and
   `/status` remain separate from product-intent commands.
9. The existing `/mode` Telegram command from SPEC-038 shall not be overloaded
   for product switching in this MVP.
10. Telegram command-menu sync shall register `/chat`, `/work`, and `/code`
    alongside the SPEC-038 command set so Telegram autocomplete exposes the
    product-intent commands.
11. Repeating the current posture command is idempotent. The product shall
    acknowledge it with a system segment but shall not reset active anchors or
    create duplicate posture-change state.
12. A product-intent command in a non-direct channel shall produce a visible
    "direct messages only" system response and shall not change posture.

#### Direct audience resolution

13. The MVP shall apply only when the current channel is `direct_message`.
14. The direct lane shall resolve exactly one audience Cat before work-intake
    behavior is allowed.
15. If no direct audience Cat can be resolved, the system shall reject the
    intake action and ask the human to choose a Cat.
16. If more than one audience is present, the flow is out of MVP scope and shall
    not silently pick a Cat.

#### Capability gating

17. The direct audience Cat shall resolve to an execution target using the
    existing Cat identity / execution-target boundary.
18. The execution target shall resolve through the existing provider capability
    profile mechanism.
19. The product shall not infer `strong_agent` or `weak_worker` from provider
    names, model labels, runtime availability, or provider delivery events.
20. `strong_agent` is required before autonomous durable Work Item anchor
    creation.
21. `weak_worker` and `unknown` shall be treated as not strong for autonomous
    durable work creation.

#### Strong direct Cat behavior

22. In `/work` posture, a `strong_agent` direct Cat may ask clarification
    questions before creating a Work Item.
23. In `/code` posture, a `strong_agent` direct Cat follows the same Work Item
    anchor path as `/work`, but the anchor carries `targetProduct: 'code'` and
    the first next action is Code-bound.
24. The clarification loop shall be Cat-initiated when required; the user shall
    not need to fill a separate intake form for the MVP.
25. The product shall create a durable draft Work Item anchor only through the
    posture/capability-gated direct slash-mode command path. The draft schema
    requires non-empty `goal`, `successCriteria[]`, `outOfScope[]`, and
    `openQuestions[]`.
26. The Concierge system prompt shall explicitly tell the Cat how to clarify
    against the existing draft anchor and when to propose task/run follow-up.
    Creating the anchor alone is not sufficient.
27. The default clarification budget is three assistant clarification turns
    after entering `/work` or `/code`. When the budget is exhausted, the Cat
    shall either create the Work Item if the schema is satisfied or ask the
    human to confirm creation with stated assumptions; it shall not ask
    unbounded new questions.
28. After Work Item creation, the same direct Cat remains the follow-up agent
    for that item in the direct lane.
29. The Cat may start or request supervised task/run execution only through
    existing Work/Code supervision boundaries, approval gates, and budgets.
30. In `/chat` posture, the Cat shall answer as ordinary direct chat unless the
    user explicitly changes posture again.

#### Weak / unknown direct Cat behavior

31. In `/work` or `/code` posture, a `weak_worker` or `unknown` direct Cat
    shall not autonomously create Work Items, Tasks, Runs, or Code execution.
32. Web shall present an inline human-confirm action in the direct lane for
    creating the drafted Work Item. Telegram shall return a concise response
    with a deep link to the Web confirmation/create surface until Telegram has
    its own rich confirmation UI.
33. If a human-gated create UI is unavailable, the system shall explain that a
    human must create the durable work object or switch to a stronger Cat.
34. Weak/unknown Cats may continue clarifying the request conversationally, but
    their output remains advisory until a human confirms durable work creation.
35. Weak/unknown behavior shall not auto-escalate to another Cat in the MVP.

#### Durable records and follow-up

36. Work Item creation shall use the current Core / Work product record
    contracts; this spec does not add a new canonical record family.
37. The created Work Item shall set `conversationId` to the source direct
    conversation id.
38. The created Work Item shall store `metadata.directSlashModeIntake` with
    source command segment id, command turn id, command lane id, source channel
    id, source transport, product posture, target product, direct audience Cat
    id, resolved capability profile kind, and schema version.
39. Created Tasks shall use existing task planning metadata with
    `planning.productHint` set to `work` or `code`, and shall store a compact
    `metadata.directSlashModeIntakeRef` pointing back to the Work Item and
    source command segment.
40. A direct lane may keep `metadata.directSlashMode.activeAnchor` as current
    state for routing and follow-up. That lane field is a cache, not the audit
    source of truth; it must point back to the Work Item and posture event.
41. Follow-up status and clarification shall be visible in the originating
    direct lane and in the relevant Work/Code product surfaces.
42. Product posture changes shall be auditable enough to explain why a later
    Work Item anchor was created from a direct conversation.

#### Tool-chain separation

43. The product-intent command turn that creates a draft Work Item anchor shall
    not dispatch to `createTask`, `createRun`, or Code execution in the same
    turn. It may dispatch the same direct Cat for a chat-only Concierge reply
    that asks clarification or recaps the request. Follow-up task/run work
    begins only on later user turns. The constraint applies even when the same
    direct Cat is wearing both Concierge and Conductor hats.
44. SPEC-082 supervision approval gates apply on top of the turn-separation
    rule above. Approval gates are not a substitute for the turn separation.
45. The draft Work Item anchor result shall be surfaced to the user before the
    Concierge reply in the same turn it is created, so the user sees the anchor
    before any Conductor-style follow-up can run.

#### Active anchor lifecycle

46. After a `/chat` posture change, the lane's
    `metadata.directSlashMode.activeAnchor` cache shall be cleared. If the
    linked Work Item is still a draft in the same source conversation, it shall
    be marked `cancelled` with posture-abandoned metadata instead of remaining
    as an untracked orphan.
47. When the active Work Item reaches a terminal `CoreWorkItemStatus`
    (`completed`, `cancelled`, or `archived`), the lane's active-anchor cache
    shall be cleared.
48. A subsequent `/work` or `/code` posture change in a lane that previously
    had its active-anchor cache cleared shall start a fresh intake; it shall
    not auto-resume any earlier Work Item. Future explicit-resume UI is
    covered by the multi-anchor open question and is out of MVP scope.
49. A direct `/work` <-> `/code` posture switch while a draft active anchor
    exists shall supersede the prior draft anchor. The old Work Item shall be
    marked `cancelled` when still `draft` and shall carry metadata pointing to
    the replacement Work Item. The lane cache shall point only at the new
    active anchor.

#### Boundary and naming

50. This flow shall not reintroduce retired prototype route/control labels.
51. The canonical domain split remains `direct_message` vs `chat_channel`.
52. Entry UI labels such as default/group/parallel shall not be used to decide
    model strength or durable work permissions.
53. Strong/weak resolution shall be deterministic policy lookup, not an LLM
    self-assessment.
54. The MVP shall not introduce new fields on Core record types.
    `CoreWorkItemRecord.conversationId` already exists and is the source-id
    field; everything else lives in additive `CoreRecordMetadata` keys
    (`metadata.directSlashModeIntake`, `metadata.directSlashModeIntakeRef`,
    `metadata.directSlashMode.activeAnchor`, `metadata.directSlashModePostureChange`,
    `metadata.planning.productHint`).

### Non-Functional Requirements

- **Safety**: weak/unknown Cats fail closed for durable work creation.
- **Auditability**: durable Work Item anchors created from direct chat carry
  `metadata.directSlashModeIntake` source context for later review.
- **Transport parity**: Telegram and Web direct lanes share the same product
  intent semantics after transport command parsing.
- **Localization**: visible acknowledgements, human-gate choices, and durable
  draft placeholder text shall come from the shared i18n catalog. Durable draft
  metadata shall retain enough localization key context for later projection
  or UI re-rendering.
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
      /code -> direct code-intake posture with targetProduct='code'
  -> write system segment with metadata.directSlashModePostureChange
  -> resolve direct audience Cat
  -> resolve Cat execution target
  -> resolve provider capability profile
      strong_agent:
        same Cat asks clarifying questions
        same Cat creates Work Item anchor when ready
        same Cat follows up through supervised task/run boundary
      weak_worker / unknown:
        no autonomous durable work creation
        ask human to confirm/create or switch Cat
```

### Posture Event Model

Product posture is event-sourced in the message stream. Every accepted
direct-lane product-intent command writes a system segment whose
`metadata.directSlashModePostureChange` carries:

```ts
interface DirectSlashModePostureChangeMetadata {
  version: 1;
  command: 'chat' | 'work' | 'code';
  previousPosture: 'chat' | 'work' | 'code' | null;
  posture: 'chat' | 'work' | 'code';
  targetProduct: 'chat' | 'work' | 'code';
  changed: boolean;
  sourceTransport: 'web' | 'telegram';
  sourceChannelId: string;
  audienceCatId: string | null;
  capabilityProfileKind: 'strong_agent' | 'weak_worker' | 'unknown' | null;
}
```

The system segment content should be a short acknowledgement in both Web and
Telegram, including idempotent repeats (`changed: false`). Non-direct channels
receive a visible rejection system segment and do not write posture-change
state.

### Work Item Intake Metadata

The Work Item is the durable anchor for both `/work` and `/code`.

Before a strong Cat creates a Work Item from direct chat, it should be able to
produce:

- title
- summary
- goal
- non-empty success criteria
- non-empty out-of-scope list
- non-empty open questions list
- proposed next action
- target product hint (`work` or `code`)

Storage contract:

```ts
interface DirectSlashModeIntakeMetadata {
  version: 1;
  targetProduct: 'work' | 'code';
  source: {
    channelId: string;
    conversationId: string;
    commandTurnId: string;
    commandLaneId: string;
    commandSegmentId: string;
    transport: 'web' | 'telegram';
  };
  audience: {
    catId: string;
    capabilityProfileKind: 'strong_agent' | 'weak_worker' | 'unknown';
  };
  command: {
    name: 'work' | 'code';
    argumentText: string;
    posture: 'work' | 'code';
  };
  draft: {
    goal: string;
    successCriteria: string[];
    outOfScope: string[];
    openQuestions: string[];
    proposedNextAction: 'clarify' | 'create_task' | 'create_run';
    placeholder?: boolean;
    requiresClarification?: boolean;
    localization?: {
      locale: 'en' | 'zh-TW';
      titleFallbackKey: string;
      summaryKey: string;
      goalFallbackKey: string;
      successCriteriaKeys: string[];
      outOfScopeKeys: string[];
      openQuestionKeys: string[];
    };
  };
}
```

`CoreWorkItemRecord.conversationId` is the source direct conversation id.
The full source details live in `workItem.metadata.directSlashModeIntake`.
Tasks created from the anchor use existing `metadata.planning.productHint` and
carry `metadata.directSlashModeIntakeRef = { workItemId, commandSegmentId }`.

### Active Anchor Resolution

After a Work Item is created, the originating direct lane keeps an active-anchor
current-state pointer:

```ts
interface DirectSlashModeActiveAnchor {
  workItemId: string;
  targetProduct: 'work' | 'code';
  establishedBySegmentId: string;
  establishedAt: string;
}
```

Follow-up messages attach to this active anchor until the user switches posture
back to `/chat`, selects another active anchor through future UI, or the Work
Item reaches a terminal `CoreWorkItemStatus` (`completed`, `cancelled`, or
`archived`). This pointer is a convenience cache; audit and projection tests
must still rely on the Work Item source metadata and posture event.

The cache is cleared eagerly when posture flips to `/chat` (FR-46) and when the
linked Work Item reaches a terminal status (FR-47). A subsequent `/work` or
`/code` in the same lane starts a fresh intake (FR-48); the prior Work Item
remains addressable from the Work product surface but is not implicitly
re-attached to the lane.

If the fresh intake is caused by a direct `/work` <-> `/code` switch while an
older draft anchor is still active, the prior draft is superseded rather than
left orphaned. The new command segment records `clearReason:
anchor_superseded`, the old draft Work Item is cancelled when it is still in
`draft` status, and metadata on the old record points at the replacement Work
Item. If policy cannot create a replacement anchor for the new posture, the
old cache is still cleared with `clearReason: posture_changed` and the prior
Work Item remains available from Work without being implicitly re-attached.

### Concierge Prompt Framework

The Concierge system prompt is what turns the gated draft Work Item anchor into
observable intake behavior. Anchor creation without an explicit prompt protocol
leaves the Cat unsure how to clarify and tends to either over-ask (repeats
clarifying questions past the budget) or under-ask (jumps to execution from one
user message). The MVP prompt protocol is:

- **One focal question per assistant turn.** The Cat shall not stack multiple
  questions in one message. Stacked questions overwhelm the user, dilute
  answers, and burn the clarification budget faster than they should.
- **Default question priority order**: `goal` → `successCriteria` →
  `outOfScope` → `openQuestions`. The Cat may consolidate when the user
  volunteers information unsolicited, and may revisit earlier topics if a
  later answer reveals a contradiction.
- **Recap before follow-up.** The Cat shall surface a brief recap of current
  understanding (what is clarified, what remains) at least once before proposing
  task/run follow-up, so the user has a chance to correct the understanding.
- **Explicit follow-up.** The Cat shall propose task/run follow-up only when the
  draft schema (`goal`, `successCriteria[]`, `outOfScope[]`, `openQuestions[]`)
  is satisfied or when the FR-27 clarification budget is exhausted; in the
  latter case the prompt directs the Cat to ask the user to confirm the stated
  assumptions.

This prompt content lives in product-owned prompt source (Phase 3 Task 3.2b)
and is testable independently of command gating and schema validation.

### Web Composer Ingress

Web ingress passes user-typed messages through the Chat composer
(`src/products/chat/renderer/components/Composer.tsx` or its current
equivalent). When the message text starts with `/`, the composer shall invoke
the shared parser (FR-1, FR-2) before sending. Recognized product-intent
commands trigger the same dispatch path as Telegram-origin commands;
non-recognized `/`-prefixed text is passed through as ordinary message
content.

Telegram ingress is unchanged from SPEC-038 — `src/platform/transports/
telegram/...` continues to own bot-side parsing, command-menu sync, and
transport-control commands. The shared parser is the single point that both
transports agree on for product-intent semantics. Drift between the two
transports is prevented by the parser and boundary tests in PLAN-092 Phase 1.

SPEC-038 ownership extends to the `/help` and `/commands` outputs. Those
outputs shall list `/chat`, `/work`, and `/code` alongside the existing
transport-control commands so users discover the product-intent surface
through the same `/help` they already use. The list update is tracked as a
PLAN-092 Phase 1 task with a docs-only follow-up to SPEC-038.

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
- The shared parser handles `/work@botname`, whitespace, and transport parity
  for Telegram and Web.
- Telegram transport commands still behave according to SPEC-038 and are not
  confused with product-intent commands.
- `/chat`, `/work`, and `/code` are registered through Telegram command-menu
  sync.
- Product-intent commands write auditable system segments with posture-change
  metadata.
- Repeating the active posture command is idempotent and does not reset the
  active anchor.
- Product-intent commands in non-direct channels produce a visible rejection and
  do not change posture.
- Direct work-intake rejects channels without exactly one audience Cat.
- Capability gating uses the existing provider capability profile resolver.
- Tests prove unconfigured/unknown providers do not get autonomous durable work
  creation.
- Tests prove configured `strong_agent` direct Cats may enter the clarification
  and Work Item anchor creation path.
- Tests prove `weak_worker` direct Cats require a human gate.
- Created Work Items preserve source conversation and audience Cat context in
  the `conversationId` field plus `metadata.directSlashModeIntake`.
- `/code` creates a Work Item anchor with `targetProduct: 'code'` before Code
  task/run execution begins.
- Strong `/work` / `/code` paths test command gating, Concierge prompt protocol,
  schema validation, and clarification-budget behavior independently.
- A successful draft anchor creation turn may dispatch the same direct Cat for
  a chat-only Concierge reply, but does not dispatch `createTask`, `createRun`,
  or Code execution in the same turn; follow-up execution can only happen in a
  later user turn under SPEC-082 supervision approval gates.
- The draft anchor result is surfaced to the user in the same turn it is
  created, before any Conductor-style follow-up can run.
- A `/chat` posture change clears the lane's active-anchor cache, cancels the
  same-conversation draft anchor as abandoned when applicable, and a subsequent
  `/work` or `/code` starts a fresh intake.
- Switching directly between `/work` and `/code` supersedes the prior draft
  anchor instead of leaving it as an untracked orphan.
- A Work Item reaching `completed`, `cancelled`, or `archived` clears the
  lane's active-anchor cache.
- The Concierge prompt enforces one focal question per assistant turn and
  surfaces a recap of current understanding before proposing task/run follow-up.
- Follow-up prompt injection validates that the referenced Work Item still
  belongs to the source direct conversation before treating an intake ref as
  active.
- Web composer routes `/`-prefixed messages through the shared parser before
  send; non-recognized `/`-prefixed text passes through as ordinary content.
- SPEC-038 `/help` and `/commands` outputs list `/chat`, `/work`, and `/code`
  alongside transport-control commands.
- No new fields are added to Core record types (`CoreWorkItemRecord`,
  `CoreTaskRecord`, etc.); all new state lives in additive
  `CoreRecordMetadata` keys plus the existing `conversationId` field.
- No retired route/control labels are introduced in storage, API contracts,
  docs, or tests.

## Open Questions

- [ ] Should future UI allow multiple active Work anchors per direct lane with
      explicit selection, or is one active anchor enough until group
      orchestration lands?
- [ ] Should persisted product-intent system segments carry localization keys
      and interpolation values in addition to rendered `content`, so future
      readers can re-render acknowledgements in a different locale?

## References

- [PLAN-092: Direct Chat Slash-Mode Work Intake Rollout](../plans/PLAN-092-direct-chat-slash-mode-work-intake-rollout.md)
- [PLAN-075: Real Provider Orchestrator Integration](../plans/PLAN-075-real-provider-orchestrator-integration.md)
- [PLAN-085: Mission Cancel and Run Stop Rollout](../plans/PLAN-085-mission-cancel-and-run-stop-rollout.md)

---

*Created: 2026-05-06*
*Author: Codex*
*Related Plan: [PLAN-092](../plans/PLAN-092-direct-chat-slash-mode-work-intake-rollout.md)*

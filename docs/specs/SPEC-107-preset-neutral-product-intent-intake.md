# SPEC-107: Preset-Neutral Product Intent Intake

> Generalize explicit `/chat` / `/work` / `/code` commands and strong-Cat
> Work/Code proposal intake from direct messages to every supported Chat, Code,
> and Work preset.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-103](../decisions/103-use-preset-neutral-product-intent-intake.md) |
| **Related Plan** | [PLAN-096](../plans/PLAN-096-preset-neutral-product-intent-intake-rollout.md) |

## Summary

The current Work/Code intake MVP works from Telegram or Web direct messages.
Owners can explicitly type `/work` or `/code`, or a strong direct Cat can
propose turning ordinary chat into Work/Code intake. This spec generalizes that
contract to every current Chat, Code, and Work preset by introducing a
preset-neutral source context. Explicit commands and Cat-authored proposals
reuse one intake path, create a Work Item anchor only after capability and
confirmation gates, and preserve the exact product preset, lane, branch, Cat,
and transport that produced the intent.

## Goals

- support explicit `/chat`, `/work`, and `/code` in every supported Chat,
  Code, and Work preset
- let eligible strong Cats in those presets propose Work/Code intake from
  ordinary no-slash messages
- keep owner confirmation required before no-slash proposals create durable
  product state
- reuse one Work Item anchor path for Chat-originated, Code-originated, and
  Work-originated intake
- preserve source context for group, team, parallel, and peer presets
- keep Telegram and mobile ingress aligned with the same preset-neutral
  contract when they send into a supported preset
- converge direct-mode metadata into preset-neutral metadata without long-term
  duplicate contracts

## Non-Goals

- no automatic Work Item, Task, Run, or Code execution from ordinary no-slash
  chat text
- no platform-owned semantic classifier as the default natural-language path
- no new persistent channel kind, preset kind, or product mode taxonomy
- no hidden handoff to another Cat when the current preset's eligible Cats are
  weak or unknown
- no per-product command parser forks
- no bypass around existing Work/Code supervision, approval, budget, or
  execution boundaries
- no full mobile interaction redesign beyond supporting the same message and
  confirmation contracts

## User Stories

- As an owner in `+New chat`, I want to type `/work draft the migration plan`
  and have Cats create a Work Item anchor from that chat.
- As an owner in `+Team code`, I want a strong Cat to recognize that my
  no-slash request should become a Code-targeted Work Item and ask for my
  confirmation.
- As an owner in `+Parallel chat`, I want proposals and Work Items to point
  back to the exact branch that raised the idea.
- As an owner in `+Parallel work`, I want `/code` to capture coding follow-up
  without leaving the Work surface or losing the source context.
- As a maintainer, I want all presets to use one command/proposal/confirmation
  contract instead of product-local copies.

## Requirements

### Functional Requirements

#### Preset coverage

1. The platform shall support product-intent intake from these current presets:
   `new_chat`, `group_chat`, `parallel_chat`, direct/private lanes,
   `new_code`, `team_code`, `peer_code`, `new_work`, `team_work`, and
   `parallel_work`.
2. Each supported preset shall be able to produce a
   `ProductPresetIntentContext`.
3. A context shall identify `sourceProduct`, `presetId`, source conversation or
   container id, lane or branch id when present, current turn id, source
   segment/message id, origin surface, transport, and eligible Cat
   participants.
4. A preset that cannot produce a valid context shall reject product-intent
   commands with visible, localized copy and shall not create durable state.
5. The context resolver shall be shared by explicit commands and Cat-authored
   proposals.

#### Explicit command behavior

6. `/chat`, `/work`, and `/code` shall use one shared parser across Web,
   mobile, Telegram-linked ingress, and product composers.
7. Product-intent commands shall be evaluated before normal assistant dispatch.
8. `/chat` shall set ordinary conversation posture for the current source
   context. It may expire unresolved proposals and abandon unconfirmed draft
   intake, but it shall not close established Work Items.
9. `/work` shall request Work-targeted intake from the current source context.
10. `/code` shall request Code-targeted intake from the current source context.
11. Command handling shall not create a new channel kind or persistent preset
    kind.
12. Unknown slash commands shall continue through ordinary message handling
    unless another transport-control command owns them.
13. Telegram command suffixes such as `/work@botname` shall still normalize to
    the shared product-intent command.
14. Transport-control commands such as `/start`, `/help`, `/commands`,
    `/status`, and `/mode` shall remain separate from product-intent commands.

#### Strong-Cat proposal behavior

15. Natural-language product suggestions shall be created by eligible strong
    Cats through the existing proposal-only tool family.
16. Proposal tools shall be exposed only when deployment policy and owner
    settings allow natural-language product suggestions.
17. Proposal tools shall be exposed only to Cats whose resolved provider
    capability profile is `strong_agent`.
18. Weak or unknown Cats shall not receive proposal tools.
19. A proposal tool call shall write an append-only proposal system segment and
    shall not create a Work Item, Task, Run, active anchor, or Code execution.
20. A source lane or branch shall accept at most one product-intent proposal per
    assistant turn.
21. Proposal tools shall not be exposed in the same assistant turn as durable
    Work Item, Task, Run, or Code execution tools.
22. Providers without tool-call support shall not receive a structured-output
    fallback in this spec.

#### Eligible Cat resolution

23. Direct/private presets shall use the addressed direct Cat.
24. Single-recipient Chat, Code, or Work presets shall use the selected or
    assigned Cat for the current turn.
25. Group and team presets may accept proposals from any addressed or active
    Cat in the current turn, subject to capability and one-proposal-per-turn
    limits.
26. Parallel and peer presets shall scope eligible Cats, proposals, and anchors
    to the child lane or branch where the message was produced.
27. The platform shall not silently switch to another Cat when all eligible
    Cats are weak or unknown.
28. If multiple strong Cats attempt to propose in the same lane/turn, the first
    accepted proposal is the only active proposal; later proposals are rejected
    or ignored with an auditable reason.

#### Confirmation and durable intake

29. No-slash proposals require explicit owner confirmation before posture or
    durable Work/Code state changes.
30. Confirming a Work proposal shall enter the same preset-neutral intake path
    as `/work <source>`.
31. Confirming a Code proposal shall enter the same preset-neutral intake path
    as `/code <source>`.
32. Confirmation shall be idempotent for the same proposal id.
33. Declining or ignoring a proposal shall leave the source context in ordinary
    conversation posture and shall not create durable product state.
34. Proposal, confirmation, decline, and expiry shall be represented as
    append-only message-stream system segments.
35. The original user transcript shall not be rewritten into a fake slash
    command.

#### Work Item anchors and metadata

36. The Work Item shall remain the durable anchor for both Work-targeted and
    Code-targeted intake.
37. Work Items created by this flow shall preserve source context in additive
    metadata under `metadata.productIntentIntake`.
38. Follow-up Tasks shall carry compact references under
    `metadata.productIntentIntakeRef`.
39. Active anchor state shall be scoped by source context under
    `metadata.productIntent.activeAnchor` or an equivalent preset-neutral
    field.
40. The metadata shall include schema version, source product, preset id,
    conversation/container id, lane/branch id, turn id, source segment id,
    transport, origin surface, target product, eligible/proposing Cat,
    capability profile kind, and confirmation/proposal ids when present.
41. The existing direct MVP metadata names such as `directSlashMode` shall be
    migrated or replaced during rollout so the canonical path is
    preset-neutral.
42. The rollout shall not add new fields to Core record types unless a later
    ADR approves a schema change. Additive metadata is the default.

#### Follow-up and execution

43. Creating a Work Item anchor shall be separated from Task, Run, or Code
    execution.
44. The command or confirmation turn may surface the new anchor and a
    chat-only clarification or recap from the eligible Cat.
45. Task, Run, or Code execution may begin only through existing Work/Code
    supervision boundaries on a later owner turn or explicit follow-up action.
46. Follow-up messages in the same source context shall be able to resolve the
    active anchor when the anchor still belongs to that source context.
47. `/chat` shall clear unresolved proposal or draft-intake state for the
    source context but shall not close established Work Items.
48. Switching between `/work` and `/code` while an unconfirmed or draft anchor
    exists shall supersede the prior draft in the same source context rather
    than leave an orphan.
49. Terminal Work Item statuses shall clear the matching active-anchor cache.

#### Transport and client parity

50. Web desktop product composers shall invoke the shared parser before send.
51. Mobile product composers shall attach the same command metadata when
    sending into a supported preset.
52. Telegram ingress shall map incoming product-intent commands and proposal
    callbacks to the linked preset context when one exists.
53. Telegram shall fall back to the direct inbox context only when the thread is
    not linked to another supported preset.
54. Web confirmation may use existing `ChatMessage.choices`.
55. Telegram confirmation may use inline keyboard callbacks keyed by proposal
    id.
56. Mobile shall at minimum render proposal/transition segments and route
    unsupported confirmation actions to a desktop/product deep link rather than
    dropping them silently.
57. Visible command acknowledgements, proposal controls, confirmation results,
    human gates, and unsupported-context copy shall come from the shared i18n
    catalog.

### Non-Functional Requirements

- **Safety**: weak/unknown Cats fail closed for durable product actions across
  every preset.
- **Auditability**: every durable Work Item can be traced to its source product
  preset, lane/branch, owner message, and eligible/proposing Cat.
- **Consistency**: Chat, Code, and Work use one command/proposal/confirmation
  contract.
- **Transport parity**: Telegram and mobile do not define different semantic
  rules from desktop product composers.
- **Cost**: no hidden model classifier call is introduced per ordinary message.
- **Layering**: product presets provide source context; Chat/shared dispatch
  owns command/proposal routing; Work/Code own durable records and execution.
- **Pre-release cleanup**: replace direct-only metadata and tests with the
  preset-neutral path in the same rollout instead of preserving long-term
  aliases.

## Design Overview

```text
Product composer / Telegram-linked ingress / mobile send
  -> shared product-intent parser
  -> ProductPresetIntentContext resolver
      explicit command:
        /chat -> ordinary posture for source context
        /work -> Work-targeted intake
        /code -> Code-targeted intake
      no slash:
        eligible strong Cat may call proposal tool
        owner confirms or declines
  -> confirmed intake
      create Work Item anchor with productIntentIntake metadata
      surface anchor in source context
      later follow-up enters Work/Code supervision boundary
```

### ProductPresetIntentContext

The implementation may choose exact names, but the shared source context must
carry this information:

```ts
interface ProductPresetIntentContext {
  version: 1;
  sourceProduct: 'chat' | 'code' | 'work';
  presetId:
    | 'direct'
    | 'new_chat'
    | 'group_chat'
    | 'parallel_chat'
    | 'new_code'
    | 'team_code'
    | 'peer_code'
    | 'new_work'
    | 'team_work'
    | 'parallel_work';
  source: {
    channelId?: string;
    conversationId?: string;
    containerId?: string;
    laneId?: string;
    branchId?: string;
    turnId: string;
    segmentId: string;
  };
  originSurface: 'desktop' | 'mobile' | 'telegram' | 'api';
  transport: 'web' | 'telegram' | 'line' | 'mobile' | null;
  eligibleCats: Array<{
    catId: string;
    actorId: string;
    capabilityProfileKind: 'strong_agent' | 'weak_worker' | 'unknown';
  }>;
}
```

### Product Intent Metadata

The canonical durable metadata should be preset-neutral:

```ts
interface ProductIntentIntakeMetadata {
  version: 1;
  targetProduct: 'work' | 'code';
  sourceContext: ProductPresetIntentContext;
  command:
    | {
        sourceKind: 'explicit_command';
        name: 'work' | 'code';
        argumentText: string;
        rawCommandToken: '/work' | '/code';
      }
    | {
        sourceKind: 'cat_product_intent_proposal';
        name: 'work' | 'code';
        argumentText: string;
        rawCommandToken: '(cat-proposal-confirmation)';
        proposalId: string;
        originalMessageId: string;
      };
  draft: {
    goal: string;
    successCriteria: string[];
    outOfScope: string[];
    openQuestions: string[];
    proposedNextAction: 'clarify' | 'create_task' | 'create_run';
  };
}
```

## Dependencies

- [ADR-101: Use the Direct-Audience Cat for Slash-Mode Work Intake](../decisions/101-use-direct-audience-cat-for-slash-mode-work-intake.md)
- [ADR-102: Use Cat-Authored Product Intent Proposals for Natural-Language Intake](../decisions/102-use-cat-authored-product-intent-proposals.md)
- [ADR-103: Use Preset-Neutral Product Intent Intake](../decisions/103-use-preset-neutral-product-intent-intake.md)
- [SPEC-104: Direct Chat Slash-Mode Work Intake](./SPEC-104-direct-chat-slash-mode-work-intake.md)
- [SPEC-105: Direct Chat Cat-Proposed Product Intent Confirmation](./SPEC-105-direct-chat-implicit-product-intent.md)
- [SPEC-082: Cats Work Agent Supervision and Tool Boundary](./SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
- [SPEC-095: Cats Mobile Shell](./SPEC-095-cats-mobile-shell-five-tabs-and-product-sidebar-variants.md)
- [PLAN-094: Cat-Proposed Product Intent Rollout](../plans/PLAN-094-cat-proposed-product-intent-rollout.md)
- [Product Integration Guide](../product-integration-guide.md)

## Acceptance Criteria

- Every supported Chat/Code/Work preset can produce a valid source context or a
  visible unsupported-context response.
- `/chat`, `/work`, and `/code` work from all supported desktop presets.
- Mobile sends recognized product-intent command metadata for supported
  presets.
- Telegram product-intent commands resolve to a linked preset context when
  present and direct inbox context otherwise.
- Unknown slash commands remain ordinary messages unless owned by transport
  control.
- Strong eligible Cats in group/team/single presets can create proposal
  segments when natural suggestions are enabled.
- Parallel/peer proposals are scoped to the branch or child lane that produced
  them.
- Weak/unknown Cats never receive proposal tools and never create durable
  product state autonomously.
- No proposal creates a Work Item before owner confirmation.
- Confirmed proposals enter the same intake path as explicit `/work` or
  `/code` with source transcript preserved.
- Work Items created from every supported preset carry
  `metadata.productIntentIntake` with source product, preset, lane/branch,
  target product, Cat, and confirmation context.
- Direct-message intake no longer depends on a direct-only metadata path as the
  canonical implementation.
- Anchor creation and Task/Run/Code execution remain turn-separated.
- Work and Code projections show preset-originated Work Items.
- Proposal and command UI strings are localized in desktop, mobile, and
  Telegram-visible copy.

## Open Questions

- [ ] Should parallel container-level `/work` or `/code` commands fan out to
      all branches, or should they always bind to the currently focused branch
      in v1?
- [ ] Should group/team presets allow proposals from any strong Cat that
      replied, or only from the Cat currently selected as the turn's primary
      responder?
- [ ] Should Work/Code product projections show proposal history before
      confirmation, or only confirmed Work Item anchors?

## References

- [PLAN-096: Preset-Neutral Product Intent Intake Rollout](../plans/PLAN-096-preset-neutral-product-intent-intake-rollout.md)
- [PLAN-092: Direct Chat Slash-Mode Work Intake Rollout](../plans/PLAN-092-direct-chat-slash-mode-work-intake-rollout.md)
- [PLAN-094: Cat-Proposed Product Intent Rollout](../plans/PLAN-094-cat-proposed-product-intent-rollout.md)

---

*Created: 2026-05-09*
*Author: Codex*
*Related Plan: [PLAN-096](../plans/PLAN-096-preset-neutral-product-intent-intake-rollout.md)*

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
   `direct`, `new_chat`, `group_chat`, `parallel_chat`, `new_code`,
   `team_code`, `peer_code`, `new_work`, `team_work`, and
   `parallel_work`.
2. Each supported preset shall be able to produce a
   `ProductPresetIntentContext`.
3. A context shall identify `sourceProduct`, `presetId`, source conversation or
   container id, lane or branch id when present, current turn id, source
   segment/message id, origin surface, transport, and eligible Cat
   participants.
4. `source.channelId` shall identify the Chat/Core channel that owns the
   transcript when one exists. `source.conversationId` shall identify the
   child or primary conversation used for follow-up. `source.containerId` shall
   identify a parallel/peer container when the preset is container-scoped.
   `source.laneId` shall identify a concurrent turn lane when the turn engine
   assigns one. `source.branchId` shall identify the selected child branch for
   parallel and peer presets.
5. `originSurface` shall identify the entry surface that accepted the owner
   input: `desktop`, `mobile`, `telegram`, or `api`. `api` is reserved for
   server-side or automation ingress that already resolves to a supported
   preset context.
6. `transport` shall identify the external or client transport that delivered
   the message: `web`, `telegram`, `mobile`, or `null` for product-internal
   API calls with no transport envelope.
7. A preset that cannot produce a valid context shall reject product-intent
   commands with visible, localized copy and shall not create durable state.
8. The context resolver shall be shared by explicit commands and Cat-authored
   proposals.

#### Explicit command behavior

9. `/chat`, `/work`, and `/code` shall use one shared parser across Web,
   mobile, Telegram-linked ingress, and product composers.
10. Product-intent commands shall be evaluated before normal assistant dispatch.
11. `/chat` shall set ordinary conversation posture for the current source
   context. It may expire unresolved proposals and abandon unconfirmed draft
   intake, but it shall not close established Work Items.
12. `/work` shall request Work-targeted intake from the current source context.
13. `/code` shall request Code-targeted intake from the current source context.
14. Command handling shall not create a new channel kind or persistent preset
    kind.
15. Unknown slash commands shall continue through ordinary message handling
    unless another transport-control command owns them.
16. Telegram command suffixes such as `/work@botname` shall still normalize to
    the shared product-intent command.
17. Transport-control commands such as `/start`, `/help`, `/commands`,
    `/status`, and `/mode` shall remain separate from product-intent commands.

#### Strong-Cat proposal behavior

18. Natural-language product suggestions shall be created by eligible strong
    Cats through the existing proposal-only tool family.
19. Proposal tools shall be exposed only when deployment policy and owner
    settings allow natural-language product suggestions.
20. Proposal tools shall be exposed only to Cats whose resolved provider
    capability profile is `strong_agent`.
21. Weak or unknown Cats shall not receive proposal tools.
22. A proposal tool call shall write an append-only proposal system segment and
    shall not create a Work Item, Task, Run, active anchor, or Code execution.
23. A source lane or branch shall accept at most one product-intent proposal per
    assistant turn.
24. Proposal tools shall not be exposed in the same assistant turn as durable
    Work Item, Task, Run, or Code execution tools.
25. Providers without tool-call support shall not receive a structured-output
    fallback in this spec.

#### Eligible Cat resolution

26. The `direct` preset shall use the addressed direct Cat.
27. Single-recipient Chat, Code, or Work presets shall use the selected or
    assigned Cat for the current turn.
28. Group and team presets may accept proposals from any addressed or active
    Cat in the current turn, subject to capability and one-proposal-per-turn
    limits.
29. Parallel and peer presets shall scope eligible Cats, proposals, and anchors
    to the child lane or branch where the message was produced.
30. The platform shall not silently switch to another Cat when all eligible
    Cats are weak or unknown.
31. If multiple strong Cats attempt to propose in the same lane/turn, the first
    accepted proposal is the only active proposal; later proposals are rejected
    or ignored with an auditable reason.

#### Confirmation and durable intake

32. No-slash proposals require explicit owner confirmation before posture or
    durable Work/Code state changes.
33. Confirming a Work proposal shall enter the same preset-neutral intake path
    as `/work <source>`.
34. Confirming a Code proposal shall enter the same preset-neutral intake path
    as `/code <source>`.
35. Confirmation shall be idempotent for the same proposal id.
36. Declining or ignoring a proposal shall leave the source context in ordinary
    conversation posture and shall not create durable product state.
37. Proposal, confirmation, decline, and expiry shall be represented as
    append-only message-stream system segments.
38. The original user transcript shall not be rewritten into a fake slash
    command.
39. For confirmed Cat proposals, `command.originalMessageId` shall point to
    the original owner message that the Cat proposal interpreted. It is the
    audit bridge from the confirmed command metadata back to the unmodified
    transcript text.

#### Work Item anchors and metadata

40. The Work Item shall remain the durable anchor for both Work-targeted and
    Code-targeted intake.
41. Work Items created by this flow shall preserve source context in additive
    metadata under `metadata.productIntentIntake`.
42. Follow-up Tasks shall carry compact references under
    `metadata.productIntentIntakeRef`.
43. Active anchor state shall be scoped by source context under
    `metadata.productIntent.activeAnchor` or an equivalent preset-neutral
    field.
44. The metadata shall include schema version, source product, preset id,
    channel/conversation/container id, lane/branch id, turn id, source segment
    id, transport, origin surface, target product, eligible/proposing Cat,
    capability profile kind, and confirmation/proposal ids when present.
45. The existing direct MVP metadata names such as `directSlashMode` shall be
    migrated or replaced during rollout so the canonical path is
    preset-neutral.
46. The rollout shall not add new fields to Core record types unless a later
    ADR approves a schema change. Additive metadata is the default.

#### Follow-up and execution

47. Creating a Work Item anchor shall be separated from Task, Run, or Code
    execution.
48. The command or confirmation turn may surface the new anchor and a
    chat-only clarification or recap from the eligible Cat.
49. Task, Run, or Code execution may begin only through existing Work/Code
    supervision boundaries on a later owner turn or explicit follow-up action.
50. Follow-up messages in the same source context shall be able to resolve the
    active anchor when the anchor still belongs to that source context.
51. `/chat` shall clear unresolved proposal or draft-intake state for the
    source context but shall not close established Work Items.
52. Switching between `/work` and `/code` while an unconfirmed or draft anchor
    exists shall supersede the prior draft in the same source context rather
    than leave an orphan.
53. Terminal Work Item statuses shall clear the matching active-anchor cache.

#### Transport and client parity

54. Web desktop product composers shall invoke the shared parser before send.
55. Mobile product composers shall attach the same command metadata when
    sending into a supported preset.
56. Telegram ingress shall map incoming product-intent commands and proposal
    callbacks to the linked preset context when one exists.
57. Telegram shall fall back to the direct inbox context only when the thread is
    not linked to another supported preset.
58. Web confirmation may use existing `ChatMessage.choices`.
59. Telegram confirmation may use inline keyboard callbacks keyed by proposal
    id.
60. Mobile shall at minimum render proposal/transition segments and route
    unsupported confirmation actions to a desktop/product deep link rather than
    dropping them silently.
61. Visible command acknowledgements, proposal controls, confirmation results,
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
  transport: 'web' | 'telegram' | 'mobile' | null;
  eligibleCats: Array<{
    catId: string;
    actorId: string;
    capabilityProfileKind: 'strong_agent' | 'weak_worker' | 'unknown';
  }>;
}
```

### Required Source Fields by Preset

All contexts require `turnId` and `segmentId`. The remaining source identifiers
are required by preset shape:

| Preset id | Required source fields | Notes |
|-----------|------------------------|-------|
| `direct` | `channelId`, `conversationId` | Telegram direct fallback resolves to this shape after transport binding lookup. |
| `new_chat` | `channelId`, `conversationId` | One ordinary Chat conversation. |
| `group_chat` | `channelId`, `conversationId`, `laneId` when materialized | One shared conversation. The lane id is conditionally required once a concurrent turn lane exists for the source turn. |
| `parallel_chat` | `containerId`, `branchId`, `conversationId` | Commands bind to the currently focused child branch in v1. |
| `new_code` | `channelId`, `conversationId` | Primary Code conversation with Code-target context. |
| `team_code` | `channelId`, `conversationId`, `laneId` when materialized | Shared Code conversation. The lane id is conditionally required once a concurrent turn lane exists for the source turn. |
| `peer_code` | `containerId`, `branchId`, `conversationId` | Peer branch/review container; commands bind to the focused branch. |
| `new_work` | `channelId`, `conversationId` | Primary Work conversation. |
| `team_work` | `channelId`, `conversationId`, `laneId` when materialized | Shared Work conversation. The lane id is conditionally required once a concurrent turn lane exists for the source turn. |
| `parallel_work` | `containerId`, `branchId`, `conversationId` | Parallel Work container; commands bind to the focused branch. |

`channelId` may also be present for container-backed presets when a child
branch has a channel projection, but `containerId + branchId + conversationId`
are the required audit identifiers for those presets. For every
container-backed preset, `conversationId` is the branch-scoped child
conversation, not a container-level parent conversation.

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

`ProductIntentIntakeMetadata` is stored on the Work Item and is the durable
audit source. The active-anchor field is only a source-context cache that points
back to the same Work Item. It is stored on the source routing owner:

- For channel-backed presets (`direct`, `new_chat`, `group_chat`, `new_code`,
  `team_code`, `new_work`, `team_work`), store the cache on the channel or
  conversation routing metadata keyed by `channelId`.
- For container-backed presets (`parallel_chat`, `peer_code`,
  `parallel_work`), store the cache on the container branch routing metadata
  keyed by `containerId + branchId`.

```ts
interface ProductIntentActiveAnchorMetadata {
  version: 1;
  workItemId: string;
  targetProduct: 'work' | 'code';
  sourceContextRef: {
    sourceProduct: 'chat' | 'code' | 'work';
    presetId: ProductPresetIntentContext['presetId'];
    channelId?: string;
    conversationId?: string;
    containerId?: string;
    laneId?: string;
    branchId?: string;
  };
  establishedBySegmentId: string;
  establishedAt: string;
}
```

The active-anchor cache must be treated as invalid unless
`workItem.metadata.productIntentIntake.sourceContext` matches
`sourceContextRef`.

Matching is field-by-field over the source identity fields:

- Required fields, must be present and equal on both sides:
  - `sourceProduct`
  - `presetId`
- Optional source-id fields, equal when both sides are absent (treated as
  `null`) or both sides hold the same string value:
  - `channelId`
  - `conversationId`
  - `containerId`
  - `laneId`
  - `branchId`

`originSurface` and `transport` are intentionally excluded from the match,
because anchors are conversation/branch-scoped and the same anchor should
resolve from any cross-surface ingress (desktop, mobile, Telegram, API) into
the same source context. `turnId` and `segmentId` are also excluded because
they advance every turn, while the anchor must persist across turns.

Display-only changes such as channel rename do not invalidate the cache because
ids are stable. Moving a conversation or branch to a different channel,
container, lane, or branch invalidates the cache because one of the identity
fields above no longer matches.

In addition to read-time matching, the following write-time triggers must
explicitly clear or supersede the cache:

- Terminal Work Item statuses (per requirement 53).
- Source-object deletion (channel, conversation, container, or branch
  deleted from Core).
- Source identity move that changes one of the matched id fields.
- Owner `/chat` in the same source context, which clears unresolved
  draft-intake state (per requirement 51).
- A new `/work` or `/code` in the same source context superseding a prior
  draft anchor (per requirement 52).

Variations not covered by these triggers fall back to the read-time match
check. Projections and audits should read the Work Item metadata; the cache
only speeds follow-up routing.

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

## Resolved v1 Scope

- Parallel, peer, and other container-level `/work` or `/code` commands bind
  to the currently focused child branch in v1. Fan-out across all branches
  would be a separate orchestration feature and is not part of this spec.

## Open Questions

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

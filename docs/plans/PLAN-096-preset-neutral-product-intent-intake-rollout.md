# PLAN-096: Preset-Neutral Product Intent Intake Rollout

> Roll out explicit `/chat` / `/work` / `/code` commands and strong-Cat
> Work/Code proposal intake across every supported Chat, Code, and Work preset.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

[SPEC-107: Preset-Neutral Product Intent Intake](../specs/SPEC-107-preset-neutral-product-intent-intake.md)

## Related Docs

- [ADR-103: Use Preset-Neutral Product Intent Intake](../decisions/103-use-preset-neutral-product-intent-intake.md)
- [SPEC-104: Direct Chat Slash-Mode Work Intake](../specs/SPEC-104-direct-chat-slash-mode-work-intake.md)
- [SPEC-105: Direct Chat Cat-Proposed Product Intent Confirmation](../specs/SPEC-105-direct-chat-implicit-product-intent.md)
- [PLAN-092: Direct Chat Slash-Mode Work Intake Rollout](./PLAN-092-direct-chat-slash-mode-work-intake-rollout.md)
- [PLAN-094: Cat-Proposed Product Intent Rollout](./PLAN-094-cat-proposed-product-intent-rollout.md)

## Overview

This rollout generalizes the recent direct-message intake work instead of
building product-local copies. The implementation should first extract the
source-context boundary, then move explicit commands and Cat proposal handling
onto that boundary, then update each Chat/Code/Work preset to supply context.

The direct-message behavior from PLAN-092 and PLAN-094 must remain intact while
the canonical implementation moves from `directSlashMode` concepts toward
preset-neutral `productIntent` concepts.

## Implementation Phases

### Phase 1: Preset inventory and source-context contract

- [ ] Task 1.1: Inventory every current Chat, Code, and Work preset and assign
      stable preset ids: `new_chat`, `group_chat`, `parallel_chat`, `direct`,
      `new_code`, `team_code`, `peer_code`, `new_work`, `team_work`, and
      `parallel_work`.
- [ ] Task 1.2: Add a shared `ProductPresetIntentContext` type and builder
      contract covering product, preset, source conversation/container,
      lane/branch, turn, segment, origin surface, transport, and eligible Cats.
- [ ] Task 1.3: Implement context builders for existing direct-message paths
      first, preserving current behavior while changing the internal contract.
- [ ] Task 1.4: Add unit tests proving direct-message contexts carry the same
      source information currently stored by `directSlashMode` metadata.
- [ ] Task 1.5: Add negative tests for unsupported or incomplete contexts so
      command handling fails visibly without durable writes.

**Deliverables**: a shared context contract exists, direct-message behavior uses
it, and unsupported contexts fail closed.

### Phase 2: Preset-neutral metadata and direct migration

- [ ] Task 2.1: Introduce canonical metadata helpers for
      `metadata.productIntentIntake`,
      `metadata.productIntentIntakeRef`,
      proposal transition metadata, and
      `metadata.productIntent.activeAnchor`.
- [ ] Task 2.2: Migrate direct slash-mode Work Item creation to write
      preset-neutral metadata.
- [ ] Task 2.3: Migrate direct Cat-proposal confirmation to write
      preset-neutral metadata while preserving source message/proposal context.
- [ ] Task 2.4: Update direct-mode tests to assert the new canonical metadata
      and remove long-term dependence on `directSlashMode` assertions.
- [ ] Task 2.5: Update projection helpers so Work and Code surfaces read the
      preset-neutral metadata for source badges, follow-up context, and active
      anchor resolution.

**Deliverables**: direct intake is still working, but the canonical durable
metadata is preset-neutral.

### Phase 3: Explicit command generalization across presets

- [ ] Task 3.1: Route desktop Chat composers for `+New chat`, `+Group chat`,
      `+Parallel chat`, and direct/private lanes through the shared parser and
      context resolver before send.
- [ ] Task 3.2: Route Code composers for `+New code`, `+Team code`, and
      `+Peer code` through the same parser and context resolver.
- [ ] Task 3.3: Route Work composers for `+New work`, `+Team work`, and
      `+Parallel work` through the same parser and context resolver.
- [ ] Task 3.4: Preserve transport-control command separation for Telegram and
      ensure `/work@botname` and `/code@botname` resolve through the linked
      preset context when present.
- [ ] Task 3.5: Add mobile send-path metadata tagging for recognized
      product-intent commands in supported Chat/Code/Work presets.
- [ ] Task 3.6: Add tests proving `/chat`, `/work`, and `/code` no longer
      reject non-direct supported presets and still reject unsupported
      contexts without durable writes.

**Deliverables**: explicit product-intent commands work from all supported
presets and clients that can send into them.

### Phase 4: Strong-Cat proposal tools across presets

- [ ] Task 4.1: Generalize proposal-tool eligibility from direct audience Cat
      to preset-scoped eligible Cats.
- [ ] Task 4.2: For single-recipient presets, expose proposal tools only to the
      selected/assigned strong Cat.
- [ ] Task 4.3: For group/team presets, expose proposal tools only to addressed
      or active strong Cats in the current turn, with one accepted proposal per
      lane/turn.
- [ ] Task 4.4: For parallel/peer presets, scope proposal tools, proposal ids,
      cooldown, and active anchors to the child lane or branch.
- [ ] Task 4.5: Preserve deployment gate, owner setting, provider tool-call
      support, weak/unknown exclusion, and same-turn durable-tool separation
      from PLAN-094.
- [ ] Task 4.6: Add tests proving proposal tool calls write proposal segments
      only, do not create Work Items before confirmation, and reject duplicate
      proposals in the same source lane/turn.

**Deliverables**: strong Cats can propose Work/Code intake from every supported
preset without bypassing confirmation or tool-separation gates.

### Phase 5: Confirmation, anchors, and follow-up

- [ ] Task 5.1: Convert confirmed Work proposals from any preset into the same
      intake path as `/work <source>`.
- [ ] Task 5.2: Convert confirmed Code proposals from any preset into the same
      intake path as `/code <source>`.
- [ ] Task 5.3: Create Work Item anchors through existing Work/Core APIs with
      `metadata.productIntentIntake` source context.
- [ ] Task 5.4: Link follow-up Tasks with `metadata.productIntentIntakeRef`
      and existing Work/Code supervision boundaries.
- [ ] Task 5.5: Implement active-anchor lifecycle per source context:
      `/chat` clears unresolved proposal/draft state, `/work` and `/code`
      supersede same-context drafts, and terminal Work Item status clears the
      active anchor.
- [ ] Task 5.6: Add projection tests proving Work and Code surfaces show
      Work Items created from Chat, Code, Work, Telegram-linked, and mobile
      preset contexts.

**Deliverables**: confirmed intake creates durable anchors with correct source
context and follow-up behavior across products.

### Phase 6: UI, transport, i18n, and verification close-out

- [ ] Task 6.1: Reuse desktop `ChatMessage.choices` for proposal confirm and
      decline controls across product presets.
- [ ] Task 6.2: Update Telegram callback handling to resolve preset-neutral
      proposal ids and linked source contexts.
- [ ] Task 6.3: Add mobile rendering for proposal and transition segments.
      If full in-app confirmation is not ready, route actions to the relevant
      desktop/product deep link with localized copy.
- [ ] Task 6.4: Add i18n keys for unsupported context, command
      acknowledgements, proposal controls, confirmation results, supersede, and
      human-gate copy.
- [ ] Task 6.5: Update docs that still describe product intent as direct-only,
      including SPEC-104/SPEC-105 references where needed.
- [ ] Task 6.6: Run targeted parser, dispatch, proposal, projection, Telegram,
      mobile, and typecheck validation.

**Deliverables**: the rollout is documented, localized, and verified without
writing demo records into the user's persisted dev state.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/shared/**` | Modify/Create | Shared parser, product-intent context, metadata, proposal, and active-anchor helpers. |
| `src/products/shared/renderer/**` | Modify | Shared composer send metadata and proposal choice rendering where product-owned surfaces reuse it. |
| `src/products/chat/**` | Modify | Chat preset context builders and command/proposal routing. |
| `src/products/code/**` | Modify | Code preset context builders, Code-target anchor projection, and composer integration. |
| `src/products/work/**` | Modify | Work preset context builders, Work-target anchor projection, and composer integration. |
| `src/platform/transports/telegram/**` | Modify | Linked preset context resolution, command suffix handling, and proposal callback handling. |
| `src/mobile/**` | Modify | Mobile send metadata and proposal/transition rendering or deep-link fallback. |
| `src/shared/i18n/**` | Modify | Localized command/proposal/human-gate/unsupported-context copy. |
| `tests/**` | Modify/Create | Parser, context resolver, proposal, confirmation, active-anchor, projection, Telegram, and mobile coverage. |
| `docs/specs/SPEC-104-direct-chat-slash-mode-work-intake.md` | Modify | Note direct MVP is now a preset instance under SPEC-107. |
| `docs/specs/SPEC-105-direct-chat-implicit-product-intent.md` | Modify | Note direct Cat proposal flow is generalized by SPEC-107. |
| `docs/product-integration-guide.md` | Modify | Document how product presets supply `ProductPresetIntentContext`. |

## Technical Decisions

- `ProductPresetIntentContext` is the integration boundary. Product-specific
  surfaces supply context; command/proposal/confirmation code consumes context.
- Work Item remains the durable anchor for Work and Code target products.
- No-slash natural-language intake remains Cat-authored and owner-confirmed.
- Direct-message `directSlashMode` concepts should be migrated into canonical
  `productIntent` metadata during this rollout.
- Parallel and peer presets scope proposal suppression and active anchors to
  the child lane or branch, not the whole container.
- `/chat` clears unresolved proposal/draft-intake state in the source context
  but does not close established Work Items.
- Weak/unknown Cats remain conversational only unless the owner uses a human
  gate or switches to a strong Cat.
- Mobile v1 must not drop proposal segments silently. If native confirmation is
  not complete, it should deep-link to a capable product surface.

## Testing Strategy

- **Unit tests**:
  - parser handles `/chat`, `/work`, `/code`, bot suffixes, arguments, unknown
    slash text, and transport-control separation
  - every supported preset produces a valid `ProductPresetIntentContext`
  - unsupported contexts reject without durable writes
  - metadata builders emit `productIntentIntake`,
    `productIntentIntakeRef`, and active-anchor shapes
  - direct metadata migration no longer depends on `directSlashMode`
- **Integration tests**:
  - explicit `/work` and `/code` create Work Item anchors from every supported
    preset
  - strong Cat proposals are available only under effective `cat_tool` mode
    and only for eligible strong Cats
  - group/team duplicate proposal attempts accept only one proposal per
    lane/turn
  - parallel/peer proposals and anchors are branch-scoped
  - confirmed proposals enter the same path as explicit commands
  - weak/unknown contexts do not create durable state
  - Work/Code projections show anchors created from Chat, Code, Work, mobile,
    and Telegram-linked contexts
- **Transport/client tests**:
  - Telegram linked context command and callback parity
  - Telegram direct fallback still works
  - mobile command metadata tagging
  - mobile proposal/transition rendering or deep-link fallback
- **Boundary tests**:
  - no product-local command parser forks
  - no platform heuristic detector outside explicit `heuristic_prefilter`
  - no same-turn proposal plus durable execution tools
  - no Task/Run/Code execution in the same turn as anchor creation
- **Manual testing**:
  - desktop Chat `+New chat`, `+Group chat`, and `+Parallel chat`
  - desktop Code `+New code`, `+Team code`, and `+Peer code`
  - desktop Work `+New work`, `+Team work`, and `+Parallel work`
  - Telegram linked thread command and proposal confirmation
  - mobile command send and proposal rendering

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Product presets fork command behavior | High | Central parser/context resolver and tests that exercise every preset through one helper. |
| Group/team presets create duplicate proposals | High | One accepted proposal per source lane/turn plus idempotency tests. |
| Parallel proposals lose branch identity | High | Branch-scoped context and projection tests. |
| Direct metadata migration breaks existing MVP behavior | High | Migrate direct path first with regression coverage before other presets. |
| Weak/unknown Cats create durable work through a new preset path | High | Central capability gate and negative tests for every product family. |
| Mobile silently hides proposal state | Medium | Require read-only rendering or deep-link fallback in Phase 6. |
| Telegram linked contexts drift from desktop semantics | Medium | Shared context resolution and transport parity tests. |
| Verification pollutes user state | Medium | Use isolated stores/tests; manual durable writes require explicit approval under the state hygiene policy. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-09 | Plan created with ADR-103 and SPEC-107 to generalize direct-message Work/Code intake to all Chat/Code/Work presets. |

---

*Created: 2026-05-09*
*Author: Codex*

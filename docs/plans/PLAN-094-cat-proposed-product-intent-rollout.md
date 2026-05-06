# PLAN-094: Cat-Proposed Product Intent Rollout

> Replace the default platform heuristic no-slash detector with a strong-Cat
> proposal-tool flow, while preserving explicit `/chat`, `/work`, and `/code`
> command behavior through SPEC-104.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Docs

- [ADR-102: Use Cat-Authored Product Intent Proposals for Natural-Language Intake](../decisions/102-use-cat-authored-product-intent-proposals.md)
- [SPEC-105: Direct Chat Cat-Proposed Product Intent Confirmation](../specs/SPEC-105-direct-chat-implicit-product-intent.md)
- [SPEC-104: Direct Chat Slash-Mode Work Intake](../specs/SPEC-104-direct-chat-slash-mode-work-intake.md)
- [PLAN-093: Direct Chat Implicit Product Intent Rollout](./PLAN-093-direct-chat-implicit-product-intent-rollout.md)

## Overview

PLAN-093 implemented a deterministic platform heuristic for no-slash Work/Code
candidate suggestions. That was useful as a wiring prototype, but it should not
be the default long-term semantic path. PLAN-094 pivots natural-language intent
to Cat-authored proposal tools:

- explicit `/chat`, `/work`, and `/code` remain platform commands;
- ordinary no-slash text is dispatched to the direct Cat as chat;
- eligible strong Cats can call a proposal-only tool;
- the owner confirms or declines the proposal;
- confirmation enters SPEC-104 and creates durable Work/Code state only after
  confirmation.

## Implementation Guardrails

- Do not bypass SPEC-104 for confirmed Work/Code intake.
- Do not create Work Items, Tasks, Runs, Code execution, or active anchors from
  proposal tool calls alone.
- Do not expose proposal tools to weak or unknown Cats.
- Do not use platform keyword lists as the default multilingual strategy.
- Do not disable explicit slash commands through natural-intent settings.
- Do not treat `/chat` as "close Work"; it is ordinary conversational posture
  within the lane, except that it may abandon unconfirmed draft intake.

## Implementation Phases

### Phase 1: Gates and heuristic containment

- [ ] Task 1.1: Add deployment config
      `CATS_CHAT_NATURAL_PRODUCT_INTENT_MODE=off|cat_tool|heuristic_prefilter`.
      Default to `off` until the Cat proposal tool path ships; never default
      to `heuristic_prefilter`.
- [ ] Task 1.2: Add an owner setting for "Suggest Work/Code from chat".
- [ ] Task 1.3: Ensure explicit `/chat`, `/work`, and `/code` ignore the
      natural-intent setting and continue through SPEC-104.
- [ ] Task 1.4: Move the PLAN-093 deterministic detector behind
      `heuristic_prefilter` only. It shall not run in `off` or `cat_tool` mode.
- [ ] Task 1.5: Add tests proving no no-slash suggestions appear when the
      effective mode is `off`.

**Deliverables**: natural-language suggestions can be disabled cleanly, and the
heuristic path is no longer the default.

### Phase 2: Proposal metadata and tool contract

- [ ] Task 2.1: Define Cat product-intent proposal metadata version 2:
      proposal id, source message, source conversation, proposing Cat,
      capability profile, target product, summary, rationale, timestamps, and
      expiry.
- [ ] Task 2.2: Add append-only proposal, confirmed, declined, and expired
      system-segment builders.
- [ ] Task 2.3: Define the product-facing tool contract
      `proposeProductIntake` or equivalent narrow work/code tools.
- [ ] Task 2.4: Validate tool calls server-side: direct lane, strong Cat,
      enabled settings, valid target product, same-lane source message, and
      non-empty summary/rationale.
- [ ] Task 2.5: Add tests proving proposal tool calls do not create Work Items
      or anchors.

**Deliverables**: a strong Cat can produce an auditable proposal segment, but no
durable Work/Code state.

### Phase 3: Runtime/tool exposure

- [ ] Task 3.1: Extend dispatch target preparation so eligible strong direct
      Cats receive the proposal tool in ordinary chat turns.
- [ ] Task 3.2: Ensure weak/unknown Cats never receive the proposal tool.
- [ ] Task 3.3: Inject prompt instructions that the tool asks for owner
      confirmation and must not be used for casual chat.
- [ ] Task 3.4: Ensure providers without tool-call support do not get a silent
      fallback that pretends to be a proposal.
- [ ] Task 3.5: Add tests proving the tool grant is controlled by capability,
      deployment mode, owner setting, and direct-lane membership.

**Deliverables**: proposal capability is a real policy-gated tool surface, not a
prompt-only suggestion.

### Phase 4: Confirmation bridge into SPEC-104

- [ ] Task 4.1: Convert confirmed Work proposals into the same intake behavior
      as `/work <source>`.
- [ ] Task 4.2: Convert confirmed Code proposals into the same intake behavior
      as `/code <source>`.
- [ ] Task 4.3: Preserve source owner message, proposal id, and proposing Cat in
      confirmed command metadata.
- [ ] Task 4.4: Use the sentinel raw command token
      `(cat-proposal-confirmation)` instead of a fake slash token.
- [ ] Task 4.5: Reuse SPEC-104 direct audience capability gating after
      confirmation.
- [ ] Task 4.6: Add idempotency tests for repeated confirmation.

**Deliverables**: confirmed Cat proposals use the existing durable intake path
without introducing a parallel Work Item creation path.

### Phase 5: Web and Telegram confirmation UX

- [ ] Task 5.1: Reuse existing Web `ChatMessage.choices` rendering for proposal
      confirm/decline.
- [ ] Task 5.2: Keep Telegram inline keyboard callback handling, but change the
      source metadata from heuristic candidate ids to Cat proposal ids.
- [ ] Task 5.3: Localize proposal, confirm, decline, expired, and disabled-copy
      strings.
- [ ] Task 5.4: Keep mobile implicit proposal UI out of scope unless a separate
      mobile slice chooses read-only rendering.
- [ ] Task 5.5: Add transport parity tests for Web and Telegram.

**Deliverables**: owner confirmation works in Web and Telegram without exposing
classifier/provider terminology.

### Phase 6: Retire or quarantine PLAN-093 heuristic behavior

- [ ] Task 6.1: Mark PLAN-093 as historical/superseded by PLAN-094.
- [ ] Task 6.2: Remove the deterministic detector from default dispatch.
- [ ] Task 6.3: If keeping the detector temporarily, confine it to
      `heuristic_prefilter` and document it as experimental.
- [ ] Task 6.4: Update SPEC-105 verification notes once the proposal-tool path
      replaces the heuristic path.
- [ ] Task 6.5: Run targeted SPEC-104/SPEC-105 regression tests and typechecks.

**Deliverables**: no-slash product suggestions are Cat-proposed by default, and
the old heuristic cannot surprise users.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/state/runtime-dispatch/**` | Modify | Tool grant gating, proposal handling, confirmation bridge. |
| `src/products/chat/shared/**` | Modify | Proposal metadata helpers; quarantine old heuristic detector. |
| `src/products/chat/api/contracts.ts` | Modify | Setting/config contracts if needed. |
| `src/shared/i18n/**` or current catalog location | Modify | Proposal and disabled-state strings. |
| `src/platform/transports/telegram/**` | Modify | Callback data and proposal confirmation bridge. |
| `tests/**` | Modify | Config gating, tool exposure, proposal lifecycle, transport parity, SPEC-104 handoff. |
| `docs/specs/SPEC-105-direct-chat-implicit-product-intent.md` | Modify | Keep contract aligned with proposal-tool implementation. |
| `docs/plans/PLAN-093-direct-chat-implicit-product-intent-rollout.md` | Modify | Mark heuristic rollout as historical/superseded. |

## Technical Decisions

- Explicit slash commands are platform commands and remain always available.
- `/chat` is turn posture, not Work closure. It may abandon unconfirmed draft
  intake but must not close established Work Items.
- No-slash natural intent is a Cat-authored proposal when enabled.
- Proposal tool calls are durable audit events but not durable Work/Code
  materialization.
- Confirmation is the only bridge into SPEC-104 durable intake.
- The heuristic detector is experimental only and must be opt-in.
- The deployment gate can force the feature off regardless of owner settings.

## Testing Strategy

- **Unit tests**:
  - config parsing for `off`, `cat_tool`, and `heuristic_prefilter`
  - owner setting effective-mode resolution
  - proposal metadata and transition metadata builders
  - proposal idempotency
  - invalid proposal tool calls are rejected
- **Integration tests**:
  - strong direct Cat gets proposal tool when enabled
  - weak/unknown Cat does not get proposal tool
  - ordinary chat without a proposal remains ordinary chat
  - proposal tool call writes proposal segment only
  - confirm Work proposal enters SPEC-104 `/work` path
  - confirm Code proposal enters SPEC-104 `/code` path
  - `/chat` in an established Work context does not close the Work Item
  - deployment `off` blocks no-slash suggestions
  - owner setting off blocks no-slash suggestions
  - heuristic detector does not run unless `heuristic_prefilter` is selected
- **Transport tests**:
  - Web choice confirmation maps to proposal id
  - Telegram callback confirmation maps to proposal id
  - localized visible copy does not affect proposal semantics

## Open Questions

- Should owner setting default to off for the first proposal-tool release?
- Should providers without tool calling get a structured-output bridge?
- Should `argumentText` use proposal summary or original message body by
  default?
- Should the temporary heuristic mode be deleted immediately after proposal tool
  landing, or kept as an experimental prefilter?

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-06 | Plan created to pivot no-slash product intent from platform heuristics to Cat-authored proposal tools with owner confirmation. |

---

*Created: 2026-05-06*
*Author: Codex*

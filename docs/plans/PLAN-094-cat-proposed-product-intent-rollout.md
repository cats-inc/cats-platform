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
- Do not expose proposal tools in the same assistant turn as durable-action
  tools such as `createWorkItem`, `createTask`, or `createRun`.
- Do not allow more than one proposal tool call per assistant turn.
- Do not use platform keyword lists as the default multilingual strategy.
- Do not disable explicit slash commands through natural-intent settings.
- Do not treat `/chat` as "close Work"; it is ordinary conversational posture
  within the lane, except that it may abandon unconfirmed draft intake.

## Implementation Phases

### Phase 1: Gates and heuristic containment

- [x] Task 1.1: Add deployment config
      `CATS_CHAT_NATURAL_PRODUCT_INTENT_MODE=off|cat_tool|heuristic_prefilter`.
      Default to `off` until the Cat proposal tool path ships; never default
      to `heuristic_prefilter`.
- [x] Task 1.2: Add an owner setting for "Suggest Work/Code from chat".
      Store it at owner-profile scope. Per-lane and per-Cat overrides are out
      of v1.
- [x] Task 1.3: Ensure explicit `/chat`, `/work`, and `/code` ignore the
      natural-intent setting and continue through SPEC-104.
- [x] Task 1.4: Move the PLAN-093 deterministic detector behind
      `heuristic_prefilter` only. It shall not run in `off` or `cat_tool` mode.
      Decouple v1 segment expiry cleanup from the v1 detector trigger so Phase
      6 can either sweep outstanding v1 candidates on mode change or keep the
      cleanup path active independently from detector execution.
- [x] Task 1.4a: Migrate the PLAN-093 detector test suite to set
      `mode = heuristic_prefilter` explicitly. Tests that previously asserted
      detector behavior under default mode shall assert it under
      `heuristic_prefilter` and add parallel `cat_tool` / `off` negative cases.
- [x] Task 1.5: Add tests proving no no-slash suggestions appear when the
      effective mode is `off`.

**Deliverables**: natural-language suggestions can be disabled cleanly, and the
heuristic path is no longer the default.

### Phase 2: Proposal metadata and tool contract

- [x] Task 2.1: Define Cat product-intent proposal metadata version 2:
      proposal id, source message, source conversation, proposing Cat,
      capability profile, target product, summary, rationale, timestamps, and
      expiry.
- [x] Task 2.2: Add append-only proposal, confirmed, declined, and expired
      system-segment builders.
- [x] Task 2.3: Define the product-facing tool contract
      `proposeProductIntake` or equivalent narrow work/code tools.
- [x] Task 2.4: Validate tool calls server-side: direct lane, strong Cat,
      enabled settings, valid target product, same-lane source message, and
      non-empty summary/rationale.
- [x] Task 2.5: Add tests proving proposal tool calls do not create Work Items
      or anchors.
- [x] Task 2.6: Add lane-local suppression and idempotency helpers: 15-minute
      proposal TTL, five-minute decline cooldown, `/chat` expiry of outstanding
      proposals, new-message expiry of unresolved proposals, and duplicate
      `proposalId` no-op behavior.

**Deliverables**: a strong Cat can produce an auditable proposal segment, but no
durable Work/Code state.

### Phase 3: Runtime/tool exposure

- [x] Task 3.1: Extend dispatch target preparation so eligible strong direct
      Cats receive the proposal tool in ordinary chat turns.
- [x] Task 3.2: Ensure weak/unknown Cats never receive the proposal tool.
- [x] Task 3.3: Inject prompt instructions that the tool asks for owner
      confirmation and must not be used for casual chat. If a proposal tool
      call is rejected, the Cat must not surface the rejection reason to the
      owner; it should resume ordinary chat without insisting on the proposal.
- [ ] Task 3.4: Ensure providers without tool-call support do not get a silent
      fallback that pretends to be a proposal. Structured-output fallback is
      deferred to a separate ADR/SPEC.
- [x] Task 3.5: Add tests proving the tool grant is controlled by capability,
      deployment mode, owner setting, and direct-lane membership.
- [ ] Task 3.6: Add per-turn tool-grant separation guards:
      `proposeProductIntake` cannot ship in the same turn as future Work Item,
      Task, or Run tool grants, and at most one proposal call is accepted per
      assistant turn.

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
- [ ] Task 4.6: Set confirmed `argumentText` to `proposal.summary.trim()` when
      non-empty, otherwise fall back to `originalMessage.body.trim()` for
      defensive legacy/migration handling.
- [ ] Task 4.7: Add idempotency tests for repeated confirmation.

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
- [ ] Task 6.4: Define and test migration cleanup for unresolved v1 candidates
      when switching from `heuristic_prefilter` to `cat_tool`. Either sweep
      outstanding `metadata.implicitProductIntentCandidate` suggestions to
      expired during mode change, or keep the v1 expiry cleanup active
      independently from detector execution.
- [ ] Task 6.5: Update SPEC-105 verification notes once the proposal-tool path
      replaces the heuristic path.
- [ ] Task 6.6: Run targeted SPEC-104/SPEC-105 regression tests and typechecks.

**Deliverables**: no-slash product suggestions are Cat-proposed by default, and
the old heuristic cannot surprise users.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/state/runtime-dispatch/**` | Modify | Tool grant gating, proposal handling, confirmation bridge. |
| `src/products/chat/shared/**` | Modify | Proposal metadata helpers; quarantine old heuristic detector. |
| `src/products/chat/shared/catProductIntentProposal.ts` | Create | Cat product-intent proposal metadata builders, validators, suppression helpers, and idempotency helpers. Mirrors the v1 `implicitProductIntent.ts` shape without reusing v1 metadata keys. |
| `src/products/chat/api/contracts.ts` | Modify | Setting/config contracts if needed. |
| `src/shared/i18n/**` or current catalog location | Modify | Proposal and disabled-state strings. |
| `src/platform/transports/telegram/**` | Modify | Callback data and proposal confirmation bridge. |
| `tests/chat-cat-product-intent-proposal.test.tsx` | Create | Proposal metadata, config gating, suppression, idempotency, and confirmation bridge coverage. |
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
- `heuristic_prefilter` is detector-only. It does not expose the Cat proposal
  tool, and it keeps the v1 detector candidate path as the only no-slash
  suggestion path.
- Effective mode is `off` if either the deployment gate or owner setting is
  off. Otherwise, effective mode is the deployment mode.
- The deployment gate can force the feature off regardless of owner settings.
- Owner setting lives at owner-profile scope, such as
  `ChatStateOwnerProfile.naturalProductIntentProposalsEnabled` or equivalent.
  Per-lane and per-Cat overrides are out of v1.
- The first implementation defaults the owner setting to enabled while the
  deployment gate defaults to `off`, so existing owners only see no-slash
  suggestions after an explicit deployment-mode opt-in.
- Providers without tool-call support do not get structured-output fallback in
  v1. Owners use explicit `/work` or `/code` with those Cats.
- Proposal metadata is stored under `metadata.catProductIntentProposal`.
  Transition metadata is stored under
  `metadata.catProductIntentProposalTransition`.
- Proposal tool calls are server-side suppressed after decline cooldown and are
  limited to one accepted proposal per assistant turn.

## Testing Strategy

- **Unit tests**:
  - config parsing for `off`, `cat_tool`, and `heuristic_prefilter`
  - owner setting effective-mode resolution
  - proposal metadata and transition metadata builders
  - proposal idempotency
  - proposal TTL, decline cooldown, `/chat` expiry, and new-message expiry
  - invalid proposal tool calls are rejected
  - per-turn proposal call limit is enforced
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
  - PLAN-093 detector tests set `heuristic_prefilter` explicitly
  - strong direct Cat does not get proposal tool when deployment mode is
    `heuristic_prefilter`, even when all other gates are open
  - proposal tool grant blocks future durable-action tools in the same turn
    once those tools become agent-callable
  - provider without tool-call support receives no natural proposal fallback
- **Transport tests**:
  - Web choice confirmation maps to proposal id
  - Telegram callback confirmation maps to proposal id
  - localized visible copy does not affect proposal semantics

## Open Questions

- Should owner setting default to off for the first proposal-tool release?
- Should the temporary heuristic mode be deleted immediately after proposal tool
  landing, or kept as an experimental prefilter?

## Follow-up Backlog

- Mobile read-only rendering for Cat proposal and transition system segments is
  deferred; mobile implicit proposal UI remains out of v1.
- Structured-output proposal fallback for providers without tool-call support is
  deferred to a separate ADR/SPEC.
- Per-lane and per-Cat natural-intent proposal overrides are out of v1; owner
  profile scope is the only setting scope.
- Migration cleanup for unresolved v1 `metadata.implicitProductIntentCandidate`
  suggestions during `heuristic_prefilter` -> `cat_tool` mode changes must be
  decided in Phase 6 before removing the default detector path.
- Work/Code projections for proposal history are undecided and remain an open
  product question.

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-06 | Plan created to pivot no-slash product intent from platform heuristics to Cat-authored proposal tools with owner confirmation. |
| 2026-05-06 | Phase 1 landed: `CATS_CHAT_NATURAL_PRODUCT_INTENT_MODE` now defaults to `off`, owner-profile setting gates natural suggestions, explicit `/chat` / `/work` / `/code` still enter SPEC-104, and the v1 deterministic detector only runs in `heuristic_prefilter`. Validation: `npm run build:server`, `node --test --test-isolation=none tests/config.test.js`, bundled `chat-product-intent-dispatch` test, and `git diff --check`. |
| 2026-05-06 | Phase 2 contract foundation landed: v2 `catProductIntentProposal` / transition metadata, `proposeProductIntake` manifest, server-side validation helper, TTL/cooldown/idempotency helpers, and focused proposal contract tests. Remaining Phase 2 work is wiring actual append-only transcript writes and proving live proposal calls do not create Work Items. Validation: `npm run build:server`, `npm run build:test-ui`, bundled `chat-cat-product-intent-proposal` test, and `git diff --check`. |
| 2026-05-06 | Phase 2 live append and Phase 3 initial exposure landed: eligible strong direct Cats receive `proposeProductIntake` in ordinary chat turns when effective mode is `cat_tool`; accepted tool requests write only v2 proposal system segments and do not create Work Items or anchors; `heuristic_prefilter` does not expose the Cat proposal tool. Remaining Phase 3 work is weak/unknown and owner-setting exposure coverage, prompt/tool rejection instructions, and per-turn guard tests. Validation: `npm run build:server`, `npm run build:test-ui`, bundled `chat-product-intent-dispatch` and `chat-cat-product-intent-proposal` tests, and `git diff --check`. |
| 2026-05-06 | Phase 3 tool-grant guard coverage landed: proposal-tool observations now carry owner-confirmation and rejection-handling invariants, and dispatch tests prove weak, unknown, owner-disabled, heuristic-mode, and non-direct lanes do not receive `proposeProductIntake`. Remaining Phase 3 work is explicit provider-without-tool-call handling and future durable-tool separation tests. Validation: `npm run build:server`, `npm run build:test-ui`, bundled `chat-product-intent-dispatch` and `chat-provider-agent-observation` tests. |

---

*Created: 2026-05-06*
*Author: Codex*

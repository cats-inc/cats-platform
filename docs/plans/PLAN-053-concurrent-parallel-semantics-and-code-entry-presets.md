# PLAN-053: Concurrent, Parallel, and Code Entry Presets

> Align Chat and Code implementation with one shared meaning for `concurrent`,
> `parallel`, and the first `Cats Code` entry presets.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-061: Concurrent vs Parallel Semantics and Code Entry Presets](../specs/SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [SPEC-069: Chat Continuity Semantics and Context Transplant](../specs/SPEC-069-chat-continuity-semantics-and-context-transplant.md)
- [SPEC-068: New Code Draft Canvas and Renderer Ownership](../specs/SPEC-068-new-code-draft-canvas-and-renderer-ownership.md)
- [ADR-059: Adopt a Unified Conversation-Turn-Lane Engine](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md)
- [ADR-062: Separate Concurrent Turn Fan-Out from Parallel Container Composition](../decisions/062-separate-concurrent-turn-fan-out-from-parallel-container-composition.md)
- [ADR-068: Own Chat Continuity Semantics Above Runtime-Session Boundaries](../decisions/068-own-chat-continuity-semantics-above-runtime-session-boundaries.md)
- [ADR-067: Use Shared Draft Primitives with Product-Owned Code Entry Drafts](../decisions/067-use-shared-draft-primitives-with-product-owned-code-entry-drafts.md)
- [SPEC-043: Cats Code MVP Multi-Agent Local-App Workflow](../specs/SPEC-043-cats-code-mvp-multi-agent-local-app-workflow.md)
- [SPEC-047: Parallel Chat, Parallel Chat Groups, and Relay Actions](../specs/SPEC-047-compare-chat-concurrent-groups-and-relay.md)
- [SPEC-057: Concurrent Group Lane-Native Live Transcript](../specs/SPEC-057-concurrent-group-lane-native-live-transcript.md)

## Overview

This plan turns the semantic split into implementation guidance:

- `concurrent` = one conversation turn with many lanes
- `parallel` = one container with many child conversations
- `+New code` = single coding conversation preset
- `+Team code` = shared coding conversation preset
- `+Peer code` = branch/review parallel container preset

The goal is to keep Chat and Code on the same engine while still giving Code
product surfaces first-class entry points and automation hooks.

This plan also carries the first continuity follow-through for Chat rather than
opening a separate continuity plan. In this plan's scope:

- `parallel` remains a container/composition concept
- `solo retarget` continuity remains a same-conversation semantic
- parallel child conversations own continuity independently
- same-chat provider/model switching must stop degrading into excerpt-only
  bootstrap

## Implementation Phases

### Phase 0: Contract Freeze

- [ ] Task 0.1: Audit type names, docs, and renderer labels that still blur
      `concurrent` and `parallel`
- [ ] Task 0.2: Freeze the minimum shared contract additions for:
      - `convergencePolicy`
      - `executionProfile`
      - `codeEntryPreset`
      - `parallel container` identity
- [ ] Task 0.3: Decide which contracts stay generic/shared and which remain
      product-local inside `products/code/*`

**Deliverables**: one explicit contract vocabulary for shared engine and Code
presets.

### Phase 1: Chat Semantic Cleanup

- [ ] Task 1.1: Ensure concurrent group-chat flows always project as
      one-turn response clusters rather than child-thread compare containers
- [ ] Task 1.2: Ensure parallel chat flows continue to use child-conversation
      identity rather than lane identity
- [ ] Task 1.3: Add or tighten tests that fail if concurrent and parallel
      projections collapse into each other
- [ ] Task 1.4: Audit relay and adoption UI so it references explicit
      convergence policy instead of silently implying `pick_one`

**Deliverables**: Chat renderer and state contracts use the right layer for
concurrent vs parallel.

### Phase 1B: Chat Continuity Follow-Through

- [ ] Task 1B.1: Fix the same-chat `solo retarget` defect so provider/model
      switching no longer silently drops continuity when a replacement runtime
      session is created
- [ ] Task 1B.2: Split same-chat continuity transplant from targeted handoff
      packaging instead of reusing `buildSoloChatBootstrapInstructions` as the
      general continuity path
- [ ] Task 1B.3: Remove the coupling between same-chat continuity and
      `MAX_PROMPT_RECENT_MESSAGES` so excerpt budgets remain bounded helpers
      rather than the semantic contract
- [ ] Task 1B.4: Keep `shouldRestartSoloSession` as a lifecycle/restart gate
      only; ensure continuity survives restart through native resume or
      transplant instead of treating restart as an implicit fresh start
- [ ] Task 1B.5: Define parallel-child continuity rules so each child
      conversation owns its own continuity and sibling transcripts do not leak
      by default
- [ ] Task 1B.6: Define first-slice packaging for non-text continuity artifacts
      such as tool results, file previews, and structured references
- [ ] Task 1B.7: Add regression tests for same-chat cross-provider retarget,
      same-provider restart, and parallel-child no-sibling-leak behavior

**Deliverables**: first continuity implementation slice for `solo retarget`,
plus explicit follow-through boundaries for parallel child continuity and later
group-join modes.

### Phase 2: Code Entry Preset Contracts

- [ ] Task 2.1: Define the `+New code`, `+Team code`, and `+Peer code` creation
      payloads
- [ ] Task 2.2: Define `executionProfile` structure for code entry and later
      editing
- [ ] Task 2.3: Define preset-to-engine mapping rules:
      - `+New code` -> one conversation
      - `+Team code` -> shared multi-participant conversation
      - `+Peer code` -> parallel container with child conversations
- [ ] Task 2.4: Define which preset fields are required at creation time and
      which are optional or editable later

**Deliverables**: durable creation contracts for the three Code entry presets.

### Phase 3: Peer-Code Automation Layer

- [ ] Task 3.1: Define first-slice automation policy ids for peer-review flows
- [ ] Task 3.2: Define provenance contract for cross-branch auto-share actions
- [ ] Task 3.3: Define how reviewer findings return to the main coding branch
- [ ] Task 3.4: Define how selected/adopted branch outcomes materialize back
      into the parent peer-code container

**Deliverables**: one explicit automation policy seam for `Peer code`.

### Phase 4: Code Surface Rollout

- [ ] Task 4.1: Update Code sidebar/entry UX around the three presets
- [ ] Task 4.2: Ensure `+New code` creation captures execution-profile inputs
      - first slice: move default `+New code` draft ownership into
        `products/code/*` while reusing shared draft primitives
      - first slice: add code-specific draft copy overrides without forking
        shared composer/panel mechanics
- [ ] Task 4.3: Ensure `+Team code` exposes workflow-policy configuration
- [ ] Task 4.4: Ensure `+Peer code` exposes branch roles and automation-policy
      configuration

**Deliverables**: first usable product entry surfaces for the new Code presets.

### Phase 5: Verification and Migration

- [ ] Task 5.1: Add regression coverage for concurrent cluster vs parallel
      container projection rules
- [ ] Task 5.2: Add creation/resume coverage for each Code preset
- [ ] Task 5.3: Add provenance coverage for peer-review automation actions
- [ ] Task 5.4: Update older Chat/Code docs and remove conflicting terminology
      once implementation lands

**Deliverables**: verified semantic split and preset rollout with migration
notes.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/core/**` | Modify (additive) | Shared container/conversation/turn/lane policy contracts if needed |
| `src/products/chat/**` | Modify | Keep concurrent cluster projection and parallel child-thread projection distinct, and implement continuity transplant / child-continuity rules |
| `src/products/code/**` | Modify/Create | Entry preset creation, execution-profile storage, peer-review automation |
| `tests/**` | Modify/Create | Projection, preset creation, automation-provenance coverage |
| `docs/**` | Modify | Terminology, architecture, and product docs once implementation clarifies details |

## Technical Decisions

- `concurrent` and `parallel` are different abstraction layers and must stay so
  in contracts, UI, and tests.
- same-chat `solo retarget` continuity belongs to conversation/participant
  semantics, not to runtime-session reuse alone.
- `convergencePolicy` belongs to concurrent fan-out, not to parallel container
  identity.
- `buildSoloChatBootstrapInstructions` and `MAX_PROMPT_RECENT_MESSAGES` cannot
  remain the general contract for same-chat continuity.
- parallel containers do not share one hidden transcript; each child
  conversation owns continuity independently unless explicit relay/adopt policy
  says otherwise.
- Code presets are product-level entry points; they are not special engine
  topologies.
- `executionProfile` is a first-class contract for code-targeted presets.
- Peer-review automation must preserve provenance rather than behaving like
  hidden transcript mutation.

## Testing Strategy

- **Unit Tests**:
  shared policy normalization, preset-to-engine mapping, execution-profile
  validation, convergence-policy helpers, continuity-mode selection, transplant
  packaging helpers
- **Integration Tests**:
  concurrent-cluster render path vs parallel-container render path,
  `+New code` / `+Team code` / `+Peer code` creation and resume flows,
  peer-review automation provenance, same-chat provider/model retarget with
  preserved continuity, parallel child no-sibling-transcript leakage
- **Renderer/Behavior Tests**:
  fixed-order concurrent cluster layout, parallel child-thread navigation,
  Code sidebar preset entry paths, explicit `start fresh` vs `continue chat`
  semantics around provider/model switching

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Concurrent and parallel semantics drift again in implementation | High | Freeze shared vocabulary first and add projection regression tests |
| Same-chat solo continuity regresses back to excerpt-only bootstrap | High | Separate transplant helpers from bounded recent-message formatting and add retarget regression tests |
| Code entry presets start leaking runtime-only details into ad hoc form state | Medium | Promote `executionProfile` into a first-class contract early |
| Peer-code automation becomes hidden branch mutation | High | Require explicit policy ids, provenance, and branch-level auditability |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-14 | Plan created to formalize concurrent vs parallel semantics and map `Cats Code` entry points onto the shared engine |
| 2026-04-17 | Reserved SPEC-068 / ADR-067 for the first `+New code` slice and started moving default Code draft ownership out of the chat-specific draft re-export path |
| 2026-04-17 | Added continuity follow-through under the same plan so same-chat solo retarget, parallel child continuity, and excerpt-bootstrap removal stay attached to the shared semantics work |

---

*Created: 2026-04-14*
*Author: Codex*

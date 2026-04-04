# PLAN-038: Guide Cat Setup and Participant Generalization

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

[SPEC-049: Guide Cat Setup and Generalized Participant Entry](../specs/SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)

## Overview

Deliver `Guide Cat` in two layers:

- a near-term suite setup and entry-suggestion slice
- a longer-term model migration from Cat-only room assumptions to generalized
  entities and participants

This plan deliberately separates lightweight onboarding from the deeper
conversation-model rewrite. The first implementation slice should improve setup
and entry discoverability without forcing a flag-day participant migration.

## Implementation Phases

### Phase 1: Freeze Terminology and Product Boundaries

- [ ] Task 1.1: Land `Guide Cat` as the canonical term in specs, ADRs,
      requirements, and terminology docs.
- [ ] Task 1.2: Freeze the rule that `Guide Cat` is optional and is not
      automatically equal to `Boss Cat` or the invisible orchestrator.
- [ ] Task 1.3: Record the generalized `entity` / `participant` direction and
      the split between conversation topology and per-turn strategy.

**Deliverables**: approved documentation baseline for naming and architecture

### Phase 2: Setup Wizard and Suite Contract Changes

- [ ] Task 2.1: Replace the current setup-time `createBossCat` framing with
      `createGuideCat` in suite-level setup copy and contracts.
- [ ] Task 2.2: Keep setup inputs minimal: Guide Cat name plus runtime target
      only.
- [ ] Task 2.3: Ensure setup can complete with or without Guide Cat.
- [ ] Task 2.4: Persist a created Guide Cat as suite-level reusable state
      rather than only as Boss Cat bootstrap.

**Deliverables**: setup can create or skip Guide Cat without breaking the suite

### Phase 3: Guide Cat Suggestions and Entry Surfaces

- [ ] Task 3.1: Add a suite-owned cached suggestion record for Guide Cat entry
      ideas.
- [ ] Task 3.2: Use that suggestion seam for `+New chat` first, with static
      fallback suggestions when Guide Cat output is missing.
- [ ] Task 3.3: Extend the same seam later to suite landing and future
      `+Group chat` entry surfaces.
- [ ] Task 3.4: Use on-demand leased Guide Cat sessions for suggestion
      generation instead of an always-on background process.

**Deliverables**: helpful entry ideas without requiring a permanently awake
Guide Cat

### Phase 4: Participant Generalization Inside Chat

- [ ] Task 4.1: Introduce generalized `entity` and channel-scoped
      `participant` contracts alongside existing Cat-specific contracts.
- [ ] Task 4.2: Add compatibility adapters so current `catAssignments`,
      `assignedCats`, `draftCatIds`, and `leadCatId` can be derived rather than
      remaining the only source of truth.
- [ ] Task 4.3: Separate conversation topology from participant class and from
      per-turn execution strategy.
- [ ] Task 4.4: Rework chat entry modeling so `+New chat`, `+Group chat`,
      direct lanes, and future non-Cat specialists depend on one shared
      participant model.

**Deliverables**: generalized participant substrate coexisting with current Cat
UI language

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/specs/SPEC-049-guide-cat-setup-and-generalized-participant-entry.md` | Create | Product requirements for Guide Cat and participant-generalization direction |
| `docs/decisions/051-generalize-participants-and-adopt-guide-cat-terminology.md` | Create | Architecture decision for naming and model direction |
| `docs/terminology.md` | Modify | Freeze Guide Cat, entity, participant, topology, and turn-strategy vocabulary |
| `src/app/renderer/setup/SuiteSetupWizard.tsx` | Modify | Rename setup copy and flow from Boss Cat bootstrap to optional Guide Cat |
| `src/shared/suite-contract.ts` | Modify | Replace setup-time Boss-Cat bootstrap fields with Guide Cat setup fields |
| `src/app/server/suiteSetupRoutes.ts` | Modify | Persist Guide Cat as suite-level setup output while keeping compatibility |
| `src/products/chat/api/contracts.ts` | Modify | Add compatibility path toward generalized participants |
| `src/products/chat/renderer/components/NewChatDraft.tsx` | Modify | Consume starter ideas and later `+Group chat` entry changes |
| `tests/*` | Modify | Add targeted coverage for setup, suggestions, and participant adapters |

## Technical Decisions

- Decision 1: Use `Guide Cat` as the shared term across product and developer
  docs because `assistant` drift has already created ambiguity with Boss Cat
  and orchestrator concepts.
- Decision 2: Keep Guide Cat sessions on an event-driven leased lifecycle so
  Guide Cat can help proactively without requiring an always-running daemon.
- Decision 3: Introduce generalized participants incrementally behind
  compatibility adapters instead of rewriting all Cat-specific state in one
  patch.

## Testing Strategy

- **Unit Tests**: setup-contract normalization, Guide Cat suggestion cache
  fallback rules, participant adapter helpers
- **Integration Tests**: setup wizard completion with and without Guide Cat,
  entry-suggestion rendering, setup persistence into suite envelope
- **Manual Testing**:
  - complete setup without Guide Cat and verify the suite still opens normally
  - complete setup with Guide Cat and verify the chosen target is visible in
    later settings or registry surfaces
  - verify `+New chat` shows cached Guide Cat suggestions when present and
    static fallback ideas otherwise

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `Guide Cat` silently collapses back into `Boss Cat` semantics | High | Freeze boundary rules in ADR and terminology docs before code migration |
| Setup scope grows into an advanced persona editor | High | Keep setup contract limited to name plus runtime target |
| Participant generalization stalls halfway and leaves more overlapping terms | High | Introduce explicit compatibility adapters and one canonical future model in docs before implementation |
| Entry suggestions become dependent on a live session | Medium | Require cached output plus deterministic fallback ideas |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-04 | Plan created to align Guide Cat setup and participant generalization |

---

*Created: 2026-04-04*
*Author: Codex*

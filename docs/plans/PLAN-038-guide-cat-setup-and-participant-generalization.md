# PLAN-038: Guide Cat Setup and Participant Generalization

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

[SPEC-049: Guide Cat Setup and Generalized Participant Entry](../specs/SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)

## Overview

Deliver `Guide Cat` in two layers:

- a near-term platform setup and entry-suggestion slice
- a longer-term model migration from Cat-only room assumptions to generalized
  entities and participants

This plan deliberately separates lightweight onboarding from the deeper
conversation-model rewrite. The first implementation slice should improve setup
and entry discoverability without forcing a flag-day participant migration.

The post-setup visible day-0 assist surface is now documented separately in:

- [ADR-054](../decisions/054-use-a-platform-level-guide-sidecar-for-day-0-assist.md)
- [SPEC-051](../specs/SPEC-051-guide-cat-sidecar-and-day-0-assist-surfaces.md)
- [PLAN-041](./PLAN-041-guide-cat-sidecar-and-day-0-assist-rollout.md)

## Implementation Phases

### Phase 1: Freeze Terminology and Product Boundaries

- [x] Task 1.1: Land `Guide Cat` as the canonical term in specs, ADRs,
      requirements, and terminology docs.
- [x] Task 1.2: Freeze the rule that `Guide Cat` is optional and is not
      automatically equal to `Boss Cat` or the invisible orchestrator.
- [x] Task 1.3: Record the generalized `entity` / `participant` direction and
      the split between conversation topology and per-turn strategy.

**Deliverables**: approved documentation baseline for naming and architecture
landed in the first documentation slice

### Phase 2: Setup Wizard and Platform Contract Changes

- [x] Task 2.1: Replace the current setup-time `createBossCat` framing with
      `createGuideCat` in platform-level setup copy and contracts, while keeping
      `Boss Cat` as a distinct Chat role until later mapping decisions land.
- [x] Task 2.2: Keep setup inputs minimal: Guide Cat name plus runtime target
      only.
- [x] Task 2.3: Ensure setup can complete with or without Guide Cat.
- [x] Task 2.4: Persist a created Guide Cat as platform-level reusable state
      rather than only as Boss Cat bootstrap, and keep the Guide-Cat-to-Boss
      mapping explicit instead of implicit.
- [ ] Task 2.5: Rework Guide Cat target selection so setup only shows truthful
      currently usable runtime-backed targets and models, with inline recovery
      guidance instead of static fallback catalogs when no usable target exists.

**Deliverables**: setup can create or skip Guide Cat without breaking the platform,
and a created Guide Cat now persists as platform-level state without implicitly
rewiring the global orchestrator target; Guide Cat setup no longer depends on
misleading fallback execution choices

### Phase 3: Guide Cat Suggestions and Entry Surfaces

- [ ] Task 3.1: Add a platform-owned cached suggestion record plus freshness
      metadata for Guide Cat entry ideas.
- [ ] Task 3.2: Attempt one initial Guide Cat suggestion generation after
      setup completes when a Guide Cat exists.
- [ ] Task 3.3: Use that suggestion seam for `+New chat` first, showing cached
      ideas immediately and lazy-refreshing on surface-open when the cache is
      stale or missing, with static fallback suggestions when Guide Cat output
      is unavailable.
- [ ] Task 3.4: Extend the same seam later to platform landing and future
      `+Group chat` entry surfaces.
- [ ] Task 3.5: Use on-demand leased Guide Cat sessions for suggestion
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
      per-turn execution strategy, starting with
      `inferChannelComposerMode(...)`, `isDirectLaneChannel(...)`, and
      `resolveConversationMode(...)` plus their mirrored `Work` and `Code`
      helpers.
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
| `src/app/renderer/setup/PlatformSetupWizard.tsx` | Modify | Rename setup copy and flow from Boss Cat bootstrap to optional Guide Cat |
| `src/shared/platform-contract.ts` | Modify | Replace setup-time Boss-Cat bootstrap fields with Guide Cat setup fields |
| `src/app/server/platformSetupRoutes.ts` | Modify | Persist Guide Cat as platform-level setup output while keeping compatibility |
| `src/core/types.ts` | Modify | Add platform-level `guideCat` state distinct from product-owned chat cat records |
| `src/products/chat/state/shell.ts` | Modify | Thread platform-level `guideCat` through the app-shell envelope |
| `src/products/chat/api/routeSupport.ts` | Modify | Expose persisted `guideCat` state in server-built shell payloads |
| `src/products/chat/renderer/api/normalization.ts` | Modify | Normalize platform-level `guideCat` payloads for renderer consumers |
| `src/products/chat/api/contracts.ts` | Modify | Add compatibility path toward generalized participants |
| `src/products/chat/state/model/shared.ts` | Modify | Rework `inferChannelComposerMode(...)` away from Cat-only active-roster assumptions |
| `src/products/chat/shared/channelTopology.ts` | Modify | Rework `resolveChannelKind(...)` / `isDirectLaneChannel(...)` around explicit topology and generalized participants |
| `src/products/chat/renderer/conversationMode.ts` | Modify | Rework `resolveConversationMode(...)` so it depends on topology and participants rather than Cat-only heuristics |
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
- Decision 4: Guide Cat setup and later product execution pickers must share
  one truthful runtime-backed selector contract instead of drifting between
  setup-only fallback behavior and product-only runtime truth.

## Testing Strategy

- **Unit Tests**: setup-contract normalization, Guide Cat suggestion cache
  fallback rules, participant adapter helpers
- **Integration Tests**: setup wizard completion with and without Guide Cat,
  entry-suggestion rendering, setup persistence into platform envelope
- **Manual Testing**:
  - complete setup without Guide Cat and verify the platform still opens normally
  - complete setup with Guide Cat and verify the chosen target is visible in
    later settings or registry surfaces
  - opt into Guide Cat when no usable runtime target exists and verify setup
    shows inline runtime-setup guidance instead of fake provider/model choices
  - verify `+New chat` shows cached Guide Cat suggestions when present and
    static fallback ideas otherwise

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `Guide Cat` silently collapses back into `Boss Cat` semantics | High | Freeze boundary rules in ADR and terminology docs before code migration |
| Setup scope grows into an advanced persona editor | High | Keep setup contract limited to name plus runtime target |
| Setup keeps showing non-usable provider/model choices | High | Share one truthful selector contract across setup and in-product execution pickers |
| Participant generalization stalls halfway and leaves more overlapping terms | High | Introduce explicit compatibility adapters and one canonical future model in docs before implementation |
| Entry suggestions become dependent on a live session | Medium | Require cached output plus deterministic fallback ideas |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-04 | Plan created to align Guide Cat setup and participant generalization |
| 2026-04-04 | Phase 1 documentation freeze completed; follow-up review clarified setup order, Boss Cat coexistence, suggestion triggers, and concrete Chat code hotspots |
| 2026-04-04 | Phase 2 setup contract slice landed: Guide Cat now persists as platform-level state, setup remains optional, and Guide Cat runtime selection no longer overwrites the global orchestrator target |

---

*Created: 2026-04-04*
*Author: Codex*

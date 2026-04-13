# PLAN-052: Guide Cat Optional Surface-Assist Capability

> Generalize Guide Cat from a setup/sidecar concept into a reusable
> low-privilege assist capability that can power suggestions, helper copy, and
> contextual prompts across product surfaces.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-060: Guide Cat Optional Surface-Assist Capability](../specs/SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [ADR-061: Treat Guide Cat as an Optional Surface-Assist Capability](../decisions/061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [SPEC-049: Guide Cat Setup and Generalized Participant Entry](../specs/SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)
- [SPEC-051: Guide Cat Sidecar and Day-0 Assist Surfaces](../specs/SPEC-051-guide-cat-sidecar-and-day-0-assist-surfaces.md)

## Overview

This rollout creates one shared Guide Cat capability seam and then lets
individual surfaces opt into it.

The first target surfaces are:

- setup follow-through
- lobby
- chat entry/composer suggestion surfaces

The sidecar remains one surface-specific consumer, not the whole feature.

## Implementation Phases

### Phase 1: Define Capability and Policy Contracts

- [ ] Task 1.1: Define a shared Guide Cat policy contract per surface.
- [ ] Task 1.2: Define null-provider, cached-assist, and runtime-backed assist
      behavior.
- [ ] Task 1.3: Define the minimum surface context payload used by Guide Cat.
- [ ] Task 1.4: Define observability fields for Guide Cat outputs and fallback
      mode.

**Deliverables**: one Guide Cat capability seam shared by all surfaces

### Phase 2: Build Runtime and Fallback Providers

- [ ] Task 2.1: Implement deterministic fallback providers for initial surfaces.
- [ ] Task 2.2: Implement cached-assist storage and retrieval.
- [ ] Task 2.3: Implement runtime-backed assist generation through the existing
      runtime boundary where allowed.
- [ ] Task 2.4: Ensure runtime-backed failures degrade cleanly into cached or
      deterministic output.

**Deliverables**: Guide Cat can run in runtime-backed or non-runtime modes

### Phase 3: Adopt Entry and Composer Surfaces

- [ ] Task 3.1: Integrate Guide Cat with lobby-first assist surfaces.
- [ ] Task 3.2: Integrate Guide Cat with `+New chat` and chat-entry suggestion
      surfaces.
- [ ] Task 3.3: Integrate Guide Cat with composer-adjacent prompt suggestions
      and helper copy.
- [ ] Task 3.4: Keep all of those surfaces usable with deterministic fallback.

**Deliverables**: shared assist behavior across the most visible day-0 and
day-1 surfaces

### Phase 4: Reframe the Sidecar as a Surface Consumer

- [ ] Task 4.1: Rework the Guide sidecar to consume the new capability seam.
- [ ] Task 4.2: Separate sidecar-local view state from Guide Cat content
      generation.
- [ ] Task 4.3: Ensure sidecar-specific affordances remain a surface concern,
      not the shared capability definition.

**Deliverables**: sidecar becomes one projection of Guide Cat rather than the
definition of the feature

### Phase 5: Expand to Work and Code Assist Surfaces

- [ ] Task 5.1: Define the first Work-specific Guide Cat suggestion surfaces.
- [ ] Task 5.2: Define the first Code-specific Guide Cat suggestion surfaces.
- [ ] Task 5.3: Ensure those surfaces use the same policy, fallback, and
      observability contract.

**Deliverables**: Guide Cat scales beyond Chat/lobby concepts

### Phase 6: Verification

- [ ] Task 6.1: Add unit tests for policy selection, cache behavior, and
      fallback resolution.
- [ ] Task 6.2: Add integration tests for lobby, entry, composer, and sidecar
      Guide Cat surfaces.
- [ ] Task 6.3: Add manual smoke tests covering:
      - Guide Cat present with runtime available
      - Guide Cat present with runtime unavailable
      - no Guide Cat configured
      - cached assist reuse and lazy refresh

**Deliverables**: stable optional-assist behavior across adopted surfaces

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/app/renderer/**` | Modify | Integrate shared Guide Cat surface providers into lobby and shell surfaces |
| `src/products/chat/renderer/**` | Modify | Add composer and entry-surface Guide Cat affordances |
| `src/products/work/**` | Modify | Add Work assist surface consumers later in the rollout |
| `src/products/code/**` | Modify | Add Code assist surface consumers later in the rollout |
| `src/shared/**` | Modify/Create | Shared Guide Cat policy, provider, cache, and fallback contracts |
| `tests/**` | Modify/Create | Coverage for Guide Cat policy, fallback, and adopted surfaces |

## Technical Decisions

- Decision 1: the capability contract comes first; sidecar and prompt chips are
  just projections.
- Decision 2: deterministic fallback is mandatory from day one.
- Decision 3: Guide Cat remains low-privilege and may only trigger deeper work
  through explicit product handoff.

## Testing Strategy

- **Unit Tests**: policy resolution, caching, fallback selection
- **Integration Tests**: lobby, entry, composer, and sidecar Guide surfaces
- **Manual Testing**:
  - new user with Guide Cat
  - existing user with cached suggestions
  - runtime outage with deterministic fallback

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Guide Cat logic gets duplicated across surfaces again | High | Define and adopt one shared capability contract before expanding surfaces |
| Surfaces become dependent on runtime-backed assist | High | Make deterministic fallback mandatory and test runtime-off scenarios explicitly |
| Guide Cat starts owning critical-path correctness | High | Keep policy low-privilege and require explicit handoff into product actions |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-14 | Plan created for the optional Guide Cat surface-assist capability rollout |

---

*Created: 2026-04-14*
*Author: Codex*

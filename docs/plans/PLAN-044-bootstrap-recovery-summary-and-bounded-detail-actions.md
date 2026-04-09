# PLAN-044: Bootstrap Recovery Summary and Bounded Detail Actions

> Rework the desktop bootstrap recovery/details page into a summary-first
> surface with a stable three-slot action row and collapsed technical details.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | User |
| **Reviewer** | Codex |

## Related Spec / Dependencies

- [SPEC-054: Bootstrap Recovery Summary and Bounded Detail Actions](../specs/SPEC-054-bootstrap-recovery-summary-and-bounded-detail-actions.md)
- [SPEC-023: Packaged Setup Wizard and Provider Installation](../specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [SPEC-045: Cross-Layer Bootstrap and Onboarding Diagnostics](../specs/SPEC-045-cross-layer-bootstrap-and-onboarding-diagnostics.md)
- [SPEC-053: Post-Setup Environment Status and Recovery Entry](../specs/SPEC-053-post-setup-environment-status-and-recovery-entry.md)
- [ADR-021](../decisions/021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [ADR-046](../decisions/046-drive-packaged-setup-through-runtime-bootstrap-apis.md)
- [ADR-047](../decisions/047-separate-bootstrap-diagnostics-by-layer-and-aggregate-in-the-host.md)

## Overview

The current bootstrap recovery/details page is functionally rich but visually
and behaviorally overloaded.
The first implementation slice should not change bootstrap ownership or retry
logic; it should only reshape the recovery/details surface so users can
understand it quickly.

This plan implements that change in three layers:

1. define one stable recovery view model and action-row policy
2. rebuild the bootstrap recovery/details layout around a summary card and
   collapsed sections
3. update tests so the recovery page no longer regresses into an all-expanded,
   action-heavy debug dump

## Implementation Phases

### Phase 1: Stabilize Recovery Action Policy

- [ ] Task 1.1: Extract or centralize a recovery-details presentation model from
      the current `buildDesktopHostActions` output.
- [ ] Task 1.2: Enforce the fixed three-slot row:
      continue, repair, quit.
- [ ] Task 1.3: Replace state-dependent action emphasis with stable slot
      semantics.
- [ ] Task 1.4: Ensure the main row never shows both `Retry*` and
      `Resume Setup`.
- [ ] Task 1.5: Move `Open Runtime Diagnostics` out of the main row and into a
      lower-level section.

**Deliverables**: one stable recovery action policy independent of how noisy a
given bootstrap state becomes

### Phase 2: Rebuild the Recovery/Details Layout

- [ ] Task 2.1: Add a summary-first recovery header with plain-language title
      and summary copy.
- [ ] Task 2.2: Keep the three-slot action row beside that summary.
- [ ] Task 2.3: Add a visible `Hide details` or equivalent path back out of the
      detailed mode after `Show details`.
- [ ] Task 2.4: Collapse technical sections by default.
- [ ] Task 2.5: Restrict top-level sections to:
      `Why am I seeing this?`, `Service status`, `Diagnostics`,
      `Logs and paths`, and conditional `Setup recovery`.
- [ ] Task 2.6: Demote helper catalog, capability-pack, rollout, chronology,
      and path-heavy content into expandable detail blocks only.

**Deliverables**: a bounded recovery/details page that reads as product UX
first and diagnostics second

### Phase 3: Copy and State Mapping Cleanup

- [ ] Task 3.1: Replace jargon-heavy recovery headlines with calm product copy.
- [ ] Task 3.2: Define exact per-state title and summary copy for:
      `failed`, `ready_for_setup`, and `needs_prerequisites`.
- [ ] Task 3.3: Define exact button labels for:
      `Continue to Setup`, `Open Setup`, `Open Cats`,
      `Retry Startup`, `Retry Check`, `Resume Setup`, `Quit Cats`.
- [ ] Task 3.4: Make sure setup-complete states clearly tell the user when
      Cats can still open safely.

**Deliverables**: one consistent copy model and one clear user-facing action
mapping table

### Phase 4: Verification

- [ ] Task 4.1: Update bootstrap-page tests to assert the new summary-first IA,
      stable action row, and collapsed-details hooks.
- [ ] Task 4.2: Update readiness tests to assert the new continue/repair/quit
      action mapping.
- [ ] Task 4.3: Add targeted tests for `Quit Cats` visibility in recovery mode.
- [ ] Task 4.4: Add targeted tests ensuring `Open Runtime Diagnostics` no
      longer consumes a main action slot.

**Deliverables**: regression coverage for the new recovery/action policy and
details layout

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `desktop/host/readiness.ts` | Modify | Rebuild recovery action selection around fixed continue/repair/quit slots |
| `desktop/host/bootstrapPage.ts` | Modify | Replace the current recovery/details dump with a summary-first layout and collapsed sections |
| `tests/desktop-readiness.test.js` | Modify | Verify the new action-row mapping and per-state button selection |
| `tests/desktop-bootstrap-page.test.js` | Modify | Verify summary-first layout, collapsed sections, and detail-mode exit affordance |
| `tests/desktop-bootstrap-navigation.test.js` | Modify (if needed) | Only if navigation wording or assumptions need updates |
| `docs/specs/SPEC-054-bootstrap-recovery-summary-and-bounded-detail-actions.md` | Create | Requirements and UX policy for the recovery/details redesign |
| `docs/plans/PLAN-044-bootstrap-recovery-summary-and-bounded-detail-actions.md` | Create | Implementation plan for the redesign |

## Technical Decisions

- Decision 1: No new ADR is required because this plan preserves the existing
  runtime/host/platform ownership split.
- Decision 2: The recovery/details surface should use fixed action slots rather
  than state-dependent primary/secondary emphasis.
- Decision 3: `Quit Cats` remains in the same action row because tray-mode
  window close may not actually exit the app.
- Decision 4: `Open Runtime Diagnostics` should stay available, but below the
  summary layer rather than in the main action row.
- Decision 5: Technical evidence stays in the page, but collapsed by default.

## Testing Strategy

- **Unit Tests**: recovery action-slot mapping, per-state title/summary copy,
  and conditional section visibility
- **Integration Tests**: desktop bootstrap page HTML content, detail-mode
  affordances, and action-row composition
- **Manual Testing**:
  - fail first-run startup and verify the page shows only the fixed three-slot
    row
  - complete setup, break runtime startup, and verify the page says `Open Cats`
    before deeper repair actions
  - enable tray mode and verify `Quit Cats` exits the app even when window
    close minimizes to tray
  - verify technical sections stay collapsed until explicitly opened

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| The new summary layer hides needed diagnostics from power users | Medium | Keep diagnostics, logs, and setup recovery in explicit expandable sections |
| The continue/repair/quit slot model is too rigid for rare states | Medium | Keep the continue slot optional, but preserve slot semantics |
| Existing tests overfit old wording or section ordering | Medium | Update tests to assert policy and structure, not fragile full-page dumps |
| `Quit Cats` remains confusing in non-tray environments | Low | Keep the label explicit and verify whether future follow-up should gate its visibility by host background mode |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-09 | Plan created as the implementation pair for `SPEC-054`; no new ADR required |

---

*Created: 2026-04-09*
*Author: Codex*

# PLAN-028: Cats Work Team Templates and Work Intake

> Turn `Cats Work` from a shared-core read surface into a product-owned
> operating flow that starts work, selects a team template, generates a plan,
> gates it through approval, and dispatches downstream tasks into Work, Chat,
> or Code.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Assigned To** | Codex |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-040: Cats Work Team Templates and Work Intake](../specs/SPEC-040-cats-work-team-templates-and-work-intake.md)
- [PLAN-021: Cross-Product Task Strategy Handoff and Runtime Bridge](./PLAN-021-cross-product-task-strategy-handoff-and-runtime-bridge.md)
- [ADR-039: Use Core task metadata as the cross-product plan exchange surface](../decisions/039-use-core-task-metadata-as-cross-product-plan-exchange.md)
- [SPEC-032: Core Task Lifecycle and Wakeup Integration](../specs/SPEC-032-core-task-lifecycle-and-wakeup-integration.md)
- [SPEC-035: Cross-Product Task Strategy Handoff and Runtime Bridge](../specs/SPEC-035-cross-product-task-strategy-handoff-and-runtime-bridge.md)

## Overview

`Cats Work` already has meaningful read models:

- dashboard projections
- project/work-item/task detail reads
- operator inbox and control-plane views
- recovery and activity/timeline surfaces

What it still lacks is a product-owned creation loop.

This plan adds that first loop:

1. start work from `/work`
2. choose a built-in team template
3. generate a first plan on shared Core records
4. review and approve before dispatch
5. hand off downstream work to Work, Chat, or Code through existing shared
   planning metadata and product-owned adapters

The first slice should keep Work opinionated and narrow. The `software_delivery`
template is the reference pack. Raw runtime ids, skill manifests, and provider
mechanics do not become the Work UI.

## Implementation Phases

### Phase 1: Team Template Catalog and Intake Contracts

- [ ] Define product-owned `WorkIntakeDraft`, `WorkTeamTemplate`, and
      `GeneratedWorkPlan` contracts
- [ ] Seed the first built-in `software_delivery` template with:
      - role pack
      - workflow pack
      - product-routing defaults
      - strategy defaults
      - approval expectations
- [ ] Add normalization helpers so template defaults and intake overrides merge
      deterministically
- [ ] Keep the first catalog file-backed or product-config-backed, not runtime-
      owned
- [ ] Define the minimum intake payload fields from SPEC-040:
      title, brief, desired outcome, optional repo/workspace context, optional
      deadline or priority hints

**Deliverables**: one product-owned Work intake and template contract layer.

### Phase 2: Core Record Creation and Initial Plan Assembly

- [ ] Add Work-owned write paths that create or update:
      - `CoreProjectRecord`
      - `CoreWorkItemRecord`
      - `CoreTaskRecord`
- [ ] Reuse `task.metadata.planning` conventions from
      [PLAN-021](./PLAN-021-cross-product-task-strategy-handoff-and-runtime-bridge.md)
      for product hints, transfer hints, strategy hints, and acceptance
      criteria
- [ ] Generate the first draft plan from the chosen template and intake data
- [ ] Persist initial approval/activity placeholders through Core-owned records
- [ ] Keep `Cats Work` above shared Core records rather than introducing a
      Work-only task schema

**Deliverables**: intake can create a real Work initiative on top of existing
shared Core contracts.

### Phase 3: Intake UI and Plan Review Surface

- [ ] Add a `Start Work` entry point in the existing `/work` shell
- [ ] Build the first intake flow with:
      - intake form
      - template selection
      - generated plan review
      - editable acceptance criteria and routing hints before approval
- [ ] Present planning intent, roles, and product-target choices in
      human-readable language before any raw trace detail
- [ ] Keep the first slice transcript-free and dashboard-native rather than
      redirecting the user into Chat to start work
- [ ] Decide whether the first review UX stays inline or gets a focused
      `/work/intake` / `/work/plans/{id}` route family

**Deliverables**: one product-native intake and plan-review surface inside Work.

### Phase 4: Approval Gate and Product-Owned Dispatch

- [ ] Record explicit approve/reject decisions through Core approval/activity
      records
- [ ] Add product-owned dispatch adapters so:
      - Work-targeted tasks stay in Work
      - Chat-targeted tasks hand off through Chat adapters
      - Code-targeted tasks hand off through Code adapters
- [ ] Reuse the existing product-to-runtime bridge instead of sending
      `CoreTaskRecord` directly to `cats-runtime`
- [ ] Surface transfer status, next action, and blocker reasons in Work detail
- [ ] Keep externally consequential actions out of scope for this slice

**Deliverables**: approved Work plans can dispatch cleanly without exposing raw
runtime internals.

### Phase 5: Dashboard, Outputs, and Recovery Integration

- [ ] Extend Work dashboard/detail views with template, plan, transfer, and
      output summaries
- [ ] Show linked downstream outputs such as:
      - Code preview/build/artifact status
      - Chat conversation or operator-loop status
      - review / QA outcomes
- [ ] Reuse existing operator inbox, control-plane, recovery, and timeline read
      models as the backbone of Work follow-through
- [ ] Add budget/quota visibility hooks where they already exist, without
      making the full war-room implementation a prerequisite
- [ ] Keep Work's default posture focused on initiative status, blockers, and
      outcomes before traces or runtime payloads

**Deliverables**: one Work dashboard that feels like an operating surface, not
just a viewer.

### Phase 6: Hardening and Template Extensibility

- [ ] Add regression coverage for intake, review, approval, dispatch, and
      linked-output flows
- [ ] Define the extension seam for later templates beyond
      `software_delivery`
- [ ] Verify first-slice defaults remain deterministic across Work, Chat, and
      Code handoff
- [ ] Update Work docs and backlog notes once the first template/intake loop is
      stable

**Deliverables**: stable first-slice Work intake plus a clean path to later
template packs.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/work/api/**` | Modify/Create | Work intake, plan review, approval, dispatch, and output summary routes |
| `src/products/work/renderer/components/**` | Modify/Create | Intake entry, template selection, plan review, dashboard, and detail components |
| `src/products/work/renderer/hooks/**` | Modify/Create | Intake actions, plan review state, approval actions, and dispatch behaviors |
| `src/products/work/renderer/api/**` | Modify | Renderer-side Work API clients and normalization helpers |
| `src/products/work/shared/**` | Modify/Create | Product-owned template, workflow, and routing helper contracts |
| `src/core/model/**` | Modify | Shared planning/approval/activity record helpers used by Work intake |
| `src/core/api/**` | Modify | Shared write/read routes consumed by Work where additive fields are needed |
| `tests/**` | Modify/Create | Work intake, template, approval, dispatch, and linked-output regression coverage |
| `docs/specs/**` | Modify (follow-on) | Update linked Work specs if template or approval scope changes during implementation |

## Technical Decisions

- Keep team templates product-owned in `Cats Work`; they are not runtime skill
  manifests.
- Reuse shared Core records and planning metadata instead of inventing a
  Work-only persistence family.
- Require explicit human review before first dispatch in the first slice.
- Use product-owned adapters for Work -> Chat/Code handoff rather than direct
  runtime dispatch from Work UI state.
- Start with one built-in `software_delivery` template and keep extensibility
  additive.

## Testing Strategy

- **Unit Tests**:
  template normalization, intake-to-plan generation, routing-default
  resolution, approval state transitions
- **Integration Tests**:
  intake -> Core record creation, plan approval/rejection, downstream dispatch
  payload formation, linked-output projection assembly
- **Renderer/Behavior Tests**:
  `Start Work` entry, template selection, plan review editing, approval flows,
  dashboard transfer/output summaries
- **Manual Testing**:
  start a software-delivery initiative, approve it, dispatch to Chat/Code, and
  inspect linked outcomes from Work without touching runtime internals directly

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Work intake becomes an overdesigned org/admin suite | High | Keep the first slice narrow: one owner, one `software_delivery` template, one approval-before-dispatch flow |
| Team template schema leaks runtime/provider concerns | High | Keep templates product-owned and express only roles, workflow defaults, routing, strategy, and approval expectations |
| Cross-product dispatch loses acceptance criteria or intent | High | Reuse normalized `task.metadata.planning` helpers and test dispatch payload formation directly |
| Dashboard becomes a raw trace viewer again | Medium | Lead with initiative, plan, blockers, outputs, and recovery summaries before any low-level detail |

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-29 | Plan created to add the first Work-native intake, team-template, review, approval, and cross-product dispatch loop |

---

*Created: 2026-03-29*
*Author: Codex*

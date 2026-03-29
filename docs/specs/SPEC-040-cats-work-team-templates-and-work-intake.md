# SPEC-040: Cats Work Team Templates and Work Intake

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

`Cats Work` already has a first shared-core dashboard and task/project/work-item
detail reads, but it is still mostly a read-model viewer above `Cats Core v1`.
The next priority slice should turn Work into a product-owned operating surface:
the owner can start a piece of work from `/work`, choose a team template,
generate a first plan, review it, and dispatch follow-up tasks into Work, Chat,
or Code without exposing raw runtime internals.

The first Work priority should therefore be:

- product-owned work intake
- software-company team templates
- plan review and approval before dispatch
- cross-product task handoff through the existing Core planning metadata
- operator-first visibility over progress, blockers, recovery, and outputs

## Goals

- define the first product-native creation flow for `Cats Work`
- make team templates and workflow packs the primary Work abstraction instead
  of raw skills or ad hoc chat rooms
- let Work create `project`, `work item`, and `task` records on top of
  existing `Cats Core v1` contracts
- require human review before the first dispatch of a generated work plan
- route downstream tasks into Work, Chat, or Code through shared planning
  metadata and product-owned adapters
- keep the default Work UI focused on operating model, progress, and outcomes,
  not provider/session mechanics

## Non-Goals

- implementing the freelance-job aggregator, proposal submission, or payment
  pipeline in this slice
- implementing distributed mesh execution or peer-to-peer worker sharing
- turning `Cats Work` into a multi-company org-chart or finance suite
- exposing runtime skill manifests, MCP profiles, or provider/session IDs as
  the primary Work UX
- replacing Chat or Code with Work; this slice coordinates those surfaces
  rather than subsuming them

## User Stories

- As an owner, I want to start a new work initiative from `Cats Work` without
  going through the chat composer first.
- As an operator, I want to choose a team template so the system can propose
  roles, workflow stages, and default execution strategies.
- As an owner, I want to review and approve the initial plan before any
  downstream execution starts.
- As a PM Cat or Boss Cat, I want Work-created tasks to hand off cleanly to
  `Cats Code` or `Cats Chat` while preserving acceptance criteria and product
  intent.
- As an operator, I want one Work dashboard that shows progress, blockers,
  approvals, recovery state, and outputs without forcing me to inspect raw
  runtime logs by default.

## Requirements

### Functional Requirements

1. `Cats Work` shall provide a product-owned work intake entry under `/work`.
2. The intake flow shall capture at least:
   - title
   - brief
   - desired outcome
   - optional repo/workspace context
   - optional deadline or priority hints
3. The intake flow shall require selecting a `team template`.
4. The first required built-in team template shall be
   `software_delivery`.
5. A team template shall define at least:
   - role pack
   - workflow pack
   - product-routing defaults
   - strategy defaults
   - approval expectations
   - optional budget or delivery-policy defaults
6. The first `software_delivery` template shall be able to express at least:
   - Boss / operator lead
   - PM or architect planning role
   - implementation role
   - review role
   - QA or validation role
7. Work intake shall create or update existing shared-core records rather than
   inventing a Work-only schema:
   - `CoreProjectRecord`
   - `CoreWorkItemRecord`
   - `CoreTaskRecord`
   - linked activity / approval records as needed
8. The initial plan generated from Work intake shall use the existing
   `task.metadata.planning` conventions defined by
   [ADR-039](../decisions/039-use-core-task-metadata-as-cross-product-plan-exchange.md).
9. The generated plan shall be able to mark downstream product intent with at
   least:
   - `productHint`
   - `transfer.suggestedProduct`
   - `strategyHint`
   - `acceptanceCriteria`
10. Before first dispatch, Work shall present a human review step for the plan.
11. The first slice shall require explicit human approval before cross-product
    dispatch begins.
12. Approval decisions for that plan shall be recorded through Core-owned
    approval/activity records rather than route-local ephemeral state.
13. Work shall dispatch downstream tasks through product-owned adapters:
    - Work-targeted tasks remain in Work surfaces
    - Chat-targeted tasks hand off to Chat adapters
    - Code-targeted tasks hand off to Code adapters
14. Work shall not pass `CoreTaskRecord` directly into `cats-runtime`.
    It shall reuse the existing product-to-runtime bridge contract.
15. Work dashboard and detail views shall reuse the existing shared-core read
    models already landed for:
    - operator inbox
    - control plane
    - recovery
    - timeline
    - project/work-item/task detail
16. Work task detail shall present planning intent and next action in a
    human-readable summary before any raw runtime payloads.
17. Work shall be able to show linked outputs from downstream execution, such
    as:
    - Code artifacts, previews, or build status
    - Chat conversation or operator-loop status
    - review / QA outcomes
18. Budget and quota visibility shall integrate with
    [SPEC-025](./SPEC-025-budget-policy-override-flows-and-war-room-dashboard.md)
    when available, but the first Work slice shall not require the full
    war-room implementation to ship.
19. Externally consequential actions are out of scope for this slice.
    If later Work templates cover proposal submission or client delivery, they
    must follow
    [ADR-034](../decisions/034-require-human-approval-gates-at-pipeline-decision-points.md).

### Non-Functional Requirements

- **Shared-contract integrity**: first slice must stay within existing
  `Cats Core v1` records and metadata conventions.
- **Boundary integrity**: Work renderer surfaces must not depend on runtime
  session internals as their primary UI model.
- **Operator clarity**: default Work screens should emphasize initiative,
  plan, status, blockers, and outputs before raw trace detail.
- **Incrementality**: this slice must build directly on the already-landed
  `/api/work` projections and Core task/control-plane infrastructure.
- **Extensibility**: additional team templates should be addable later without
  rewriting the first intake model.

## Design Overview

```text
Cats Work
  /work
    -> New Work intake
    -> Choose team template
    -> Create project + work item + draft tasks in Cats Core
    -> Review generated plan
    -> Human approval gate
    -> Product-owned dispatch
         -> Work tasks stay in Work
         -> Chat tasks hand off to Chat
         -> Code tasks hand off to Code
    -> Monitor through Work dashboard
         -> operator inbox
         -> control plane
         -> recovery
         -> outputs / artifacts
```

### First Template Pack

The first slice should treat `software_delivery` as the reference Work pack.

Its default product posture is:

- planning-heavy work stays in `Cats Work`
- implementation-heavy work routes to `Cats Code`
- clarification, communication, or lightweight specialist work may route to
  `Cats Chat`

Its default strategy posture should be compatible with existing suite
direction:

- Work default: `pdca`
- Chat default: `react`
- Code default: `reflexion`

These remain product-owned defaults, not runtime-owned policy.

### UI Direction

The first visible Work surface should extend the current dashboard rather than
replace it. The new pieces should be:

- `Start Work` entry point
- template selection
- plan review panel
- transfer or product-target indicators
- output and handoff status summaries

This slice should not require a separate company-admin shell before Work feels
useful.

## Dependencies

- [ADR-007](../decisions/007-establish-cats-core-v1-for-chat-and-work.md)
- [ADR-014](../decisions/014-freeze-parallel-delivery-boundaries-for-provider-telegram-and-chat-workstreams.md)
- [ADR-025](../decisions/025-make-cats-inc-a-suite-host-with-core-owned-product-projections.md)
- [ADR-032](../decisions/032-own-task-substrate-in-core-not-runtime.md)
- [ADR-034](../decisions/034-require-human-approval-gates-at-pipeline-decision-points.md)
- [ADR-039](../decisions/039-use-core-task-metadata-as-cross-product-plan-exchange.md)
- [SPEC-025](./SPEC-025-budget-policy-override-flows-and-war-room-dashboard.md)
- [SPEC-032](./SPEC-032-core-task-lifecycle-and-wakeup-integration.md)
- [SPEC-035](./SPEC-035-cross-product-task-strategy-handoff-and-runtime-bridge.md)

## Open Questions

- [ ] Should the first `software_delivery` team template be hard-coded in
      product config, or loaded from a file-backed template catalog?
- [ ] Should Work own dedicated create/update endpoints for project/work-item
      intake, or should it remain a thin product layer above shared Core write
      routes in the first slice?
- [ ] How much of the first plan review should be inline in the dashboard
      versus a focused `/work/intake` or `/work/plans/{id}` route family?
- [ ] Which minimum budget or cost fields from `SPEC-025` should appear in the
      first Work intake and dashboard slice?
- [ ] Should delivery/review approval be mandatory for every
      `software_delivery` plan, or configurable per template in the first slice?

## References

- [Research: Codex View of Chat, Work, and Code Product Boundaries](../research/2026-03-20-codex-cats-chat-work-code-product-boundaries.md)
- [Research: Cats Work Aggregator and Mesh Vision](../research/2026-03-24-cats-work-aggregator-and-mesh-vision.md)
- [Research: Unified Planning Language and Cross-Product Strategy](../research/2026-03-26-unified-planning-language-and-cross-product-strategy.md)
- [Research: Gemini Unified Planning Language Handoff Semantics](../research/2026-03-26-gemini-upl-handoff-semantics.md)
- [README](../../README.md)
- [ROADMAP](../../ROADMAP.md)

---

*Created: 2026-03-29*
*Author: Codex*
*Related Plan: TBD*

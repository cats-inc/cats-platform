# PLAN-099: Phase-Scoped Work Tool Surface Rollout

> Implementation plan for Cats-owned supervised Work tools that capture
> Chat/Telegram todos as Work Items and let Boss Cat triage and start work.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress |
| **Owner** | Codex |
| **Reviewer** | TBD |

## Related Spec

[SPEC-109: Phase-Scoped Work Tool Surface](../specs/SPEC-109-phase-scoped-work-tool-surface.md)

## Overview

Roll out the Work tool surface in small slices. The first slice should prove
that strong Cats can capture Work Items from Chat or Telegram through a
supervised tool boundary without starting execution. Later slices add triage,
Boss Cat execution preparation, and external issue tracker bindings.

## Implementation Phases

### Phase 1: Registry and Contract Skeleton

- [x] Task 1.1: Add Work tool entries to `docs/tool-calls.md`.
- [x] Task 1.2: Define TypeScript contract types for phase-scoped Work tools.
- [x] Task 1.3: Add supervised tool manifests for read-only proposal and
      local-state capture tools.
- [x] Task 1.4: Add schema validation helpers and error code constants.
- [x] Task 1.5: Add tests proving tools are filtered by phase, policy, and
      capability profile.

**Deliverables**: Registered tool names, manifests, validation scaffolding, and
policy-surface tests. No runtime model is using the tools yet.

### Phase 2: Intake Capture Delegate

- [x] Task 2.1: Implement a product-owned `work.item.propose_split` delegate
      that returns structured candidate Work Items without writing Core.
- [x] Task 2.2: Implement `work.item.capture` through the supervised boundary.
- [x] Task 2.3: Persist captured Work Items with source provenance metadata and
      idempotency keys.
- [x] Task 2.4: Emit tool-boundary evidence and Work Activity records for
      accepted/rejected capture attempts.
- [x] Task 2.5: Add tests for single capture, multi-item split proposal,
      idempotent retry, weak/unknown rejection, and source metadata.

**Deliverables**: Strong Cats can request intake capture through a supervised
tool path; capture writes only Work Items, not Tasks/Runs.

### Phase 3: Chat and Telegram Wiring

- [ ] Task 3.1: Extend provider-agent observations so strong single-target Cats
      can receive intake tools when natural product-intent mode permits.
- [ ] Task 3.2: Feed accepted tool results into the Chat message stream as
      owner-visible acknowledgement sidecars.
- [ ] Task 3.3: Apply the same source-context builder to Telegram-originated
      messages.
- [ ] Task 3.4: Preserve existing slash-mode `/work` and `/code` behavior while
      routing new natural-language capture through the shared tool surface.
- [ ] Task 3.5: Add tests for web Chat and Telegram parity without writing
      live dev-state records.

**Deliverables**: Chat/Telegram natural-language todos can create visible Work
Items through the same contract.

### Phase 4: Triage Tools

- [ ] Task 4.1: Implement `work.project.lookup` as a bounded read-only tool.
- [ ] Task 4.2: Implement `work.project.create` with project-intent validation.
- [ ] Task 4.3: Implement `work.item.update` with planning-status bounds.
- [ ] Task 4.4: Implement `work.item.assign_project`.
- [ ] Task 4.5: Add Work Graph projection tests for captured and triaged items.

**Deliverables**: Boss Cat and approved strong Cats can organize captured Work
without starting execution.

### Phase 5: Boss Cat Execution Preparation

- [ ] Task 5.1: Add an execution-preparation phase resolver for owner requests
      such as "Boss Cat, start working through these".
- [ ] Task 5.2: Implement `work.item.prepare_execution` as a no-side-effect
      proposal tool.
- [ ] Task 5.3: Implement `work.task.create_from_work_item` behind existing
      supervision and approval gates.
- [ ] Task 5.4: Ensure Task creation links through `WorkItem.taskId` and keeps
      WorkItem source provenance intact.
- [ ] Task 5.5: Add tests proving capture and execution cannot occur in the
      same assistant turn without an owner-visible acknowledgement boundary.

**Deliverables**: Boss Cat can convert selected Work Items into supervised
execution plans and Tasks without bypassing policy gates.

### Phase 6: External Tracker Binding

- [ ] Task 6.1: Define the MVP external Work binding metadata shape.
- [ ] Task 6.2: Implement `work.external.link_issue` for manual URL/id binding.
- [ ] Task 6.3: Add read-side projection fields for linked external issues.
- [ ] Task 6.4: Add one adapter spike for GitHub Issues or Gitea import/export.
- [ ] Task 6.5: Defer bidirectional sync until conflict policy and credential
      handling have a dedicated follow-up ADR/SPEC.

**Deliverables**: Work Items can link to external issues without making
external trackers the Cats system of record.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/tool-calls.md` | Modify | Register Work tool contracts as they land |
| `docs/agent-control-surfaces.md` | Modify | Cross-link Work tool surface when implementation begins |
| `src/platform/supervision/*` | Modify/Create | Register and gate Work supervised tools |
| `src/products/work/shared/*` | Create/Modify | Tool contract types and metadata helpers |
| `src/products/work/api/*` | Modify/Create | Product-owned delegates for Work mutations |
| `src/products/chat/state/runtime-dispatch/*` | Modify | Expose intake tools to strong Cats in bounded observations |
| `src/platform/transports/telegram/*` | Modify | Preserve Telegram source context for intake tools |
| `tests/*` | Create/Modify | Contract, policy, Chat, Telegram, and Work projection coverage |

## Technical Decisions

- Work tools are Cats-owned supervised tools first; MCP exposure is optional
  and later.
- Capture tools write Work Items only. They do not write Tasks, Missions, Runs,
  or runtime sessions.
- External tracker support starts with local bindings, not bidirectional sync.
- MVP metadata uses existing open-ended Core metadata instead of adding new
  Core fields.
- Weak/unknown Cats fail closed for mutating Work tools.

## Testing Strategy

- **Unit Tests**: Tool schema validation, phase filtering, idempotency keys,
  status bounds, metadata normalization.
- **Integration Tests**: Supervised tool boundary applies/rejects capture and
  triage requests against an isolated `MemoryCoreStore`.
- **Chat Tests**: Strong Cat observations include only the allowed intake tools;
  weak/unknown Cats do not receive mutating tools.
- **Telegram Tests**: Telegram-originated messages preserve transport source
  metadata and produce the same Work Item shape as web Chat.
- **Work Projection Tests**: Captured and triaged Work Items appear in Work
  list/detail/graph projections without fake Project anchors.
- **Manual Testing**: Use existing state or isolated test stores only; do not
  write demo Work Items into the user's persisted dev state without explicit
  approval.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Models over-create Work Items from casual chat | High | Require phase, strong-Cat gate, source context, and confirmation where mode demands it |
| Capture silently starts execution | High | Keep intake tools unable to create Tasks/Runs; test same-turn separation |
| Tool surface becomes broad CRUD | High | Register phase-scoped tools and enforce status/field bounds |
| External tracker sync dominates scope | Medium | Start with link/import/export bindings; defer bidirectional sync |
| Duplicate captures on retry | Medium | Use source-message and logical-item idempotency keys |
| Telegram group messages mutate shared work unexpectedly | Medium | Keep stricter confirmation as an open policy question before broad rollout |

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-13 | Phase 1 contract manifests, validation helpers, and policy/capability filtering tests landed in `4196128e4`. |
| 2026-05-13 | Phase 2 Work intake delegate implemented with split proposal, supervised capture, idempotent Core writes, source metadata, and isolated tests. |
| 2026-05-13 | Plan created with ADR-105 and SPEC-109 as the governing docs. |

---

*Created: 2026-05-13*
*Author: Codex*

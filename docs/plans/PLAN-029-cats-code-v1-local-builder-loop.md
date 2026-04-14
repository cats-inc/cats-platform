# PLAN-029: Cats Code v1 Local Builder Loop

> Turn `Cats Code` from a read-oriented dashboard into a local-first builder
> loop that binds a room-owned workspace, runs a code task through the existing
> runtime bridge, shows live plan/progress plus previews, and lets the owner
> decide how to follow through.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress |
| **Owner** | Codex |
| **Assigned To** | Claude |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-041: Cats Code v1 Local Builder Loop](../specs/SPEC-041-cats-code-v1-local-builder-loop.md)
- [PLAN-021: Cross-Product Task Strategy Handoff and Runtime Bridge](./PLAN-021-cross-product-task-strategy-handoff-and-runtime-bridge.md)
- [ADR-038: Separate room-owned workspaces from session-owned sandboxes](../decisions/038-separate-room-owned-workspaces-from-session-owned-sandboxes.md)
- [ADR-059: Adopt a Unified Conversation-Turn-Lane Engine](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md)
- [ADR-060: Normalize Heterogeneous Runtime Delivery Into Product Events](../decisions/060-normalize-heterogeneous-runtime-delivery-into-product-events.md)
- [ADR-063: Separate Managed Work, Agent Missions, Execution Runs, and Transport Bindings](../decisions/063-agent-missions-and-transport-bindings.md)
- [SPEC-034: Room-Owned Workspace Bootstrap and Ownership Semantics](../specs/SPEC-034-room-owned-workspace-bootstrap-and-ownership.md)
- [SPEC-020: Embedded Preview Surfaces for Runtime Artifacts and Services](../specs/SPEC-020-embedded-preview-surfaces-for-runtime-artifacts-and-services.md)
- [SPEC-058: Interaction Core and Domain Materialization](../specs/SPEC-058-interaction-core-and-domain-materialization.md)
- [cats-runtime ADR-015: Own workspace substrate tools in cats-runtime](../../../cats-runtime/docs/decisions/015-own-workspace-substrate-tools-in-cats-runtime.md)
- [cats-runtime ADR-016: Own executable delivery primitives, not delivery policy](../../../cats-runtime/docs/decisions/016-own-executable-delivery-primitives-not-delivery-policy.md)

## Overview

`Cats Code` already has the hard prerequisites spread across product and
runtime:

- Code dashboard and task/artifact read models in `cats`
- shared Core task/artifact/control-plane records
- room/workspace-aware runtime execution primitives
- preview/browser substrate and delivery primitives in `cats-runtime`

The missing piece is the first product-owned loop that ties them together:

1. resolve the coding workspace
2. create or resume the shared Code task
3. bridge planning + workspace into runtime execution
4. show live plan/progress and preview/build outputs
5. let the owner inspect, revise, review, commit, push, or export with the
   right approval gates

This plan keeps Code local-first and workspace-first. It borrows lightweight
step tracking and re-plan value from OpenManus, but not its runtime-owned
planning or sandbox model.

## Implementation Phases

### Phase 1: Workspace Entry and Binding Contracts

- [x] Define the first product-owned Code workspace entry contract:
      - operator-selected local folder/repo
      - managed room workspace when no folder was chosen up front
- [x] Add read/write helpers so room-owned workspace authority stays distinct
      from any session-local cwd
- [x] Expose workspace summary and ownership state in Code task/detail views
- [x] Reuse existing room/workspace ownership semantics rather than inventing a
      Code-only workspace schema
- [x] Define empty/unbound workspace behavior so the first task can guide the
      user into a valid local-first starting point

**Deliverables**: explicit, product-owned workspace binding for the first Code
builder loop.

### Phase 2: Code Task Creation, Resume, and Runtime Bridge

- [x] Add Code-surface actions that create or target shared Core tasks with
      `productHint = 'code'`
- [ ] Define the first Code mission/run contract so one managed task can spawn
      many execution attempts without blurring task identity
- [x] Resolve default execution strategy to `reflexion` unless task planning
      overrides it
- [x] Bridge task planning, workspace context, and correlation metadata into
      `cats-runtime` through the existing runtime-neutral execution bridge
- [ ] Prefer resuming aligned task-bound sessions instead of always starting a
      fresh runtime session
- [x] Expose the focused task's runtime session state, provider target, and
      workspace summary in Code task detail

**Deliverables**: task-to-runtime execution from the Code surface with correct
workspace authority.

### Phase 3: Product-Owned Plan and Live Progress View

- [x] Define the first Code plan-step model with ordered statuses:
      - `not_started`
      - `in_progress`
      - `completed`
      - `blocked`
- [x] Source plan state from task metadata, child tasks, or structured outputs
      without creating a runtime-owned second task system
- [x] Add a dedicated plan/progress panel beside the existing live event tape
- [x] Add a bounded re-plan flow that updates the visible plan or creates child
      tasks without discarding the parent task
- [ ] Preserve live event tape as a first-class companion surface rather than
      hiding it behind the plan panel

**Deliverables**: a focused progress view that makes long-running coding tasks
legible.

### Phase 4: Preview, Build, and Artifact Loop

- [x] Surface linked build and preview artifacts for the focused Code task
- [x] Render the latest ready preview/build result in a dedicated preview area
      when normalized preview surfaces are available
- [x] Fall back cleanly to artifact detail, open-link, or download flows when
      inline rendering is unavailable
- [ ] Prioritize the latest ready output as the default visual focus when
      multiple results exist
- [ ] Keep preview and artifact changes tied to the same task context so the
      owner never loses orientation

**Deliverables**: one end-to-end builder loop where real output is visible from
inside Code.

### Phase 5: Repo Follow-Through and Approval Gates

- [x] Surface runtime-owned repo status and change inspection for the selected
      workspace
- [x] Add preview-first follow-through actions for:
      - inspect repo status
      - preview commit payload
      - preview push payload
      - export/publish local artifacts
- [x] Require explicit human approval for actions with external consequences,
      including remote push, external publish, or deployment
- [x] Keep local build, test, dependency installation, and dev-server actions
      outside separate approval gates
- [x] Preserve a no-auto-commit, no-auto-push default in the first slice

**Deliverables**: bounded owner follow-through above runtime delivery
primitives.

### Phase 6: Review Entry and Hardening

- [ ] Add an optional review request flow from Code task detail after a coding
      run completes or reaches a meaningful checkpoint
- [ ] Reuse shared Core parent/child tasks for review requests rather than a
      Code-only review model
- [ ] Preserve structured coder summaries/checkpoints as visible task-adjacent
      outputs
- [ ] Make mission/run history legible in Code without replacing the canonical
      Work task record
- [x] Add regression coverage for workspace binding, re-plan flows,
      preview/build rendering, and approval-gated follow-through
- [ ] Document deferred follow-ons such as automatic peer fan-out and broad
      template catalogs

**Deliverables**: stable first-slice Code builder loop with a clean path to
later review automation.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/code/api/**` | Modify/Create | Code task actions, workspace binding, preview/build, and repo follow-through routes |
| `src/products/code/renderer/components/**` | Modify/Create | Workspace entry, plan/progress panel, preview surface, repo actions, and review-entry UI |
| `src/products/code/renderer/hooks/**` | Modify/Create | Code-task execution, workspace binding, live progress, and approval-gated follow-through behaviors |
| `src/products/code/renderer/api/**` | Modify | Renderer-side Code API clients and normalization helpers |
| `src/products/code/shared/**` | Modify/Create | Product-owned Code helper contracts for workspace, plan steps, and follow-through state |
| `src/core/model/**` | Modify | Shared planning/task/artifact helpers consumed by Code |
| `src/core/api/**` | Modify | Additive task/artifact/read-model support required by the builder loop |
| `tests/**` | Modify/Create | Code workspace, runtime bridge, progress, preview, repo, and review-entry regression tests |
| `docs/specs/**` | Modify (follow-on) | Update linked Code specs if plan-step or follow-through scope changes during implementation |

## Technical Decisions

- Keep the first serious Code slice local-first and workspace-first.
- Treat room-owned workspace authority as product-owned state; runtime only
  consumes resolved workspace context for execution.
- Keep plan/progress product-owned on top of Core/task metadata rather than
  inventing a runtime-owned planning system.
- Treat the builder loop as a Code projection over shared interaction and
  materialization contracts plus normalized runtime delivery.
- Keep managed task identity, Code mission identity, and run identity
  distinct.
- Start with one primary coder session per focused task to simplify the first
  builder loop.
- Require approval only for externally consequential follow-through, not for
  local iteration.

## Testing Strategy

- **Unit Tests**:
  workspace-binding helpers, plan-step normalization, default-strategy
  resolution, approval-gated repo action helpers
- **Integration Tests**:
  Code task creation/resume -> runtime bridge payload formation, artifact/preview
  projection updates, repo follow-through preview payloads, review-task creation
- **Renderer/Behavior Tests**:
  workspace entry flow, plan/progress rendering, re-plan updates, preview/build
  focus behavior, approval prompts for push/publish actions
- **Manual Testing**:
  bind a local repo, run a Code task, observe plan/progress, inspect preview or
  build output, then choose revise/review/commit-preview/push-preview from the
  same Code surface

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Code builder loop duplicates a second task system | High | Keep plan/progress additive and derived from Core/task metadata or child-task structure |
| Workspace authority and session cwd get conflated | High | Preserve the room-owned workspace contract and surface it explicitly in Code detail |
| Preview/build UX depends on runtime APIs that are not yet normalized enough | Medium | Use artifact/open-link fallback paths and keep runtime contract gaps additive |
| External actions become too easy to trigger accidentally | High | Gate push/publish/deploy actions behind explicit approval while keeping local iteration fast |

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-29 | Plan created to deliver the first local-first `Cats Code` builder loop above shared Core tasks and runtime workspace/preview primitives |
| 2026-03-29 | Claude assigned. Branch `claude/spec-041-code-builder-loop` created. Starting implementation Phase 1→7. Shared file changes: `src/app/server/dependencies.ts` (wire runtimeClient), `src/products/code/api/index.ts` (expand deps + routes). |
| 2026-03-29 | Phase 1–5 (backend): complete. 12 new API routes, 4 state modules, 27 tests. |
| 2026-03-29 | Phase 6 (renderer): `CodeBuilderView` wired at `/code/build` route with sidebar "Build" entry. PlanPanel, BuildPreviewPanel, DeliveryPanel mounted inside builder. Full workspace → task → execute → plan/delivery loop reachable from UI. CSS added in `styles/code-builder.css`. |
| 2026-03-29 | Phase 7 (tests): current platform is green after later regressions were fixed separately. Server and web builds remain clean. |
| 2026-03-29 | Follow-up hardening slice: preview rendering now resolves through shared Core preview-surface policy instead of treating artifact paths as raw iframe URLs. `/code/artifacts/:artifactId` now exists as the clean fallback surface, and builder-local CSS now extends existing operator chrome instead of redefining pseudo-shared operator classes. |
| 2026-03-29 | Remaining P1 items deferred: stuck/re-plan cues, structured summaries, review request flow. Artifact list is currently refreshed by task-detail polling; live SSE preview/artifact mapping remains deferred. |
| 2026-03-29 | Codex: Added a first builder-surface resume entry so `/code/build` can reopen draft/blocked/failed tasks instead of only minting new ones. Continued execution now reuses the resolved task id rather than silently creating duplicate tasks after a failed start. Session-level aligned resume remains deferred. |
| 2026-03-30 | Codex: Bound `/code/build` to the shared workspace-resolution contract instead of treating workspace as a raw string. Builder now resolves explicit folders or selected-chat repo / managed-room fallbacks, writes the resulting workspace summary into task metadata, and surfaces ownership state in Code task detail and builder UI. |
| 2026-03-30 | Codex: Added a dedicated execution summary panel in `/code/build` so the focused task id, task status, runtime session state, provider/model target, and effective strategy stay visible beside the plan/output loop. |
| 2026-03-30 | Codex: Moved runtime-preview and artifact-fallback target resolution into `src/core/previewSurfaces.ts` so Code builder polling and artifact detail now consume the same preview-selection contract instead of keeping preview parsing logic inside `CodeBuilderView`. |

---

*Created: 2026-03-29*
*Author: Codex*

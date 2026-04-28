# PLAN-064: New Code MVP Task, Run, and Artifact Materialization

> Deliver the first narrow `+New code` slice by making the entry preset
> materialize one primary coding conversation, one primary code task, task-bound
> execution runs, and linked artifacts with clear Code-vs-Work ownership rules.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Build/Relay sidebar dependencies retired) |
| **Owner** | Codex |
| **Reviewer** | middl |

## Related Spec / Dependencies

- [SPEC-043: Cats Code MVP Multi-Agent Local-App Workflow](../specs/SPEC-043-cats-code-mvp-multi-agent-local-app-workflow.md)
- [SPEC-041: Cats Code v1 Local Builder Loop](../specs/SPEC-041-cats-code-v1-local-builder-loop.md) (stopped; historical context only)
- [SPEC-061: Concurrent vs Parallel Semantics and Code Entry Presets](../specs/SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [SPEC-058: Interaction Core and Domain Materialization](../specs/SPEC-058-interaction-core-and-domain-materialization.md)
- [SPEC-091: Cats Code Workspace and Artifact Sidebar](../specs/SPEC-091-cats-code-workspace-and-artifact-sidebar.md)
- [ADR-063: Separate Managed Work, Agent Missions, Execution Runs, and Transport Bindings](../decisions/063-agent-missions-and-transport-bindings.md)
- [PLAN-029: Cats Code v1 Local Builder Loop](./PLAN-029-cats-code-v1-local-builder-loop.md) (stopped; do not complete `/code/build`)
- [PLAN-032: Cats Code MVP Fan-Out, Relay, and Convergence](./PLAN-032-cats-code-mvp-fan-out-relay-and-convergence.md) (stopped; do not complete `/code/relay`)

## Current Direction Notice

`PLAN-064` remains active only for `+New code` task/run/artifact
materialization. It must not be used to finish or restore standalone sidebar
`Build` or `Relay` surfaces. The active Code sidebar may add `Workspaces` and
`Artifacts`; those are execution-context and evidence indexes over Code
entries, not restored Build / Relay workflow surfaces. Any useful run,
artifact, preview, or collaboration semantics from the retired plans must be
folded into Code entry presets, task detail, workspace detail, or artifact
detail.

## Overview

The recent spec pass locked the `+New code` MVP vocabulary:

- one primary `Conversation` with `kind = 'code_thread'`
- one primary code `Task` as the durable objective
- zero or more `Run`s as concrete execution attempts
- zero or more `Artifact`s as durable outputs

What is still missing is an implementation plan that turns those terms into one
coherent product slice.

This plan deliberately stays narrower than the full `Cats Code` MVP. It does
not attempt to land multi-agent peer review, full Work-board integration, or a
top-level run-management product. It focuses only on the minimum end-to-end
contract that should become true when the user chooses `+New code`.

The implementation thesis is:

1. `+New code` should immediately create a durable Code anchor, not just a
   transient draft conversation
2. the durable anchor should be `Conversation + primary code Task`
3. `Project` / `WorkItem` should not be required at creation time; Work
   promotion remains explicit follow-on state
4. `Run` should appear only when a concrete execution attempt starts
5. `Artifact` should remain traceable to the task and, when available, the
   producing run
6. Code-origin work should remain Code-owned in this MVP slice; Work promotion
   stays deferred

## Slice Boundary

### In scope for PLAN-064

- `+New code` entry materialization contract
- primary `code_thread` conversation creation
- primary code-task seeding
- no required `Project` / `WorkItem` creation for Code-owned entries
- first run creation and repeat-run semantics
- direct `Task -> Run` linkage for the MVP, without a required Mission layer
- task/run/artifact linkage and Code-only projection rules
- Code recents, workspace, artifact, task detail, and run-history presentation
  for this slice
- Code-product-only visibility for the first `code_thread` entry/resume path

### Explicitly deferred after PLAN-064

- `+Team code` and `+Peer code` topology-specific materialization
- a first-class Mission layer between `Task` and `Run` for `+New code`
- Work promotion, `WorkItem` linkage, and default Work-product projection for
  Code-origin tasks
- Chat-product recents or other cross-product entry points for
  `code_thread` conversations
- multi-agent roster, relay, and convergence work beyond existing `PLAN-032`
- full Boss Cat continuation rules across hidden Code-owned tasks
- duplicate-create collapse or idempotent `+New code` create behavior
- top-level run dashboard or standalone run product surface
- rich Work-board lifecycle for Code-origin tasks once promotion is introduced

## Implementation Phases

### Phase 1: Freeze the `+New code` Materialization Contract

- [ ] Define the create-time product contract for `+New code` so one entry
      action always yields:
      - one `Conversation(kind = 'code_thread')`
      - one primary code `Task`
      - no `Run` until the execution dispatcher / runtime bridge admits an
        executable attempt
- [ ] Define the minimum metadata written at creation time, including at least:
      - product hint / origin surface
      - linked conversation id
      - workspace hint when already known
      - initial Code-owned visibility state
- [ ] Make Project / WorkItem absence explicit in the create contract so
      Code-owned entries do not accidentally become Work entries before a
      deliberate promotion / linking step
- [ ] Make the no-`job` rule explicit in create-boundary helpers and contracts
      so internal APIs do not reintroduce mixed terminology
- [ ] Reuse shared Core records and existing Code task helpers instead of
      creating a Code-only persistence shape for this slice

**Deliverables**: one frozen `+New code` create contract with stable task and
conversation anchors.

### Phase 2: Land Task-Bound Run Semantics

- [ ] Define exactly when the first `Run` is created:
      - first explicit execute/build/continue attempt from a Code entry or
        task-detail surface
      - not at thread creation time
- [ ] Define run-boundary rules for this slice:
      - retry creates a new run
      - explicit restart creates a new run
      - takeover or handoff creates a new run when recorded as a new attempt
      - reconnect/resume inside the same active attempt reuses the same run
- [ ] Make the MVP execution shape explicit:
      - `+New code` uses direct `Task -> Run` linkage
      - Mission-backed execution remains follow-on work for later slices
- [ ] Ensure run records remain linked to the durable task and relevant runtime
      session/execution identifiers for observability
- [ ] Expose run history as task-adjacent observability rather than a
      replacement for task identity
- [ ] Fold any still-useful builder-loop execution helper semantics into
      `+New code` and task detail; do not extend `/code/build`

**Deliverables**: one coherent meaning of `Run` as a task-bound execution
attempt.

### Phase 3: Project Artifacts and Evidence Projection

- [ ] Define the first artifact-linking rule set for `+New code`:
      - artifacts belong to the task
      - artifacts may also reference the producing run
      - artifact lists must stay readable even when many runs exist
- [ ] Ensure runtime outputs such as preview/build/test/report artifacts can be
      projected back into the same task detail flow
- [ ] Keep artifact provenance visible enough that the operator can tell which
      run produced the output without opening raw records
- [ ] Reuse existing preview/artifact selection helpers rather than inventing a
      second Code-only evidence contract
- [ ] Define how structured outputs such as summaries, checkpoints, or review
      notes should attach to the same task/run lineage

**Deliverables**: one evidence path where Code outputs remain attached to the
same durable task and execution history.

### Phase 3A: Code Workspace Navigation

- [ ] Define the first workspace-linking rule set for Code:
      - workspace context may come from Code task metadata, `Conversation.repoPath`,
        execution profile `cwd` / worktree policy, or run/runtime metadata
      - workspace context does not create or imply a Work `Project`
      - entries with no resolved workspace remain visible through Code Recents
        and may group under `No workspace`
- [ ] Add a Code-owned `Workspaces` sidebar projection that groups code work by
      execution context rather than by Work Planning hierarchy
- [ ] Ensure workspace detail links back to relevant conversations, tasks,
      latest run / run history, and artifacts
- [ ] Keep workspace routing compatible with future repo/worktree filters
      without blocking the first mockup or MVP on a full repository model

**Deliverables**: one Code workspace index that helps users resume local
execution context without forcing Work planning records.

### Phase 4: Code UI Entry and Projection

- [ ] Make `+New code` create flow visible in the Code UI with a stable landing
      path into the created `code_thread`
- [ ] Update Code recents so they are conversation-led while still surfacing
      enough task state to resume work confidently
- [ ] Keep `code_thread` visibility scoped to the Code product in this slice
      instead of also projecting the same entry into Chat recents or other
      cross-product launch surfaces
- [ ] Update Code task detail so it becomes the primary place to inspect:
      - primary task state
      - latest run
      - run history
      - linked artifacts
      - workspace summary when known
- [ ] Keep run history inside task detail for MVP instead of blocking on a
      top-level run page
- [ ] Add `Workspaces` and `Artifacts` as Code sidebar entries while keeping
      Projects / Work Items / Tasks / Runs / Missions in the Work sidebar
- [ ] Ensure artifact views and task-detail execution surfaces deep-link back
      to the same task and conversation context

**Deliverables**: a usable `+New code` UI path where entry, resume, execution,
and evidence all point back to one task/conversation anchor.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/code/shared/channelEntry.ts` | Modify | Lock `+New code` create semantics and entry metadata |
| `src/products/code/api/contracts.ts` | Modify | Encode primary task, run, and artifact payload shapes |
| `src/products/code/api/taskRoutes.ts` | Modify | Add or tighten create/resume routes for primary code task and run history |
| `src/products/code/api/runtimeBridgeRoutes.ts` | Modify | Ensure first-run creation timing and execution-boundary semantics stay consistent |
| `src/products/code/api/projection.ts` | Modify | Add Code recents/task-detail projections for task/run/artifact lineage |
| `src/products/code/state/taskExecution.ts` | Modify | Align run creation, retry, restart, and takeover semantics with the new contract |
| `src/products/code/shared/taskDetailSummary.ts` | Modify | Surface primary-task, latest-run, and artifact linkage for renderer use |
| `src/products/code/shared/workspaceSummary.ts` | Modify | Keep workspace summary semantics aligned with the Code Workspaces sidebar |
| `src/products/code/renderer/components/NewChatDraft.tsx` | Modify | Route `+New code` entry into the new create flow |
| `src/products/code/renderer/components/ChatView.tsx` | Modify | Keep conversation-led recents and thread resume behavior aligned |
| `src/products/code/renderer/components/WorkspaceListView.tsx` | Create | Show Code workspace groups without turning them into Work Projects |
| `src/products/code/renderer/components/WorkspaceDetailView.tsx` | Create | Show workspace-linked conversations, tasks, latest runs, and artifacts |
| `src/products/code/renderer/components/CodeBuilderView.tsx` | Do not extend | Retired Build-surface code may be removed or mined only to migrate useful semantics into active entry/task surfaces |
| `src/products/code/renderer/components/RunInspector.tsx` | Modify | Render task-adjacent run history without elevating runs above tasks |
| `src/products/code/renderer/components/ArtifactDetailView.tsx` | Modify | Show artifact provenance back to task and producing run |
| `src/products/code/renderer/api/codeTask.ts` | Modify | Normalize primary task, run history, and artifact-lineage data for the UI |
| `src/core/taskRecords.ts` | Modify | Support task linkage and seed-time metadata needed by `+New code` |
| `src/core/executionRecordLists.ts` | Modify | Provide additive run-history queries needed by Code detail |
| `tests/code-new-chat-draft-entry-copy.test.tsx` | Modify | Verify `+New code` entry copy and Code-only entry visibility remain correct |
| `tests/code-task-execution.test.js` | Modify | Cover first-run creation timing plus retry/restart boundaries |
| `tests/code-builder-resume.test.js` | Retire/replace | Replace Build-route resume coverage with active entry/task-detail run semantics |
| `tests/code-routing.test.tsx` | Modify | Ensure Code entry, builder, and artifact-detail surfaces stay reachable from Code |
| `tests/execution-record-lists.test.js` | Modify | Validate run-history queries for one task with many runs |
| `tests/code-task-detail-projection.test.js` | Create | Cover latest-run and artifact-lineage projection in Code task detail |

## Technical Decisions

- Treat `Conversation + primary code Task` as the durable `+New code` anchor.
- Do not create a `Project` or `WorkItem` for `+New code` unless an explicit
  Work-promotion or linking action asks for it.
- Create `Run` at execution-dispatch admission, not at entry time. For Code,
  first send may immediately admit the first executable attempt and therefore
  create the first Run in the same submit flow.
- For this MVP, `+New code` uses direct `Task -> Run` linkage and does not
  require a first-class Mission record.
- Keep one task identity across retries, restarts, takeovers, and repair loops
  unless the product is explicitly creating a different durable objective.
- Keep explicit repeated `+New code` actions simple: each create action may open
  a new conversation/task pair, matching current product behavior. Create-time
  deduplication or idempotency is deferred.
- Keep Code recents conversation-led while making task and latest-run state easy
  to resume from the same surface.
- Add Code `Workspaces` as a first-class sidebar index over repo/folder/worktree
  or managed-room execution contexts, but do not model those workspaces as Work
  `Project` or `WorkItem` records.
- Add Code `Artifacts` as a first-class sidebar index over durable
  `CoreArtifactRecord` outputs, but keep creation tied to attachments, imports,
  execution outputs, or explicit document/report creation rather than sidebar
  entry opening.
- Keep `code_thread` visibility scoped to Code product entry points in this
  slice; Chat-product projection is deferred.
- Let Work Graph project Code tasks with `productBinding = code` and place
  projectless Code tasks under `No project`; do not create fallback
  `Project` / `WorkItem` records just to house them.
- If a Code-origin task is later linked through `WorkItem.taskId`, Work Graph
  projects the current task binding as `work`. The lineage signals that put
  the task in `code` before promotion still persist on the underlying records
  — explicit `planning.productHint` / `planning.transfer.suggestedProduct`
  when origin came from a planning hint, the `code_thread` `Conversation.kind`
  when origin came from conversation fallback, and any `build` / `preview`
  `Artifact` attached to the task when origin came from artifact precedence —
  none of which is rewritten by promotion. The projection exposes only the
  *current* binding via `WorkGraphObjectSummary.productBinding` and does not
  carry a separate `productLineage` / `originBinding` field in this slice.
  Surfaces that need to display "promoted from Code" must read those
  underlying signals directly from `CoreTaskRecord` and its related `Artifact`
  / `Conversation` records — `planning` metadata alone is not sufficient
  for artifact-driven or conversation-fallback Code tasks.
- Defer Work promotion from this slice; Code-origin tasks stay Code-owned by
  default.
- Preserve `job` only as an external-system boundary term; do not reintroduce
  it as a Core-owned noun.

## Testing Strategy

- **Unit Tests**:
  `tests/code-task-execution.test.js`,
  `tests/execution-record-lists.test.js`,
  `tests/code-task-detail-projection.test.js`
- **Integration Tests**:
  create conversation -> seed primary task -> execute -> create first run ->
  retry -> attach artifacts -> inspect task detail
- **Renderer/Behavior Tests**:
  `tests/code-new-chat-draft-entry-copy.test.tsx`,
  `tests/code-builder-resume.test.js`,
  `tests/code-routing.test.tsx`
- **Manual Testing**:
  create a fresh `+New code` thread, confirm the primary task exists before
  execution, start one execute/build/continue attempt from the active Code
  entry or task-detail surface, verify the first run appears, retry once,
  inspect artifacts from Code detail, and confirm the thread stays resumable
  from Code recents only

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| The slice drifts back into Work- or Chat-level integration before `+New code` basics land | High | Keep Work promotion and Chat projection explicitly deferred in this plan |
| `Run` semantics drift again between Code builder, runtime bridge, and docs | High | Centralize run-boundary rules in shared task-execution helpers and keep terminology tests/docs aligned |
| Artifact UI loses provenance when several runs exist for one task | Medium | Keep task-first artifact lists with explicit producing-run hints in detail views |
| MVP readers assume Mission is still required between `Task` and `Run` | Medium | State the direct `Task -> Run` rule explicitly and defer Mission-backed execution to later slices |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-19 | Plan created to implement the first narrow `+New code` materialization slice around `Conversation + primary code Task + Run* + Artifact*` with Code-owned-by-default behavior |
| 2026-04-19 | Follow-up trim: deferred Work promotion and Chat projection, removed create-time idempotency from MVP scope, and made the MVP `Task -> Run` rule explicit |
| 2026-04-28 | Amended scope after Build/Relay sidebar retirement: `PLAN-064` remains active for `+New code`, but it no longer depends on completing `/code/build` or `/code/relay`. |
| 2026-04-28 | Clarified entry materialization: `+New code` creates `Conversation + primary Task`, does not require `Project` / `WorkItem`, and creates the first `Run` only when an execution attempt is admitted. |
| 2026-04-28 | Clarified orphan-task home: Code tasks without Project / WorkItem anchors project into Work Graph as `productBinding = code` under `No project`, rather than receiving fallback Work records. |
| 2026-04-28 | Follow-up amendment: first Run starts at dispatcher/runtime admission; a first user send can create it immediately when Code auto-dispatches. Work linkage through `WorkItem.taskId` flips current Work Graph binding to `work` without erasing Code origin lineage. |
| 2026-04-28 | Lineage / projection contract correction: clarified that "Code origin remains" lives on raw `CoreTaskRecord.metadata.planning`, NOT as a separate projection field. `WorkGraphObjectSummary` exposes only the *current* `productBinding`. Adding a `productLineage` / `originBinding` projection field is a deliberate follow-on, not implied by this slice. |
| 2026-04-28 | Added `SPEC-091` alignment: Code sidebar may add `Workspaces` and `Artifacts` as execution-context / evidence indexes while Work remains the sidebar home for Projects, Work Items, Tasks, Runs, and Missions. |

---

*Created: 2026-04-19*
*Author: Codex*

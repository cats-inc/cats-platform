# ADR-081: Canonicalize the Core Record Taxonomy as Interaction / Planning / Execution

> Contributors and cross-agent reviewers have been listing
> Core record families inconsistently — sometimes enumerating
> every concept in `terminology.md` ("goals, requirements,
> backlog items, issues, schedules, triggers, references...")
> as if each were an independent record, sometimes collapsing
> all orchestration into a flat `Project → Task → Run` chain.
> Neither matches what `src/core/types.ts` actually models.
> Pin down a single canonical taxonomy of three layers with
> finite entity lists, and spell out which surface-level
> concepts collapse into which entity.

## Status

Proposed

## Context

Two recent sources give different answers to "what are the
durable record families in Cats Core?":

1. `docs/terminology.md:129` defines **Managed Work** as
   "the operator-facing family of durable planning records
   such as goals, projects, requirements, backlog items,
   issues, tasks, and approvals" — plus `Schedule`, `Trigger`,
   `Reference`, `Mission`, `Code Task`, `Work Task` as adjacent
   terms with their own rows.
2. `src/core/types.ts` only declares record interfaces for
   `Project`, `WorkItem` (a.k.a. `ManagedWorkRecord`), `Task`,
   `Approval`, `Mission`, `Run`, `Trace`, `Checkpoint`, `Outcome`
   (as `CoreOrchestrationOutcomeRecord`), `Artifact`, and
   `Activity`. No `Goal`, `Requirement`, `BacklogItem`, `Issue`,
   `Schedule`, `Trigger`, `Reference`, or `ExecutionResult`
   record exists.

The aspirational list served its purpose while the Core schema
was still open, but it now actively misleads:

- new contributors ask which table to query for a "backlog
  item" and get confused when the answer is "it is a
  `WorkItem` row with a `kind` in metadata"
- cross-agent discussions fork into parallel vocabularies
  because nobody agrees on the reference shape
- draft and orchestrator work (per ADR-077) presumes a stable
  set of anchors; treating every concept as a potentially
  independent entity makes the draft schema's `taskId` /
  `workItemId` / `projectId` reference fields look incomplete

Around Execution the confusion is symmetric:
`Checkpoint`, `Outcome`, `Trace`, `Activity`, `Artifact` look
like peers of `Run` in the terminology doc, but the code treats
them as a **cross-layer materialization / evidence tier** with
**record-specific nullable anchors**. `Trace`, `Checkpoint`,
and `Outcome` carry only `conversationId` / `runId` / `taskId`
and never anchor directly at the Planning layer; `Artifact`
and `Activity` additionally carry `projectId` / `workItemId`
and routinely attach to a project, work item, or conversation
with no `Task` or `Run`. None of the five ever own a `Run`.

The right fix is not to rename code or add new tables. It is
to freeze a canonical **three-tier** taxonomy with finite entity
lists, and publish an explicit mapping from legacy / aspirational
terms onto those entities. ADR-063 already separated managed
work, missions, runs, and transport bindings; this ADR finishes
the job by making the taxonomy exhaustive and deduplicated.

## Decision

### 1. Three canonical layers over the declared canonical record set

The Core data model declares its canonical record set in
`CORE_CANONICAL_RECORD_FAMILIES` (`src/core/types.ts:21-34`).
This ADR groups those families — plus a few closely related
records such as `CoreProjectRecord` / `CoreWorkItemRecord` /
`CoreTaskRecord` that predate that list — into **three
functional layers**. The layers are an organizing frame for
docs and reviews, not a replacement for the declared record
set. Every canonical record family appears in exactly one
layer below; no canonical family is dropped.

**Layer 1 — Interaction Core** (who interacts, through which
channel, and inside what durable interaction shape):

- `Agent` / `CoreActorRecord` — reusable identity (Cat,
  orchestrator, worker, bot, resource)
- `Participant` — one `Agent`'s membership inside one
  `Conversation`
- `Container`
- `Conversation`
- `Turn`
- `Lane`
- `Segment`
- `Session` (ephemeral runtime attachment; included because it
  is part of the interaction shape even though not durable)
- `TransportBinding` — record for one external transport
  thread and its optional links into Cats. `conversationId`,
  `participantId`, and `agentId` are all nullable; a binding
  may resolve to a `Conversation` or stay unresolved. Lives
  here because, when it does resolve, it is what selects the
  `Conversation` a transport ingress lands in.

**Layer 2 — Managed Work / Planning** (what the operator wants
done):

- `Project`
- `WorkItem` (a.k.a. `ManagedWorkRecord`)

**Layer 3 — Execution / Orchestration** (how work gets executed
and what it leaves behind):

- `Task`
- `Run`
- `Mission` — a distinct Execution entity (not a `Task`
  variant). `managedWorkId`, `conversationId`, `assignedAgentId`,
  `sourceTurnId`, and `sourceLaneId` are all nullable; a mission
  may anchor to a `WorkItem`, remain fully internal, or tie back
  to a specific turn / lane, depending on how it was spawned.
  See ADR-063.

`Approval` is intentionally absent from the Planning entity
list and is documented as a cross-cutting gate in §3 below.

Every other noun currently used in docs or discussions either
resolves to one of these via the deduplication rules below, or
is a cross-cutting concern documented separately.

### 2. Deduplication rules (legacy / aspirational terms → canonical entity)

These mappings are binding for new docs, ADRs, SPECs, plans,
and code comments:

- `Goal`, `Requirement`, `Backlog Item`, `Issue`, `Defect`,
  `Story`, `Epic` → **`WorkItem` with a `kind` discriminator**.
  None of these gets its own record.
- `Work Task`, `Code Task` → **`Task`**. There is no separate
  record type. Whether a given `Task` surfaces in the Code
  product is resolved at projection time by `isCodeTask`
  (`src/products/code/api/projection.ts`) in priority order:
  (1) the task has a `build` or `preview` `Artifact` → Code;
  (2) otherwise `resolveTaskExecutionProduct`
  (`src/shared/taskExecutionBridge.ts`) consults the task's
  planning handoff — `planning.productHint === 'code'` or
  `planning.transfer.suggestedProduct === 'code'` is
  authoritative; (3) the linked `Conversation.kind ===
  'code_thread'` is only a legacy / no-planning fallback. Do
  not document Code Task as "a Task with a `code_thread`
  Conversation" — that inverts the actual priority.
- `Mission`, `Assignment` → **`Mission`** is its own
  Execution-layer record (`MissionRecord`), distinct from
  `Task`. All of its anchoring fields are nullable:
  `managedWorkId` (optional `WorkItem` anchor),
  `assignedAgentId` (optional agent binding),
  `sourceTurnId` / `sourceLaneId` / `conversationId` (optional
  interaction provenance). A mission may therefore remain fully
  internal and never surface as a `WorkItem`, per ADR-063. Do
  not describe `Mission` as a subtype of `Task`, and do not
  document it as requiring a `WorkItem` anchor. `Assignment`
  remains a UI synonym for `Mission` and should not appear in
  shared schemas.
- `Execution Result` → **`Outcome`** (`CoreOrchestrationOutcomeRecord`).
- `Activity` → **an independent operator-feed record**
  (`CoreActivityRecord`), not a projection over `Trace`. It has
  its own `/api/core/activities` GET/POST surface and its own
  `kind` enum (`note`, `status_change`, `approval_requested`,
  `approval_decided`, `operator_action`, `artifact_recorded`,
  `checkpoint_recorded`, `work_item_updated`). Readers must
  consume `CoreActivityRecord` directly; they must not attempt
  to reconstruct the activity feed from `Trace` records alone,
  because operator-authored activities are written straight to
  the activities table and never flow through `Trace`.
- `Job` → avoid. Use `Mission` (delegation) or `Run` (execution
  attempt) per ADR-063.

### 3. Rules vs. entities vs. materialization records

Three structural distinctions that must survive in every future
doc:

- **Rules / policies** — `Schedule`, `Trigger`, `Scheduler policy`,
  `Sharing policy`, `Dispatch policy`, `Convergence policy`,
  `Delivery policy`, `Budget policy`, `Execution profile`. These
  configure when and how execution happens; they are not
  durable records at the same level as `Task` or `Run`. They may
  be persisted as configuration rows, but they are never listed
  alongside `Task` / `Run` as peer entities.
- **Pointers / references** — `Reference` is a structured
  pointer type (a field shape), not a record family of its own.
  `TransportBindingRecord` and `BotBindingRecord` are real
  records; `TransportBindingRecord` sits inside Interaction Core
  (§1) because, when its nullable `conversationId` resolves, it
  is what selects the Conversation a transport ingress lands in.
  `BotBindingRecord` is infra/integration glue between Cats and
  external bot identities, and is not listed in
  `CORE_CANONICAL_RECORD_FAMILIES`.
- **Cross-cutting approval gate** — `CoreApprovalRecord` is
  **not** an independent top-level record. It is an embedded
  value object on `CoreTaskRecord.approval` that captures the
  approval state for a single task. The independent record is
  `CoreApprovalBindingRecord`, persisted at
  `core.approvalBindings`, which binds an approval task onto
  any subject whose `subjectKind` is
  `project | work_item | task | run | artifact | conversation`
  (see `CoreApprovalBindingSubjectKind`). Approval therefore
  attaches to any layer but does not itself own a layer slot.
- **Cross-layer materialization / evidence tier** —
  `Artifact`, `Outcome`, `Checkpoint`, `Trace`, and `Activity`.
  Each is a canonical record that captures durable state around
  the graph, but the available anchor fields are
  **record-specific** — do not assume a uniform
  `projectId / workItemId / taskId / runId / conversationId`
  set across the tier:
  - `CoreTraceRecord` (`src/core/types.ts:595`): nullable
    `conversationId` / `runId` / `taskId` only. No direct
    Planning anchor.
  - `CoreCheckpointRecord` (`types.ts:610`): nullable
    `conversationId` / `runId` / `taskId` (+ `sourceTraceId`).
    No direct Planning anchor.
  - `CoreOrchestrationOutcomeRecord` (`types.ts:631`): nullable
    `conversationId` / `runId` / `taskId`. No direct Planning
    anchor.
  - `CoreArtifactRecord` (`types.ts:655`): nullable `projectId`
    / `workItemId` / `conversationId` / `taskId` / `runId`.
  - `CoreActivityRecord` (`types.ts:684`): nullable `projectId`
    / `workItemId` / `conversationId` / `taskId` / `runId` (+
    `artifactId`, `actorId`).

  So only `Artifact` and `Activity` may attach directly at the
  Planning layer. `Trace`, `Checkpoint`, and `Outcome` reach
  Planning only indirectly — via the `Task` or `Conversation`
  they anchor on — and in practice behave as
  Execution-anchored evidence. The tier as a whole still does
  not live strictly under Execution: operator-authored
  `Activity` and most `Artifact` kinds (`document`, `report`,
  `attachment`, `transcript_export`, `dataset`) routinely
  attach to a project, work item, or conversation with no
  `Task` or `Run` at all. None of the five ever own a `Run`.
  `Activity` is still **not** a projection over `Trace` — see
  §2.

### 4. Cross-layer link contract (frozen)

The taxonomy only works if cross-layer links stay stable. These
foreign keys are part of the canonical model and must not be
quietly widened:

- `Container.parentContainerId` → `Container` (self-nest)
- `Conversation.containerId` → `Container`
- `Project.primaryConversationId` → `Conversation`
- `WorkItem.projectId` → `Project`
- `WorkItem.parentWorkItemId` → `WorkItem` (self-nest)
- `WorkItem.conversationId` → `Conversation`
- `WorkItem.taskId` → `Task` (the bridge from Planning to
  Execution)
- `Task.parentTaskId` → `Task` (self-nest)
- `Task.conversationId` → `Conversation`
- `Mission.managedWorkId` → `WorkItem`
- `Mission.conversationId` → `Conversation`
- `Run.taskId` → `Task`
- `Run.parentRunId` → `Run` (self-nest)
- `Run.conversationId` → `Conversation`
- `Approval` is cross-cutting: an `ApprovalBinding` subject may
  be `project | work_item | task | run | artifact | conversation`
  (see `CoreApprovalBindingSubjectKind`).

Any new record that needs to participate in this graph must
declare its anchor into the three layers explicitly, the same
way `Artifact` already carries `projectId` / `workItemId` /
`conversationId` / `taskId` / `runId`.

### 5. Documentation and cross-reference obligations

- `docs/terminology.md` is updated in the same change set to
  mark legacy terms as aliases and to name each canonical layer
  explicitly.
- Future ADRs, SPECs, and PLANs must use layer names
  ("Interaction", "Planning", "Execution") when grouping record
  families, not ad-hoc labels like "work orchestration" or
  "run context".
- When a doc needs to talk about `Goal` / `Requirement` /
  `Backlog Item` / `Issue`, it must explicitly note "(a
  `WorkItem` kind)" so readers do not expect a separate table.

### 6. Scope — what this ADR does not do

- It does **not** add or rename any record type in
  `src/core/types.ts`.
- It does **not** introduce a `kind` enum on `WorkItem` yet; the
  metadata channel is sufficient until a product actually needs
  to render kind-specific UI.
- It does **not** change the frozen shared contracts
  (`src/core/types.ts`, `src/platform/orchestration/contracts.ts`,
  `src/shared/roomRouting.ts`). This is taxonomy clarification
  only.
- It does **not** supersede ADR-063 (mission/run separation),
  ADR-039 (Core task metadata as plan exchange), or ADR-077
  (per-branch draft state). It frames them inside one shared
  vocabulary.

## Consequences

### Positive

- a single canonical taxonomy to cite in reviews, ADRs, and
  onboarding docs
- aspirational terms (`Goal`, `Requirement`, `Backlog Item`,
  `Issue`, `Schedule`, `Trigger`, `Reference`, `Execution Result`)
  get explicit resolutions, so future ADRs do not have to
  re-litigate whether they are new entities
- the Planning-to-Execution bridge (`WorkItem.taskId`) is called
  out as a first-class contract rather than a field that happens
  to exist
- cross-agent discussions can quickly confirm "yes, that is a
  `Task`" / "no, that is a `WorkItem` kind" instead of inventing
  parallel vocabulary
- the three-layer framing leaves room for orchestrator composition
  work (ADR-077) to keep assuming stable anchors

### Negative

- the `terminology.md` "Managed Work" row has to stop reading
  like an open-ended list; doc consumers who memorized the old
  wording will need to update
- any future need for a true independent `Goal` or `Requirement`
  record now requires a follow-up ADR to amend this one rather
  than silently adding a table
- the Interaction Core layer grew to include `Agent`,
  `Participant`, and `TransportBinding` to match
  `CORE_CANONICAL_RECORD_FAMILIES`; contributors who were using
  a smaller "5 interaction records" mental model need to expand
  it
- the Planning layer now lists only `Project` and `WorkItem`
  as independent entities; `Approval` moved to the cross-cutting
  gate description in §3, and `Task` stays in Execution. Surface
  docs that previously grouped "Project / WorkItem / Task /
  Approval" under Planning need to be re-scoped.

### Neutral

- no schema change, no migration, no runtime behavior change
- ADR-063's separation of managed work / mission / run / transport
  binding remains in force; this ADR re-states it inside the
  three-layer frame
- does not change how product teams scope their work under the
  parallel-delivery rules (Chat / Work / Code trees remain
  product-owned)

## Alternatives Considered

### Alternative 1: Keep `terminology.md` as-is

- **Pros**: zero change; preserves aspirational naming for future
  expansion.
- **Cons**: the gap between doc and code keeps widening; every new
  contributor re-asks the same "is a `Goal` a table?" question;
  cross-agent reviews keep diverging.
- **Why rejected**: the cost of the ambiguity is now visible in
  actual reviews, and the doc is supposed to be the authoritative
  glossary.

### Alternative 2: Expand `src/core/types.ts` to match the terminology doc

- **Pros**: the aspirational terms would become real records;
  every noun resolves to a schema.
- **Cons**: introduces 4+ new tables (`Goal`, `Requirement`,
  `BacklogItem`, `Issue`, `Schedule`, `Trigger`, `ExecutionResult`,
  `Reference`) with no product surface that needs them yet;
  violates the "no speculative schema" posture this project has
  held since day one.
- **Why rejected**: we do not add durable entities ahead of a real
  consumer. Taxonomy clarity does not require new tables.

### Alternative 3: Collapse to two layers (Interaction + Work)

- **Pros**: simpler mental model; Planning and Execution merge
  into one "Work" layer.
- **Cons**: loses the Planning-to-Execution bridge distinction
  (`WorkItem.taskId`), which is exactly where most cross-agent
  confusion happens. Approval gating (`pending_approval` on
  Task vs. `planned` on WorkItem) depends on the two layers being
  separate.
- **Why rejected**: the two-layer framing erases precisely the
  distinction the product already relies on.

### Alternative 4: Flat `Project → Task → Run` hierarchy

- **Pros**: matches the most common informal mental model.
- **Cons**: there is no `Task.projectId` in the schema. The link
  goes `Project → WorkItem → (optional) Task → Run`. A flat
  hierarchy doc would claim a direct edge the code does not model,
  and would hide `WorkItem` entirely even though it is the main
  planning entity.
- **Why rejected**: doc would misrepresent the schema in the
  name of simplicity.

## References

- [ADR-007: Establish Cats Core v1 for Chat and Work](./007-establish-cats-core-v1-for-chat-and-work.md)
- [ADR-039: Use Core task metadata as cross-product plan exchange](./039-use-core-task-metadata-as-cross-product-plan-exchange.md)
- [ADR-059: Adopt a unified conversation-turn-lane engine](./059-adopt-a-unified-conversation-turn-lane-engine.md)
- [ADR-063: Separate managed work, agent missions, execution runs, and transport bindings](./063-agent-missions-and-transport-bindings.md)
- [ADR-077: Make parallel draft state per-branch-addressable for orchestrator composition](./077-make-parallel-draft-state-per-branch-addressable-for-orchestrator-composition.md)
- `cats-platform/src/core/types.ts` — canonical record declarations
- `cats-platform/src/core/types.ts:21` — `CORE_CANONICAL_RECORD_FAMILIES` (the authoritative record set this ADR groups into layers)
- `cats-platform/src/products/code/api/projection.ts` — `isCodeTask` routing (artifact kind + `resolveTaskExecutionProduct`)
- `cats-platform/src/shared/taskExecutionBridge.ts` — `resolveTaskExecutionProduct` priority (planning handoff authoritative, conversation kind is fallback)
- `cats-platform/docs/terminology.md` — updated in the same change set

---

*Proposed: 2026-04-22*
*Proposed by: Claude under user-directed investigation (三套心智模型 去重討論)*

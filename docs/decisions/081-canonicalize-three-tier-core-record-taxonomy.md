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

Within Execution the confusion is symmetric:
`Checkpoint`, `Outcome`, `Trace`, `Activity`, `Artifact` look
like peers of `Run` in the terminology doc, but the code treats
them as **by-products of a Run** — each record carries a nullable
`runId` / `taskId` / `conversationId` back-reference and is
produced by a Run, never owns one.

The right fix is not to rename code or add new tables. It is
to freeze a canonical **three-tier** taxonomy with finite entity
lists, and publish an explicit mapping from legacy / aspirational
terms onto those entities. ADR-063 already separated managed
work, missions, runs, and transport bindings; this ADR finishes
the job by making the taxonomy exhaustive and deduplicated.

## Decision

### 1. Three canonical layers, each with a finite entity list

The Core data model has exactly three layers. Each layer has a
fixed set of **independent durable entities** — anything not on
these lists is either a `kind` discriminator on an existing
entity, a by-product reference, or a policy/rule object.

**Layer 1 — Interaction Core** (durable interaction structure):

- `Container`
- `Conversation`
- `Turn`
- `Lane`
- `Segment`
- `Session` (ephemeral runtime attachment; included because it is
  part of the interaction shape even though not durable)

**Layer 2 — Managed Work / Planning** (what the operator wants
done):

- `Project`
- `WorkItem`
- `Approval`

**Layer 3 — Execution / Orchestration** (how work gets executed
and what it leaves behind):

- `Task`
- `Run`
- `Mission` (Task variant bound to an agent)

Every other noun currently used in docs or discussions either
resolves to one of these via the deduplication rules below, or
is a cross-cutting concern documented separately.

### 2. Deduplication rules (legacy / aspirational terms → canonical entity)

These mappings are binding for new docs, ADRs, SPECs, plans,
and code comments:

- `Goal`, `Requirement`, `Backlog Item`, `Issue`, `Defect`,
  `Story`, `Epic` → **`WorkItem` with a `kind` discriminator**.
  None of these gets its own record.
- `Work Task`, `Code Task` → **`Task`**. The `code_thread`
  distinction lives on the linked `Conversation.kind`, not on a
  separate record type.
- `Mission`, `Assignment` → **`Mission`** is a `Task` variant
  bound to an `assignedAgentId`. `Assignment` is a UI synonym
  and should not appear in shared schemas.
- `Execution Result` → **`Outcome`** (`CoreOrchestrationOutcomeRecord`).
- `Activity` → **a feed projection over `Trace`**, not a parallel
  entity. The `CoreActivityRecord` table exists but represents a
  derived surface, not a new top-level family.
- `Job` → avoid. Use `Mission` (delegation) or `Run` (execution
  attempt) per ADR-063.

### 3. Rules vs. entities vs. by-products

Three structural distinctions that must survive in every future
doc:

- **Rules / policies** — `Schedule`, `Trigger`, `Scheduler policy`,
  `Sharing policy`, `Dispatch policy`, `Convergence policy`,
  `Delivery policy`, `Budget policy`, `Execution profile`. These
  configure when and how execution happens; they are not
  durable records at the same level as `Task` or `Run`. They may
  be persisted as configuration rows, but they are never listed
  alongside `Task` / `Run` as peer entities.
- **Pointers / references** — `Reference`, `Transport binding`
  (record form: `TransportBindingRecord`), `Bot binding`. A
  `Reference` in particular is a structured pointer type, not a
  record family of its own. Transport and bot bindings are
  real records, but they sit outside the three-layer taxonomy as
  infra/integration glue.
- **Run by-products** — `Artifact`, `Outcome`, `Checkpoint`,
  `Trace` (and its `Activity` projection). Each is produced by a
  `Run` (or occasionally a `Task` without a Run, such as a
  planning checkpoint), and carries a back-reference. They are
  canonical records but they **are not a fourth layer** and they
  **are not peers of `Run`** — they are dependent children of the
  Execution layer.

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
- the `Activity` record is downgraded to "feed projection over
  Trace" in status, even though the code still persists it — docs
  must be careful not to imply it is a peer of `Run`

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
- `cats-platform/docs/terminology.md` — updated in the same change set

---

*Proposed: 2026-04-22*
*Proposed by: Claude under user-directed investigation (三套心智模型 去重討論)*

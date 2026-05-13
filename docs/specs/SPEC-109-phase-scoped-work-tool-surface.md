# SPEC-109: Phase-Scoped Work Tool Surface

> Structured Cats-owned tools for turning Chat/Telegram work talk into durable
> Work Items, then letting Boss Cat triage and start work through supervised
> boundaries.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Active / MVP Implemented |
| **Owner** | Codex |
| **Reviewer** | TBD |

## Summary

Cats needs a structured tool surface that tells strong Cats exactly what Work
operations they may request. The first product scenario is simple: the owner
speaks todos in Cats Chat or Telegram, Cats captures them as Work Items, and
Boss Cat later works through the backlog. This specification defines the
bounded tools, phase separation, permission rules, persistence rules, and
external tracker boundary for that flow.

## Implementation Status

The MVP tool surface landed on 2026-05-13. Current implementation includes:

- Cats-owned supervised manifests and delegates for intake, triage, execution
  preparation, and external tracker binding phases.
- Chat and Telegram intake proposal/capture paths with owner-visible
  confirmation before durable writes.
- Chat provider-agent observations and tool-request executors for explicit
  Project create, Project lookup, Work Item update, Project assignment, and
  external tracker link/unlink requests.
- Boss Cat execution-preparation proposals that can create pending-approval
  Tasks without starting Runs or runtime sessions.
- Provider-agent bounded-observation validation for tool descriptors, input
  hints, context refs, invariants, summaries, budgets, and recovery fallback
  surfaces.
- Local external tracker bindings, manual UI link/unlink, Work Graph/list/detail
  projections, and a GitHub Issues adapter spike without remote writes.

Automatic bidirectional external tracker sync, credential handling, remote
write approval, and runtime/MCP projection of the full tool catalog remain
follow-up work under ADR-106 and future rollout slices.

## Goals

- Let strong Cats capture one or more Work Items from natural-language Chat or
  Telegram messages.
- Let Boss Cat triage Work Items and organize them into Projects without
  building a full PM-system clone.
- Separate intake from execution so creating a Work Item cannot silently start
  a Task, Mission, or Run in the same phase.
- Make model-visible tool capabilities explicit, validated, permissioned, and
  auditable through Cats-owned supervised tools.
- Keep external trackers as optional bindings around Cats Work Items.

## Non-Goals

- Do not expose broad, unscoped Project / WorkItem CRUD directly to models.
- Do not make MCP the source-of-truth Work API in the first slice.
- Do not require every Chat or Telegram message to become a Work Item.
- Do not create Projects just to house untriaged todos.
- Do not start runtime execution from a capture tool.
- Do not clone Redmine, Bugzilla, GitHub Issues, or any external tracker schema.

## User Stories

- As the owner, I want to tell Cats Chat or Telegram a list of todos so they
  appear as Work Items I can review later.
- As the owner, I want a strong Cat to split a single messy message into
  several Work Items without starting any of them.
- As the owner, I want Boss Cat to organize captured Work Items into Projects
  and priorities when I ask.
- As the owner, I want Boss Cat to start working through selected Work Items
  only after the Work Items are visible and I have asked for execution.
- As the owner, I want a Work Item to link to GitHub/Redmine/Bugzilla later
  without making those tools the internal system of record.

## Requirements

### Functional Requirements

1. **FR-1 (Cats-owned tool surface).** Work planning tools shall be registered
   as Cats-owned supervised tools before being exposed to runtime tool catalogs
   or MCP.
2. **FR-2 (Phase-scoped grants).** Every Work tool shall belong to exactly one
   primary phase: `intake`, `triage`, `execution_preparation`, or
   `external_tracker_binding`.
3. **FR-3 (Bounded observation).** A strong Cat shall receive only the tools
   granted for the current phase and policy. Tool availability shall not be
   inferred from prompt prose.
4. **FR-4 (Intake capture).** The `work.item.capture` tool shall create one
   draft or planned Work Item from owner-provided source text.
5. **FR-5 (Intake split proposal).** The `work.item.propose_split` tool shall
   return a structured list of candidate Work Items for one owner message.
   Applying the candidates shall be a platform-side operation.
6. **FR-6 (Source provenance).** Captured Work Items shall retain source
   provenance in metadata, including source surface, conversation id,
   transport binding when available, source message id, source text summary or
   excerpt, producing Cat id, and capture phase.
7. **FR-7 (No same-phase execution).** Intake tools shall not create Tasks,
   Missions, Runs, or runtime sessions.
8. **FR-8 (One visible acknowledgement).** A Work Item captured from Chat or
   Telegram shall be owner-visible before any execution preparation tool can
   act on it.
9. **FR-9 (Draft status bounds).** Intake-created Work Items shall start in
   `draft` or `planned`. They shall not start as `in_progress`, `completed`,
   `cancelled`, or `archived`.
10. **FR-10 (Triage update).** The `work.item.update` tool shall allow bounded
    updates to title, summary, metadata kind, priority, status within planning
    states, assignment hints, and open questions.
11. **FR-11 (Project lookup).** The `work.project.lookup` tool shall let a Cat
    read a bounded Project list or match candidate Projects without exposing
    raw Core state.
12. **FR-12 (Project create).** The `work.project.create` tool shall create a
    Project only when the owner request or triage context makes a real grouping
    intent explicit.
13. **FR-13 (Project assignment).** The `work.item.assign_project` tool shall
    attach a Work Item to a Project while preserving the original source
    provenance.
14. **FR-14 (Execution preparation).** The
    `work.item.prepare_execution` tool shall produce an execution proposal for
    one or more Work Items. It shall not create a Run by itself.
15. **FR-15 (Task creation).** The `work.task.create_from_work_item` tool shall
    create a Task linked through `WorkItem.taskId` only under an execution
    preparation grant.
16. **FR-16 (Mission and Run boundary).** Mission creation and Run start shall
    continue through the existing supervision, approval, budget, and evidence
    boundaries.
17. **FR-17 (Boss Cat execution posture).** Boss Cat may receive execution
    preparation tools when the owner asks to start, work through, execute, or
    delegate Work Items.
18. **FR-18 (Strong Cat intake posture).** Non-Boss strong Cats may receive
    intake tools for their addressed Chat/Telegram lane, but not execution
    preparation tools unless a later policy explicitly grants that role.
19. **FR-19 (Weak/unknown gate).** Weak or unknown Cats shall not receive
    mutating Work tools. They may receive read-only context or proposal-only
    surfaces when policy allows.
20. **FR-20 (External binding).** External tracker tools shall write bindings
    that connect Cats Work Items to external issues. They shall not replace the
    Cats Work Item id, status enum, or Core record shape.
21. **FR-21 (Idempotency).** Mutating tools shall define deterministic
    idempotency keys based on source message, phase, actor, and logical item
    identity where possible.
22. **FR-22 (Activity evidence).** Applied, rejected, or approval-held Work
    tool calls shall emit tool-boundary evidence. User-visible Work changes
    should also create Activity records when they affect triage or execution.
23. **FR-23 (Registry updates).** Every added tool shall be listed in
    `docs/tool-calls.md` with owner, channel, input/output summary,
    server-resolved fields, side effects, idempotency, and error codes.
24. **FR-24 (No Core field expansion for MVP).** The MVP shall not require new
    Core Project or WorkItem fields. New data shall live in metadata and
    Activity records unless a follow-up ADR approves schema changes.

### Candidate Tool Contracts

The first implementation should start with these tool names and phases:

| Tool | Phase | Side effect | Caller |
|------|-------|-------------|--------|
| `work.item.propose_split` | `intake` | `none` | Strong Cat / Boss Cat |
| `work.item.capture` | `intake` | `local_state` | Strong Cat / Boss Cat |
| `work.project.lookup` | `triage` | `none` | Strong Cat / Boss Cat |
| `work.project.create` | `triage` | `local_state` | Boss Cat / approved strong Cat |
| `work.item.update` | `triage` | `local_state` | Boss Cat / approved strong Cat |
| `work.item.assign_project` | `triage` | `local_state` | Boss Cat / approved strong Cat |
| `work.item.prepare_execution` | `execution_preparation` | `none` | Boss Cat |
| `work.task.create_from_work_item` | `execution_preparation` | `local_state` | Boss Cat / supervised Work delegate |
| `work.external.link_issue` | `external_tracker_binding` | `local_state` | Owner-approved strong Cat / product UI |

### Tool Input Shape Principles

Tool schemas shall expose owner-authored content and user-controllable fields,
but keep authoritative fields server-resolved.

Caller-visible fields may include:

- title
- summary
- source text or source message reference
- suggested Project title
- Work Item kind such as `todo`, `bug`, `issue`, `story`, `requirement`
- priority hint
- open questions
- execution intent summary

Server-resolved fields shall include:

- owner actor id
- source conversation id
- source transport binding id
- source message id when the tool is scoped to a current turn
- producing Cat actor id
- creation timestamps
- Core ids unless an approved idempotency key maps to an existing record
- effective policy and capability profile

### Status and Phase Bounds

The status surface shall remain deliberately narrow:

- Intake may create `draft` or `planned`.
- Triage may move between `draft`, `planned`, `ready`, and `blocked`.
- Execution preparation may move `ready` to `in_progress` only when Task or
  Mission admission has succeeded through the supervision boundary.
- Tools shall not set `completed`, `cancelled`, or `archived` unless a
  dedicated follow-up contract defines completion evidence and user intent.

### External Tracker Binding Shape

External tracker integration shall use the metadata key
`externalWorkBindings` with `schemaVersion: 1` and binding metadata equivalent
to:

```ts
interface ExternalWorkBinding {
  schemaVersion: 1;
  localKind: 'project' | 'work_item';
  localId: string;
  provider: 'github' | 'gitlab' | 'gitea' | 'redmine' | 'bugzilla';
  externalType: 'issue' | 'project' | 'ticket';
  externalId: string;
  externalUrl: string | null;
  syncDirection: 'pull' | 'push' | 'bidirectional';
  lastSyncedAt: string | null;
  externalUpdatedAt: string | null;
  linkedAt: string;
  linkedByActorRef: string | null;
}
```

The Work Graph read model shall project valid Project and Work Item bindings
as `externalBindings[]` summaries with provider, external type/id/url, sync
direction, sync timestamps, and linked actor metadata. Invalid or malformed
binding metadata shall be ignored by the projection rather than failing the
whole graph response.

The binding may live in metadata for the MVP. A future ADR may promote bindings
to a dedicated Core record if sync conflict handling requires it.

The first external adapter spike shall be GitHub Issues. It shall use an
injectable fetch boundary, read a single issue into a Work Item import draft,
reject pull-request rows returned by the GitHub Issues API, and build create
issue payloads for future export without performing remote writes in the spike.

Automatic bidirectional sync is explicitly out of scope for this spec. The
`syncDirection` field records intent only until ADR-106's follow-up design
defines credential handling, remote write approval, conflict policy, and audit
semantics.

## Non-Functional Requirements

- **Safety**: Mutating tools must pass supervised policy checks before any
  state write.
- **Auditability**: Every mutating tool must leave enough evidence to explain
  who requested it, why it was allowed, what changed, and where the owner text
  came from.
- **Least privilege**: Tool grants must be phase-scoped and actor-scoped.
- **Local-first**: Work capture must work without external trackers.
- **Transport parity**: Chat and Telegram intake should write the same Core
  shape and differ only in source metadata.
- **Recoverability**: Idempotent retries must not create duplicate Work Items
  for the same logical capture.

## Design Overview

```text
Cats Chat / Telegram message
  -> bounded observation for strong Cat or Boss Cat
  -> phase-scoped Work tool request
  -> supervised tool boundary
  -> Core WorkItem / Project / Task mutation
  -> Activity + Work Graph projection
  -> optional external issue binding
```

The design keeps three boundaries separate:

- **Tool contract**: what the model can request.
- **Product delegate**: how Cats validates and applies the request.
- **Projection**: how Work, Chat, Code, and Telegram surfaces display the
  result.

## Dependencies

- [ADR-105: Adopt a Phase-Scoped Work Tool Surface](../decisions/105-adopt-phase-scoped-work-tool-surface.md)
- [PLAN-099: Phase-Scoped Work Tool Surface Rollout](../plans/PLAN-099-phase-scoped-work-tool-surface-rollout.md)
- [SPEC-082: Cats Work Agent Supervision and Tool Boundary](./SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
- [SPEC-104: Direct Chat Slash-Mode Work Intake](./SPEC-104-direct-chat-slash-mode-work-intake.md)
- [SPEC-105: Direct Chat Cat-Proposed Product Intent Confirmation](./SPEC-105-direct-chat-implicit-product-intent.md)
- [SPEC-107: Preset-Neutral Product Intent Intake](./SPEC-107-preset-neutral-product-intent-intake.md)
- [Tool Call Registry](../tool-calls.md)

## Open Questions

- [ ] Should `work.item.capture` apply directly in the first slice, or should
      all natural-language captures require a proposal/confirmation path first?
- [ ] Should Project creation by Boss Cat require explicit owner confirmation
      when no matching Project exists?
- [ ] Which metadata keys become canonical for priority, Work Item kind, source
      excerpt, and open questions?
- [ ] Should external tracker bindings stay in WorkItem metadata for MVP, or
      should a dedicated binding record be introduced before bidirectional sync?
- [ ] Should Telegram group chats require stricter confirmation than one-on-one
      bot chats before mutating Work state?

## References

- [Agent Control Surface Registry](../agent-control-surfaces.md)
- [Tool Call Registry](../tool-calls.md)
- [Product Integration Guide](../product-integration-guide.md)

---

*Created: 2026-05-13*
*Author: Codex*
*Related Plan: [PLAN-099](../plans/PLAN-099-phase-scoped-work-tool-surface-rollout.md)*

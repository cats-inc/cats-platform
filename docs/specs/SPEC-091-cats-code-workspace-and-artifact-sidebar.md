# SPEC-091: Cats Code Workspace and Artifact Sidebar

> Add first-class `Workspaces` and `Artifacts` entries to the `Cats Code`
> sidebar without duplicating the managed-work navigation owned by `Cats Work`.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | middl |
| **Related Plan** | TBD for full sidebar rollout; [PLAN-081](../plans/PLAN-081-code-artifact-declaration-rollout.md) covers artifact declarations |

## Summary

`Cats Work` owns the management taxonomy: Projects, Work Items, Tasks, Runs,
and Missions. `Cats Code` should not duplicate those as its own top-level
management sidebar. Code needs a different operator lens: where the code work
is happening and what reusable output it produced.

This spec adds two Code-owned sidebar entries:

- `Workspaces`
- `Artifacts`

Both are projection surfaces over existing Core and Code metadata. They do not
create new Core record families and do not force `Project` / `WorkItem`
creation for `+New code`.

## Goals

- Give Code users a durable place to return to repo, folder, worktree, or
  managed-room execution contexts.
- Give Code users a durable place to inspect generated outputs such as
  previews, builds, reports, documents, attachments, and datasets.
- Keep Code navigation execution-oriented while Work navigation remains
  accountability-oriented.
- Make the sidebar split clear enough for visual mockups and implementation
  planning.
- Preserve provenance from every workspace or artifact back to conversation,
  task, run, and Work linkage when those anchors exist.

## Non-Goals

- Adding Projects, Work Items, Tasks, Runs, or Missions as first-class Cats Code
  sidebar entries.
- Recreating the retired standalone `Build` or `Relay` sidebars.
- Adding a visible source editor as the primary Code surface.
- Adding new canonical Core record types.
- Requiring `Project` or `WorkItem` records before Code work can begin.
- Defining final visual styling, icons, spacing, or exact interaction polish.

## User Stories

- As a Code user, I want to reopen a coding workspace by repo/folder/worktree
  so I can resume the right local context without remembering which chat
  created it.
- As a Code user, I want to inspect outputs across recent code work so I can
  find the latest preview, build result, test report, or draft document.
- As a Work user, I want Projects, Work Items, Tasks, Runs, and Missions to
  stay in Work so Code does not become a second management cockpit.
- As an implementer, I want a clear distinction between Code workspace
  navigation and Work project hierarchy.

## Requirements

### Functional Requirements

1. `Cats Code` shall expose `Workspaces` as a Code-owned sidebar entry.
2. `Cats Code` shall expose `Artifacts` as a Code-owned sidebar entry.
3. `Cats Code` shall keep `Recents` / code conversations as the primary
   conversation-led entry surface.
4. `Cats Code` shall not expose Projects, Work Items, Tasks, Runs, or Missions
   as peer top-level management entries in the Code sidebar for this slice.
5. `Cats Work` remains the canonical sidebar home for Projects, Work Items,
   Tasks, Runs, and Missions.
6. `Workspaces` shall group Code work by execution context, not by Work
   Planning hierarchy.
7. A Code workspace may be resolved from one or more existing signals:
   - Code task metadata under the `codeWorkspace` key
   - the `Conversation.repoPath` field when a conversation is repo-bound
   - execution profile inputs such as `cwd` and worktree policy
   - run/runtime metadata when an execution attempt has a concrete cwd
8. A Code workspace shall not be treated as a `Project` or `WorkItem`.
9. A `+New code` entry may start without a known workspace; such entries shall
   remain visible in Code Recents and may appear in a `No workspace` grouping
   if the Workspaces view needs to account for them.
10. `Artifacts` shall list durable `CoreArtifactRecord` rows relevant to Code
    work.
11. Artifact relevance for the Code sidebar shall be derived from anchors or
    provenance, including:
    - attached `taskId` for a Code task
    - attached `runId` for a Code run
    - attached `conversationId` for a `code_thread`
    - artifact metadata that points at a Code workspace or execution profile
12. Artifact creation shall not happen merely because a Code entry or sidebar
    entry is opened. Artifacts are produced by attachments, imports, execution
    outputs, or explicit document/report creation.
13. Code artifact materialization shall use the structured declaration contract
    defined by SPEC-092. Agent declarations, tool declarations, system
    candidates, and user imports are valid producer paths.
14. Cwd scanning and transcript JSON parsing shall not be authoritative
    producer paths for the Code `Artifacts` sidebar.
15. Artifact rows shall preserve provenance back to the strongest available
    anchors: conversation, task, run, workspace, project, and work item.
16. Artifact detail shall deep-link back to the relevant Code conversation,
    task detail, run history, workspace, and Work object when those anchors
    exist.
17. A Code artifact may also appear in Work as evidence when it is anchored to
    a Work-visible object, but Work evidence placement does not make Artifacts
    a Work-owned sidebar category.
18. If a Code-origin task is later linked into Work through `WorkItem.taskId`,
    Code workspace and artifact provenance remains available as Code execution
    context; Work current binding may still project as `work`.

### Sidebar IA Requirements

The first Code sidebar target shape is:

```text
Cats Code
  + New code / Team code / Peer code
  Recents
  Workspaces
  Artifacts
```

`Workspaces` should support at least these grouping concepts:

- recent workspace activity
- owner-selected folders
- room-owned managed workspaces
- conversation-bound repos
- no workspace / unresolved context

`Artifacts` should support at least these grouping or filtering concepts:

- recent artifacts
- artifact kind
- status
- workspace
- task
- producing run

Mockups should treat `Workspaces` and `Artifacts` as navigation and inspection
surfaces. They are not forms that force the user to create Work planning
records before coding.

### Non-Functional Requirements

- **Traceability**: Every visible artifact should show enough provenance to
  understand which conversation, task, run, or workspace produced it.
- **Low friction**: Unknown workspace state must not block `+New code`.
- **Boundary clarity**: Code workspace labels must not imply Work Project
  ownership.
- **Extensibility**: The first UI should tolerate future artifact kinds without
  requiring a new sidebar category.

## Design Overview

```text
Cats Work sidebar
  Projects
  Work Items
  Tasks
  Runs
  Missions

Cats Code sidebar
  Recents
  Workspaces
  Artifacts

Shared Core records
  Conversation
  Task
  Run
  Artifact
  Project / WorkItem when Work linkage exists
```

The Code sidebar answers:

- "Where is this code work happening?"
- "What did the code work produce?"

The Work sidebar answers:

- "What managed work exists?"
- "Who owns it, what is blocked, and what needs action?"

## Data Contract Notes

No new Core record family is required for this spec.

`Workspaces` initially project from existing Code metadata and execution
context. Current Code metadata already distinguishes:

- `user_selected`
- `managed_room`
- `conversation_repo`

`Artifacts` project from `CoreArtifactRecord` rows that Cats Code
materializes through the structured declaration contract in SPEC-092. Existing
artifact kinds are:

- `document`
- `report`
- `build`
- `preview`
- `attachment`
- `transcript_export`
- `dataset`

Code-specific outputs such as diffs, review reports, changed-file summaries,
or test results should use the closest existing kind plus metadata in this
slice. Adding more artifact kinds is a separate Core-contract decision.

## Dependencies

- [SPEC-043](./SPEC-043-cats-code-mvp-multi-agent-local-app-workflow.md)
- [SPEC-061](./SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [SPEC-083](./SPEC-083-work-system-map-and-cockpit-projections.md)
- [SPEC-092](./SPEC-092-code-artifact-declaration-contract.md)
- [PLAN-064](../plans/PLAN-064-new-code-mvp-task-run-artifact-materialization.md)
- [PLAN-081](../plans/PLAN-081-code-artifact-declaration-rollout.md)
- [ADR-081](../decisions/081-canonicalize-three-tier-core-record-taxonomy.md)
- [ADR-088](../decisions/088-use-structured-artifact-declarations-for-code-materialization.md)

## Open Questions

- Should the UI label be `Workspaces`, `Repos`, or `Workspaces & Repos` for
  the first mockup?
- Should `Artifacts` default to all Code-relevant artifacts or only artifacts
  whose status is `ready` / `published`?
- Which Code outputs deserve new Core artifact kinds later instead of metadata
  on existing `document` / `report` / `attachment` records?
- Should `Reviews` become a separate Code sidebar entry later, or remain an
  artifact/task-detail filter in the first slice?

---

*Created: 2026-04-28*
*Author: Codex*
*Related Plan: TBD for full sidebar rollout; [PLAN-081](../plans/PLAN-081-code-artifact-declaration-rollout.md) covers artifact declarations*

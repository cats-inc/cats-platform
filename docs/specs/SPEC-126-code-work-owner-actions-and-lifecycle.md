# SPEC-126: Code and Work Owner Actions and Lifecycle

## Metadata

| Field | Value |
| --- | --- |
| **Status** | Approved, 2026-10-20; implementation in progress; final owner review/testing pending |
| **Owner** | Platform product/Core integration |
| **Reviewer** | Owner |
| **Related ADR** | [ADR-133](../decisions/133-give-code-and-work-owner-actions-and-source-aware-lifecycle.md) |
| **Related Plan** | [PLAN-119](../plans/PLAN-119-code-work-owner-actions-and-lifecycle-rollout.md) |
| **Baseline** | Platform `977acf1f`, read-only audit on 2026-10-20 |

## Summary

Complete the owner actions around Code and Work objects: manage their names,
status and relationships; return to their actual execution context; stop and
recover supported work; archive or remove clutter; and explicitly clear
eligible execution history. Source-aware lifecycle commands must make these
actions durable without deleting user repositories, recreating removed records
or leaving broken references. Navigation consolidation follows these actions.

## Goals

- Make Codespaces removable and genuinely owner-pinned.
- Give Runs/Missions useful default views and terminal-history management.
- Complete everyday Project, Work Item, Task, Artifact and Schedule actions.
- Reuse eligibility across list, detail and operational views.
- Preserve producer provenance, outputs, active work and the complete Work Graph.
- Define cleanup preview, apply, retention and failure/recovery behavior.

## Non-Goals

- Implementing features as part of this documentation task.
- Replacing the shared interaction engine or creating a Code task registry.
- Removing cross-product objects from the Work Graph.
- Arbitrary filesystem cleanup, provider-native history deletion, or undoing
  already-applied external effects through Stop/Retry.
- A new archive/RAG subsystem, remote execution service or general bulk editor.
- Publishing, bumping versions or silently enabling automatic cleanup.

## User Stories

- As an owner, I can remove a Codespace from Cats and keep my local files.
- As an owner, I can see current work without routine room history filling the
  default view, and still find that history when investigating a conversation.
- As an owner, I can export and clear eligible completed history with a clear
  account of what remains and what space was actually reclaimed.
- As an owner, I can finish, archive, restore and reorganize work without
  deleting its evidence or breaking links.

## Current Implementation Evidence

These are source-audit findings, not destructive acceptance-test results.
Live inspection used existing Desktop DOM and GET responses only; no records
were created, modified or deleted in the controlling profile.

| Evidence | Finding |
| --- | --- |
| `src/products/code/api/projection.ts` | Codespaces aggregate task workspaces, conversation repos, runtime cwd and artifact anchors; ID is derived from the existing normalized path. |
| `src/products/code/renderer/state/codeWorkspacesStore.ts` and `components/Sidebar.tsx` | Every fetched Codespace is placed in `pinnedIds`; items have no unpin/removal action. |
| `src/products/work/api/projection.ts` and `renderer/components/runs/RunsListPage.tsx` | Runs includes all Core attempts; the list has no source/status/date filter or cleanup controls. |
| `src/products/chat/state/core-projection/` and `state/store.ts` | Conversation-derived work and workflow records are synchronized on snapshot writes; Core-row deletion alone is not authoritative. |
| `src/core/model/planningRecords.ts`, `taskControls.ts` and Work `productCrudRoutes.ts` | Project/Work Item/Task deletion removes one record; references remain. |
| Work `components/runs/`, `missions/`, `tasks/GoldenPathSection.tsx` | Stop, cancel and selected recovery flows already exist; terminal listing/cleanup is missing. |
| Code `LivePreviewPanel.tsx`, `CodeRelayView.tsx` | Some displayed Retry/forwarding controls are fixed disabled placeholders. |
| Work `components/schedules/` and `src/platform/scheduler/store.ts` | Schedule detail has enable/disable, test fire and delete; deleting a rule also removes its trigger receipts. |

All shortened component paths above are relative to their named product's
renderer. Source evidence may change during implementation; refresh it before
claiming a capability is still missing.

## Requirements

### Functional Requirements

#### Action contract and persistence

1. **FR-01 — One eligibility rule.** Each supported action shall expose its
   operation, subject, eligibility/blocker and required decision scope from a
   server-owned contract. List/detail/overview renderers shall reuse it. Apply
   shall revalidate ownership, current revision, state and dependencies.
2. **FR-02 — Consistent placement.** Detail headers and list overflow menus
   shall expose the same applicable management actions. Primary actions shall
   name the next useful operation. Batch actions shall show selection counts
   and per-item eligibility; no invisible selection across filters/pages.
3. **FR-03 — Durable owner intent.** Pinning, labels, archive and Codespace
   removal shall persist per owner/profile, survive restart and preserve
   producer links. Removed Codespaces shall not rediscover themselves from
   unchanged source records. Existing inferred Codespaces shall be unpinned
   initially unless an explicit owner preference already exists.
4. **FR-04 — Separate vocabulary.** Stop/cancel, complete, archive, unpin,
   remove from Cats, delete record and clear history shall have distinct
   effects. Archive/restore shall not launch or resume execution. Restoring a
   listing shall not claim to restore permanently purged evidence.
5. **FR-05 — Source authority.** Commands shall distinguish Core-owned,
   conversation/workflow-derived and Runtime-owned resources using persisted
   provenance. A source-derived row shall not report deletion success while
   snapshot synchronization would rebuild it. Existing unsafe delete routes
   shall pass through this boundary or return an actionable unsupported result.
6. **FR-06 — References and active use.** Delete previews shall include incoming
   hierarchy links, explicit WorkGraphLinks, approvals, evidence, sub-runs,
   schedules, Runtime sessions and live previews as applicable. Active or
   required references shall block deletion or require an explicitly supported
   reparent/detach choice. Cleanup shall not create new dangling references.

#### Code page actions

7. **FR-07 — Codespaces.** List/detail shall support search, status/source
   filters, owner label, pin/unpin, archive/restore and `Remove from Cats — keep
   local folder`. A removed-items view shall support explicit restoration.
   Active execution/preview use shall block registration removal with links to
   the applicable Stop action. Detail shall support open-folder where the host
   can do it, continue/new Code in the selected context, and clickable related
   conversations, tasks and artifacts. Unknown/missing folders shall have
   truthful locate/rebind or removal actions without automatic path guessing.
8. **FR-08 — Code task and builder context.** Continue, stop/cancel and supported
   retry shall act on the selected task and its actual conversation/workspace.
   Owners shall not need to copy an ID into a generic Build page. Task editing
   and archive/restore shall use Core lifecycle. Starting a fresh builder form
   shall not imply that an existing execution was stopped. Existing plan,
   delivery-preview, Commit/Push and export decisions shall retain their scope.
9. **FR-09 — Artifacts.** Add search and context filters, rename, archive/restore,
   batch archive and direct download/export when available. `Remove record`
   shall preserve files; any managed-file reclamation shall be a separate
   previewed operation subject to ownership and reference checks. Published or
   externally referenced evidence shall report protection/retention explicitly.
10. **FR-10 — Live Preview.** Open, Stop and Logs shall remain available by
    capability. Implement truthful retry/restart for supported supervisors,
    log export and removal of eligible ended-preview history. Never describe
    hiding logs in the current component as persisted-log cleanup.
11. **FR-11 — Relay and knowledge.** Supported dispatch cancellation, failed
    dispatch retry, forwarding and terminal conversation archive/removal shall
    use canonical execution/conversation owners. Do not add a second Relay
    lifecycle registry. Existing knowledge adopt/revoke/delete flows remain
    canonical, with search/source filtering and clear effects on active use.
    Build/Relay are transitional routes; improvements shall converge into
    contextual Code flows rather than create new primary destinations.

#### Work page actions

12. **FR-12 — Projects.** Add edit, pause/resume, archive/restore, search/status
    filters and list action menus alongside existing create/delete/pin controls.
    Before deletion, show linked work and offer valid move/detach choices or a
    blocker; deleting a Project shall not silently destroy its children's work.
13. **FR-13 — Work Items.** Add edit, priority, move/relink Project, complete/
    reopen, archive/restore and a contextual prepare/start Task action. Keep
    external issue import/binding behavior explicit; a local removal shall not
    implicitly delete an external issue or start bidirectional tracker sync.
14. **FR-14 — Tasks.** Add edit/reassign, complete/cancel, archive/restore and
    contextual execution control alongside existing create/approval/start/delete.
    In-flight work shall reach an acknowledged eligible state before destructive
    cleanup. Reuse supported specialized recovery rather than offering generic
    replay. Completing a Task shall validate its required acceptance gates.
15. **FR-15 — Runs.** List/detail shall offer source, status, date, task/project
    and archived-state filters, server pagination, stable sorting and explicit
    parent/sub-run grouping. Default scope shall emphasize deliberate managed
    work and actionable attempts. `All sources` and conversation/task histories
    shall retain access to ordinary room attempts. Show Stop, supported retry/
    resume, export, archive/restore and terminal-history cleanup by eligibility.
16. **FR-16 — Missions.** Add source/status/date filters, parent/context links,
    archive/restore and batch terminal cleanup beside existing Cancel. Retry/
    resume shall be offered only for supported producer paths. A parent cleanup
    shall disclose child attempts and may not leave active children hidden.
17. **FR-17 — Schedules.** Add create, edit time/timezone/target/policy, duplicate,
    list enable/disable and direct execution-history links. Test fire shall
    explicitly say it executes work and obey normal admission/approval rules.
    Schedule deletion shall disclose the affected rule and trigger receipts,
    preserve referenced execution provenance or a minimal explanation, and
    never imply that previous effects were undone. Receipt retention participates
    in the cleanup preview; changing the current deletion contract requires the
    compatibility assessment in FR-25.
18. **FR-18 — Operational and diagnostic pages.** Cockpit/War Room shall expose
    eligible next actions, including approvals, supported recovery and Stop,
    rather than only names of actions. System Map/drawers shall open canonical
    details and relationship management. Broken Links shall support explicit
    reparent/relink/detach repairs for missing anchors and previewed batch
    removal of eligible orphan links; a diagnostic is resolved by the data
    change, not by hiding a warning.

#### Cleanup, recovery and navigation

19. **FR-19 — Two cleanup scopes.** `Clear detailed logs` shall preserve necessary
    attempt summaries, status, producer links and protected evidence. `Remove
    execution history` shall apply only to eligible terminal records and show
    remaining protected summaries. Neither scope deletes conversations,
    deliverable files, provider-native history or user directories implicitly.
20. **FR-20 — Preview and apply.** Read-only preview shall identify the exact
    selection, scope, source owner, descendants, protected references, counts
    and estimated reclaimable bytes when measurable. Unknown size shall be
    shown as unknown. Apply shall reject stale revisions/changed eligibility,
    be idempotent on retry and return removed/compacted/retained/blocked/failed
    items, actual reclaimed bytes when known and a resumable cleanup receipt.
    Confirmation is bound to this preview; selection expansion requires a new one.
21. **FR-21 — Safe interruption.** Persist source compaction/suppression and
    surviving links atomically within each authoritative store. Coordinate
    multi-store work with a recoverable receipt. Crash/restart or partial
    Runtime retention shall preserve recoverable intent and expose retry;
    observers shall not see a fully successful delete while resources remain
    unresolved. Purged derived rows shall not return on the next Chat write.
22. **FR-22 — Retention controls.** Provide opt-in detailed-log retention by age
    and/or bounded storage after manual cleanup is reliable. Show the policy,
    eligible scope, next cleanup and result. Protect active attempts, required
    references and deliverables. No automatic destructive policy is enabled by
    migration, and hiding/archiving an item does not make its files disposable.
23. **FR-23 — Navigation consolidation.** After action coverage, propose one
    Work overview combining Cockpit/War Room responsibilities; group Runs/
    Missions under execution and System Map/Broken Links under diagnostics.
    Code keeps conversations, Codespaces and Artifacts as its primary structure.
    Existing deep links shall resolve to canonical current views where the
    public contract is retained, without parallel legacy renderers. Confirm
    the final layout/default landing before this phase starts.
24. **FR-24 — Full graph and provenance.** Filtering shall preserve ADR-083's
    complete cross-product graph and diagnostics. Classify producer/source,
    current task binding and conversation origin independently on the server.
    Plain conversation materialization shall not be mistaken for deliberate
    managed-work admission. Unknown provenance stays visibly unknown and
    diagnosable; titles, path presence and ID prefixes are not admission rules.
25. **FR-25 — Upgrade and compatibility.** Before writes, deliver validated,
    backed-up, atomic upgrades of recognized old profile/schedule formats with
    failure recovery and restart coverage. Preserve unknown/unsupported input
    for recovery. Record public API/DELETE/config/data compatibility impact;
    incompatible changes require the next Platform minor (`0.9.0` or later),
    and independently assess any Runtime boundary. No version bump/publication
    is part of this draft.

### Non-Functional Requirements

- **State isolation:** automated tests use memory stores or temporary fixture
  profiles. UI acceptance uses an isolated Desktop candidate. Never populate or
  destructively probe the controlling user's profile.
- **Concurrency:** source and lifecycle revisions prevent races with new turns,
  active Runtime work and simultaneous UI actions. Cleanup batches are bounded
  and report partial outcomes instead of blocking the renderer indefinitely.
- **Accessibility/localization:** named menus, keyboard selection, focus return,
  progress and result announcements use the existing locale infrastructure.
- **Security:** normal authorization and host filesystem boundaries apply;
  exports omit credentials. Ordinary local archive/unpin/edit actions require
  no new global approval workflow. Existing execution/publish gates still apply.
- **Observability:** cleanup records explain scope, actual results and recovery
  without retaining the log content the owner asked to purge.

## Design Overview

```text
List / detail / overview
  -> product action projection + read-only cleanup preview
  -> source-aware command boundary (eligibility + revision recheck)
       -> Core records and durable owner lifecycle intent
       -> conversation/workflow source for derived history
       -> Runtime ownership/cancellation/reclamation when required
  -> per-item result + recoverable receipt
  -> refreshed canonical views and complete Work Graph
```

The following matrix defines delivery slices, not implementation claims:

| Surface | Minimum useful action coverage | Slice |
| --- | --- | --- |
| Codespaces list/detail/sidebar | Real pin/unpin, archive/restore, persistent removal, open/continue/context links | P1a |
| Existing Project/Work Item/Task Delete | Source/dependency checks, truthful rejection or valid relationship handling | P1a |
| Runs/Missions history | Source filters, archive/restore, export and terminal cleanup | P1b |
| Projects/Work Items/Tasks | Edit, status, reassignment, move, contextual execution/recovery | P2 |
| Artifacts/Knowledge | Record lifecycle, protected provenance, export and search | P2 |
| Schedules/Live Preview/Relay | Missing authoring/recovery/history actions in canonical contexts | P3 |
| Overview/System Map/Broken Links/navigation | Shared next actions, repairs and reviewed navigation consolidation | P4 |
| Automatic detailed-log retention | Opt-in policy after manual cleanup and upgrade acceptance | P5 |

## Acceptance Scenarios

| ID | Required outcome |
| --- | --- |
| A1 | Unpin an inferred Codespace: it leaves the pinned sidebar, remains discoverable and stays unpinned after reload/restart. |
| A2 | Remove an inactive artifact-backed Codespace: the folder/artifact survive, rediscovery and Chat writes do not restore the entry, and explicit restore works. |
| A3 | Remove a Codespace in active use: explain the reference and link to Stop; do not delete its folder or hide active execution. |
| A4 | Mixed deliberate Work, ordinary room, scheduled and unknown-source fixtures: default views and explicit filters behave as specified while the full graph retains all objects. |
| A5 | Clear eligible terminal room-turn logs: transcript/output/required summary survive; subsequent snapshot synchronization does not restore the purged detail. |
| A6 | Delete a derived Task or referenced Project: mutate the correct source with supported relationship handling, or reject with a useful blocker; no false success/reappearance/new dangling reference. |
| A7 | Preview cleanup, then start/relink work concurrently: stale apply is rejected and requires a fresh preview. |
| A8 | Interrupt multi-store cleanup or receive Runtime retained/failure: results remain truthful, restart exposes recovery, and retry does not double-delete or replay work. |
| A9 | Restore archived history after detailed-log cleanup: retained summaries return with explicit cleared-log state; no execution or fabricated evidence is created. |
| A10 | Schedule edit/duplicate/test-fire/delete: correct target/timezone/admission, explicit execution warning and accurate receipt/history scope. |
| A11 | Supported Retry invokes the originating driver; unsupported cases explain why; running/terminal navigation and all views agree on eligibility. |
| A12 | Old/malformed/future-version profile fixtures and migration write failures: valid data upgrades losslessly, backups recover, unsupported input remains intact. |

## Dependencies and Open Questions

- Frozen shared-contract integration review must settle lifecycle metadata
  placement, producer classification, action payloads and cleanup receipts.
- Runtime resource deletion is conditional on its ownership/retained/recovery
  contract; broad workspace reclamation stays gated by the joint retention work.
- Confirm log-retention choices and whether quotas should be offered initially;
  no default duration is selected here.
- Confirm the single Work overview layout and final placement of transitional
  Build/Relay capabilities before P4 navigation work.

## References

- [ADR-133](../decisions/133-give-code-and-work-owner-actions-and-source-aware-lifecycle.md)
- [PLAN-119](../plans/PLAN-119-code-work-owner-actions-and-lifecycle-rollout.md)
- [SPEC-083](SPEC-083-work-system-map-and-cockpit-projections.md)
- [SPEC-090](SPEC-090-work-graph-link-relations.md)
- [SPEC-091](SPEC-091-cats-code-workspace-and-artifact-sidebar.md)
- [SPEC-092](SPEC-092-code-artifact-declaration-contract.md)
- [SPEC-094](SPEC-094-schedule-rules-and-mission-triggers.md)
- [SPEC-096](SPEC-096-mission-cancel-and-run-stop-contract.md)
- [SPEC-108](SPEC-108-cats-code-live-preview-substrate.md)
- [SPEC-114](SPEC-114-telegram-work-delivery-golden-path.md)

---

*Created: 2026-10-20. Last updated: 2026-10-20.*

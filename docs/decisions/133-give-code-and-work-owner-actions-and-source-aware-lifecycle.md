# ADR-133: Give Code and Work Owner Actions and Source-Aware Lifecycle

## Status

Accepted, 2026-10-20. The owner approved the entire rollout as locally committed
slices, without pushing or publishing. Final owner review and testing follow
implementation. P4 navigation grouping is included in this authorization.

P0-P5 implementation and scoped acceptance are complete. The
[plan's acceptance record](../plans/PLAN-119-code-work-owner-actions-and-lifecycle-rollout.md#acceptance-evidence-and-review-handoff)
contains source/instance receipts, checks and limits. Final owner review/testing
remains pending. The owner subsequently authorized latest-main integration,
push and an auto-merge PR on 2026-10-20, superseding the original local-only hold.
This authorization includes no version bump or publication.

## Context

Code and Work expose many inspectable objects without a complete way to manage
them. The owner's examples were a Codespace that cannot be removed and Runs
that accumulate without a cleanup action. A read-only audit at Platform
`977acf1f` found three different gaps:

- **Presentation:** every discovered Codespace is treated as pinned, including
  archived entries. Runs has no source, status or date controls. Work exposes
  planning, execution, operational and diagnostic pages as peer destinations.
- **Product actions:** Projects, Work Items and Tasks support creation and
  deletion, but lack consistent editing, completion, archive and restore.
  Run detail can stop an attempt; Mission detail can cancel a mission. Terminal
  history has no corresponding management flow. Some recovery actions exist
  only in specialized Task panels. Preview Retry and Relay forwarding include
  permanently disabled controls.
- **Authority:** Codespaces are path-based projections of tasks, conversations,
  sessions and artifacts. Conversation-backed Tasks, Work Items, Runs, Missions
  and evidence are rebuilt from Chat state when the store writes a snapshot.
  Deleting a projected row alone cannot reliably remove it. Existing Core
  Project/Task deletion also leaves referring records intact.

This is an incomplete lifecycle contract, not just missing menu buttons.
Runs are execution attempts with control and recovery state as well as logs.
Ordinary room turns also produce attempts, so an unqualified global list
resembles a debug ledger more than a managed-work surface.

Existing architecture remains relevant:

- ADR-032 assigns product task lifecycle to Core, above Runtime.
- ADR-083 requires a complete cross-product Work Graph, explicit task binding
  and separate structural/operational projections. Removing ordinary room
  history from the default list must not erase it from that graph.
- SPEC-091 makes Code conversation-led with Codespaces and Artifacts; it does
  not authorize reviving Build and Relay as permanent primary destinations.
- ADR-049 separates stop/close from destructive product deletion and requires
  truthful Runtime cleanup outcomes. The joint workspace-retention research
  leaves broader resource reclamation unresolved.

## Decision

### 1. Give each page an owner task and supported actions

Every management list and detail page will expose actions appropriate to the
object's state and producer. Primary actions appear in context; secondary
actions live in a consistent overflow menu; batch actions operate on an
explicit selection. Structural and diagnostic views may remain primarily
read-only, with a path to the canonical detail and applicable repair commands.

The server determines action eligibility and revalidates it on execution.
Lists, details, Cockpit and War Room consume the same eligibility rules rather
than inventing their own state transitions. This is a bounded shared action
contract for proven uses, not a universal replacement for product renderers.
Unavailable actions explain their blocker; placeholder buttons are not counted
as implemented capabilities. Retry is available only when the originating
execution path can truthfully resume or create a new attempt.

### 2. Separate presentation, execution, record and resource operations

| Operation | Meaning |
| --- | --- |
| Pin / unpin | Owner navigation preference; execution and history remain available. |
| Archive / restore | Durable listing state; default lists exclude archived entries. Active work remains reachable in operational views. |
| Remove Codespace from Cats | Reversible removal of its Cats registration/discovery entry, preserving the local folder and outputs. Active references block removal. |
| Stop Run / cancel Mission | Existing execution-control contract; preserve history and report actual Runtime capability/outcome. |
| Delete product record | Explicit source-aware removal with dependency handling, not an implicit stop or recursive directory delete. |
| Clear execution history | Previewed cleanup of eligible terminal history; distinguish detailed logs from whole attempt records and protected summaries. |
| Delete managed resources | Separately scoped reclamation executed through Runtime ownership checks; retained/shared resources stay visible as retained. |

Archive does not mean complete, unpin does not mean stop, and removing a
Codespace does not authorize deleting a repository. User-selected directories
are preserved. Automatic detailed-log retention is opt-in initially; merely
upgrading or hiding a row never authorizes data loss.

### 3. Persist owner intent alongside projections

Add bounded, owner/profile-scoped lifecycle state for Codespace registration,
pinning, display label and archive/removal intent, and for record listing or
history-cleanup intent where the source record cannot express it. Integrate
this state with the existing profile persistence and mutation boundary; do not
introduce another execution registry or an unsynchronized renderer-only store.

Codespace keys use the current resolver/identity contract. This work must not
silently merge paths with different case, symlink or worktree semantics.
Existing inferred entries are discoverable but are not all auto-pinned.
Explicit removal survives rediscovery until the owner restores the entry.
Restoring a listing does not replay execution or resurrect purged logs.

Metadata placement and API shapes passed the P0 frozen-contract integration
review recorded in PLAN-119 before implementation. There is no new canonical
Core execution record family implied by a presentation preference.

### 4. Route destructive changes to the authoritative producer

Core-owned records are mutated through Core lifecycle commands. Chat-derived
records are handled at the conversation/workflow source or through durable
source-aware suppression/compaction, so snapshot synchronization cannot recreate
removed history. Product delegates carry intent and present results; Runtime
continues to own session/process/filesystem cleanup.

Before deletion or pruning, compute dependencies, active use, protected evidence
and ownership. Block an unresolved dependency or offer explicit supported
reparent/detach choices. Never create new dangling references as a successful
cleanup outcome. Existing broken references remain diagnosable and repairable.
Preserve a minimal provenance/cleanup receipt when retained records still need
to explain an attempt whose detailed logs were cleared.

Preview is read-only. Apply rechecks revision/eligibility and reports per-item
removed, compacted, retained, blocked or failed results. Multi-store cleanup is
idempotent and recoverable after interruption; an unresolved Runtime retention
result is not full success. Existing ADR-049 destructive channel/Cat deletion
semantics remain in force and are not silently relaxed by history cleanup.

### 5. Separate default owner views from the complete graph

Runs and Missions gain explicit producer/source, task binding, status and time
filters. Default owner views emphasize managed work and actionable attempts;
ordinary room history remains available through explicit source filters and
conversation/task drill-down. Producer provenance, current Work binding and
conversation origin are distinct signals; neither a title/ID prefix nor
`WorkItem.taskId` alone proves a deliberate Work admission.

The complete cross-product Work Graph and its diagnostics remain available as
required by ADR-083. This proposal changes default presentation, not record
identity, provenance or the graph's coverage.

After management actions work, consolidate Cockpit and War Room into one Work
overview, group Runs/Missions under execution management and System Map/Broken
Links under diagnostics. Code remains conversation/Codespace/Artifact-led.
Build/Relay capabilities converge into canonical contextual flows rather than
expanding the permanent primary navigation. URL continuity, where compatible,
resolves to current views without retaining a second legacy renderer.

This proposes amendments to ADR-083's view-owned navigation and SPEC-091's
inspection-only initial scope. Their graph taxonomy and Code/Work ownership
remain unchanged. No default landing page changes in the documentation slice.

### 6. Upgrade persisted state before enabling lifecycle writes

Persisted lifecycle changes require validation, backup, atomic replacement,
failure preservation and restart/recovery coverage. Old profiles must retain
their conversations, outputs and source links. Unsupported or ambiguous state
is reported for recovery, never interpreted as disposable data.

Compatible fields/endpoints can remain within the current `0.8.x` line. If
implementation removes public routes, changes existing DELETE/config guarantees
or imposes incompatible persisted-data requirements, the required boundary is
the next Platform minor, `0.9.0` or later. Determine the actual boundary in the
contract review; this proposal does not bump or authorize a release. Runtime
changes require its own compatible contract or separately recorded boundary.

## Integration Contract (P0)

- Persist an optional `ownerLifecycle` Core extension with version `1`, a
  monotonic revision, subject entries, minimal cleanup receipts and disabled
  retention defaults. Existing profiles load without a write; first persistence
  uses the existing backup/temp-file/atomic-rename boundary. Malformed/future
  extensions fail closed and preserve original bytes and recovery evidence.
- Keys combine record family and existing ID. Codespaces keep current path
  identity and save registration details for restore. Entries express owner
  presentation/deletion/compaction intent, never a parallel execution registry.
  Chat projection reapplies intent after materialization; workflow source
  compaction uses the atomic snapshot mutation boundary.
- Product action and history preview/apply/export/policy delegates use revision
  checks and `updateCore`/`updateSnapshot`. Preview fingerprints cover relevant
  source records and references, including concurrent execution changes.
- Existing Delete must block incoming hierarchy, graph, approval, evidence,
  run-tree, schedule and active-preview references. Derived planning records
  reject deletion with a source-context link; archive remains available. No
  implicit conversation deletion or filesystem reclamation is introduced.
- Source classification uses producer metadata/admission independently of
  current task binding and conversation origin. Unknown and ordinary room
  attempts remain accessible through explicit filters and the full Work Graph.
- Core owns rows/lifecycle intent; Chat owns derived workflow sources;
  scheduler owns rules/receipts; Code supervisor owns preview leases; Runtime
  owns sessions/processes/filesystems. Cleanup retains protected summaries and
  reports unsupported/retained resources honestly. Arbitrary workspace and
  provider-native history deletion remain outside this rollout.
- The optional extension/additive endpoints are compatible. Tightening unsafe
  DELETE behavior and changing default list/navigation behavior are recorded for
  the next Platform minor, `0.9.0` or later. No version bump/release or Runtime
  public-contract change is authorized by this implementation task.

## Consequences

### Positive

- Owners can retire clutter and recover it deliberately.
- Removal survives projection rebuilds and application restarts.
- Execution controls and evidence cleanup have truthful, distinct outcomes.
- Default pages become useful without reducing cross-product traceability.

### Negative

- Lifecycle writes require producer coordination and tested profile upgrades.
- Cleanup previews, protected references and partial results add implementation
  work before bulk destructive actions can ship.

### Neutral

- Core/Platform owns product lifecycle; Runtime owns execution resources.
- Navigation consolidation follows the capability work and needs design review.
- Initial detailed-log retention is opt-in and age-only (30 days shown for
  editing, disabled by default). Hourly bounded passes reuse manual cleanup;
  referenced evidence remains protected automatically. Provider/FS quotas stay
  outside the supported ownership boundary. Backup recovery requires re-opt-in.

## Alternatives Considered

| Alternative | Benefit | Why not selected |
| --- | --- | --- |
| Add Delete buttons that remove Core rows | Small UI change | Derived rows return; related records and resources can be orphaned. |
| Keep only browser-local hidden IDs | Fast clutter reduction | Does not manage persisted history, survive profile moves or explain resource use. |
| Cascade-delete everything beneath a visible item | Simple apparent rule | Shared evidence, external folders and ongoing work have different owners. |
| Permanently hide all Chat/Code attempts from Work | Quiet default | Violates the complete Work Graph and loses cross-product diagnosis. |
| Redesign navigation first | Fewer menu items | Leaves the missing lifecycle and action authority unchanged. |

## References

- [SPEC-126](../specs/SPEC-126-code-work-owner-actions-and-lifecycle.md)
- [PLAN-119](../plans/PLAN-119-code-work-owner-actions-and-lifecycle-rollout.md)
- [ADR-032](032-own-task-substrate-in-core-not-runtime.md)
- [ADR-049](049-cascade-product-deletes-into-runtime-session-deletion.md)
- [ADR-083](083-adopt-work-graph-projections-for-system-map-and-cockpit.md)
- [SPEC-091](../specs/SPEC-091-cats-code-workspace-and-artifact-sidebar.md)
- [SPEC-096](../specs/SPEC-096-mission-cancel-and-run-stop-contract.md)
- [Product integration guide](../product-integration-guide.md)
- [Workspace retention research](../../../cats-runtime/docs/research/2026-09-18-playground-workspace-retention.md)

---

*Created: 2026-10-20. Last updated: 2026-10-20.*

# PLAN-119: Code and Work Owner Actions and Lifecycle Rollout

## Metadata

| Field | Value |
| --- | --- |
| **Status** | Implementation/scoped acceptance complete; latest-main integration and auto-merge PR authorized; PR CI pending |
| **Owner** | Platform product/Core integration |
| **Reviewer** | Owner |
| **Related Spec** | [SPEC-126](../specs/SPEC-126-code-work-owner-actions-and-lifecycle.md) |
| **Related ADR** | [ADR-133](../decisions/133-give-code-and-work-owner-actions-and-source-aware-lifecycle.md) |
| **Base** | Platform `977acf1f` |
| **Integration Base** | Remote main `de0128032514b81d934b6c44bdab3d0249190c0e` |
| **Worktree** | `.claude/worktrees/code-work-actions` |
| **Branch** | `docs/code-work-actions-lifecycle` |

## Overview

Ship owner actions before collapsing navigation. First define source authority,
safe writes and upgrade requirements; then deliver Codespace management and
terminal-history cleanup; follow with everyday record management, remaining
execution surfaces, diagnostic repairs and reviewed navigation. Automatic
retention is last and opt-in. The owner initially approved local commits without
pushing, then authorized latest-main integration, push and an auto-merge PR on
2026-10-20. This supersedes the push hold; everyday owner testing and any future
release remain separate.

The approved integration contract is recorded in ADR-133 P0. Runtime work, if needed, uses its own checkout/instructions and release
boundary. Keep the existing shared interaction engine and cancellation paths.

## Implementation Phases

### P0 — Contract and producer inventory

- [x] Review ADR-133/SPEC-126, settle source classification and approve the
  first implementation slice. Check numbering against other active worktrees
  again before integration.
- [x] Enumerate Core-owned, conversation-derived, schedule-owned and Runtime
  resources for every action. Include synthetic Tasks/Work Items and room
  Run/Mission/evidence reconstruction, not just list endpoints.
- [x] Trace incoming hierarchy/WorkGraphLink/approval/evidence/schedule/preview
  references; specify block, reparent, detach and protected-summary behavior.
- [x] Through frozen-contract integration review, define bounded lifecycle
  metadata, action eligibility, server filters/pagination, revisioned cleanup
  preview/apply and minimal recovery receipts. Do not create a parallel registry.
- [x] Design the old-profile upgrade with validation, backup, atomic replacement,
  failure preservation and restart/recovery. Include scheduler receipt changes
  if its deletion/retention contract changes.
- [x] Record whether public DELETE behavior, routes, config or persisted-data
  requirements cross the `0.8.x` boundary. Breaking Platform contracts require
  `0.9.0` or later; assess Runtime separately. Do not bump/publish in this phase.

**Exit:** reviewed contracts, ownership/dependency matrix, migration design and
fixture cases; no lifecycle write is enabled before the applicable upgrade is
tested. Complete graph coverage and producer provenance remain explicit.

### P1a — Codespace management and existing Delete correctness

- [x] Implement validated persistence for owner pin/label/archive/removal state
  using the approved identity rules. Import inferred Codespaces as discoverable
  and unpinned; preserve explicit preferences if any.
- [x] Make suppression survive projection rebuilds, source refresh and restart;
  add explicit removed-item restoration. Preserve local directories/artifacts.
- [x] Add sidebar/list/detail menus, search/status/source controls and contextual
  open-folder/continue/new Code/related-conversation links.
- [x] Block registration removal during active execution/preview use and offer
  the canonical stop/context action. Keep active work reachable after unpinning
  or archiving its context.
- [x] Route existing Project/Work Item/Task Delete through source-aware and
  dependency checks. Derived deletions must change the authority or reject;
  referenced records must not be silently orphaned. Return truthful results.
- [x] Validate A1-A3, A6 and the applicable A12 migration/failure cases before
  exposing these writes in an isolated Desktop candidate.

**Exit:** the reported Codespace clutter can be managed durably; existing Delete
does not falsely claim success or manufacture broken references.

### P1b — Runs/Missions listing and manual history cleanup

- [x] Project authoritative producer/source independently of task binding and
  conversation origin; classify unknown input explicitly. Distinguish ordinary
  room materialization from deliberate managed-work admission.
- [x] Add server status/source/time/context filters, pagination, stable sorting
  and parent/sub-run grouping. Preserve the complete Work Graph and explicit
  access to all sources.
- [x] Add terminal archive/restore, selected-item actions and log export.
- [x] Implement read-only cleanup previews with exact item scope, dependencies,
  protected summaries, measurable/unknown size and bound revisions.
- [x] Implement explicit detailed-log compaction and eligible full-history
  removal at their authoritative sources. Preserve transcript/deliverables,
  required summaries and producer links; prevent reconstruction of purged detail.
- [x] Recheck eligibility on apply, protect active/changed/required references,
  bound batches and return per-item actual results.
- [x] Persist minimal cleanup recovery receipts. Exercise interruption,
  idempotent retry and Runtime retained/failure where Runtime is involved;
  do not claim Runtime filesystem reclamation if its contract is unavailable.
- [x] Validate A4-A9/A12 with memory/temporary-profile fixtures and isolated
  candidate flows; prove reload, restart and subsequent Chat writes cannot
  restore cleared detail.

**Exit:** owners can find, export, archive and actually clear eligible terminal
history, with honest retention/recovery and no lost deliverables.

### P2 — Everyday work and artifact management

- [x] Add Project edit, pause/resume, archive/restore and relationship-aware
  removal/move choices in list/detail surfaces.
- [x] Add Work Item edit/priority, Project move/relink, complete/reopen,
  archive/restore and contextual Task preparation/start.
- [x] Add Task edit/reassign, acceptance-aware completion/cancellation,
  archive/restore and state/source-appropriate execution/recovery controls.
- [x] Add contextual Code task continuation instead of manual task-ID entry.
  Distinguish fresh builder form state from actual stop/cancel.
- [x] Add Artifact rename/archive/restore, protected record removal, context
  filters and direct export/download; preserve files unless a separate managed
  resource cleanup is selected and supported.
- [x] Keep knowledge adoption/revocation/deletion authoritative; add search/
  source filters and clear effects on active use.
- [x] Reuse eligibility and command contracts across list/detail and validate
  approvals, acceptance gates, external issue independence and link integrity.

**Exit:** core owner work can be edited, completed, reorganized and retired from
its own context without abandoning execution or evidence.

### P3 — Schedule, preview and dispatch gaps

- [x] Add Schedule create/edit/duplicate, list toggle and execution-history
  links. Keep timezone, target, concurrency, misfire and approval rules intact.
- [x] Label Test fire as real execution; preserve admission and permission gates.
- [x] Preview rule deletion/receipt cleanup and preserve necessary execution
  provenance. Apply the P0 compatibility/upgrade decision to changed contracts.
- [x] Implement supported preview retry/restart, log export and ended-history
  cleanup through the existing supervisor; explain unavailable capabilities.
- [x] Complete supported dispatch cancel/retry/forwarding and terminal history
  management through canonical conversation/task owners. Converge transitional
  Build/Relay capabilities into contextual Code flows.
- [x] Validate A10-A11 plus resource ownership and retained/partial outcomes;
  permanently disabled placeholders are not completion evidence.

**Exit:** supported schedule, preview and dispatch workflows have useful actions
and truthful failure/recovery paths in their canonical context.

### P4 — Operational actions, repair and navigation

- [x] Bring shared eligible next actions into Cockpit/War Room and detail drawers.
  Preserve specialized approval/recovery semantics rather than reimplementing them.
- [x] Add canonical-detail navigation and relationship management to System Map;
  add missing-anchor relink/reparent/detach and previewed orphan-link batch
  repair to Broken Links.
- [x] Apply the owner-approved full-plan navigation consolidation: one Work
  Overview combines the Cockpit grid with decision/recovery operations. Final
  visual review remains with the owner before any push.
- [x] Group Runs/Missions under execution and System Map/Broken Links under
  diagnostics. Keep Code conversation/Codespace/Artifact-led.
- [x] Resolve retained public deep links to current canonical views without
  maintaining parallel legacy renderers. Route removals use the recorded
  compatibility boundary rather than hidden aliases.
- [x] Verify selection/back navigation, filters, keyboard/focus, localization,
  empty/error states and all-source graph coverage in the isolated candidate.

**Exit:** fewer competing destinations, useful next actions and actual repairs;
navigation changes do not hide unresolved work or change object identity.

### P5 — Opt-in retention and release readiness

- [x] Implement age-only detailed-log retention after the manual cleanup fixture
  checks; expose explicit opt-in, scope, next pass, result and protection reasons.
  Storage quotas are deferred because external/provider storage is not owned.
  Isolated manual cleanup acceptance precedes final readiness.
- [x] Keep automatic deletion disabled for migrated profiles. Validate active
  work, protected references and outputs remain outside automatic reclamation.
- [x] Exercise bounded background cleanup, interruption/restart and retention
  races against new work; reuse the manual cleanup boundary.
- [x] Record scoped checks and remaining native acceptance. If release is later
  authorized, prepare the actual compatibility/migration notes and exact source/
  artifact pins in the original release change; no publication in this plan task.

**Exit:** retention is explicit, bounded and recoverable; release claims match
the checks actually performed and the separately authorized release scope.

## Expected Files and Ownership

The approved ownership map guided P0-P5. Implementation and acceptance scope are
recorded below; final owner review/testing remains pending.

| Area | Intended responsibility |
| --- | --- |
| `src/core/types.ts`, `src/core/model/`, persistence/migration boundary | Integration-reviewed lifecycle metadata, relationship handling and upgrade guarantees. |
| `src/products/chat/state/core-projection/`, `src/products/chat/state/store.ts` | Source-aware derived-record lifecycle and snapshot rebuild behavior. |
| `src/products/code/api/`, `renderer/state/codeWorkspacesStore.ts`, `renderer/components/` | Codespace preferences, contextual actions, artifacts and preview/dispatch presentation. |
| `src/products/work/api/`, `renderer/api/`, `renderer/state/queries/`, `renderer/components/` | Owner command delegates, filters, operational actions, details, cleanup and repair UX. |
| `src/platform/supervision/`, `src/platform/scheduler/` | Existing execution control, rule/receipt semantics and approved cleanup coordination. |
| `src/app/renderer/productShell/` | Proven shared action affordances and later navigation integration. |
| `cats-runtime` public session/workspace APIs, if required | Runtime-owned reclamation and retained outcomes; separate owning-member work. |
| Product guides and governing ADR/Spec/Plan | Capability/status, compatibility and actual validation updates in each implementation slice. |

## Testing Strategy

- Use targeted existing coverage as starting points: `work-product-crud-routes`,
  `work-run-cancellation*`, `work-mission-projection-visibility`,
  `work-graph-task-binding`, `work-graph-link-*`, `work-schedule-*`,
  `code-workspace-resolution`, `code-artifact-*` and `code-live-preview-*`.
- Add behavioral fixtures for A1-A12: memory stores and temporary persisted
  profiles, including corrupt/future input, failed atomic replacement, crash
  recovery, concurrent writes and source reconstruction. Test outcomes, not
  component implementation mirrors.
- Run focused checks for each changed boundary. Browser/server import changes
  require the applicable build checks. Do not duplicate the whole CI suite
  locally merely to prepare a commit or PR.
- Use an isolated source-built Desktop candidate for write acceptance. Never
  create smoke records or test destructive cleanup against the controlling
  profile. Startup alone does not prove lifecycle behavior.
- Documentation-only slices use whitespace/reference/status checks. Application
  build and behavioral evidence is recorded for the implementation slices below.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Deleted projection rows reappear | Source-aware compaction/removal plus rebuild/restart acceptance. |
| Shared evidence or files are lost | Explicit scope, reference protection and Runtime ownership; keep external folders. |
| Snapshot races undo cleanup | Revision checks and atomic source/persistence boundaries. |
| Partial cleanup appears successful | Per-item outcomes and resumable minimal receipts. |
| New defaults hide needed Chat/Code evidence | Explicit source filters, context drill-down and unchanged complete graph. |
| Broader navigation work delays the reported fixes | P1a/P1b ship independently; review P4 after owner actions exist. |
| Existing schema/public behavior is broken inside `0.8.x` | P0 compatibility assessment and tested upgrades before enablement. |

## Requirement Traceability

| Requirements | Phases | Acceptance |
| --- | --- | --- |
| FR-01-FR-06 | P0, P1a, reused throughout | A1-A3, A6-A8, A12 |
| FR-07 | P1a | A1-A3 |
| FR-08-FR-09, FR-12-FR-14 | P2 | A6, A9, A11 plus record/acceptance fixtures |
| FR-10-FR-11, FR-17 | P2 knowledge; P3 execution | A10-A11 |
| FR-15-FR-16, FR-19-FR-21, FR-24 | P1b | A4-A9, A11 |
| FR-18, FR-23 | P4 | A4/A11 plus repair/navigation acceptance |
| FR-22 | P5 | A5, A7-A9 plus automatic-policy fixtures |
| FR-25 | P0 and every persisted/API change | A12 and compatibility review |

## Progress Log

| Date | Update |
| --- | --- |
| 2026-10-20 | PR #286 first CI attempt timed out after finishing its tests: new async React `act` calls leaked referenced MessagePorts in bundled ESM. Reproduced with CI's esbuild/no-isolation settings, then replaced async `act` with synchronous events and explicit result waits. Corrected asynchronous query readiness, the shared Codespace confirmation fixture, Artifact QueryClient context and the server fixture's obsolete active-attempt Resume expectation (now asserts rejection, canonically stops, then resumes). The 12 focused bundled UI cases pass and naturally exit in about 2 seconds with no referenced MessagePorts; the server projection case passes. No product code changed. A new required CI run is pending on the pushed correction. |
| 2026-10-20 | Integration authorized: merged remote main `de012803` (including the participant/audience/coordinator redesign), preserving all original slice commits. Resolved three document-index conflicts by retaining both tracks; reviewed automatically merged projection, sidebar, workspace and i18n seams. Removed the obsolete `skipBossCatGreeting` field from the cleanup fixture. Server, renderer and test typechecks plus web build passed; 108 focused lifecycle/renderer/driver/Work tests passed, with the changed history fixture rechecked (7). Selected JS integration checks had 59 passes and the same three Chat store failures reproduced in an unmodified remote-main archive; a bounded standalone Core write-adapter case timed out identically in both trees. Remote main's hosted CI was green. Local full CI was not duplicated; PR `validate` and `nodejs (24)` remain the merge gates. Earlier native candidate receipts predate this integration and are not claimed as post-merge native acceptance. No version bump or release authorized. |
| 2026-10-20 | Final acceptance/polish slice complete: source-built isolated Desktop flows verified Codespace registration/pin/rename/archive/restore/removal, exact history preview/apply, active blocking, opt-in automatic compaction, planning edits, actual missing-anchor repair and Chat/sidebar/composer regressions. Final candidate rechecked future-tense preview labels, named per-item results, scoped form layout and shared cancel-default confirmation dialogs. 23 final renderer/sidebar checks passed; client typecheck and full candidate server/Desktop/Runtime/web builds passed. Both candidates drained with exit 0; stopped-profile reload, subsequent Chat write and fresh-store reload preserved cleanup, relationships, transcript and files. Final build inputs matched all 1,812 files byte-for-byte. See acceptance evidence and limits below. P0-P5 implementation is complete; no push/version bump/release; final owner review/testing pending. |
| 2026-10-20 | P5 retention slice: age-only detailed-log policy defaults off, validates checked edits, shows hourly schedule/protection/result and reuses manual source compaction under the Core mutation lock. Each pass inspects/compacts at most 100 attempts; a durable cursor progresses past protected records. Active/new descendants, open gates, referenced evidence and files stay protected. Failed persistence preserves data; backup recovery disables automatic cleanup to avoid restoring a stale opt-in. No Runtime/FS reclamation or quota is claimed. Server/client checks, web build and 18 retention/lifecycle/history fixtures passed, including HTTP races, failed backup, restart, source reconstruction and opt-out. Isolated candidate acceptance and final readiness remain open. |
| 2026-10-20 | P4 renderer slice: one canonical Work Overview combines managed-object views with shared approval/recovery actions; retained War Room/Cockpit URLs redirect with queries intact. Execution/diagnostic navigation groups replace competing destinations; Code Build/Relay remain contextual. Graph drawers provide canonical links, owner controls, execution actions and relationship repair. Broken Links exposes explicit valid targets and selected orphan-link previews; all-source/archived graph coverage remains available. Active producer-owned identities stay reachable after prior archive. Server/client/web checks passed, 13 graph/relationship/projection/path fixtures and 21 sidebar/operational/relationship/Code renderer checks passed; 2 typed overview contract checks passed. Isolated native navigation/Chat acceptance remains open. |
| 2026-10-20 | P4 relationship command slice: source/active/approval-aware optional anchor repair, parent-cycle/Project consistency checks, canonical link relinking and previewed exact orphan-link batches added. Link writes now use the Core lock; duplicate relinking reports merge rather than false failure. Optional removed-link identities suppress stale rebuild and sanitize backups. Server build, 12 relationship/lifecycle/deletion fixtures and existing Core/link routes/projection checks passed; UI integration and isolated acceptance remain open. Corrected new fixture Artifact kinds to the public document enum. |
| 2026-10-20 | P3 execution/dispatch slice: selected Code attempts expose canonical Run stop/history; failed dispatch retry and response forwarding prepare an editable recipient/mode/prompt form with source-message provenance. Relay contexts reuse Project owner lifecycle. Admission, runtime-bridge publication and late completion now mutate Core atomically and preserve cancellation/concurrent edits. Code startup reserves one attempt, rejects duplicate/approval/source/archived admission, cleans late sessions after cancellation and records recoverable startup failures. Explicit runtime refresh closes an ended attempt without claiming Task acceptance; approved Tasks load directly for continuation. Relay auxiliary excerpts compact at source while conversation responses remain. Server/client/web checks, 21 focused owner/execution/history/renderer checks and 28 existing Code/Relay/builder checks passed. Contextual navigation convergence remains in P4; native acceptance remains open. |
| 2026-10-20 | P3 Preview slice: Live Preview and canvas controls expose artifact-backed supervisor restart, log export and revision-bound ended-history cleanup. Unsupported restart explains its required source/artifact context. Cleanup explicitly removes host-session lease/log memory only; files, artifacts and provider evidence remain. Active/stopping/failed-stop entries are protected and changed log buffers invalidate preview. Server/client checks and 20 API/supervisor/renderer tests passed; native candidate acceptance remains scheduled. |
| 2026-10-20 | P3 Schedule slice: create/edit/duplicate, list toggle, exact rule-scoped Run history, real-execution Test fire confirmation and rule/receipt-detail cleanup preview implemented. Checked edits preserve policy fields; stale tick completion preserves newer owner configuration. Removal requires disabled/inactive/unclaimed work, compacts receipt detail and retains identities/provenance. Optional deleted-rule identities prevent stale reinsertion; file state validates future/malformed input, uses backup/atomic replacement and validated recovery. Next-minor public cleanup tightening follows ADR-133; no version bumped. Server/client checks passed and 27 schedule/history cases passed (DST, retries, concurrency, stale edits, failed backup, restart/recovery). Preview/dispatch and isolated candidate work remain open. |
| 2026-10-20 | P2 renderer slice: shared owner forms and archive/status/search filters wired into Project/Work Item/Task lists/details and Code task/artifact context. Added linked Task preparation, title-based builder continuation, Artifact selected archive/restore preview/export/context filters and knowledge search/source/active-use explanation. Task creation/linking now commits atomically. Snapshot tokens exclude projection clocks; real-file deletion/recovery and exact batch-scope checks added. Server/client checks and web build passed; 20 existing CRUD/builder/Artifact checks and 7 focused owner checks passed. Code execution/recovery controls continue in P3; isolated visual acceptance remains open. |
| 2026-10-20 | P2 command slice: shared Core eligibility/read/apply boundary added for Project/Work Item/Task/Artifact. Commands enforce source authority, active execution/approval protection, acceptance attestation, stale snapshots, valid actors, hierarchy cycles and Project consistency; external issue status/files stay independent. Deleted owner intent also sanitizes recovery backups. Server build and 18 focused planning/deletion/history/persistence cases passed (including concurrent HTTP apply). UI integration remains open. |
| 2026-10-20 | P1b renderer slice: Runs/Missions now use server filters, paging and source context; list/detail expose terminal archive/restore, export and exact-scope cleanup previews/results. Selection changes discard in-flight previews; stale apply requires another preview. Isolated renderer preview/stale/selection test passed; 11 history/persistence tests passed. Web build passed. Isolated candidate acceptance remains pending. |
| 2026-10-20 | P1b backend slice: producer/binding/origin-aware history list, filters/pagination, terminal archive/restore/export, revisioned preview/apply, descendant/protected-summary handling and bounded idempotent receipts implemented. Workflow detail is compacted at source and in projections; backup sanitization/recovery prevents resurrection while preserving transcripts/outputs. Future profile versions fail closed. Focused history/persistence HTTP, concurrency, failed-backup and restart/recovery tests passed (11). Renderer integration and isolated Desktop acceptance remain open. |
| 2026-10-20 | P1a deletion slice: Core rejects derived/active/referenced planning deletion; product DELETE validates and applies under `updateCore`, with 409 blockers and no new dangling links. Fixed snapshot normalization dropping valid WorkGraphLinks, so dependency checks also survive reload/owner mutations. Server build, 38 existing CRUD/Core/link checks and 11 focused lifecycle/Codespace/deletion checks passed. Isolated Desktop acceptance remains pending. |
| 2026-10-20 | P1a Codespaces slice: real owner pin/unpin (including sidebar), rename, archive/restore/remove, removed-items recovery, folder registration and contextual open/new/related links implemented. Active Run/Session/Preview removal is blocked, folders/outputs retained. 41 focused lifecycle/Codespace/sidebar/artifact checks passed; server/client typechecks and web build passed (Vite `--configLoader runner` avoids the sandbox's native esbuild ancestor-directory restriction). Isolated Desktop visual/write acceptance remains scheduled after the UI slices. |
| 2026-10-20 | P1a storage slice: optional versioned owner intent survives file/Chat round-trips; unsupported data preserves primary/backup; memory Core mutations serialize. Server build and 4 lifecycle persistence/recovery/concurrency tests passed; Core store tests passed. Chat store checks: 32 passed, 5 workflow/replay failures reproduced with the unchanged HEAD implementations; baseline evidence is private under the worktree's ignored `.claude/checks/`. No live profile writes. |
| 2026-10-20 | P0 approved: optional versioned lifecycle extension, atomic mutation/source authority, compatibility boundary and fixture validation scope recorded in ADR-133. Entire rollout authorized as local commits without pushing. |
| 2026-10-20 | Read-only Code/Work audit completed at `977acf1f`; owner requested a worktree and ADR/Spec/Plan. Dedicated documentation branch/worktree created. All implementation phases remain unchecked. |
| 2026-10-20 | Documentation checks passed: 7 changed/new files, 36 added local references (including the canonical sibling Runtime checkout), UTF-8/LF/final-newline checks, 25 sequential functional requirements, 12 acceptance scenarios and no completed implementation checkboxes. Index diff whitespace check passed. No application tests/builds or destructive live acceptance were run for this documentation-only slice. |

## Acceptance Evidence and Review Handoff

All writes used memory/temporary profiles or two private source-built Desktop
candidates, never the controlling Desktop profile. Native checks used the
candidate's instance-bound screenshots and bounded input bridge. An unconfirmed
navigation response was reconciled from a fresh screenshot before continuing.

| Scope | Evidence actually obtained |
| --- | --- |
| A1-A3 Codespaces | Fixtures cover inferred identity, durable owner state, active Run/Session/Preview blockers and folder preservation. Native registration, pin/sidebar, rename, archive/restore and removal were exercised; removed-item API restoration kept identity. Final native removal required confirmation, Escape cancelled, and confirmed removal left the file readable. |
| A4 source and navigation | Mixed managed/ordinary-room fixtures, list/graph tests and native default/all-source switching. Ordinary terminal room attempts stay out of the managed default and remain in System Map. Work opens one Overview with execution/diagnostic groups; old route redirects and selection contracts have focused coverage. |
| A5, A7-A9 history | Source compaction, descendants, protected summaries, stale/concurrent apply, failed persistence, retry and recovery fixtures passed. Native exact-scope cleanup retained the outcome; active cleanup was blocked. After shutdown, fresh stores plus a subsequent Chat write kept cleared logs cleared and retained transcript/artifact/file. Provider/Runtime files were outside cleanup scope. |
| A6, P2 everyday management | Source/dependency/acceptance, actor, hierarchy, batch and external-status fixtures passed. Native Work Item edit persisted. System Map exposed canonical owner/relationship controls; native Broken Links repair linked an unanchored Run to the chosen Task and removed that diagnostic. |
| A10 Schedule | 27 focused schedule/history cases cover policy/timezone/DST, duplicate/edit, admission, stale completion, receipt cleanup and backup recovery. Native create/edit forms showed the target and timezone; disabled-rule detail and exact cleanup scope were inspected. Test fire showed the real-execution warning and Escape cancelled; the isolated rule stayed disabled with no receipt. |
| A11 Preview/Code/Relay | 20 Preview cases and focused/existing execution/Relay checks exercise actual supervisor/driver delegates, stale/active cleanup protection, admission, cancellation and late completion using controlled drivers. Selected Run stop and editable retry/forward contracts have renderer coverage. No live provider dispatch or native Preview process was started. |
| A12 and P5 retention | Valid/old/future/malformed profile, backup/atomic failure, restart, cursor/batch bounds, opt-out and new-work races passed focused fixtures. Native explicit opt-in compacted one eligible ordinary-room attempt, left active evidence/output intact, and was turned off. Final candidate default-off controls and results were inspected. Recovery requires re-opt-in. |
| Shared renderer regression | Final 23 renderer/sidebar checks passed. Native Chat new/group/parallel/direct/ongoing-room composers, audience picker, avatars, transcript/agent bubble and sidebar overflow were inspected in the isolated candidate. No real message was dispatched to a provider. |

Private evidence is retained under the parent workspace `.task-artifacts/`:

| Candidate | Identity and source receipt |
| --- | --- |
| `code-work-owner-candidate-03` | Launch `64ab147993488f85750573fabb9703e0dc47d681aa0347d719b1f40a58f14805`; instance `5850a62893001dd65ff90c4ffee10b94`; Platform source digest `7f2041db47a8777e98a3b63ed601e017e20c5b3fbce8b4e16a1e3df422e55419`. Main behavioral acceptance before final presentation polish. |
| `code-work-owner-candidate-04` | Launch `40c2ff6304cadc554a3bbf5b7679ceef3cccd4854a5bda48dae517986c731910`; instance `50b49d96c98edb54a035337e61cac6ae`; Platform source digest `be757ee10f7777053f4f9bfbfc114a96155d62360534dab5c9f5f47f3ed74d7b`. All 1,812 final application/build input files matched this built snapshot byte-for-byte. |

Both launches record Platform HEAD `fb216287` plus dirty source bytes for this
final polish slice, and clean Runtime HEAD
`367f99d4d9488054954cecc08e8ed199a3441df0` (digest
`31f431242f4018fc9564a0219cb07e8161ec3afe016df6a47384aa49748e1a71`).
Each root retains `launch.json`, screenshots, `candidate-evidence.json` and
`acceptance-stop.json`; both authenticated instance-bound stops returned
`drained`, exit 0. Candidate 04 also retains `final-source-match.json`.
Private fixture credentials, profile contents and binaries are not committed.
Initial candidate attempts failed before application startup (Git ownership,
then missing Electron distribution); a checksum-verified existing Electron
41.2.0 cache was extracted privately. Shared dependencies/settings were not
changed.

Validation limits for owner review:

- Focused tests and candidate builds passed; the full local CI suite was not run.
  Before latest-main integration, five workflow/replay failures were reproduced
  with the original baseline (32 passed, 5 failed). With remote `de012803`, the
  standalone Chat store check is 30 passed/3 failed in both the integration tree
  and an unmodified remote-main archive. A standalone in-flight Core write-adapter
  case also times out after 10 seconds in both. The archive/logs are private at
  the parent `.task-artifacts/code-work-remote-baseline-de012803/`; the original
  baseline logs remain under ignored `.claude/checks/`. Remote main's hosted
  `validate` and `nodejs (24)` passed; the PR must pass its own required CI.
- PR #286's first required job timed out because async React `act` leaked
  MessagePorts in ESM test bundles. The corrected focused bundle uses real
  synchronous events/result waits, passes all 12 cases and exits naturally
  without `--test-force-exit`. Missing fixture providers, premature query
  assertions and old confirmation/active-resume expectations were also fixed.
  This test-only correction requires a new green PR CI result.
- Live provider execution, Test fire execution and native Preview startup were
  not exercised. Their driver/admission/cancellation contracts use controlled
  fixtures; no claim of live provider end-to-end acceptance is made.
- The owner's later request authorizes push and an auto-merge PR, superseding
  the original local-only hold. Everyday owner testing remains pending. Earlier
  native evidence predates integration with the participant/coordinator redesign;
  post-integration seams have focused renderer/driver/storage checks. The recorded
  breaking public/default changes require the next Platform minor (`0.9.0` or
  later) if release is later authorized, with tested migration and exact pins in
  that release change. No release is part of this integration task.

---

*Created: 2026-10-20. Last updated: 2026-10-20.*

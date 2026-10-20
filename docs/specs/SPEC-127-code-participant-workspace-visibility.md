# SPEC-127: Code Participant Workspace Visibility

## Metadata

| Field | Value |
| --- | --- |
| **Status** | Approved; sliced implementation in progress, acceptance pending |
| **Owner** | Cats Code workstream |
| **Reviewer** | Owner and Platform/Runtime integration owners; pending |
| **Decision** | [ADR-134](../decisions/134-observe-participant-workspaces-within-one-code-codespace.md) |
| **Related Plan** | [PLAN-120](../plans/PLAN-120-code-participant-workspace-visibility.md) |
| **Runtime dependency** | ADR-046 / SPEC-037 / PLAN-047 in cats-runtime |

## Summary

Show which repositories and concrete worktrees each participant has operated
within a Code conversation with one selected Codespace. All coding agents may
retain the same non-Git parent cwd. A Code-specific right side panel provides
the full view; participant popovers provide a summary and a direct entry point.
Only admitted Runtime observations establish actual work areas.

## Goals

- Support one ordinary Codespace root containing repositories at arbitrary depth.
- Show several repos or worktrees per participant with stable execution attribution.
- Distinguish startup cwd, task intent, observed checkout and current/recent activity.
- Preserve existing participant settings, permissions and worktree lifecycle rules.
- Recover truthful status after navigation, stream interruption and restart.

## Non-Goals

- Bubble badges, message metadata, per-message workspace snapshots or transcript changes.
- Selecting/configuring multiple Codespaces, root arrays or multi-root access grants.
- Cats Work labels, panels or managed-work workflow redesign.
- New agent/team/session engines, global Cat workspace properties or participant management.
- Automatic repository crawling, worktree creation/placement/adoption/cleanup or Git delivery.
- Changing the cwd automatically when an agent uses a child repo or worktree.
- General filesystem surveillance or complete tracing of arbitrary shell scripts.

## User Stories

- As the owner, I select `~/Source/cats-inc/` once and let several coding agents
  start there while seeing which member repositories they operate.
- As the owner, I can distinguish two agents using different worktrees of the
  same repository, including branch/detached state and management responsibility.
- As the owner, I can tell recent work from an operation still running, and tell
  incomplete telemetry from an agent that has not performed any observed work.

## Requirements

### FR-01: One Codespace with a common cwd

The selected directory may be non-Git. Repos at any child depth can appear after
an admitted operation identifies them. The reference scenario uses `source`
workspace mode: each agent's startup cwd remains `~/Source/cats-inc/`, while
per-command paths or `git -C` target concrete repos/worktrees.

Do not infer a cwd change from a tool path or rewrite the conversation's selected
root with a runtime lease cwd. Existing explicitly chosen managed-worktree sessions
must still display their real runtime cwd separately. Existing single-repo,
repo-subdirectory and room-owned sandbox conversations remain supported.

Observed worktree rows do not become additional selected Codespaces. Preserve
SPEC-091's projection and ADR-133's owner-controlled registration/listing state.
An observation must not undo Codespace removal/suppression or recreate purged
execution history. The active conversation's work-area facts are inspected
through existing authorized attachments without registering another Codespace.

### FR-02: Scope state to participant executions

Attribute an observation through the server-owned relationship between
conversation, participant, lane, run/turn and Runtime session. A Cat can appear
in another conversation without sharing this state. Provider/model participants
use their stored participant identities too. Under ADR-132, a bound coordinator
uses that participant's own session; do not introduce a separate orchestrator
identity or observation attachment.

Group several attached sessions under their participant and expose separate
attempts in details. Keep previous-attempt observations as recent history;
they must not become active for a replacement session. Reject orphan, foreign,
replayed or mismatched session attribution.

### FR-03: Identify repositories and physical checkouts

Use Runtime-verified repository and checkout identities, qualified by execution
location. Several linked worktrees share a repository identity but have distinct
checkout identities. Independent clones, case-sensitive paths and identical
directory names must not collapse accidentally.

Display repository label, checkout kind (`original`, `worktree`, `non-Git` or
`unknown`), branch or detached commit when known, concrete path and worktree
ownership (`Runtime-managed`, `unmanaged` or `unknown`). Missing facts remain
unknown. A `.git` file is valid worktree evidence when resolved by Runtime.
Explicit session binding may show an associated checkout with no observed
operations; label it as bound context rather than actual read/write activity.
Full paths are details; use a Codespace-relative path only when containment is
verified. Authorized paths outside it carry an explicit outside-Codespace label.

### FR-04: Distinguish intent, observation and freshness

| UI state | Required evidence |
| --- | --- |
| Task scope / 任務範圍 | Existing assigned intent; visibly separate from observed work |
| Operation running / 操作執行中 | Correlated structured operation start without a terminal event |
| Recent read/write/test / 最近操作 | Correlated completion and the supported operation classification |
| No observed activity / 尚無已觀察操作 | Available coverage with an empty observation set |
| Partial / 部分操作可見 | Runtime reports partial provider/tool coverage |
| Not reported / 未回報 | Unsupported provider coverage or absent contract |
| Connection interrupted / 連線中斷 | Product lost observation continuity; last observed time retained |

A busy participant does not make every workspace row active. Read and write
attempts must be distinguished from successful operations. Exact file counts
and test results require corresponding evidence; missing counts/results are
omitted. Unknown shell behavior must not be classified by command text alone.

Show observed-at time for retained information. On cancel/close/error or lost
continuity, an outstanding operation becomes cancelled/unknown as appropriate;
the UI must not leave an unbounded running indicator. On recovery, reconcile
the authoritative snapshot before showing current activity again.

### FR-05: Code side-panel composition

Add **Work areas / 工作區** only to started Code conversations. Reuse the
existing folder/context section for the single Codespace summary and preserve
run status, approval actions and Code preview/canvas integration.

The Work areas section lists current conversation participants, each followed by
repository groups and concrete checkout rows. Display active operations before
recent entries without reordering the participant list or stealing the selected
row. Expand a row for full paths, startup/runtime cwd, provenance, session/run
links, branch/detached state and management ownership. No participant adding,
renaming, model or role editing is introduced into this panel.

Use bounded lists with an explicit truncation indicator. Opening a row does not
run a model, recursively scan disk, change permissions or take worktree ownership.
The initial feature exposes inspection and the existing authorized open-folder
action; destructive worktree actions are outside scope.

### FR-06: Avatar summary and entry

Add a short Code-only summary to the existing participant popover, for example
`cats-runtime · worktree; cats-platform +1`, with **View work areas / 查看工作區**.
The action opens the right side panel on that participant. A fresh conversation
with no observations shows a truthful empty/not-reported summary.

Keep ADR-131/ADR-132's current participant popover, model/settings actions,
provider/model-participant behavior, hidden single-participant roster and
audience-chip fallback. Start fresh and the implicit God Cat were removed by
ADR-132 and must not return through this feature. Saved selection attention
retains its existing precedence. Do not add a second roster.

### FR-07: Interaction, layout and localization

Panel visibility is user-controlled and remembered through the existing
conversation UI preference mechanism. New activity does not open it, move focus,
select another participant or scroll the transcript. Navigation and reconnect
must not accidentally replace the selected Codespace.

Work-area controls are keyboard accessible, expose labels beyond color, support
long repo names/branches/paths, and fit supported Desktop/web widths. Reuse the
existing side-panel responsive behavior. Ship English and Traditional Chinese
copy, including partial, unavailable, stale, detached and unmanaged states.

### FR-08: Runtime ingestion and product projection

Consume Runtime SPEC-037's typed `workspace_activity` snapshots plus session
inspection data. Maintain a bounded Code read model over existing session/run
provenance. Normalize transport once; the renderer must not parse raw provider
events, assistant prose or transcript tool JSON.

Proposed Code-owned API: `GET /api/code/conversations/:conversationId/work-areas`.
It checks Code conversation ownership and returns the one selected Codespace,
participant executions, coverage/freshness and workspace rows. Transport/live
updates must use the same model and authorization. Proposed routes and fields
are not current API claims; exact integration sign-off is Phase 1 of PLAN-120.

Event ordering uses Runtime session ID, observation epoch and monotonic activity
revision within that epoch. Keep independent sessions independent. Reconnect
subscribes and reconciles a snapshot without losing events during the read; use
revisions to suppress duplicates and older arrivals. Reconcile an unknown epoch
against the current attachment before replacing state. Delete/unlink and session
replacement invalidate current status.

The product may retain bounded last-known facts in existing namespaced
session/run metadata; Runtime remains authoritative for current observations.
No per-message fields, new Core record family or global workspace registry is
required. Freeze-sensitive changes receive explicit integration review first.

### FR-09: Permissions and verification

Observation changes no cwd, tool grant, writable root, selected Codespace or
worktree cleanup policy. The panel does not promise that Codespace selection
alone confines every provider. Verification only uses already-authorized paths
and execution-location mappings; foreign or ambiguous paths remain unverified.
Worktree contents and Git metadata may require distinct authority.

Agent-created/unmanaged worktrees remain unmanaged. No local host Git probing
of remote/guest paths without a verified mapping. Do not persist commands,
source contents, credentials, remote URLs with secrets or raw provider payloads
in this read model.

### FR-10: Persistence and compatibility

Recognized existing data without observations opens normally with an unavailable
or empty coverage state, never fabricated activity. Persisted observations restored
after a restart are last-known until reconciled. Retention is bounded and tied to
existing conversation/session deletion rules.

Before changing a persisted schema, document and test validation, backup, atomic
replacement, interrupted-write/restart behavior and failure recovery. Use a
one-time migration when required; do not retain obsolete execution APIs. A
breaking public/persisted contract requires the next 0.x minor (or stable major).
This planning task authorizes no version change or publication.

## Design Overview

```text
Runtime tool/provider observations + verified Git identity
    -> per-session activity snapshot and revision
    -> shared normalized transport, server-owned execution attribution
    -> Code participant work-area projection
    -> right side panel + existing avatar popover summary
```

Example panel (illustrative data only, never written to a real profile):

```text
Codespace  ~/Source/cats-inc/

Work areas
  Codex       Running             cwd: cats-inc/
    cats-runtime   Worktree / feat/multi-root   Test running
    cats-platform  Original checkout           Recent read
  Claude      Reviewing           cwd: cats-inc/
    cats-runtime   Worktree / feat/multi-root   Recent read
```

The checkout operation and the participant's overall run state are separate.
A reused worktree path gets fresh identity verification before current claims.
The panel is an inspection surface; existing runtime/Git ownership governs actions.

## Acceptance Criteria

| ID | Scenario and expected result |
| --- | --- |
| AC-01 | A non-Git `cats-inc` root starts two agents with identical cwd; separate repo operations appear without changing either cwd or the binding. |
| AC-02 | A repo four levels down is discovered from an observed operation without a recursive root scan. |
| AC-03 | One agent reads two repos and operates two worktrees of one repo; all distinct checkouts remain visible under that participant. |
| AC-04 | Another agent reviews an existing worktree; both views identify the same physical checkout with separately attributed operations and unchanged management ownership. |
| AC-05 | Worktree `.git` files, detached HEAD, branch changes, moved/deleted paths and non-Git folders render verified facts or explicit unknown states. |
| AC-06 | Unsupported/partial providers, generic shell commands, failed writes and missing tool results never manufacture modifications or test success. |
| AC-07 | Duplicate/out-of-order events, two sessions, session replacement, cancellation, disconnect and restart do not leak or revive stale running status. |
| AC-08 | The same Cat in another conversation, provider/model participants and the bound coordinator have correct isolated attribution; foreign-session observations and a separate coordinator attachment are rejected. |
| AC-09 | Avatar entry selects the matching panel row; model settings, attention marks, single-participant fallback, approvals and preview still behave as before. |
| AC-10 | Opening/streaming work areas neither modifies bubbles nor adds multiple Codespace selection; Chat and Work retain their surfaces. |
| AC-11 | Long paths, localization, keyboard control, narrow layout and user-controlled panel state pass bounded renderer/Desktop acceptance. |
| AC-12 | Old data and restart/failure recovery preserve user records; no tests or mockups write to the user's real profile. |
| AC-13 | Observations respect ADR-133 Codespace removal/suppression and source-aware history cleanup; they never recreate deleted product records or grants. |

## Dependencies and Review Gates

- Runtime [SPEC-037](https://github.com/cats-inc/cats-runtime/blob/main/docs/specs/SPEC-037-session-workspace-activity.md)
  and [PLAN-047](https://github.com/cats-inc/cats-runtime/blob/main/docs/plans/PLAN-047-session-workspace-activity.md).
- Explicit shared transport/attribution review under the product integration guide.
- Existing Codespaces, session policy, operator/run views and avatar contracts.
- Independent architecture/implementation review before acceptance; this draft
  does not claim provider or native UI validation.

## Open Questions

- [ ] Confirm exact shared transport callback and session metadata persistence
  seam without broadening Core or Chat contracts unnecessarily.
- [ ] Select the first native provider adapter with fixture evidence for actual
  operation paths; keep other providers visibly partial/unavailable until verified.
- [ ] Confirm the existing panel preference key and responsive behavior to reuse.

## References

- [ADR-134](../decisions/134-observe-participant-workspaces-within-one-code-codespace.md)
- [PLAN-120](../plans/PLAN-120-code-participant-workspace-visibility.md)
- [SPEC-091](SPEC-091-cats-code-workspace-and-artifact-sidebar.md)
- [ADR-132](../decisions/132-separate-participants-audience-and-the-orchestrator-binding.md)
- [ADR-133](../decisions/133-give-code-and-work-owner-actions-and-source-aware-lifecycle.md)
- [Product integration guide](../product-integration-guide.md)

---

*Created: 2026-10-20*

# ADR-134: Observe Participant Workspaces Within One Code Codespace

## Status

Accepted for implementation, 2026-10-20. The owner authorized sliced implementation
and incremental commits after PR #289 passed CI and merged. Implementation is in
progress; acceptance remains pending. Companion documents:
[SPEC-127](../specs/SPEC-127-code-participant-workspace-visibility.md)
and [PLAN-120](../plans/PLAN-120-code-participant-workspace-visibility.md).

The owner reserved ADR-133, SPEC-126 and PLAN-119 for another workstream.
This proposal uses ADR-134, SPEC-127 and PLAN-120 without editing that work.

## Context

A Team Code conversation can select `~/Source/cats-inc/` as its one Codespace.
That directory need not be a Git repository. Its coding agents can all start
with that same cwd while reading or changing `cats-runtime`, `cats-platform`
and other repositories beneath it. Repositories can be nested at arbitrary
depths. An agent may also operate several checkouts or worktrees in one run.

The current single selected path and session cwd do not describe those actions.
Runtime's `source` workspace accepts an ordinary directory. Its managed
`worktree` mode instead resolves one containing Git repository and changes the
session's runtime cwd to a Runtime-owned worktree. These are separate execution
choices; this proposal must not silently replace the shared parent cwd with a
repo or worktree cwd.

Code already has Codespaces projections under SPEC-091 and owner-controlled
registration/listing lifecycle under ADR-133. Started conversations share
folder/run-status side-panel composition. ADR-131 places participant settings
on avatars and removes participant administration from side panels; ADR-132
makes coordination a binding on an existing participant's own session.
Extend these contracts with Code execution visibility without creating another
roster, coordinator session, editor or agent registry.

The owner explicitly deferred bubble-level workspace information and multiple
selected Codespaces. Cats Work terminology and UI are outside this slice.

## Decision

### 1. Keep one Codespace and distinguish execution observations

Keep the existing single selected Codespace binding. Do not require its root,
an agent's startup cwd and a Git checkout root to be equal.

Treat a participant's work areas as an observed set scoped to this conversation
and its attached lane/run/session identities. One participant can have several
repos, several worktrees of one repo, and ordinary non-Git directory operations.
Do not attach this state to the global Cat identity.

An observation neither selects another Codespace nor grants another filesystem
root. It also does not create a Project, Work Item or Task just to display a row.
Respect ADR-133 registration removal, suppression and history cleanup; observing
a checkout must not recreate a removed Codespace or a purged execution record.

### 2. Put the complete view in the Code conversation's right side panel

Add a Code-owned read-only **Work areas / 工作區** section. Group rows by
conversation participant, then repository and concrete checkout. Show repository
identity first, then original-checkout/worktree kind, branch or detached HEAD,
observed operation, freshness and worktree management responsibility.

Keep the selected Codespace summary visible through the existing folder/context
affordance. Show a short label; put full paths in details. Preserve run status,
approvals, preview/canvas behavior and the user's panel open/closed state.
New events must not open the panel, move focus or change its selected row.

This narrowly amends ADR-131's side-panel rule for Code execution inspection.
It does not restore participant adding, renaming, model editing or role editing
to a side panel. Chat and Work keep their current behavior.

### 3. Use avatars for a summary and a contextual entry point

Extend the Code participant popover with a compact work-area summary and
**View work areas / 查看工作區**. The action opens the Code panel and selects
the participant's execution rows. Preserve the existing model/settings actions,
saved-selection attention behavior and single-participant audience-chip fallback.
Do not add a second permanent avatar roster or change the audience chip's job.

### 4. Require evidence and distinguish observation from intent

Runtime owns provider-neutral session workspace observations and Git identity
resolution. Platform maps session facts to the conversation's participant and
renders the projection. Runtime must not depend on Code routes or Cat identity.

Separate task intent from observed operations. A busy agent is not proof that it
is editing every listed repository. Only a currently observed running operation
can use a present-tense activity label; completed operations become recent work.
Missing, partial or disconnected coverage must be visible. Free-form assistant
text and generic shell command strings are not authoritative repository evidence.

Use the companion Runtime proposal, ADR-046 / SPEC-037 / PLAN-047. Keep the
public contract provider-neutral and additive. Integrate shared transport/state
seams explicitly; keep the Code projection and UI in the Code product tree.

### 5. Preserve worktree and permission ownership

Distinguish the Git repository from each physical checkout. Several worktrees
share a repository identity but retain different checkout identities and branches.
Use verified Git metadata, including `.git` files, rather than directory names.

An agent-created worktree remains unmanaged unless an independently authorized
lifecycle operation takes ownership. Observation grants no create, commit,
merge, delete, cleanup or broader shell permission. External/Runtime-managed
worktrees may be displayed when already authorized and verifiable; a path outside
the selected Codespace must be labeled explicitly and never silently authorized.

## Consequences

### Positive

- A shared parent cwd supports the Cats repositories without obscuring which
  checkout each agent actually used.
- The user can inspect several agents and worktrees together with stable
  participant attribution and honest freshness.
- Existing avatar settings, shared conversation semantics and worktree cleanup
  responsibilities remain coherent.

### Negative

- Runtime observation and provider coverage work is required; a UI-only change
  cannot provide reliable actual-workspace status.
- Some providers and shell actions will initially show partial or unavailable
  information. Coverage must be validated individually.
- Shared stream ingestion and persisted snapshots require integration review and
  focused lifecycle/upgrade tests.

### Neutral

- Bubble metadata, per-message snapshots and multiple selected Codespaces remain
  deferred. They are not prerequisites for this slice.
- No version bump or publication is authorized by these planning documents.

## Alternatives Considered

### Require every cwd to be a repository root

Simple for one repository, but it prevents the requested common-parent cwd and
does not describe operations on several repositories or sibling worktrees.

### Put all information in avatar popovers

Compact, but transient popovers make team-wide comparison and inspection of
several worktrees difficult. Retain them as summary and navigation entry points.

### Put workspace labels beside every bubble

Useful for historical provenance, but explicitly deferred by the owner. This
proposal makes no message/bubble schema or renderer changes.

### Infer work areas from text, cwd or recursive repository discovery

Cwd describes an execution starting point, prose describes intent, and a disk
scan describes what exists. None proves which checkout an agent operated.
Resolve repository identity only for admitted observations and selected context.

## References

- [SPEC-127](../specs/SPEC-127-code-participant-workspace-visibility.md)
- [PLAN-120](../plans/PLAN-120-code-participant-workspace-visibility.md)
- [SPEC-091: Codespaces and Artifacts](../specs/SPEC-091-cats-code-workspace-and-artifact-sidebar.md)
- [ADR-131: Audience chip and avatar responsibilities](131-let-the-audience-chip-choose-the-audience-and-the-avatar-choose-the-model.md)
- [ADR-132: Participants, audience and coordinator binding](132-separate-participants-audience-and-the-orchestrator-binding.md)
- [ADR-133: Owner actions and source-aware lifecycle](133-give-code-and-work-owner-actions-and-source-aware-lifecycle.md)
- [Product integration guide](../product-integration-guide.md)
- [Runtime SPEC-037](https://github.com/cats-inc/cats-runtime/blob/main/docs/specs/SPEC-037-session-workspace-activity.md)

---

*Proposed: 2026-10-20*
*Decision authority: Owner; integration review pending*

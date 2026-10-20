# PLAN-120: Code Participant Workspace Visibility

## Metadata

| Field | Value |
| --- | --- |
| **Status** | In Progress; owner-authorized sliced implementation, acceptance pending |
| **Owner** | Cats Code workstream |
| **Reviewer** | Owner and Platform/Runtime integration owners; pending |
| **Spec** | [SPEC-127](../specs/SPEC-127-code-participant-workspace-visibility.md) |
| **Decision** | [ADR-134](../decisions/134-observe-participant-workspaces-within-one-code-codespace.md) |
| **Runtime dependency** | ADR-046 / SPEC-037 / PLAN-047 in cats-runtime |

## Overview

Implement evidence-backed repo/worktree visibility for one Code conversation's
participants. Preserve one Codespace and the common parent cwd. Use the right
side panel for complete inspection and existing avatar popovers for summaries
and navigation. Bubble information and multiple selected Codespaces are excluded.

The owner authorized implementation and incremental commits after PR #289 passed
CI and merged. Both main checkouts were pulled before worktrees were created.
Version changes and publication remain separately authorized. ADR-133 / SPEC-126 /
PLAN-119 belong to another workstream and remain governing integration constraints.

## Delivery Slices

| Slice | Repository and deliverable | State |
| --- | --- | --- |
| S1 | Runtime activity types and admitted repo/worktree identity | In progress |
| S2 | Runtime bounded reducer, ordering, snapshot validation and inactive restore | Pending |
| S3 | Runtime local-tool observation, session lifecycle, transport and checkpoint integration | Pending |
| S4 | Native provider structured evidence, coverage and fixture/native checks | Pending |
| S5 | Platform participant attribution, work-area API and live projection | Pending |
| S6 | Code right panel, avatar entry, localization and renderer regressions | Pending |
| S7 | Cross-repository native acceptance, recovery/privacy and documentation reconciliation | Pending |

Each slice receives scoped validation and a separate commit. The one-Codespace,
common-cwd, no-bubble and no-extra-grant requirements apply throughout delivery.

## Implementation Phases

### Phase 1: Agree on observation and integration contracts

- [ ] Review ADR-134 / SPEC-127 with the Runtime SPEC-037 snapshot, coverage,
  identity, ordering, retention and lifecycle rules.
- [ ] Map conversation/participant/lane/run/session attribution using existing
  server-owned bindings, including provider/model participants and ADR-132's
  coordinator binding to a participant's own session.
- [ ] Agree the proposed Code-owned work-areas read route and live-update seam;
  review any changes to frozen/shared contracts before implementation.
- [ ] Inventory real provider operation payloads and coverage. Select one
  fixture-backed native provider slice alongside Runtime-owned local tools.
- [ ] Define bounded session metadata storage and audit existing snapshot upgrade
  handling. Specify tested migration/recovery if a persisted schema must change.
- [ ] Review the narrow ADR-131 amendment: Code execution inspection only, with
  participant administration remaining in the existing avatar/composer flow.
- [ ] Preserve ADR-133's owner-controlled Codespace registration, suppression
  and source-aware history cleanup; observations cannot recreate removed records.

**Deliverable:** Reviewed cross-repository contract and acceptance fixture matrix.
No dependency on multi-root settings or message schema changes is permitted.

### Phase 2: Ingest Runtime facts and build the Code read model

- [ ] Consume Runtime `workspace_activity` and inspection snapshots through one
  normalized transport; do not parse raw provider data in Code or the renderer.
- [ ] Add bounded namespaced last-known observations to the selected session/run
  metadata seam, with stale-on-restart behavior and existing deletion retention.
- [ ] Implement conversation-participant grouping and stable repository/checkout
  identity; keep independent sessions/revisions and intent vs observation separate.
- [ ] Implement the Code API delegate route with ownership checks and limits.
- [ ] Handle duplicate/out-of-order delivery, reconnect/read races, cancellation,
  session replacement and foreign-session attempts.
- [ ] Add focused model, API and cross-layer consumer tests against isolated stores.

**Deliverable:** Authenticated Code work-area projections recover without
changing cwd, selected root, permissions or worktree ownership.

### Phase 3: Compose the Code panel and avatar entry

- [ ] Add Code-owned work-area contracts, view model and renderer components.
- [ ] Use the existing `ConversationView` section composition seam; expose only
  the minimal generic extension hooks needed for Code, without Code imports in
  Core/platform/shared layers.
- [ ] Preserve the folder/context summary, run status, approvals and preview/canvas.
- [ ] Render participant -> repository -> checkout rows, current/recent operations,
  coverage/freshness, branch/detached state and managed/unmanaged details.
- [ ] Add a Code-only summary and entry action to the existing participant
  popover. Preserve model editing, attention marks and one-participant fallback.
- [ ] Reuse user-controlled panel state, keyboard/focus behavior and responsive
  composition. Do not reopen or refocus on incoming activity.
- [ ] Add English/Traditional Chinese copy and focused renderer tests.

**Deliverable:** Inspectable team work areas with no bubble or multi-Codespace UI.

### Phase 4: Verify the Cats repositories scenario and integration

- [ ] Use an isolated synthetic `cats-inc` directory with two repos, a deeply
  nested repo, two linked worktrees and a non-Git folder. Do not use real source
  checkouts for write-based fixtures or the controlling user's persisted state.
- [ ] Start two agents/sessions with the same root cwd and verify per-repo and
  worktree evidence without a cwd rewrite.
- [ ] Verify one agent across several repos and two worktrees of the same repo;
  verify review of an existing worktree by another participant.
- [ ] Verify a bound coordinator uses its participant's own observations and
  owner removal/history cleanup is not reversed by observation refresh.
- [ ] Exercise partial/unavailable providers, ambiguous shell operations,
  branch/path changes, close/cancel, reconnect and restart.
- [ ] Inspect the real isolated Code renderer for avatar entry, panel selection,
  localization, long paths, narrow layout and preview/approval coexistence.
- [ ] Confirm Chat/Work and message/bubble behavior are unchanged through focused
  consumer and boundary checks.
- [ ] Obtain independent review and record actual provider/OS evidence and limits.

**Deliverable:** SPEC-127 AC-01 through AC-13 evidence, with unsupported cases
explicitly reported. Fixture passes do not count as native provider acceptance.

### Phase 5: Documentation and compatibility readiness

- [ ] Update product API/integration documentation for the implemented contract.
- [ ] Reconcile this plan, spec, ADR and Runtime companion statuses.
- [ ] Record migration and required version boundary, if any, before a separately
  authorized release; do not bump versions or publish as part of this plan.

## Files to Create/Modify

Candidates for implementation review, not changes made by this planning task:

| Surface | Intended change |
| --- | --- |
| `src/products/code/shared/` | Product work-area read contracts and view-model helpers |
| `src/products/code/state/` | Attributed bounded projection over session/run facts |
| `src/products/code/api/` | Code-owned read route and validation |
| `src/products/code/renderer/AppRoutes.tsx` | Opt into Code panel/popover composition |
| `src/products/code/renderer/components/` | Work-area section, details and summary |
| `src/products/shared/renderer/components/conversation-view/` | Minimal opt-in section/selection hooks, if required |
| `src/products/shared/renderer/components/ParticipantTargetPopover.tsx` | Optional Code summary/entry slot; existing settings preserved |
| `src/runtime/` and shared Runtime event ingestion | Typed observation transport; explicit integration review |
| Existing session/run metadata persistence seam | Bounded last-known snapshot and recovery rules |
| `src/shared/i18n/` | English and Traditional Chinese copy |
| `tests/` | Projection/API/transport/renderer and compatibility regressions |

## Technical Decisions

- Runtime owns actual workspace facts; Code owns conversation participant mapping
  and presentation. Generic shared layers receive injected hooks, not product imports.
- Retain a single Codespace binding. Observed checkout collections are not a
  multi-Codespace configuration API and convey no authority.
- Use read-only inspection in the side panel, preserving ADR-131's settings locations.
- Use per-session observation epochs/revisions and explicit freshness rather
  than timestamp sorting across sessions or polling Git on every render.
- Worktree ownership and cleanup remain with their existing lifecycle owner.

## Testing Strategy

Documentation-only preparation: check links, numbering, scope and diffs; no
application test or build is required or claimed in this task.

Implementation validation is scoped by phase:

- Model/API: isolated stores, verified identities, attribution, ordering,
  coverage, limits, privacy and retained-state recovery.
- Transport: Runtime fixtures consumed by Platform; generic shell and unsupported
  provider cases remain explicitly incomplete.
- Renderer: panel composition, entry selection, no focus theft, avatar settings,
  attention states and no message/bubble metadata.
- Affected builds/type checks only after implementation, including browser/server
  import boundaries when shared hooks change. Reuse passing checks for unchanged inputs.
- Native acceptance: one named provider/OS at a time using isolated profiles,
  matching structured evidence to the visible repo/worktree. Never write demo
  conversations or observations into the user's running profile.

Existing regressions to consider include `code-workspace-resolution.test.js`,
`code-draft-session-policy-chain.test.tsx`, `participant-avatar-popover.test.tsx`
and `channel-participant-target.test.js`. New tests must cover behavior rather
than mirror implementation structure.

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Provider streams omit operation paths | Validate coverage per adapter; show partial/not reported |
| Restored data looks live | Restore last-known only; reconcile Runtime before active labels |
| Reused paths or similarly named repos collapse | Verified physical checkout identity qualified by execution location |
| Code UI changes global participant administration | Opt-in Code hooks and ADR-131 regression checks |
| Observations broaden authority or adopt worktrees | Keep inspection read-only and lifecycle ownership explicit |
| Unbounded snapshots or disk crawling | Caps, truncation and observation-driven bounded resolution |

## Progress Log

| Date | Update |
| --- | --- |
| 2026-10-20 | Created ADR-134 / SPEC-127 / PLAN-120 and the Runtime companion proposal. Scope is one Codespace, participant work areas, panel and avatar entry; bubbles and multiple selected Codespaces are deferred. Implementation and native acceptance have not started. |
| 2026-10-20 | Initial documentation validation passed: 34 references across the six new Platform/Runtime documents resolved against the local worktrees; numbering, index entries, LF/final newlines and code fences checked. Both repositories passed `git diff --check`. No application tests, builds or live acceptance were run for this docs-only task. |
| 2026-10-20 | Preparing owner-authorized direct-main commit/push against updated Platform main `f3bef166`. Reconciled the proposal with ADR-132 participant/coordinator semantics and ADR-133 owner lifecycle; reserved workstream documents remain unchanged. Implementation remains out of scope. |
| 2026-10-20 | Latest-main integration validation passed: preserved both upstream feature commits and their ADR/SPEC/PLAN documents, merged index additions from both workstreams, resolved 38 references across the six new documents and passed whitespace checks. This remains a documentation-only delivery; no application tests or builds were run. |
| 2026-10-20 | Owner authorized sliced implementation and incremental commits. PR #289 was verified merged at `8bb3fd2f` with changes/validate/nodejs CI successful; both main checkouts pulled cleanly. Platform worktree `plan120-work-areas` starts at that merge commit. Runtime S1 and independent contract review are in progress. |

---

*Created: 2026-10-20*

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
| S1 | Runtime activity types and admitted repo/worktree identity | Complete; Runtime `5300ed77`, 15 focused tests |
| S2 | Runtime bounded reducer, ordering, snapshot validation and inactive reattachment | Complete; Runtime `cfa4c044`, 11 focused tests and typecheck passed |
| S3 | Runtime local-tool observation, session lifecycle, transport and memory-only restart checks | Complete; Runtime `de219b6f`, scoped suites/typecheck and independent review passed |
| S4 | Native provider structured evidence, coverage and fixture/native checks | Complete; Runtime `57b449e3`, isolated Windows Claude 2.1.304 native evidence, scoped tests/typecheck and independent review |
| S5 | Platform participant attribution, work-area API and live projection | Complete; 28 focused tests, server/renderer/test typechecks and independent review passed |
| S6 | Code right panel, avatar entry, localization and renderer regressions | Complete; seven renderer regressions, 49 existing consumer tests, affected typecheck and candidate builds passed; visual acceptance in S7 |
| S7 | Cross-repository native acceptance, recovery/privacy and documentation reconciliation | Identity hardening and two-session HTTP projection passed; final Electron work-area visual acceptance incomplete |

Each slice receives scoped validation and a separate commit. The one-Codespace,
common-cwd, no-bubble and no-extra-grant requirements apply throughout delivery.

## Implementation Phases

### Phase 1: Agree on observation and integration contracts

- [x] Review ADR-134 / SPEC-127 with the Runtime SPEC-037 snapshot, coverage,
  identity, ordering, retention and lifecycle rules.
- [x] Map conversation/participant/lane/run/session attribution using existing
  server-owned bindings, including provider/model participants and ADR-132's
  coordinator binding to a participant's own session.
- [x] Agree the Code-owned work-areas read route and live-update seam;
  review any changes to frozen/shared contracts before implementation.
- [x] Inventory real provider operation payloads and coverage. Select one
  fixture-backed native provider slice alongside Runtime-owned local tools.
- [x] Define bounded memory-only observation retention. Runtime/Code introduce no
  persisted observation schema; restart reports no activity until reattachment.
  Any future persisted format requires tested migration/recovery.
- [x] Review the narrow ADR-131 amendment: Code execution inspection only, with
  participant administration remaining in the existing avatar/composer flow.
- [x] Preserve ADR-133's owner-controlled Codespace registration, suppression
  and source-aware history cleanup; observations cannot recreate removed records.

**Deliverable:** Reviewed cross-repository contract and acceptance fixture matrix.
No dependency on multi-root settings or message schema changes is permitted.

### Phase 2: Ingest Runtime facts and build the Code read model

- [x] Consume Runtime `workspace_activity` and inspection snapshots through one
  normalized transport; do not parse raw provider data in Code or the renderer.
- [x] Keep bounded last-known observations in memory, keyed by conversation,
  canonical participant, session and attachment start. Restart does not restore facts.
- [x] Implement conversation-participant grouping and stable repository/checkout
  identity; keep independent sessions/revisions and intent vs observation separate.
- [x] Implement the Code API delegate route with ownership checks and limits.
- [x] Handle duplicate/out-of-order delivery, reconnect/read races, cancellation,
  session replacement and foreign-session attempts.
- [x] Add focused model, API and cross-layer consumer tests against isolated stores.

**Deliverable:** Authenticated Code work-area projections recover without
changing cwd, selected root, permissions or worktree ownership.

### Phase 3: Compose the Code panel and avatar entry

- [x] Add Code-owned work-area contracts, view model and renderer components.
- [x] Use the existing `ConversationView` section composition seam; expose only
  the minimal generic extension hooks needed for Code, without Code imports in
  Core/platform/shared layers.
- [x] Preserve the folder/context summary, run status, approvals and preview/canvas.
- [x] Render participant -> repository -> checkout rows, current/recent operations,
  coverage/freshness, branch/detached state and managed/unmanaged details.
- [x] Add a Code-only summary and entry action to the existing participant
  popover. Preserve model editing, attention marks and one-participant fallback.
- [x] Reuse user-controlled panel state, keyboard/focus behavior and responsive
  composition. Do not reopen or refocus on incoming activity.
- [x] Add English/Traditional Chinese copy and focused renderer tests.

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

## S5 Integration Contract

The generic read-only execution inspector is implemented by the existing
conversation engine. The host injects it and the selected Runtime client into
Code's read model. Frozen Core, orchestration, routing and Chat API contracts
remain unchanged. Inspection reads existing stores without repair or writes.

Runtime run IDs are separate from Platform turn/lane IDs. Only immutable
`inspection.currentRun/lastRun.wake.metadata` captured when a Runtime run began
can correlate them, and only after an exact match against server-owned
conversation/channel/participant/turn/lane/target bindings. Mutable session
context and timestamps confer no attribution. Owner run/mission deletion or
log-clear entries invalidate both workflow and retained Core fallback bindings.

The Code route serves JSON and `Accept: text/event-stream` from the same
projection. It subscribes before inspection, reconciles unknown epochs, rejects
late inspections across an epoch change, and revalidates authority after awaits.
Two-second reconciliation also catches idle Chat-only lease/owner changes.
Backpressured delivery has one in-flight and one latest pending projection, so
revocation and Runtime stream cleanup continue while an output is stalled.

Limits: 32 participants, four retained attempts per participant, 32 bindings per
attempt, 128 observation cache entries, four unresolved Runtime inspections,
32 live Runtime subscriptions, eight watchers/deliveries, 32 inspected attempts
per refresh and a 256 KiB aggregate response. Runtime's stricter per-session
limits also apply. Unknown execution mappings are omitted and coverage becomes
partial; retained running operations display unknown unless the exact active
engine binding and reconciled current Runtime run agree.

## S6 Renderer Contract

Code composes the existing conversation view with a Work areas section and a
generic optional participant inspection action. Both existing top-bar avatars
and the single-participant audience chip use the same editor/action path. The
baseline currently renders a single participant's top-bar avatar; this feature
preserves that behavior rather than adding or hiding a roster.

The browser validates the complete nested Code projection and UTF-8 byte limit.
Native EventSource owns reconnect; errors deactivate retained running operations,
and revocation clears facts. Explicit avatar navigation holds one pending focus
request, consumes it when the participant appears, and never replays it on live
updates or manual panel reopening. Existing preview, operator/approval and bubble
composition stays intact.

The existing panel had local component state, without a durable preference key.
Code now opts into a generic controlled-state seam and stores only open/section
UI preferences, scoped by profile and conversation (64 entries / 16 KiB UTF-8).
Disabled storage, including a throwing getter, does not block inspection. Paths,
operations and provider payloads are never put in this preference cache.

All observed checkout paths remain full paths with an explicitly unverified
Codespace relationship. The original Codespace folder action is retained; no
observed path is opened on the host without verified execution-location mapping.

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
| 2026-10-20 | Delivery checkpoint: two isolated participants consumed Runtime observations through the actual HTTP client and Code projection with one common cwd, a fourth-level repo, two linked worktrees, multiple repos and the same physical checkout under both participants. Runtime identity replacement/submodule fixtures passed (18 tests; one case-sensitive-filesystem capability skip). The source candidate built Runtime/server/Desktop/Vite and started successfully. Final work-area visual acceptance did not complete because the separate isolated Electron harness exited before UI evidence was produced. The owner requested commit and auto-merge PR delivery; no visual pass or full-suite local pass is claimed. |
| 2026-10-20 | S6 adds Code panel/popover composition, strict nested projection validation, native EventSource recovery, consumed explicit focus requests and scoped bounded UI preferences. Seven isolated renderer tests passed, including disconnect/reconnect, foreign events, pending focus, no focus theft, preference restoration/isolation, disabled storage, malformed/oversized UTF-8 data, localization and transcript preservation. Affected test/source typecheck and 49 existing Chat/avatar/preview regressions passed. The isolated candidate compiled Runtime, Platform server/Desktop and Vite renderer and started both services. Independent source review found no remaining blocker. Initial test diagnostics exhausted memory while diffing DOM objects; bounded boolean assertions exposed incorrect fixture expectations, now corrected. Native visual acceptance remains S7. |
| 2026-10-20 | S5 implemented the read-only engine inspector, immutable Runtime-run attribution, bounded memory projection and owner-checked JSON/SSE route. 28 focused tests passed; the final active-turn/path guard rerun passed 17 affected tests. Server, renderer and test TypeScript checks passed. Independent review reproduced and verified fixes for same-session lane replacement, epoch rollback, stalled NDJSON consumers and stalled SSE revocation. Real MemoryChatStore tests cover run/mission logs/deletion and retained Core fallback. No user profile writes or persistence migration. S6/S7 remain pending. |
| 2026-10-20 | Created ADR-134 / SPEC-127 / PLAN-120 and the Runtime companion proposal. Scope is one Codespace, participant work areas, panel and avatar entry; bubbles and multiple selected Codespaces are deferred. Implementation and native acceptance have not started. |
| 2026-10-20 | Initial documentation validation passed: 34 references across the six new Platform/Runtime documents resolved against the local worktrees; numbering, index entries, LF/final newlines and code fences checked. Both repositories passed `git diff --check`. No application tests, builds or live acceptance were run for this docs-only task. |
| 2026-10-20 | Preparing owner-authorized direct-main commit/push against updated Platform main `f3bef166`. Reconciled the proposal with ADR-132 participant/coordinator semantics and ADR-133 owner lifecycle; reserved workstream documents remain unchanged. Implementation remains out of scope. |
| 2026-10-20 | Latest-main integration validation passed: preserved both upstream feature commits and their ADR/SPEC/PLAN documents, merged index additions from both workstreams, resolved 38 references across the six new documents and passed whitespace checks. This remains a documentation-only delivery; no application tests or builds were run. |
| 2026-10-20 | Owner authorized sliced implementation and incremental commits. PR #289 was verified merged at `8bb3fd2f` with changes/validate/nodejs CI successful; both main checkouts pulled cleanly. Platform worktree `plan120-work-areas` starts at that merge commit. Runtime S1 and independent contract review are in progress. |
| 2026-10-20 | Runtime S1–S4 are committed as `5300ed77`, `cfa4c044`, `de219b6f` and `57b449e3`. Admitted local tools and native Claude direct Read/Write/Edit now expose bounded memory-only snapshots through inspection/NDJSON/SSE. Two isolated Windows Claude Code 2.1.304 conversations shared a non-Git parent cwd; live/captured evidence covered a deep repo, an existing unmanaged worktree, successful Read/Write/Edit and a failed Read. Runtime retains redacted native frames and a live snapshot for consumer fixtures. Scoped tests, TypeScript and independent review passed; no all-provider/OS, Platform attribution or renderer acceptance is claimed. S5–S7 remain pending. |

---

*Created: 2026-10-20*

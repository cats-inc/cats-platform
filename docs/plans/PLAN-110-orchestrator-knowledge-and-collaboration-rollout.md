# PLAN-110: Orchestrator Knowledge and Collaboration Rollout

## Metadata

| Field | Value |
|-------|-------|
| Status | In progress; isolated native K2/K3, K3 saved-state projections and full CI pass; content-profile/practice gates open |
| Owner | Platform integration; Chat and Work own their operation delegates |
| Reviewer | Independent Codex contract and implementation review; product owner |
| Last updated | 2026-09-25 |

## Related Spec

[SPEC-118](../specs/SPEC-118-orchestrator-knowledge-and-collaboration-operations.md)
defines the requirements and acceptance scenario.
[ADR-119](../decisions/119-share-product-knowledge-and-role-procedures-with-supervised-agents.md)
records the shared knowledge/procedure decision. This is a consumer/operation
workstream related to [PLAN-109](PLAN-109-cats-self-development-and-catlas-practice.md),
not a replacement for its preview development or practice/promotion gates.

## Resume Checkpoint (2026-09-25)

The owner requested short, continuous slices with durable checkpoints so a
session reset does not lose work. Continue from this section; do not restart
already completed model runs. Read workspace/member `AGENTS.md`, `CODEX.md`,
[the collaboration guide](../AGENT-GUIDE.md), this plan and its linked SPEC/ADR
before changing the owning repository. Direct commit/push to `main` is authorized;
no release, version bump or publication is authorized.

- **Completed slices:** bounded K3 coordination, implementation, revision capture,
  independent review and final feedback pass with **61,033 tokens** in a private
  Windows/Codex 0.156.1 / `gpt-6-astra` profile. Duplicate confirmation preserves
  identities; source fixture unchanged; temporary auth copy removed. This is
  the fifth continuation attempt, not a new task to rerun after reset. Successful
  saved-state Chat/Work native projections also pass; the Desktop candidate and
  its two sidecars are closed.
- **Code/validation:** Platform server build and 53 latest collaboration/prompt
  regressions pass; independent reviews cover the continuation, role grants and
  private context reduction. Runtime commits `e43d421` / `a694104` are on main;
  [Runtime full CI passes](https://github.com/cats-inc/cats-runtime/actions/runs/36080164885).
  Platform continuation is on main as `471755c9`; its
  [full CI passes](https://github.com/cats-inc/cats-platform/actions/runs/36082102563).
  Evidence-only checkpoint `88a2716f` records the completed native projection.
- **Completed K2 context slice:** K2 now reuses the existing same-session delivery helper with
  an explicit four-result bound; K3 retains eight. Server compilation, test
  typechecking, 92 focused cases, actual wire recapture and independent review
  pass. Commit `14c080fc` is on main and its
  [full CI passes](https://github.com/cats-inc/cats-platform/actions/runs/36084948721),
  including `validate`, `nodejs (24)`, full typechecks and tests.
  No native model call, budget/grant change or new tool is part of this slice.
- **Completed host-budget slice:** the reviewed contract now gives the opt-in host
  an explicit immutable preparation policy. Defaults remain 30 seconds/8,000
  tokens; documented configuration ceilings are 300 seconds/80,000 tokens.
  Three regression cases fail against the prior build; server compilation,
  test typechecking, all 190 focused cases and independent implementation review
  pass. Commit `cc5d07ad` is on main and its
  [full CI passes](https://github.com/cats-inc/cats-platform/actions/runs/36089146521).
  That host-budget slice changed no normal host setting and ran no native inference.
- **Completed K2 native slice:** the real authenticated Chat path produces actual
  model-driven discovery, context inspection, preparation and final feedback in
  one read-only Codex/`gpt-6-astra` session: **53,128 tokens**, four decisions,
  36.635 seconds from first send to final response. Runtime/native/persisted
  preparation usage agrees; no collaboration admission, worker or source edit.
  Server compilation, test typechecking, nine focused cases, independent harness
  review and [full CI on `c5f73f7e`](https://github.com/cats-inc/cats-platform/actions/runs/36090719739)
  pass. Evidence is `%TEMP%/cats-k2-live-20260925-preparation-01/`; the private
  auth copy is removed, HTTP closed, and PIDs 7884/13904 are absent. The interrupted
  tool view resumed observation of this same run; it did not trigger another run.
  The one-run authorization is consumed. Independent raw-evidence review passes.
  This acceptance uses the explicitly approved private 300-second/80,000-token
  policy. Its first send alone used 8,669 tokens; it does not fit or raise the
  unchanged 30-second/8,000-token defaults. The suggested later Work budget is
  240 seconds/16,000 tokens, remains unadmitted and was not executed.
- **Next slice:** finalize this evidence checkpoint, then review the exact
  content-profile/supplement contract from PLAN-109's G0 inventory on `024130b6`.
  Retain its 33 ordinary Runtime skills and normal Catlas/Orchestrator knowledge;
  specify Cats-specific supplement ownership, artifact selection, cache identity
  and resume/fresh-context behavior before wiring filters. No further live model
  call is needed to complete that contract slice. The private acceptance settings
  do not implement production release/preview content separation.
- **Completed accounting slice:** an isolated fake-Runtime audit reproduced a first
  malformed response with 9,001 returned tokens but no preparation report;
  ordinary dispatch could then fall through to a second inference. The fix
  captures usage before parsing, records a terminal snapshot for attempted
  failures and retains valid ordinary/pre-send setup fallback. The unchanged
  compiled baseline fails three new regressions; server compilation, test
  typechecking, 74 focused cases and independent review pass. Commit `24205589`
  is on main and its
  [full CI passes](https://github.com/cats-inc/cats-platform/actions/runs/36086668719),
  including `validate`, `nodejs (24)`, full typechecks and tests. No native
  inference or changed budget/target/grant is part of this slice. Both K2
  prerequisite slices and the subsequent host-budget slice are complete;
  it does not itself configure a larger allowance or authorize another live run.
- **Local evidence to reuse:** `%TEMP%/cats-k4-live-20260925-continuation-05/`
  contains `result.json`, `provider-calls.json` and private persisted product
  state. Successful revision is `8547f80885c8c6d1ca8e219194046a291ded2a7b`;
  parent Task is `task-collaboration-a7102c69be393ef6a148d559f4de7a53`.
  `%TEMP%/cats-k4-projection-XJZ2Kj/` contains the closed private Desktop candidate,
  guarded UI helper, reopen helper, earlier blocked captures and successful
  `chat-completed`, `work-completed-parent`, `work-completed-review-run` captures
  with accessibility snapshots. Candidate PIDs 3140/14640/8912 are all absent.
  Never copy these fixtures into normal Cats state.
- **Open gates:** PLAN-109 content-profile selection/cache exclusion and subsequent
  development/practice/promotion. K2 preparation and K3 execution were separately
  accepted; this evidence does not compose the new K2 proposal through K3/native
  UI in one uninterrupted scenario. The
  create/bridge cancellation/recovery evidence does not prove active-inference
  cancellation or installed-Desktop crash recovery. Practice/promotion remains
  a separate workstream. Do not label all K4 or the parent plan complete.

## Overview

The owner's sequence is documentation, then wiring. Complete the contracts and
baseline first, then deliver a small knowledge-consumption slice before enabling
new collaboration mutations. Each gate has its own evidence; K1 does not imply
that Orchestrator can create conversations or recruit Cats autonomously.

| Gate | Deliverable | Depends on | Current state |
|------|-------------|------------|---------------|
| K0 | ADR/SPEC/PLAN, baseline and operation ownership mapping | Existing Catlas and supervision seams | Complete; K2/K3 delegate and recovery mapping recorded |
| K1 | Shared role-aware knowledge plus actual Orchestrator content delivery | K0 knowledge contract | Implemented; scoped fixtures and full CI pass |
| K2 | Authorized teammate/context discovery and collaboration preparation | K1; read-only delegate mapping | Implemented; 480 focused tests and full CI pass |
| K3 | Conversation/membership/work mutations with durable identity and result feedback | K2; write/recovery contract review | Implemented; focused and correction batches plus full CI pass |
| K4 | Source-free distribution and isolated live-provider/native acceptance | K3 | Separate native K2/K3 and K3 saved-state projections pass; content-profile exclusion and combined rollout acceptance pending |

## Ownership and Boundaries

| Owner | Work |
|-------|------|
| Platform integration | Shared reader/selection/provenance, role context assembly, operation policy/registry coordination and packaged assets |
| Chat | Visible Orchestrator prompt and decision-request inputs; canonical conversation/membership delegates, topology, routing and event projections |
| Work/Core owners | Work assignment/run lifecycle, durable intent/idempotency/recovery mapping and outcome/evidence ownership |
| Runtime | Existing provider execution/content transport; member-local changes only if a missing adapter is established; optional native-skill/resource delivery later |

No cats-one or Apps implementation is required for the initial consumer slice.
Do not reshape frozen Core/Chat contracts or add another scheduler/roster/store
to avoid an ownership decision. Existing user authorization carries forward;
routine continuation does not create a new approval ceremony.

K3 composes Work-owned admission, execution and result records from Chat-owned
coordination through the Work execution port. The dependency guard records the
seven exact Chat-to-Work integration edges; its generic product-boundary checks
remain intact. Work does not import Chat implementations, and this integration
adds no Core/Platform-to-product dependency.

## Implementation Phases

### K0: Document and resolve contracts

- [x] Inspect both visible coordinator and provider-agent decision paths.
- [x] Distinguish executable tools, role procedures, live observations and
  preview-only development/practice skills in ADR/SPEC.
- [x] Record the collaboration scenario and requirement-to-acceptance mapping.
- [x] Finalize operation identifiers and owner mappings for discovery,
  conversation/membership, work start, inspection and stop.
  SPEC-118 maps K2's three read/preparation and K3's five mutation/lifecycle
  identifiers to Chat/Work delegates.
- [x] Map durable operation identity, state revisions and interrupted execution
  to existing Core/Work records before any new mutation is exposed.

**Exit:** K1 can proceed with the bounded knowledge contract. K3 additionally
requires reviewed mutation schemas, topology and persistence/recovery ownership.

### K1: Connect shared knowledge and Orchestrator procedures

- [x] Extract the current Catlas reader into a Platform-owned product-knowledge
  module; keep Code help as a consumer and preserve its behavior/provenance.
- [x] Define and validate role/kind/applicability/operation-dependency metadata
  with explicit format versions and fixtures for the existing Catlas v1 bundle.
- [x] Author initial English/Traditional Chinese procedures for role selection,
  current-room handoff, collaboration preparation, truthful result reporting
  and missing-capability recovery. Distinguish current operations from future
  conversation creation/recruitment.
- [x] Select procedures using the role, actual user intent, current scope and
  verified available tools. Knowledge-only fallback must not enable new writes.
- [x] Inject content into the visible coordinator and applicable provider-agent
  decision request. Resolve Orchestrator's own binding, never Catlas's binding.
- [x] Attach selected/delivered revision/digest metadata using existing request
  and evidence seams; invalidate on relevant binding/tool/context changes.
- [x] Package the shared content for npm/Desktop; update both staging fixtures
  and npm declared/packed inventory tests.
- [x] Verify missing/incompatible knowledge fallback, unsupported-tool exclusion,
  bounded payloads, both actual model-input paths and existing Code/Chat routing.

**Exit:** AC-01, AC-02 and the knowledge-only parts of AC-03/AC-08/AC-09 have
fixture evidence. No new creation/recruitment capability is advertised yet.

K1 uses a shared v1/v2 reader, a five-entry bilingual Orchestrator bundle, and
inline per-turn instructions/decision JSON. Provider-selected default Chat and
Code/Work consumers of the internal actor slot are excluded from coordinator
role injection. Exact operation revisions, normalized
binding identity (including instance/model controls), fresh per-request loading,
and a 16,000-character complete knowledge envelope bound selection. Visible
handoff remains the existing room-routing convention; it is not a new tool.

Validation: 255 focused knowledge, Catlas, Chat prompt/routing, observation,
decision/policy, Code policy/artifacts, setup, Work-intent, supervision and architecture tests passed. The
11 new knowledge integration cases capture actual Runtime request contents;
13 existing Catlas cases retain their HTTP-adapter and lifecycle coverage.
All 25 Desktop packaging tests and the focused npm declared/packed inventory
test passed. Server/Desktop/renderer builds, bundled server output, and the
affected TypeScript checks passed. An initial sandboxed routing batch stalled
in its local session fixture; the isolated fixture and complete focused batch
passed outside that restriction. Independent agent review found identity,
binding/control and truncation-provenance defects; fixes and regression cases
were reviewed with no residual findings. Remote CI outcomes and subsequent
corrections are recorded in the progress log below.

The K1 fixtures do not establish live-provider/native skill behavior, installed
Desktop acceptance, profile exclusion, or a complete collaboration tool/result
loop. K2/K3 evidence is recorded below; K4 and PLAN-109 development/practice/promotion gates remain open. No
persisted product schema, frozen contract, version or publication changed.

### K2: Add discovery and collaboration preparation

- [x] Expose an authorized, bounded eligible-Cat lookup and conversation-context
  inspection through product-owned supervised delegates.
- [x] Include the real goal and resolved state summaries in the model request;
  do not rely on message length or opaque references as task understanding.
- [x] Produce a proposal referencing two distinct existing Cats, intended
  conversation reuse/create behavior, product origin, context scope, expected
  output, implementation-to-review dependency and budget.
- [x] Reject stale/unknown targets and distinguish unavailable capability from
  missing user input. Reuse existing consent/approval handling where applicable.
- [x] Register only implemented descriptors and result contracts; test the same
  read operations through the provider-agent path, not just direct unit calls.

**Exit:** AC-03/AC-04 and preparation aspects of AC-08 pass without collaboration
mutations; ordinary Chat turn/run/transcript projections still persist.

K2 implements `chat.collaboration.discover_cats`, `inspect_context`, and
`prepare` (all revision 1.0) as Chat-owned read-only supervised delegates. The
existing decision opt-in remains off by default. Only a locally routed true
Chat coordinator receives the surface, outside existing Work tool phases.
Default-provider Chat, direct Cat replies, multi-target delivery, Code/Work and
external transports retain their existing paths. The authenticated Chat
message/retry entry explicitly enables the surface; the separate direct
Orchestrator dispatch endpoint does not advertise it.

The production continuation starts after ACK with an active cancellable turn.
A maximum of four delegate operations/five model requests share one ephemeral
decision session, a default 30-second elapsed cap and measured-usage checks. Structured
results return to that session, then a localized transcript response records a
validated proposal, missing input/capability, or a truthful stop. Current
conversation/goal scope, distinct discovered IDs, exact target availability,
review-after-artifact dependency and unadmitted work budgets are explicit.
The normal dispatch merge preserves concurrent edits and revalidates proposal
revision/source identity under its mutation gate. Normal Chat trace/run
projections remain; no conversation/member/managed Work or teammate run is added.

Provider-native enforcement remains a K4 limitation. K2 requests the existing
isolated read-only/default Runtime policy, no skills, and rejects observed
native activity; it does not claim an empty whitelist is a universal no-tools
boundary. No Runtime contract, persisted schema, version or release changed.

Validation: all 480 focused tests pass, including 16 K2 cases and 11 K1 knowledge
cases. The batch covers Chat/Work dispatch, observation/policy/adapter contracts,
Catlas, cancellation, merge/recovery, supervision and architecture boundaries.
Server compilation, the affected test TypeScript check and refreshed test bundles
pass. Captured Runtime
requests verify actual goals, procedure content, same-session results and
isolated read-only/no-requested-skills setup. In-memory/temporary HTTP fixtures
verify post-ACK execution, cancel consumption, concurrent-edit preservation and
successful proposal publication through the production merge. Scope exclusion,
malformed/unsupported decisions, stale source/targets, cleanup-time changes,
read/usage/elapsed bounds, rejection wording and ordinary fallback are covered.
Independent review rechecked all reported corrections with no remaining
blocking findings. All 1,016 local links in affected Markdown resolve, fences
balance, and changed files use UTF-8/LF with no whitespace errors.
Full [CI on `34221fad`](https://github.com/cats-inc/cats-platform/actions/runs/36035473857)
passed both `validate` and `nodejs (24)`. No live provider, installed Desktop or
user-state writes were used for this validation.

### K3: Complete collaboration operations and feedback

The owner requested K3 continuation on 2026-09-25. SPEC-118 now records the
five implemented operations, existing Chat choice-based admission, durable parent
Task/role identities, atomic Chat/Core publication, verified implementation-to-
review handoff and interruption rules. Independent contract review established
the narrow-write queue/host-drain split. Preserve frozen shared contracts and existing transport Work
semantics; validate new metadata against old snapshots and isolated failure tests.

- [x] Reuse Chat's conversation and membership persistence/materialization,
  origin/topology rules and state-event publication in supervised adapters.
- [x] Reuse Work/Core assignment and run admission; keep membership, work
  assignment and Runtime session startup separately observable.
- [x] Persist admitted intent/operation identity and expected scope/revision
  before side effects. Apply validated storage evolution and recovery if needed.
- [x] Execute one bounded operation at a time under existing policy, then send
  structured outcome and refreshed observations back to the same coordinator.
- [x] Start review only after a verified implementation artifact/revision is
  available, with a scoped handoff and distinct eligible reviewer.
- [x] Handle duplicate/concurrent calls, conflicting input, partial failure,
  restart reconciliation, cancellation and bounded retry without silent cleanup
  of created conversations or user work.
- [x] Verify the full scenario in MemoryCoreStore/temporary product fixtures;
  include failure paths and authoritative postcondition checks.

**Exit:** AC-05/AC-06/AC-07 and remaining operation invalidation checks pass in
fixtures. Product tool registries identify which adapters and transports passed.

The original proposal's structured owner choice admits one parent Task and two
fixed role Tasks. Five tools ensure Chat topology/membership, queue one role,
inspect and stop. The queue tool has no Runtime effects: a host-owned drain
checks the persisted owner grant independently after queue receipt persistence.
The coordinator remains narrow-write; unknown-model FR-19 and weak ceilings are
unchanged. No scheduler, public HTTP/MCP endpoint or frozen contract is added.

Implementation runs with local file tools in an isolated worktree. Runtime
captures a new full commit ID and confirms clean HEAD; the distinct reviewer's
Task remains pending approval until that proof exists. Review is read-only at
the actual verified cwd/commit. Results and bounded receipts return to the same
coordinator, with shared time/token limits. Commit identity and review judgment
are separate from test evidence; remote publishing is not granted.

Atomic Chat/Core writes and current-state merges preserve concurrent edits.
Repeated HTTP confirmation acknowledges the existing attempt without replacing
its cancellable turn. Run/Task revocation prevents late sends or success;
metadata audit updates preserve operator state. Recovery includes fenced parents
with queued/pending roles and unclosed sessions. Known late session IDs remain
recoverable; unconfirmed creation blocks rather than launching another attempt.
Existing snapshots retain their format and backups; unknown metadata cannot run.

Follow-up persistence review also found stale Core replacement in memory and bot
settings. Those mutations now validate and update the latest Core atomically;
canonical memory/transport reconciliation stays after commit. Twelve isolated
HTTP races reproduce the previous Task/Run loss, deleted-memory resurrection and
duplicate-token acceptance. All twelve fail against the pre-fix build and pass
after the correction. The fixtures use delayed bodies and explicit gates, not
timing sleeps or user state. The final follow-up batch passes all 257 tests,
including those twelve cases, all 25 K3 cases, memory/store/REST/Telegram coverage
and both architecture guards; server compilation also passes.

Validation: all 823 tests across 83 affected files pass, including 25 K3
cases. Captured Runtime inputs and authenticated HTTP fixtures cover owner
admission, queue-before-host ordering, exact revision review, same-session
feedback, repeated confirmation, cancellation during create/send, late replies,
shared budgets, stale scope, ambiguous restart and retained effects. Chat store,
CRUD, dispatch/retry, parallel relay, Telegram, Work golden path, Catlas,
knowledge, supervision and architecture regressions pass. New persistence tests
cover concurrent creation, existing-message annotations, selection preservation
and no resurrection of deleted rooms. A persistence-failure fixture targets the
actual atomic writer; its original failure assertions remain intact.

Server compilation, affected test typechecking and refreshed test bundles pass.
Independent review reports no remaining P1/P2 findings after corrections to
revocation, duplicate HTTP turns, cleanup recovery and concurrent writers. The
initial expanded batch exposed two parallel-relay regressions; corrected merges
retain preparation metadata and immutable baselines, and both regressions now
pass. All 1,030 local links in affected Markdown resolve and fences balance.
Initial [CI on `97e1f6fb`](https://github.com/cats-inc/cats-platform/actions/runs/36049653929)
passed full typechecks and 4,734 tests (59 skipped), with one dependency-graph
failure for the seven planned but unregistered integration edges. The exact
edge registration and the independently reviewed persistence correction pass
the follow-up checks above.
Corrected [CI on `115fe483`](https://github.com/cats-inc/cats-platform/actions/runs/36052038916)
passes both `validate` and `nodejs (24)`, including full typechecks and the complete
test suite: 4,806 cases, 4,747 passed, 59 skipped, zero failures/cancellations.
Fixtures use temporary or memory state; no live provider,
installed Desktop, native UI or user's persisted dev state was exercised. K4 and
PLAN-109 development/practice/promotion gates remain open. No frozen contract,
persisted schema, version or release changed.

### K4: Validate distribution and real execution

The owner requested continuation after K3 on 2026-09-25. Integration owns the
isolated live/native scenario; independent reviewers own distribution/profile
inspection and Runtime enforcement review. Before launching a candidate, verify
Electron identity and userData before its instance lock, private Platform/Runtime/
Desktop roots, loopback listeners, candidate-only cleanup and absence of automatic
OS-login/update mutations. A different cwd or sidecar state root is insufficient.

Current prerequisite findings: relocated npm/Desktop knowledge delivery now has
executable acceptance below. PLAN-109 G1 supplement
selection/cached-profile exclusion is not implemented; release trust/update flags
are not content profiles. Record that dependency separately rather than marking
G1 complete merely because no development supplement has been added yet.
The first live target must support the requested workspace access policy through
its actual adapter. Runtime capability labels alone are not enforcement evidence.

- [x] Verify source-free npm/Desktop artifacts contain compatible normal
  procedures and work without optional Catlas or development-supplement skills.
- [ ] Validate profile exclusion with PLAN-109's inventory/cached-state gates;
  do not infer release exclusion from a hidden control or a skill name.
- [ ] Run the collaboration scenario against an isolated candidate Runtime and
  product state with a real provider, identified tools and bounded budget.
- [x] Inspect native UI projections, actual model delivery, conversation and
  membership IDs, Task/Run results and retained create/bridge cancellation/recovery
  evidence at the recorded boundaries.
- [x] Test a model path without native skill discovery. Native skills or MCP
  resources remain optional later delivery work, requiring separate proof.
- [x] Record provider/OS/build-specific limits and scoped completion. Update
  SPEC, registries and parent-plan links without closing unrelated practice gates.

**Exit:** AC-09/AC-10 and the end-to-end scenario have identified live/native
evidence. Publication still follows the existing release authorization/SOP.

#### K4 evidence and remaining work (2026-09-25)

Source-free acceptance passes all three test cases: an actual offline npm pack
is relocated away from the checkout, and Desktop's real staging/bundler and
extraResources mappings materialize the second consumer. Both locales preserve
asset bytes, selected content, digests and request receipts. Removing Catlas's
asset does not stop the Orchestrator request. Desktop's renderer and Runtime
assets are minimal packaging fixtures; this test does not claim packaged Runtime
or renderer execution, or PLAN-109 cached-profile exclusion. The renderer fixture
also makes the test independent of local Vite output, which clean test CI does
not build. The final rerun used the corrected server and host output.

An additive candidate profile establishes Electron identity/storage before the
lock and private sidecar homes/cwd, Cats state and loopback ports. It disables
installation/update/OS-login mutations. Native Windows 11/RDP acceptance used
Platform 0.4.4 and Runtime 0.2.1 at `8e1c6fc`, alongside installed Cats 0.4.3.
Both sidecars reported their own lifecycle-ready events. A real second launch
of the same candidate exited successfully without duplicate sidecars. Scoped
UI Automation and a viewed 1280-by-860 capture verified the onboarding window;
this was a checkout-built candidate, not a new installer/release validation.

The first close exposed snapshot delivery to an already destroyed BrowserWindow.
The candidate host and Runtime required scoped process-tree cleanup. The fix
clears closed window references and guards event delivery. A fresh native repeat
then stopped Platform and Runtime via stdin closure and exited all three owned
PIDs; no forced kill was needed. This proves native startup/close, not the Chat/
Work result projections. Temporary authentication copies from the live probes
were removed; no test records were placed in the user's normal Cats state.

The real-provider harness runs production K3 admission/delegates against private
Runtime and Git fixtures. It constructs K2 preparation and the owner choice;
natural-language proposal generation remains a separate check. First Codex
0.156.1 / `gpt-6-astra` inference returned an invalid decision because the prompt
provided only a schema label. Complete response examples/rules now accompany
the observation, without relaxing validation. Rejected response usage is now
recorded before parsing, and failed final feedback preserves original terminal
execution evidence. Atomic stop writers also preserve the winning cancelled or
blocked result when an earlier stop resumes late; cleanup acknowledgements can
only advance for the same owned session. A deterministic interleaving reproduced
both reason-overwrite failures before the fix. Independent review and regression
fixtures cover these fixes.

The second inference run used no native skills, created a real conversation,
verified the two canonical participants and queued implementation. Work stopped
at strict provider readiness before creating a worker session. Preparation had
recorded `degraded`, which is not executable `ok`. The four coordinator responses
consumed 18,967 + 24,884 + 30,203 + 34,555 = **108,609 tokens**. Runtime's raw
last-turn and cumulative usage agree. The 80,000-token continuation threshold
was crossed by the final response; it is not a provider hard ceiling. No source
edit, captured revision, independent review or mechanical fixture success is
claimed. The source fixture remained unchanged and coordinator cleanup completed.

Readiness-only probes require exact worker `ok` before inference, initialize
private provider history and capture diagnostics. Initial passive probes timed
out or returned `degraded/version_unknown`, including with the actual npm prefix.
Source review exposed the structural mismatch: passive CLI availability is
metadata-only and intentionally classified `degraded`, while Work requires `ok`.
Increasing the selector timeout cannot resolve that contract mismatch.

The final isolated Codex probe used full live compatibility diagnostics and
returned strict `ok`: **zero inference calls, zero measured tokens**, with Runtime
shutdown and authentication-copy removal confirmed. For this CLI backend those
diagnostics execute bounded version/help commands. Other backend diagnostics can
create transient sessions, so the Work correction resolves the configured exact
target first, uses full live diagnostics only for CLI, and retains light checks
for other backends. Execution pins the verified backend-qualified instance;
readiness never replaces the existing owner grant or shared budget. This probe
proves readiness only; no worker/model attempt was repeated after this correction.
The final readiness-only repeat also verified the spawned Runtime's own lifecycle
PID/endpoint before HTTP access, rejecting another process's healthy listener.
It again returned `ok` without inference; the exact owned PID was absent after
cleanup and the temporary authentication copy was removed.

Next executable work is to define an adequate bounded continuation policy for
growing native CLI context. Keep strict readiness and the existing owner grant.
Then rerun implementation, exact revision review, duplicate confirmation
and native Chat/Work projections. Full K4 and PLAN-109 G1/G2/G4 stay open; no
version bump, publication, native-skill requirement or frozen-contract change
has been introduced. Local checks pass: server/Desktop/test TypeScript, 39 K3
cases, the earlier 53-case K2/K3/knowledge batch, 52 decision/adapter/policy cases,
102 architecture/browser-boundary cases, 91 Desktop lifecycle/config/packaging
cases and the final 15-case candidate/visibility/recovery batch. These batches
overlap; they are not an aggregate unique-test count. Distribution adds its
three passing cases and candidate lifecycle parsing adds four passing cases.
All 984 local links in the ten changed Markdown documents resolve; fences and
UTF-8/LF checks pass. Independent reviews covered production changes and the
live harness. Initial [CI on `49434c11`](https://github.com/cats-inc/cats-platform/actions/runs/36064609559)
passed full typechecks and 4,778 tests (59 skipped), with two failures in legacy
close-handler source assertions. The native shutdown fix binds the handler to
the captured `window`; those assertions still required `mainWindow.on`. Updating
the binding expectation retains every tray, shutdown and installer-handoff guard.
All four close-behavior checks and independent review pass after the correction.
Corrected [CI on `b30d5adc`](https://github.com/cats-inc/cats-platform/actions/runs/36065815288)
passes both `validate` and `nodejs (24)`, including full typechecks and 4,839 test
cases: 4,780 passed, 59 skipped, zero failures/cancellations. The integration gate
for this K4 slice is verified; full live execution and PLAN-109 profile/practice
gates remain open. This subsequent documentation-only record does not change
tested executable or packaged knowledge inputs.

#### K4 continuation and native enforcement (2026-09-25)

The retained four-call trace contains 73,587 Platform prompt characters. The
first three requests each repeat 6,017 characters of tool descriptors and
7,669 characters of knowledge. Native Codex also adds coding-agent instructions,
skills/plugins and tools despite an empty Runtime skill request. A successful
primitive workflow needs five coordinator decisions and two worker turns, so
Platform prompt reduction alone must not be described as an 80,000-token fit.

- [x] Implement session-bound K3 delivery references with fresh host validation,
  truthful provenance, bounded wire payloads and newly delivered receipts.
- [x] Verify the provider-native context controls through the Runtime boundary;
  keep ordinary coding-worker capabilities and read-only coordinator scope.
- [x] Run focused regressions and independent review, then exercise actual
  implementation/revision/review with reconciled usage and cleanup evidence.
- [x] Complete final model feedback within the unchanged 80,000-token threshold.
- [x] Exercise actual Runtime create/bridge cancellation and process-loss recovery,
  plus native Chat/Work blocked/cancelled projections at the recorded boundaries.
- [x] Inspect successful final feedback and revision/review in native Chat/Work.

The fixed live threshold remains a continuation limit, not a provider hard cap.
Any incomplete or over-budget attempt remains recorded as such.

The private fixture uses explicitly configured coordinator and worker
instances with small native base instruction files and optional apps/plugins
disabled. This is a configured-profile acceptance, not a claim about default
Codex context cost or universal native-tool isolation. The production host still
supplies the role, goal, tool restrictions and output contract. Read-only native
file inspection commands are permitted for review without widening its Runtime
sandbox or approval policy. A zero-turn Codex probe found that configured `-c`
values before `app-server` were ignored. Runtime's provider-owned argument
placement correction now passes a compiled WorkerProcess/native configuration
probe without authentication or inference. Explicit per-session model/control
values retain precedence over configured defaults.

The first continuation attempt consumed **73,818 actual tokens** in four
coordinator calls and no worker inference. It exposed a maintenance race: Runtime
deleted a worktree between preparation and registry publication. Runtime now
reserves preparation through publication/rollback, checks current ownership just
before deletion, and makes a new preparation wait for an already claimed cleanup.
Actual Git create/fork/failed-hydration and inverse-race fixtures pass.

An additive fixed-workflow acceptance request now lets the host run the existing
Chat setup and implementation/review boundaries between two coordinator calls.
Seven operation outcomes are durably retained; all their bounded feedback
projections reach the next decision. The independent review caught JSON-escaped
summaries exceeding the aggregate limit. Complete raw receipts and canonical
evidence now survive; model projections explicitly mark truncated descriptions
with digests and Artifact references. Unprojectable oversized reasons stop later
effects without losing the current outcome. Both regressions pass.

The second continuation attempt reached a real implementation session but made
no edit. Runtime reported **42,723 tokens**, while native history proved
**52,053**: two implementation model responses consumed 9,330 + 9,477 = 18,807,
but only the last response was charged. Native coordinator totals matched. This
is an accounting failure, not bounded-flow acceptance. The worker also observed
read-only native permissions despite an admitted writable worktree. Zero-turn,
unauthenticated native probes showed a clean Windows profile downgrades requested
workspace-write without `windows.sandbox="unelevated"`. That setting belongs only
to the explicit private acceptance profile; the user profile is untouched.
The resulting audit also found Runtime's read-only sandbox legacy-mode mapping
needed correction before repeating inference. Neither a larger token threshold
nor broader worker grants is used as a workaround. Both failed attempts stopped
their owned Runtime and removed temporary authentication copies; fixture sources
remained unchanged. Full worker/revision/review and native projection acceptance
are still pending at this checkpoint.

The third continuation attempt verifies both Runtime corrections: native and
charged usage are exactly **62,897 tokens**, including all implementation
responses; native coordinator sandbox is read-only and implementation is
workspace-write. It remains blocked because Codex uses native shell commands for
file inspection, while the admitted file-tool whitelist intentionally excludes
shell execution. The fixture source is unchanged, no revision/review is claimed,
and owned Runtime shutdown/auth-copy removal passed.

The next correction follows Runtime ADR-041: opt-in dynamic `read_file` and
`list_files` operations use Runtime's existing local path/tool policy. Work
projects its admitted directory-read capability to the canonical name without
altering stored owner grants and requests the two read operations for review.
General shell approval stays unchanged. Native registration, scope/lifecycle
regressions and independent review precede another inference attempt.

The live harness now binds each Runtime role session to its actual native thread
and compares native totals, returned usage, persisted intent usage and final
report usage. Successful completion also requires delivered final feedback and
JSON-equivalent stored Chat metadata. Cleanup failure cannot pass acceptance.

Native Windows UI acceptance reopened the second attempt's private saved state
in the checkout-built candidate. UI Automation and a viewed 1280-by-860 capture
confirmed Chat's truthful blocked report and disabled consumed confirmation.
Cats Work opened the retained linked work item, but that detail screen alone
does not prove parent/child Task status projection; that gate remains open.
Normal window close stopped the owned Electron, Platform and Runtime PIDs.

A separate zero-inference native Runtime trial verifies cancellation during a
held real create response and recovery after terminating an owned fixture host
after its bridge was persisted, before model send. In both cases the actual
Runtime sessions reached `closed`, both role stages were cancelled and the
conversation was retained. Reopening the persisted store stopped the parent with
`interrupted_requires_new_proposal`; repeating recovery preserved the result and
did not send a goal. The source repository was unchanged and Runtime exited with
code zero. No provider authentication was copied. The first probe checked the
asynchronous `closing` status too early; the repeat waits up to five seconds for
`closed`. This proves create/bridge recovery at that boundary, not cancellation
of an in-flight native model response or a crash of the installed Desktop app.

The Work projection map was also checked against the saved Core records: the
first Tasks sidebar entry exposes the collaboration parent and role subtasks;
Missions is a separate route. An unrelated existing WorkItem graph limitation
keeps `linkedWorkItemId` null even for explicit WorkItem-to-Task links. That issue
does not erase collaboration Tasks and is not used to infer a missing K3 record.
An additional native repeat opened the actual collaboration parent through
Tasks. UI Automation verified the blocked parent, both cancelled child Tasks
and disabled dispatch; a viewed 1280-by-860 capture confirms that screen.
All three owned candidate processes stopped normally after window close.

The fourth continuation attempt completes real implementation, captures revision
`cc11281d4729e30653986fbbd2a04bec28e78e0f`, and receives independent approval for
the inspected addition function. Host-run fixed fixture tests pass after
verifying the pure, single-file edit. Reviewer limitations remain explicit:
static inspection did not independently establish the baseline diff and no tests
were run by the reviewer. The host verifies revision identity and the fixture.

This attempt still fails bounded-flow acceptance. Actual/native/Work usage all
match **95,312 tokens** (coordinator 35,638; implementation 30,483; review 29,191).
The final coordinator response crosses the 80,000 continuation threshold, so
feedback delivery is not reported as successful even though role work finished.
The temporary authentication copy was removed and source checkout stayed clean.
The two worker prompts are only 870 and 1,097 characters, while each native
response carries roughly 9,500 tokens of context; further improvement must be
verified at the native/profile and wire-delivery boundaries. Raising the fixture
threshold is not a substitute for proving the intended bounded path.

The final zero-inference lifecycle repeat uses the corrected Runtime build and
the probe's final cleanup-dependent success gate. Cancellation and process-loss
recovery both pass, both real sessions reach `closed`, repeated recovery is
unchanged, and Runtime exits normally without any authentication copy.

Runtime's worktree ownership/read-only corrections and Codex argument, usage and
explicit read-tool bridge are committed through `a694104`. Its full
[release-preflight CI](https://github.com/cats-inc/cats-runtime/actions/runs/36080164885)
passes. The Platform continuation remains subject to its own integration gate.
Worker prompts now explicitly assign implementation or independent review only:
the host owns conversation setup, recruitment, revision capture and final
reporting. Independent reads may be batched without dropping inspection or
claiming validation that did not run.

A private unauthenticated native request capture then compares three profiles
against a loopback-only mock provider. Each sends one request, receives HTTP 400
and stops its owned child; none performs model inference. The serialized input
falls from 31,271 to 20,844 bytes after disabling unused goal/image/shell tools
and the five packaged system skills. Required `apply_patch`, `read_file` and
`list_files` declarations remain, with code mode enabled. This is byte evidence,
not a token estimate. The multi-agent namespace remains despite its feature
flag; optional context settings are not a native-tool firewall. The private live
harness applies these settings without changing ordinary provider profiles.

The owner explicitly approved the isolated provider payload after an automatic
approval review requested confirmation. The fifth continuation completed even
though its command view was interrupted. Its saved success evidence was checked
before any retry: **61,033 tokens** (coordinator 26,876; implementation 20,176;
review 13,981) across three distinct native threads and four Runtime sends.
Native usage, returned usage, Work intent and final report totals agree. Native
base instructions and role sandboxes match the private configuration. The actual
revision is `8547f80885c8c6d1ca8e219194046a291ded2a7b`; the independent review approves
the inspected addition function with its static-inspection limits preserved.
The host verifies revision identity, the single-file edit and passing fixture
tests. All seven actual outcomes reach the coordinator, final feedback is true,
persisted Chat metadata matches, duplicate confirmation creates no extra work,
the source fixture is unchanged and the temporary authentication copy is removed.
This proves bounded K3 execution in the configured profile, not default native
context cost, model-driven K2 preparation or all K4 gates.

Validation of the latest Platform delta passes server compilation and 53 focused
collaboration/prompt-session tests. Earlier affected adapter, knowledge,
distribution and boundary checks also pass. Independent review covers prompt
delivery, workflow acceptance, receipt bounds, native read grants and the private
profile reduction. Independent evidence review also verifies nine native model
responses behind the four Runtime sends, the actual one-line Git change and
absence of Runtime PID 5916/authentication copy. Reviewer inspection covers the
file content; Cats verifies commit identity. The host's fixed mechanical tests
run after final model feedback, so the model report correctly says tests were
not run at its reporting point.

The next slice loads that successful saved state into the private checkout-built
Desktop candidate without another model call. UI Automation and viewed
1280-by-860 captures verify Chat's actual completion report, reviewer limitations
and disabled consumed owner confirmation. Work's Tasks view shows the completed
parent and both completed role children; the review child opens its completed
Run, specific inspection summary and successful outcome. Canonical commit IDs
remain verified in persisted evidence; the Chat text reports revision verification
without displaying the full hash. The parent has no direct worker Run because
execution belongs to the two child Tasks. Normal window close stops Electron,
Platform and Runtime (3140/14640/8912); all three PIDs are absent. This is a
saved-state native projection check, not a new installed-release execution test.

Full [Platform CI on `471755c9`](https://github.com/cats-inc/cats-platform/actions/runs/36082102563)
passes `validate` and `nodejs (24)`, including full typechecks and tests. Workspace
skill mirrors were refreshed after the unrelated upstream skill changes and the
read-only sync check is clean. This evidence-only follow-up changes no tested
executable or packaged knowledge inputs. Model-driven K2 preparation, profile
inventory/cache exclusion and PLAN-109 practice/promotion remain open.

#### K2 preparation context slice (2026-09-25)

A zero-inference preflight uses the production turn builder, requester and loop
with two fixture Cats and a fake Runtime. The current protocol requires four
model decisions for discovery, inspection, proposal and final feedback, with a
five-request ceiling. It retains 30 seconds and 8,000 measured tokens for the
whole preparation; the suggested execution budget in a proposal is not authority
to enlarge that earlier stage. Normal provider configuration is unchanged.

| Request | Baseline Platform wire bytes | Actual K2 cache delivery bytes |
|---------|------------------------------|-------------------------------------|
| Discovery | 15,762 | 17,834 |
| Context inspection | 16,682 | 9,505 |
| Preparation | 17,240 | 9,142 |
| Final feedback | 13,529 | 9,207 |
| Total | 63,213 | 45,688 |

The actual compiled requester repeat matches the earlier offline projection.
This fixture is ASCII, so bytes equal characters. The first projection grows by
2,072 bytes for explicit delivery metadata; later projections remove repeated
descriptors, knowledge entries and already delivered receipts. Each request also
has 953 characters of adapter instructions. Native history may resend previous
context to the model, so these totals are new Platform wire bytes, not aggregate
model input, tokens or an elapsed-time acceptance result. Private evidence and
the reproduction script are in `%TEMP%/cats-k2-wire-preflight-qfYnj2/`; the actual
repeat is preserved separately in `%TEMP%/cats-k2-wire-actual-QiqDQ6/`.

The scoped implementation enables the existing attempt-local cache only for the
verified K2/K3 coordinator surfaces. K2 explicitly requests the four-result
bound so enabling references cannot inherit K3's eight-result bound. Exact
session/binding identity, fresh goal/policy/budget/scope, final tool removal and
host-side complete receipt validation stay intact. The real-requester regression
fails against the previous build for missing bootstrap delivery metadata. The
updated fake model remembers receipts in its own session while raw captured
requests remain unchanged; assertions require each receipt exactly once and
unchanged preparation budgets. Server compilation, test typechecking, all 92
focused collaboration/knowledge/adapter cases and independent review pass. The
production repeat prepares a valid proposal, delivers its actual final feedback,
leaves Chat state unchanged and closes its fake session once. Exact prior wire
digests/references match; each of the three read results arrives once, current
token/time constraints remain explicit and final tools are empty. It uses no
authentication, native model or network request.
Full [CI on `14c080fc`](https://github.com/cats-inc/cats-platform/actions/runs/36084948721)
passes `validate` and `nodejs (24)`, including full typechecks and tests.
The subsequent checkpoint changes documentation only. Workspace skill mirrors
were refreshed after upstream `910219b7`; the read-only sync check is clean.
This is a prerequisite optimization, not live K2 or profile-exclusion acceptance.

#### K2 preparation failure-accounting slice (2026-09-25)

The next zero-inference audit finds that K2 counted tokens only after a parsed,
policy-accepted decision. A malformed first response returning 9,001 tokens had
no preparation report; post-ACK dispatch could fall through to ordinary Chat.
A malformed second response hid a 9,021-token total behind a generic error.
Private reproduction evidence is in `%TEMP%/cats-k2-failure-audit-s9P6p4/`.

The correction captures each Runtime send/result before parsing, with a copied
terminal usage report and explicit incomplete subtotals. Failed attempted
inference stops the current preparation without silently retrying through Chat.
Known budget exhaustion takes precedence over malformed output, while explicit
cancellation, stale context and currency-policy failures retain their cause.
Valid ordinary first responses and pre-send setup failures retain existing
fallback. The optional report field preserves old metadata without migration;
original limits, target binding, grants and K3 admission are unchanged. Native
response counts remain separate from Runtime sends. This does not establish
that a real model-driven K2 preparation fits 30 seconds/8,000 tokens.

Three new regressions fail against the prior compiled implementation; the
ordinary/setup compatibility case already passes. Updated server compilation,
test typechecking and 74 focused collaboration/execution/prompt-session cases
pass. Coverage includes first and later JSON/policy/native rejection, missing
or invalid usage, transport failure, first timeout, immutable late-response
snapshots and existing metadata without the new field. An authenticated HTTP
fixture verifies that a malformed 9,001-token response publishes one localized
budget-stop report, settles the active turn and sends no ordinary fallback
inference. Independent review approves accounting, cancellation, compatibility
and tests. Full
[CI on `24205589`](https://github.com/cats-inc/cats-platform/actions/runs/36086668719)
passes `validate` and `nodejs (24)`, including full typechecks and tests. All
fixtures use fake Runtime or private stores; no live model/authentication or
ordinary user state is involved. The following checkpoint changes documentation
only and does not rerun completed native acceptance.

#### Native K2 preparation-budget follow-up (host wiring and full CI pass)

Keep the configured Orchestrator target and preparation authority explicit.
The completed Live05 K3 coordinator used 10,081 tokens on its first Runtime send
and 16,795 on its final send. This is measured evidence from the same private
Codex/`gpt-6-astra` profile, not a K2 measurement or a forecast for another model.
The current K2 protocol still needs four decisions for a successful proposal and
feedback. Its byte reduction and K3 success cannot establish fit within the
separate 30-second/8,000-token preparation limit.

Independent contract review approves host configuration for the existing opt-in
path. Two documented settings preserve the defaults and strictly reject invalid
integers or values above 300 seconds/80,000 tokens. The requester copies/freezes
one policy snapshot; begin/retry uses its non-writable property and the loop
independently intersects narrower observation limits. Only the final selected K2
descriptor surface receives the policy: K3's intermediate `collaborationTools`
array is also nonempty, so the builder must explicitly exclude execution tools.
The builder replaces its synthetic 30-second default for K2 instead of silently
clipping an explicit host setting back to that default. An eligible first
decision uses this budget even when it returns an ordinary reply; no second
allowance starts after tool selection.

This is host-operator configuration inspected before enabling the opt-in flow,
with effective values recorded in existing usage metadata. A product-facing
budget editor remains later. Model/message input and K3's execution choice do
not configure it; target bindings and all grants remain unchanged. No persisted
or frozen contract changes are needed. Restart establishes a new configuration
snapshot; the active attempt does not reread environment settings. Numeric
ceilings are not actual default increases or a native-fit claim. Three isolated
configuration/HTTP/snapshot regressions fail against the prior compiled build.
Server compilation, test typechecking and 190 focused configuration, preparation,
execution, prompt-session and architecture cases pass. These include an
authenticated preparation above the old token default, a fresh narrower retry,
an immutable policy snapshot, narrower observation enforcement, and K3 execution
with a deliberately tiny unused preparation policy. Independent implementation
review approves the contract, scope, validation and compatibility. Commit
`cc5d07ad` passes [full CI](https://github.com/cats-inc/cats-platform/actions/runs/36089146521).
No normal host configuration or provider authentication has been changed.

The isolated live harness now has a separate preparation mode to exercise
the real production discovery/inspection/preparation path. Capture actual
Runtime and native usage separately, reconcile the terminal snapshot, verify
final feedback and close the private session. A prepared K2 proposal must still
show no collaboration creation/admission or worker execution. Reuse the existing
K3 evidence instead of launching workers again. PLAN-109 content-profile
inventory/cache exclusion and practice/promotion remain separate work packages.

#### K2 acceptance harness slice (local validation and full CI pass)

`scripts/testing/orchestrator-collaboration-live.mjs --phase preparation` requires
explicit `--preparation-max-duration-ms` and `--preparation-max-tokens`, using the
production setting validator. The default execution mode retains the completed
K3 workflow. Preparation uses the real authenticated Chat message API and host
requester factory, with a fresh FileChatStore and synthetic addition goal. It
does not fabricate the discovery/inspection/preparation decisions or submit
the resulting execution choice. The fixture refuses any second/fallback/worker
model session before forwarding it, while retaining the product's K2 policy.

The helper verifies the actual ACK/source message, persisted prepared report,
distinct teammates, applied read receipts and model decisions, final empty-tool
feedback, complete preparation usage, unchanged topology and no Work admission.
Ordinary Chat turn projections are permitted. The outer harness reconciles the
single coordinator's native thread and Runtime usage separately from K3's three
roles. Send attempts are recorded before awaiting results; missing responses or
usage never become a passing zero-usage claim.

The CLI's preparation process receives only its private environment. The HTTP
helper also substitutes an inert Telegram command-sync delegate so inherited
development credentials cannot trigger unrelated startup actions. No provider
requester, read operation or receipt is replaced. The HTTP server exposes its
existing best-effort startup recovery Promise; callers can await all passes
settling before work/cleanup, without claiming that every pass succeeded or all
background work is quiescent. An active post-ACK turn is cancelled and settled
before closing HTTP; the outer harness then closes owned Runtime and credentials.

Initial private tests exposed CSRF rotation on auth status and detached startup
writes after listener close. The helper adopts the returned CSRF token and waits
for the actual startup Promise. Server compilation, test typecheck and nine
focused cases pass, including a deferred startup pass, rejected usage, blocked
ordinary fallback, interrupted turn and readiness with no submitted message.
The native Windows/Codex readiness at `%TEMP%/cats-k2-readiness-a622e179/` passes
with no authentication supplied, zero model sessions/sends, private host limits
of 300 seconds/80,000 tokens, unchanged fixture source and closed HTTP/Runtime.
PID 13028 is absent. This proves local launch/configuration only; no logged-in
model inference or native K2 preparation acceptance is claimed. Independent
implementation review approves the exact target/sandbox/budget guards, lifecycle
settlement, usage reconciliation and K3 preservation. Commit `c5f73f7e` passes
[full CI](https://github.com/cats-inc/cats-platform/actions/runs/36090719739),
including `validate`, `nodejs (24)`, full typechecks and tests.

#### Model-driven K2 native acceptance (2026-09-25)

After the harness CI passed, the owner explicitly approved one isolated model
run using existing Codex authentication and the synthetic addition goal, normal
Cats knowledge/tool descriptors and private state/local paths. The private host
policy was 300 seconds/80,000 tokens, at most five decisions, with possible
single-response overshoot. Platform code is `c5f73f7e` (documentation-only
`024130b6` followed); Runtime is `a694104`. Windows/Codex 0.156.1 used the same
reviewed minimal native profile and explicit `gpt-6-astra` target. The interrupted
tool view left the original background process running; resume inspected that
run instead of launching another inference.

Evidence `%TEMP%/cats-k2-live-20260925-preparation-01/` records `prepared`,
four Runtime sends and four native usage updates in one read-only coordinator
thread. Total usage is **53,128 tokens**: 52,425 input and 703 output.
The actual decisions and measured Runtime usage are:

| Decision | Tokens | Delivered prior result |
|----------|--------|------------------------|
| Discover eligible Cats | 8,669 | None; bootstrap carries selected knowledge and descriptors |
| Inspect current context | 11,700 | Actual discovery receipt |
| Prepare collaboration | 14,877 | Actual context receipt |
| Report prepared proposal | 17,882 | Actual preparation receipt; no available tools |

Runtime session `3a9ddfb1-86ae-4ebc-871d-c0e52b413175` maps to native thread
`01a0d6a8-d1ed-77b3-8f5f-62bbb0de0b83`. The first send starts at
03:43:00.692 UTC and the last response completes at 03:43:37.327 UTC (36.635
seconds); the whole harness including preflight/cleanup spans 03:42:15.846 to
03:43:38.091 UTC. Native model, base instructions and read-only sandbox match.
The terminal `preparationUsage` is complete and equals Runtime/native totals;
the reopened private Chat snapshot contains the same report and original owner
message identity. Source/result message IDs are
`5ca49dbc-7923-4db0-8634-71c3a29ac465` /
`95bc3503-0b3b-4936-ac37-b8fe6d311046`.

The model chose two distinct discovered Cats, requested a new conversation,
retained review-after-revision dependency and truthfully described their
declared-only roles and degraded passive availability. It suggested a later
240-second/16,000-token Work budget with `not_admitted` / `not_started` status;
that is not a measured execution estimate or an execution grant. No execution
choice was submitted, no worker session/Work admission was created, topology
was preserved and the fixture repository is unchanged. The HTTP server closed,
the temporary authentication copy is gone, and harness/Runtime PIDs 7884/13904
are absent. Independent raw-evidence review confirms the actual decisions,
receipts, usage, persisted report, no admission/source edits and cleanup.

Runtime inventory also contains a closed `origin: discovered` alias for the same
native thread, labelled `source` / `read_write`. The actual owned session has
`origin: runtime`, `sandbox` / `read_only`, and every native turn is read-only.
There is one forwarded `createSession` and one native model thread, not only one
persisted Runtime row. The alias did not execute another request or worker and
does not invalidate preparation evidence; retain this metadata limitation when
designing content-profile provenance and resumed/discovered-session exclusion.

This closes the isolated model-driven K2 preparation gate for this exact target
and explicit private policy. The first decision already exceeds the unchanged
8,000-token default; no default-budget or other-provider fit is established.
K3's earlier 61,033-token execution and saved-state native UI evidence are
separate accepted fixtures, not execution of this proposal. Content-profile
exclusion, combined rollout acceptance, active-inference crash recovery and
PLAN-109 practice/promotion remain open. Do not repeat either successful model
run or reuse its consumed one-run authorization after a reset.

## Initial Change Map

| Area | Intended change |
|------|-----------------|
| `src/platform/catlas/knowledge.ts` and a shared product-knowledge module | Extract reusable validation/selection; keep the shipped Code help contract |
| `config/` and npm/Desktop asset inventories | Versioned concepts/procedures; explicit packaged-file assertions |
| `src/products/chat/state/prompts.ts` | Visible Orchestrator procedure content and truthful capability guidance |
| `src/products/chat/state/providerAgentDecisionRequester.ts` and Platform provider adapter | Selected content/provenance for the structured decision path |
| Chat turn observation and product-owned operation delegates | Authorized current goal/context, callable capability projection and verified results |
| Core/Work existing operation/evidence owners | Durable identity, outcome and recovery only after contract mapping |
| Tool/control/API documentation | Update status and schemas when operations become implemented; no speculative API registration |

## Validation Strategy

Documentation stage: check local links, requirement/acceptance coverage,
implemented-versus-planned statements, formatting and compatibility language.
No application build or test is required for this stage.

Implementation stage: run relevant knowledge, Orchestrator prompt/adapter,
observation/policy, Chat routing and Code-help regression suites. Include server
and affected renderer type/build checks, Desktop staging and npm package-contract
checks. Use captured Runtime requests to assert content bytes, not just skill
names. Expand storage/routing/integration tests for K3's actual affected owners.
Full required CI remains the integration gate; scoped fixtures do not establish
provider-live, native or other-OS acceptance.

All automated stateful checks use temporary directories or in-memory stores.
Live checks use isolated candidate profiles; never seed test conversations into
the user's dev disk state. Fixed expected outcomes and independent review govern
future promotion through PLAN-109.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Instructions promise an operation the agent cannot call | Select against verified adapter/tool capability and test the complete return path |
| Visible prompt gets knowledge but decision session does not | Capture and assert inputs at both Runtime request boundaries |
| Agent mentions a name and reports successful recruitment | Require explicit membership mutation and canonical postcondition read |
| Retried or interrupted actions duplicate work | Durable intent identity, input conflict checks and reconciliation before retry |
| New shared reader changes current Catlas help | Keep legacy bundle fixtures and existing help/packaging regressions |
| Ordinary role procedures accidentally ship development resources | Explicit audience/content classification and source-free/profile tests |

## Progress Log

| Date | Update |
|------|--------|
| 2026-09-25 | K2 harness `c5f73f7e` passes [full CI](https://github.com/cats-inc/cats-platform/actions/runs/36090719739). The separately approved one-run native K2 acceptance completes actual discovery/inspection/preparation/final feedback in four decisions and 53,128 reconciled tokens, with no admission/worker/edit and verified private cleanup. Interrupted tool observation resumed the same run. Explicit private 300-second/80,000-token policy passes; the first 8,669-token response does not fit the unchanged default. Independent raw-evidence review passes and records the closed discovery alias without claiming another model thread. Content-profile/combined rollout/practice gates remain open. |
| 2026-09-25 | Host-budget commit `cc5d07ad` passes [full CI](https://github.com/cats-inc/cats-platform/actions/runs/36089146521). Added a separate K2 acceptance harness mode with explicit limits, real authenticated Chat API, startup/turn settlement, one-session containment and native usage reconciliation. Server build, test typecheck, nine focused cases, credential-free native readiness and independent review pass; full CI pending. No further native inference is authorized or claimed by this checkpoint. |
| 2026-09-25 | Added strict, immutable host-owned K2 preparation settings with unchanged 30-second/8,000-token defaults. Begin/retry receives the policy; the loop preserves narrower limits and K3 keeps its separate execution allowance. Three prior-build regressions fail as expected; server compilation, test typecheck, 190 focused cases and independent implementation review pass. Full CI pending. No normal host configuration, native inference, target/grant, persisted schema or frozen contract changed. |
| 2026-09-25 | K2 failure accounting on `24205589` passes [full CI](https://github.com/cats-inc/cats-platform/actions/runs/36086668719), including `validate`, `nodejs (24)`, full typechecks and tests. Both context reuse and accounting prerequisites are integration-validated. The next preparation-budget contract is documented and independently reviewed as proposed; no numerical increase, target substitution or native call is authorized by that note. Native K2 and PLAN-109 profile/practice gates remain open. |
| 2026-09-25 | K2 records Runtime usage before parsing and publishes a terminal report for attempted-inference failures, preventing an unreported ordinary Chat retry. Optional usage snapshots distinguish known subtotal from complete usage and stay fixed after late replies. Three red regressions confirm the original failure; 74 focused cases, server compilation, test typecheck and independent review pass. Original budgets, target, normal first-decision/setup fallback and K3 grants remain unchanged. Full CI pending; native K2/profile gates stay open. |
| 2026-09-25 | K2 context reuse on `14c080fc` passes [full CI](https://github.com/cats-inc/cats-platform/actions/runs/36084948721), including `validate`, `nodejs (24)`, full typechecks and tests. The reset checkpoint and indexes now distinguish completed bounded K3/native projection and K2 cache evidence from still-open native preparation and profile/practice gates. This follow-up is documentation-only; no further model inference or budget change. |
| 2026-09-25 | K2 preparation now reuses the reviewed session-bound delivery helper while retaining four results/five requests/30 seconds/8,000 tokens. Actual zero-inference production capture reduces new wire bytes from 63,213 to 45,688, matching the offline projection; bootstrap metadata grows, and native token fit is not inferred. All 92 focused cases, server compilation, test typecheck and independent review pass. Full CI pending; native K2 and profile/practice gates remain open. |
| 2026-09-25 | Full [CI on `471755c9`](https://github.com/cats-inc/cats-platform/actions/runs/36082102563) passes `validate` and `nodejs (24)`. Successful saved-state native Chat/Work projections now pass: completion report, consumed confirmation, completed parent/role Tasks and review Run/outcome; all owned processes close normally. This evidence-only slice records the resumable next boundary without changing tested inputs. Model-driven K2 preparation and PLAN-109 profile/practice gates remain open. |
| 2026-09-25 | Bounded live K3 passes at 61,033 reconciled tokens after the recorded 95,312-token failure: real implementation/revision/review, all seven outcomes, final feedback, duplicate confirmation and cleanup verified. Added session-bound context references, fixed-workflow acceptance, bounded feedback projections and canonical read-tool grants; 53 latest focused cases, compilation and independent review pass. Native blocked/cancelled projections and create/bridge recovery pass. Runtime through `a694104` passes full CI; Platform CI and successful native projections are the next checkpointed slice. PLAN-109 profile/practice gates and model-driven K2 acceptance remain open. |
| 2026-09-25 | Corrected [K4 CI on `b30d5adc`](https://github.com/cats-inc/cats-platform/actions/runs/36065815288) passes `validate` and `nodejs (24)`, full typechecks and 4,780 tests (59 skipped; zero failures/cancellations). The isolated acceptance and live-preflight correction slice is integration-validated. Full worker/revision/review execution, native result projections, the bounded native CLI flow and PLAN-109 profile/practice gates remain open. This documentation-only record changes no tested executable or packaged knowledge inputs. |
| 2026-09-25 | Initial K4 CI passed full typechecks and 4,778 tests (59 skipped), with two stale close-handler source assertions. Updated their captured-window binding expectations while preserving the tray/shutdown/installer guards; all four focused checks and independent review pass. This correction changes tests and this validation record only; production behavior and the remaining live acceptance limits are unchanged. Corrected full CI pending. |
| 2026-09-25 | K4 source-free npm/Desktop knowledge and native Windows candidate startup/lock/close acceptance pass. Real Codex coordination exposed missing decision-format guidance, pre-parse usage loss and terminal-feedback reason overwrites; fixes and focused regressions pass. Exact CLI readiness now passes via bounded version/help diagnostics with zero inference; Work's passive-versus-execution readiness mismatch is corrected without widening other backends. Native CLI input growth still crosses the response-boundary token threshold. Worker execution, revision/review, native result projections and profile exclusion remain open; see the dated K4 evidence. No release/version or user-state change. Full CI pending. |
| 2026-09-25 | Full [CI on `115fe483`](https://github.com/cats-inc/cats-platform/actions/runs/36052038916) passed `validate` and `nodejs (24)`, including full typechecks and 4,747 passing tests (59 skipped; zero failures/cancellations). K3's code/integration gate is complete. This subsequent documentation-only record does not change tested executable inputs; all 1,031 local Markdown links resolve and fences balance. K4 live/native/source-free acceptance and PLAN-109 development/practice/promotion remain open. |
| 2026-09-25 | Initial K3 CI exposed only the missing seven exact Chat-to-Work dependency registrations. Added those planned edges without weakening generic ownership rules. Follow-up review found stale Core writers in memory/Bot APIs; corrected atomic validation/mutation, with twelve isolated HTTP races failing before and passing after. All 257 affected follow-up tests and server compilation pass; independent reviews cover production changes, boundary registrations and tests. Corrected full CI pending. |
| 2026-09-25 | Implemented K3 owner-confirmed Chat/Work collaboration, pure role queue plus independently authorized host execution, immutable revision review and durable cancellation/recovery. Fixed concurrent Chat/Telegram writers and duplicate-confirmation turn lifecycle. All 823 focused tests, server/test typechecks, document checks and independent review pass. Full CI pending; K4 live/native/distribution and PLAN-109 practice remain open. |
| 2026-09-25 | Full [CI on `34221fad`](https://github.com/cats-inc/cats-platform/actions/runs/36035473857) passed both `validate` and `nodejs (24)`, including full typechecks and the complete test suite. K2's code/integration gate is complete. This subsequent documentation-only record does not change tested executable inputs or claim K3-K4/live-provider completion. |
| 2026-09-25 | Implemented K2's Chat read delegates, exact manifests/procedure dependency, bounded same-session feedback, validated proposals and post-ACK continuation. Independent review corrections cover substantive revisions, original-source anchoring, cleanup/publication revalidation, cancellation consumption, concurrent-state preservation, authenticated entry scoping, Runtime request policy and ordinary fallback. The first expanded run exposed seven metadata-only observation regressions; limited actual-goal delivery to the verified K2 surface without weakening existing tests. The final 480-test focused batch, compilation/typecheck, document checks and independent review pass. Full CI pending; K3-K4 remain open. |
| 2026-09-24 | Full [CI on `c4736f98`](https://github.com/cats-inc/cats-platform/actions/runs/35976031494) passed both `validate` and `nodejs (24)`, including the corrected Code/Work scope and asynchronous rewrite fixtures. K1's code/integration gate is complete. This subsequent documentation-only record does not change tested executable inputs or claim K2-K4/live-provider completion. |
| 2026-09-24 | CI corrections passed 26 focused scope/Code/setup cases and then the expanded 255-test regression batch. Refreshed server typecheck/output, test bundles and bundled server output passed. Independent review confirmed the scope fix and asynchronous test correction without weakening product assertions. Follow-up full CI remains the integration gate. |
| 2026-09-24 | Initial [CI on `3815c6d0`](https://github.com/cats-inc/cats-platform/actions/runs/35974455451) passed typechecks and 4,688 tests but exposed two integration failures: Code's internal actor slot received Chat coordinator instructions, and the rewrite fixture read the transcript immediately after asynchronous ACK. Restricted both knowledge paths to explicit Chat origin, added Code/Work exclusion coverage, and made the rewrite fixture await the actual reply while also checking its delivered content/receipt. Follow-up validation is required before reporting CI success. |
| 2026-09-24 | After the owner confirmed same-round wiring, implemented K1 shared knowledge, both applicable Orchestrator input paths, bilingual procedures, provenance and npm/Desktop assets. Scoped validation and independent review passed as recorded above; K2-K4 operations and live acceptance remain pending. |
| 2026-09-24 | Drafted ADR-119, SPEC-118 and PLAN-110 from the owner's knowledge/tools/skills clarification. Recorded the current two Orchestrator input paths, separate operation/result gaps, staged ownership and pending acceptance. This drafting change adds no executable wiring, runtime tool, native skill, user state, version bump or publication. |
| 2026-09-24 | Documentation validation passed for all three new documents and their four index references: 41 local links, 14 unique functional requirements mapped to 10 acceptance criteria, balanced fences, no template placeholders and UTF-8/LF. Reviewed parent-plan and registry links, profile boundaries, current-versus-proposed capability claims and whitespace. No application tests or builds were run for this documentation-only change. |

---

*Created: 2026-09-24*
*Last updated: 2026-09-25*

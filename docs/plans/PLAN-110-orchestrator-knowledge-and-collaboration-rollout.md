# PLAN-110: Orchestrator Knowledge and Collaboration Rollout

## Metadata

| Field | Value |
|-------|-------|
| Status | In progress; K1-K3 CI-validated; K4 distribution/native startup verified, full live execution pending |
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
| K4 | Source-free distribution and isolated live-provider/native acceptance | K3 | Pending |

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
decision session, 30-second elapsed cap and measured-usage checks. Structured
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
- [ ] Inspect native UI projections, actual model delivery, conversation and
  membership IDs, Task/Run results and retained cancellation/recovery evidence.
- [x] Test a model path without native skill discovery. Native skills or MCP
  resources remain optional later delivery work, requiring separate proof.
- [ ] Record provider/OS/build-specific limits and scoped completion. Update
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
live harness; full CI for this executable K4 slice is pending.

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

# SPEC-118: Orchestrator Knowledge and Collaboration Operations

## Metadata

| Field | Value |
|-------|-------|
| Status | In progress; K1-K2 CI-validated; K3 scoped validation passed, CI pending; K4 pending |
| Owner | Platform integration; Chat owns conversation operations |
| Reviewer | Product owner; independent Codex implementation review |
| Decision | [ADR-119](../decisions/119-share-product-knowledge-and-role-procedures-with-supervised-agents.md) |
| Plan | [PLAN-110](../plans/PLAN-110-orchestrator-knowledge-and-collaboration-rollout.md) |
| Last updated | 2026-09-25 |

## Summary

Give Orchestrator both compatible product procedures and the current verified
tool surface, with bounded user/context inputs and structured execution feedback.
Reuse the knowledge mechanism introduced for Catlas, while keeping Orchestrator
independent of the optional Guide Cat and preserving existing supervision.
Ordinary collaboration knowledge belongs in both release and preview/debug;
Cats-source development/practice skills remain governed by SPEC-117.

The owner calls this coordinator God Cat; current implementation prompts call
the visible role Boss Cat. This spec introduces no new Cat type or public rename.
The contracts below are proposed until their PLAN-110 gate has evidence.

## Goals

- Make product knowledge reusable across explanation and coordinated execution.
- Teach selection, sequencing, handoff and verification alongside tool schemas.
- Prove actual model input delivery without requiring provider-native skills.
- Enable one recoverable collaboration flow using canonical product operations.

## Non-Goals

- Enabling the preview development supplement in release.
- Giving Catlas orchestration authority or requiring it for ordinary Chat.
- Replacing deterministic routing, the interaction engine or Core work records.
- Autonomous source modification, practice, knowledge promotion or publication.
- A generic shell/HTTP escape hatch for missing product operations.
- Shipping a new MCP server, native skill library or vector database in phase 1.

## Inspected Baseline (before K1)

Static inspection on 2026-09-24 used Platform `1391075e`, including the Catlas
implementation and packaging correction in `0f140439` / `e3a61434`. This planning
pass did not run a provider, create real conversations or modify user state.

| Area | Existing source | Gap for this work package |
|------|-----------------|---------------------------|
| Knowledge | [reader](../../src/platform/catlas/knowledge.ts), [bundle](../../config/catlas-knowledge.json) | Code-entry Catlas only; no Orchestrator consumer or role/procedure selection |
| Visible coordinator | [prompt builder](../../src/products/chat/state/prompts.ts) | Fixed role/roster/memory/recent-message context; mentions existing participants, no versioned procedure delivery |
| Decision request | [Chat requester](../../src/products/chat/state/providerAgentDecisionRequester.ts), [Platform adapter](../../src/platform/orchestration/providerAgentAdapter.ts) | Structured decision contract exists; prompt serializes observation without product procedure content |
| Observation and capabilities | [Chat observation](../../src/products/chat/state/providerAgentObservation.ts), [turn preparation](../../src/products/chat/state/runtime-dispatch/turn.ts) | Bounded routing summaries and selected Work descriptors exist; no complete collaboration operation inventory |
| Conversation mutations | [Chat routes](../../src/products/chat/api/resources/channelRoutes.ts), [route support](../../src/products/chat/api/routeSupport.ts) | Existing product writes need explicit supervised agent adapters, receipts and retry/recovery mapping |
| Supervision | [policy gate](../../src/platform/orchestration/providerAgentPolicyGate.ts), [lifecycle tools](../../src/platform/supervision/lifecycleTools.ts) | Reusable primitives; a spawn record alone does not establish conversation membership or finished work |
| Registries | [tool calls](../tool-calls.md), [control surfaces](../agent-control-surfaces.md) | Several internal delegates still have pending runtime exposure; an HTTP route is not proof of agent callability |

## Design Overview

```mermaid
flowchart LR
  K[Versioned concepts and role procedures] --> C[Platform context assembly]
  T[Verified tools filtered by policy] --> C
  O[Current authorized observation] --> C
  C --> M[Bound Orchestrator model]
  M --> D[Structured decision]
  D --> G[Existing policy and product delegate]
  G --> R[Authoritative result and evidence]
  R --> C
```

Catlas uses the same knowledge reader with its own scope and explain-only
inference path. The visible coordinator response and provider-agent decision
request can consume different selected procedures, but neither may infer that
content delivered to another session is already present in its own context.

### Knowledge and procedure contract

The shared reader must retain the current Catlas v1 behavior while introducing
an explicitly versioned role-aware format. Entry metadata is:

| Field group | Meaning |
|-------------|---------|
| Identity/provenance | Stable entry ID, revision, content digest, sources and verification date |
| Audience/kind | `catlas` and/or `orchestrator`; concept or procedure |
| Applicability | Product/build range, required capabilities, locale and supported surfaces |
| Selection | Intent/topic cues and bounded entry size |
| Procedure | Prerequisites, ordered steps, expected observations/results, recovery and stop conditions |
| Operation dependencies | Canonical operation IDs and compatible contract revisions; no copied executable schema |

Knowledge files contain product facts and methods. Actual Cat IDs, provider
readiness, grants, budgets and conversation contents belong in a fresh
observation, not a distributable bundle. Build-coupled files are authoritative;
indexes and native/MCP delivery representations are derived and replaceable.

### K1 implementation contract

The shared Platform reader accepts the shipped Catlas `schemaVersion: 1`
bundle and the new `schemaVersion: 2` Orchestrator bundle. V1 entries normalize
to `catlas` concepts on `code-help`; V2 explicitly validates `roles`, `kind`,
`surfaces` and `requiredOperations: [{ id, version }]`, as well as both `en` and
`zh-TW` contents. Operation dependencies require an exact manifest revision.
Bundle loading is capped at 128 KiB; the entire serialized Orchestrator knowledge
envelope, including goal, scope, operations, entries and digest, is at most
16,000 characters. Truncated goals/operations and omitted large scope summaries
are explicit; omitted scope retains a digest and suppresses intent procedures.

Chat selects on the actual bounded goal, response language, current roster,
surface and verified operation descriptors. Ordinary/global Orchestrator replies
receive inline per-turn instructions, including the rewrite pass; structured
decision requests receive the same content mechanism in their own JSON envelope.
Provider-selected default Chat retains its ordinary assistant identity. Code and
Work also reuse the internal actor slot; they retain product-owned instructions.
K1 coordinator role injection requires explicit Chat origin and a real
Orchestrator consumer. Other Cats do not inherit this role.

Decision requests compare the current normalized provider/model/instance/control
identity with the capability observation and send the actual Orchestrator binding,
including default-model selection and controls. This does not use Catlas's binding.
Each invocation reloads the packaged asset and recomputes context provenance;
there is no selection cache that survives a binding, locale, roster, policy or
tool change. Visible dispatch conservatively exposes only the existing room
handoff convention; a requested tool-intent profile is not a verified provider
tool inventory. Decision selection uses its policy-filtered `availableTools`.

`productKnowledge` request metadata records status, role/surface/locale, bundle
revision/digest, entry IDs/revisions/digests, context digest and `inline`/`none`
delivery. Visible assistant metadata retains the receipt after Runtime returns.
The existing request/session evidence identifies the execution target. These
receipts prove what the request contained, not model understanding or completed
product operations. Missing/invalid/incompatible content produces an empty
snapshot and normal dispatch under existing policy. Native skill discovery is
not required. K2 adds the read/preparation loop below; mutation tools remain K3.

### K2 read-operation contract

K2 uses Chat-owned supervised delegates, delivered through the existing opt-in
provider-agent decision path (`CATS_CHAT_PROVIDER_AGENT_DECISION_ENABLED`). It
does not change the default setting or expose a public HTTP/MCP endpoint.
Existing Work intake/triage phases retain their own tools; the new read surface
is offered only when no such product operation phase is selected.
Only the authenticated Chat message/retry entry explicitly enables this surface;
the separate direct Orchestrator dispatch endpoint does not advertise it.
The actual bounded goal is added only when these read descriptors are available;
other decision observations retain their existing metadata-only input contract.

| Operation (revision 1.0) | Input | Result |
|--------------------------|-------|--------|
| `chat.collaboration.discover_cats` | Optional query (128 characters), limit (1-16) | Active Chat Cats in the authenticated local owner's directory, stable IDs, declared roles, configured targets, current-room lease status and light Runtime availability; bounded/truncated flags |
| `chat.collaboration.inspect_context` | Empty object; scope is server-bound | Current canonical conversation identity, topology, active participant IDs, workspace presence, current routing status and revision; no other conversation contents |
| `chat.collaboration.prepare` | Observed revision, two distinct discovered Cat IDs, reuse-current/create intent, expected output, bounded missing-information list and proposed work budget | A validated proposal or a missing-input/capability result; no creation, membership, assignment or execution |

Only a routed Chat Orchestrator can receive these descriptors. Read grants are
intersected with policy; tool and output revisions are checked. Roles are
declared metadata, not verified skill or permission claims. Light availability
does not admit execution. Default-provider Chat, direct Cat replies, Code/Work
and external transports do not inherit owner-directory access from an actor name.

The requester performs bounded, sequential calls in one ephemeral decision
session, after the ordinary message ACK and active-turn persistence. Every
delegate result returns as structured feedback to that session.
At most four operations and five model requests fit within the original elapsed
budget (capped at 30 seconds); measured usage is checked between calls. Tokens
cannot be hard-capped inside a provider call with the current Runtime contract.
Timeout/cancellation stops continuation and requests best-effort Runtime cancel
and close. Fresh reads recheck scope, binding and relevant state before acting
on a model response and before returning a proposal. No continuation survives a
restart. Preparation budgets are suggestions, never execution grants.

The ordinary cancel endpoint stops the active preparation and consumes its
cancellation request. The existing mutation-gated dispatch merge preserves
concurrent changes; a final revision/source-message check inside that gate
downgrades stale proposals before publication. Discovery results are bounded to
10,000 serialized candidate characters; all feedback together is limited to
24,000 characters/four receipts. Unsupported monetary limits and missing usage
measurements stop preparation once a collaboration tool is selected. An ordinary
first response retains the existing decision/fallback path even if usage is
unavailable. Cleanup is best effort and bounded separately.

Decision sessions reuse the existing isolated `sandbox` / `read_only` / `default`
Runtime request contract, request no native skills, instruct JSON-only decisions
and reject observed non-text/native-tool segments. This is not a universal
provider-native tool prohibition: provider-specific enforcement and live/native
acceptance remain K4, with no Runtime implementation changes in K2.

The final proposal has Chat origin, goal/current-conversation-only handoff scope,
expected output, distinct implementation/review roles and a review dependency on
the actual implementation artifact/revision. An ordinary localized transcript
message records preparation and tool receipts; it cannot claim collaboration
mutations. Ordinary Chat turn/run projections still record the coordinator's
preparation response; no teammate execution run or managed Work is admitted.
K3 must re-admit and revalidate any later execution.

### K3 admission, mutation and recovery contract

K3's complete provider call/result path is implemented; scoped validation passes
and full CI is pending (see PLAN-110).
The following operations require an actual owner-confirmed proposal. This adds
no public HTTP route and does not alter the default provider-agent opt-in.

An executable preparation is displayed through the existing Chat choice surface.
Its submitted owner choice binds the persisted proposal, original goal, two
selected Cats, workspace policy and combined duration/token budget. Plain model
text, a fabricated choice, or a proposal without the new execution-scope digest
cannot authorize writes. Existing K2 proposals remain readable; prepare a fresh
proposal to execute them. This additive metadata requires no persisted schema
migration and must preserve old snapshots unchanged.

| Operation (revision 1.0) | Owner | Result / boundary |
|--------------------------|-------|-------------------|
| `chat.collaboration.ensure_conversation` | Chat | Create or reuse the admitted Chat conversation through the canonical channel builder; return verified canonical identity and created/reused outcome |
| `chat.collaboration.ensure_participants` | Chat | Add only the two admitted existing Cats through membership delegates; return canonical membership postconditions |
| `work.collaboration.request_role` | Work | Persist one queued role Run only, returning an accepted request; no Runtime calls inside this tool. Review queuing requires the implementation's verified immutable revision |
| `work.collaboration.inspect` | Work | Read only this intent's authoritative records, stage, results and retained evidence |
| `work.collaboration.stop` | Work | Stop only this intent's owned execution; retain conversations, memberships, Tasks/Runs and evidence |

One durable parent Task carries a versioned collaboration intent in existing
metadata. Its key derives from the source conversation and proposal message;
input digest conflicts reject instead of creating another workflow. Child Task,
Run, artifact and outcome identities derive from that intent and role. The Chat
store uses an additive atomic snapshot mutation seam so a canonical conversation
or membership change and its intent receipt commit together. Core/Work updates
use the existing Core transaction seam; no second store or scheduler is added.
Unrelated memory and bot-binding mutations also apply to the latest Core inside
that transaction. A delayed request must not replace newly admitted Tasks/Runs,
restore deleted memory, or bypass current binding-token uniqueness.

The coordinator retains `narrow_write`; FR-19 still denies broad writes to
unknown/catalog-only models, and weak-worker ceilings remain unchanged.
After the local queue tool returns and its receipt is persisted, the host drains
that queued role in the existing post-ACK continuation. Work independently checks
the persisted owner grant (proposal digest, fixed role/Cat, repository, permission
envelope and shared budget), then calls the expensive supervised Runtime boundary.
The queue result itself grants no execution authority. A subsequent host inspection
receipt delivers the actual Run result to the same coordinator. This follows the
existing Work admission-to-runner separation; expensive execution is not relabeled
as a local-state model tool. Reviewer Tasks remain non-dispatchable until proof.

Each stage records intent before external work. A bounded sequential coordinator
session receives actual tool results; proposed/accepted/started/result-ready/
reviewed states remain distinct. The combined work budget covers both Cats and
is checked between calls; deadline/cancellation cancels owned Runtime work and
prevents late responses from committing success. Native provider enforcement
and installed/live acceptance remain K4, not claims of this implementation.

Implementation evidence comes from Runtime delivery, not a Cat's prose or an
invented artifact ID. The reviewer receives that exact isolated workspace and
artifact/revision, under read-only policy. A review verdict is attributed to the
reviewer and does not establish mechanical correctness of free-text acceptance
criteria. Publication to a remote repository is outside this collaboration grant.

The initial K3 execution requires a repository workspace. Runtime must produce a
new immutable commit in its isolated worktree and confirm a clean matching HEAD;
an artifact listing currently has no digest and cannot satisfy this gate alone.
The reviewer session's actual cwd must match that verified delivery workspace,
with matching clean HEAD before and after review. The check proves captured
revision identity, not passing tests. Both role Tasks exist at admission so
generic convergence cannot mistake implementation alone for completion.

Budget fields on Runtime supervision metadata are descriptive today; the K3
delegate must enforce elapsed time, measured usage and cancellation itself.
Persist the supervised runtime bridge immediately after session creation and
before sending work. Runtime has no create-session idempotency key or lookup by
operation: a crash between accepted creation and bridge persistence is ambiguous
and must block, never trigger a blind replacement session. Recovery must not use
the transport golden-path startup sweep, which may create replacement sessions.

Duplicate requests return existing postconditions; HTTP confirmation preserves
the original cancellable turn. A stopped attempt requires a new proposal, not
an automatic retry. Restart recovery reconciles active and fenced parents with
unfinished children/sessions. Known late session IDs are persisted even after
cancellation, and cleanup is marked complete only after confirmation. Starting
without a session ID remains ambiguous and never triggers a replacement create.
Concurrent edits, continuity resets, target changes, removed members,
stale owner intent and revoked scope stop further effects. Partial completion is
reported truthfully; already-created user work is never silently deleted.

### Collaboration responsibility map

The following maps the complete workflow. K2 read/preparation and K3 mutation/
lifecycle identifiers and exact input restrictions are registered above. Model
inputs cannot override the server-bound intent, identities, workspace or grant.

| Operation | Input supplied by model | Server-resolved context and result |
|-----------|-------------------------|------------------------------------|
| Discover eligible teammates | Optional bounded query and limit | Authorized existing Cats, stable IDs, readiness/availability and capability limits |
| Inspect collaboration context | `{}` | Current bound conversation, participants, supported topology, workspace, routing and observed revision |
| Prepare collaboration | Observed revision, distinct discovered Cat IDs, reuse/create intent, expected output, missing information and proposed budget | Original goal, product origin, authorized candidates and validated proposal |
| Ensure conversation | `{}` | Owner-confirmed scope, canonical conversation/channel mapping and created/reused outcome |
| Ensure participant membership | `{}` | The two admitted Cats, current canonical membership and added/already-present outcome |
| Request role work | `{role: "implementation"}` or `{role: "review"}` | Fixed Task/Run, owner grant, dependency and accepted queue result; host separately validates before Runtime startup |
| Inspect or stop owned work | `{}` | Bound intent's authoritative lifecycle, cancellation outcome, retained work/evidence references |

The first flow uses two distinct existing, eligible Cats for implementation and
review. It does not create permanent Cats or provider instances. Review starts
after the implementation artifact/revision is available. Adding a participant,
starting a run and completing a task are separately observable outcomes.

## Requirements

### Functional Requirements

- **FR-01 — Shared ownership.** Platform shall own validated knowledge loading,
  applicability, bounded selection and provenance. Catlas and Orchestrator shall
  use this mechanism without depending on each other's identity or settings.
- **FR-02 — Versioned role procedures.** Validate the entry metadata above,
  reject unsupported formats, select only applicable role/surface content and
  preserve tested behavior for the shipped Catlas v1 bundle. Limit loaded bytes
  and model context; do not load every procedure on every turn.
- **FR-03 — Tool truth.** Derive available operations from executable manifests,
  verified adapters, selected provider capability and current policy. Procedures
  cannot register tools. Missing/incompatible required operations prevent an
  execution procedure from being presented as runnable.
- **FR-04 — Actual model delivery.** Deliver relevant content to the visible
  coordinator and the decision path that performs the task. Phase 1 uses inline
  content. A later native-skill or MCP resource path must prove the actual read
  and preserve the same entry revision/digest; a path or URI is not delivery.
- **FR-05 — Bounded current context.** Provide the actual authorized user goal,
  surface, entity references, eligible roster, availability, grant/budget summary
  and observation revision. Existing character counts and opaque references
  alone are insufficient for a new collaboration decision. Revalidate facts at
  mutation time. Exclude unrelated private conversations and secrets.
- **FR-06 — Role and routing integrity.** Resolve the Orchestrator's own binding
  and server-owned actor identity. Knowledge must not override deterministic
  routing, add implicit audience members, turn a mention into an invitation or
  grant a procedure/tool access from its text.
- **FR-07 — Complete operation path.** Reuse owning product delegates and the
  supervised tool boundary for each advertised operation. Validate target scope,
  schema, current state, capability, authorization and existing approval rules.
  Preserve conversation topology, origin/recents and publication of product state
  changes. Never write raw Core/channel records from a skill.
- **FR-08 — Feedback and verification.** Return structured results to the same
  coordinating run and expose relevant postconditions. Distinguish rejected,
  pending approval, accepted, started, completed and failed states. Report creation
  only after reading its canonical identity/membership; report task success only
  after the expected output is verified.
- **FR-09 — Durable retry and cancellation.** Bind operation identity to the
  admitted user intent/run. Repeated or concurrent delivery shall not duplicate
  conversations, memberships or work. Changed inputs using the same identity
  shall conflict. Reconcile interrupted/partially applied work before retrying;
  cancellation stops owned execution and retains already created work/evidence.
- **FR-10 — Scoped handoff and review.** Transfer the goal, allowed resources,
  constraints, expected output and source-run references to each selected Cat.
  Use a distinct eligible reviewer for the first flow and pass the actual
  implementation result before review. If that is impossible, explain the unmet
  prerequisite rather than inventing a teammate or claiming independent review.
- **FR-11 — Traceable delivery.** Record requested/selected/delivered entry IDs,
  revisions/digests, delivery mode, target/session, input-context revision and
  operation/result references through existing trace/evidence ownership. Do not
  require hidden reasoning traces or a second private conversation ledger.
- **FR-12 — Invalidation and fallback.** Refresh selection on build, tool,
  provider binding, role, grant or relevant state changes, including resume.
  Missing knowledge preserves ordinary Chat and existing routing; the new
  collaboration workflow stops or requests a missing prerequisite without
  fabricating success, broadening permissions or retrying without a bound.
- **FR-13 — Distribution.** Package normal product procedures for source-free
  release and preview/debug. Keep ADR-118's development/practice supplement
  separate. A native wrapper, if introduced later, is an explicitly classified
  Runtime-delivered representation, not a new Platform skill catalog.
- **FR-14 — Compatibility and learning.** Preserve compatible 0.4.x interfaces
  for additive wiring. Any breaking contract follows the next-minor policy.
  User-data changes need validated backup, atomic replacement and failure/restart
  recovery tests. Candidate lessons follow SPEC-117's independent promotion;
  ordinary conversations are not automatically global training material.

### Non-Functional Requirements

- Reuse current bounded context limits as the starting budget and record any
  justified increase; no unbounded tool/resource discovery or full-state dump.
- Use existing execution budgets and cancellation, with explicit limits for
  operation count, elapsed time and measured provider usage in the first flow.
- Begin with English and Traditional Chinese; validity and execution semantics
  must not depend on which natural language expresses the goal.
- Missing procedure knowledge must not break ordinary conversation delivery.

## First End-to-End Acceptance Scenario

Request: "Create a bug-fix conversation with one implementer and one reviewer."

1. Resolve the current goal, authorized scope and two eligible existing Cats.
   Ask a focused question if the bug or intended workspace is unspecified.
2. Reuse a suitable authorized conversation when requested, or create one with
   the correct origin/topology and durable operation identity.
3. Ensure membership and roles once, then read back canonical participant IDs.
4. Create/assign work through its owning product path and start the implementer
   with bounded context. Review depends on the returned artifact/revision.
5. Return each actual tool result to the Orchestrator. Rejected, pending or
   partial results select the documented recovery instead of a success claim.
6. Report the conversation, participants and work status with evidence. Retry
   the same intent and prove there are no duplicate resources.

A candidate conversation being created does not mean the bug is fixed. A review
assignment is not a completed review. The first knowledge-only gate cannot be
reported as this end-to-end scenario passing.

## Acceptance Criteria

K1 has fixture evidence for AC-01/AC-02 and the knowledge-only parts of
AC-03/AC-08/AC-09, recorded in PLAN-110. K2 adds read/preparation evidence for
AC-03/AC-04/AC-08, including actual requester and authenticated HTTP continuation,
result feedback, stale-state rejection and cancellation. Real provider/native
behavior, full profile exclusion and installed end-to-end acceptance remain K4.
K3 adds mutation, immutable-revision, result-feedback and recovery fixtures for
AC-05/AC-06/AC-07/AC-08; validation outcomes are recorded in PLAN-110.

| ID | Observable criterion | Requirements |
|----|----------------------|--------------|
| AC-01 | Shared reader selects role/locale/build-compatible content and rejects invalid/oversized bundles while existing Catlas fixtures continue to pass | FR-01, FR-02, FR-14 |
| AC-02 | Captured requests contain actual selected procedure text/digests in both applicable Orchestrator paths, including a provider without native skill support | FR-04, FR-11 |
| AC-03 | An unsupported tool or stale tool revision cannot become callable through a procedure; ordinary Chat still works | FR-03, FR-06, FR-12 |
| AC-04 | Two different authorized goals/states produce distinguishable observations and appropriate eligible targets; unrelated private data is absent | FR-05, FR-06, FR-10 |
| AC-05 | The collaboration scenario reads back canonical conversation/membership IDs and correct product projections | FR-07, FR-08 |
| AC-06 | The same, concurrent and interrupted intents do not duplicate resources; changed inputs conflict and cancellation preserves recoverable outputs | FR-09, FR-14 |
| AC-07 | Rejected/pending/failed tool results reach the coordinating model and prevent false creation/start/completion reports; review uses the real implementation result | FR-08, FR-10, FR-11 |
| AC-08 | Binding, permission, tool, build and resume changes invalidate stale procedure selection and observations | FR-02, FR-05, FR-12 |
| AC-09 | Source-free npm/Desktop fixtures include normal procedures and consume them without Catlas or development skills; profile exclusion is separately evidenced | FR-01, FR-13 |
| AC-10 | An isolated live-provider candidate performs the flow with an identified grant/budget and evidence; knowledge promotion and persistent-state upgrade checks apply before their respective gates close | FR-07, FR-09, FR-11, FR-14 |

## Dependencies and Implementation Decisions

The integration owner must map durable operation identity/recovery fields onto
existing Core/Work records before enabling writes. Final operation schemas,
approval UX and topology mapping require owning-product review; they are not
new public contracts in this drafting pass. Changes to frozen Core/Chat contracts
must follow the [integration guide](../product-integration-guide.md).

Native skill/MCP resource delivery is deferred until inline delivery and the
first complete tool/result path are validated. Runtime changes, if required,
must have their own member-local implementation and compatibility checks.

## References

- [SPEC-117: knowledge production and promotion](SPEC-117-cats-self-development-and-catlas-practice.md)
- [SPEC-109: phase-scoped tools](SPEC-109-phase-scoped-work-tool-surface.md)
- [PLAN-075: provider-agent supervision](../plans/PLAN-075-real-provider-orchestrator-integration.md)
- [Tool registry](../tool-calls.md) and [control surfaces](../agent-control-surfaces.md)

---

*Created: 2026-09-24*
*Last updated: 2026-09-25*

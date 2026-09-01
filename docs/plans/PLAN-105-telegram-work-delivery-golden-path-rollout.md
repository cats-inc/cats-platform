# PLAN-105: Telegram Work Delivery Golden Path Rollout

> Roll out the Core-owned path from Telegram intake through supervised
> execution, result review, policy-gated publication, and delivery receipt.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | Owner |

## Related Spec

[SPEC-114: Telegram Work Delivery Golden Path](../specs/SPEC-114-telegram-work-delivery-golden-path.md)

## Related Decision

[ADR-112: Adopt a Core-Owned Transport Work Delivery Golden Path](../decisions/112-adopt-a-core-owned-transport-work-delivery-golden-path.md)

## Overview

Build one narrow path over the existing Cats records and boundaries rather than
adding a new task ledger. The rollout first makes readiness and Telegram
callbacks truthful, then adds a versioned scope-confirmation command, connects
that command to idempotent Task/Run admission, makes supervised execution
produce durable progress and completion evidence, and finally closes result
publication and source-binding delivery with a recoverable outbox receipt.

Implementation is staged so every phase has an independently testable exit
condition. No phase may simulate success by writing demo data into the actual
persisted development state.

## Delivery Gates

| Gate | Required evidence | Effect |
|------|-------------------|--------|
| G0: Contract approved | ADR-112 and SPEC-114 approved, open questions needed for Phase 1 resolved | implementation may begin |
| G1: Honest readiness | binding, owner, Cat/provider, capability, workspace, permission, and delivery checks have product-visible diagnostics | Telegram may offer Start work |
| G2: Reliable ingress | callback polling, acknowledgement ordering, dedupe, and async outbox tests pass | Telegram callbacks may drive product commands |
| G3: Safe admission | versioned scope authorization and duplicate/restart tests produce exactly one approved Task and Run | redundant Desktop Start Run may be removed from the golden path |
| G4: Durable execution | supervised continuation, blocker, progress, cancellation, and completion-evidence tests pass | long work may be labeled running/result-ready |
| G5: Governed delivery | Artifact/commit evidence, publish gates, source-binding send, and receipt recovery tests pass | path may be labeled delivered |
| G6: Installed-product proof | packaged Desktop plus dedicated real Telegram test passes, with rollback and support notes | feature may be enabled for the first owner cohort |

## Implementation Phases

### Phase 0: Approve the Contract and Build a Trace Matrix

- [ ] Review and approve ADR-112's Core-ledger, layer-ownership, async-ingress,
      execution-authorization, and publish-gate decisions.
- [ ] Review SPEC-114 with product wording for the accepted, scope-proposed,
      admitted, decision-needed, result-ready, and delivered messages.
- [ ] Resolve the first default delivery mode and which result types Telegram
      may carry directly.
- [ ] Map every SPEC-114 requirement to the current implementation, a gap, or a
      deliberately deferred follow-up.
- [ ] Document the derivation of each golden-path projected stage from existing
      Core, supervision, Artifact/Outcome, and transport receipt state.
- [ ] Confirm that no new Core record family is needed. If one is needed, stop
      and propose a focused follow-up ADR before adding it.
- [ ] Define stable idempotency-key inputs for ingress, admission, owner
      decisions, publication, progress, and final delivery.
- [ ] Define a temporary-state test harness and dedicated Telegram test-binding
      procedure that complies with repository state-hygiene rules.

**Deliverables**: approved contracts, requirement trace matrix, projection
rules, idempotency scheme, and isolated test plan.

**Exit gate**: G0.

### Phase 1: Make Delegation Readiness Truthful and Product-Visible

- [ ] Add one readiness evaluator that composes Telegram binding health,
      authorized direct owner, bound Cat, provider/model target, provider
      capability profile, workspace/project, permission envelope, effective
      delivery policy, and desktop background-service state.
- [ ] Reuse that evaluator from Telegram admission, Desktop setup/status, and
      Work inspection instead of duplicating readiness rules.
- [ ] Add actionable reason codes and localized remediation copy for every
      missing prerequisite.
- [ ] Surface provider capability bootstrap/configuration through a supported
      Settings/onboarding path so local file editing is not the sole path.
- [ ] Prevent Telegram from offering Start work until the versioned proposal
      contains a currently admissible target.
- [ ] Ensure `/status` continues to report binding health and identifies when
      local execution is unavailable or degraded.
- [ ] Add tests for missing provider binary/auth, absent capability profile,
      invalid workspace, insufficient permission, disabled binding, and stopped
      background service.

**Deliverables**: shared readiness contract, Desktop remediation surface,
Telegram degradation messages, and readiness coverage.

**Exit gate**: G1.

### Phase 2: Repair Callback Ingress and Add Durable Async Delivery

- [ ] Include `callback_query` in Telegram long-polling `allowed_updates` and
      preserve parity in webhook registration.
- [ ] Verify callback update normalization for message-backed and supported
      message-less callback shapes.
- [ ] Answer recognized callback queries before invoking long-running product
      work; classify stale, unauthorized, expired, and already-applied actions.
- [ ] Replace entity-rich callback data with a compact opaque action token
      resolved through server-owned state.
- [ ] Add durable ingress idempotency keyed by binding and external update.
- [ ] Introduce or extend a transport delivery outbox for acknowledgements,
      proposals, progress, decisions, results, and publish results.
- [ ] Persist send attempt, retry classification, Telegram response message id,
      and terminal receipt without copying bot tokens into outbox payloads.
- [ ] Decouple polling/webhook continuation from assistant/runtime completion.
      Bound concurrency per binding so one long request cannot stop unrelated
      Telegram updates while preserving request-local ordering.
- [ ] Coalesce stale/routine progress and give decision/terminal deliveries
      higher priority.
- [ ] Add duplicate update, duplicate callback, callback-answer ordering,
      transient API error, ambiguous send, and process-restart tests.

**Deliverables**: callback-capable polling/webhook ingress, opaque action
tokens, durable outbox/receipt behavior, and non-blocking update processing.

**Exit gate**: G2.

### Phase 3: Version Scope and Admit Work from One Owner Confirmation

- [ ] Extend Work intake source context with the internal binding id, opaque
      source refs, proposal revision, and proposal digest while retaining
      existing conversation/message provenance.
- [ ] Add a scoped proposal projection containing goal, target,
      acceptance criteria, delivery mode, side effects, gates, readiness, and
      the one focal unresolved question.
- [ ] Render the proposal consistently in Telegram and Desktop with localized
      Start work, Adjust, and Cancel actions.
- [ ] Invalidate old action tokens whenever an execution-relevant proposal
      field changes.
- [ ] Add one product-owned authorization/admission command that verifies
      owner, binding, scope revision/digest, readiness, policy, and action
      expiry.
- [ ] Make the command produce one linked ready/approved Task and one queued
      supervised Run, or an actionable non-admitted result with no observable
      partial state. Use a storage transaction where available or a resumable
      idempotent saga with a stable admission key.
- [ ] Preserve the intake invariant: agent/tool activity in the creation turn
      cannot call the authorization command or manufacture the owner event.
- [ ] Record approval provenance as Telegram owner authorization and expose it
      in Task detail.
- [ ] Return admitted/blocked state and a safe Desktop link through the outbox.
- [ ] Keep manual Desktop approval and Start Run paths for non-golden-path work,
      while avoiding a redundant second click for an already-admitted Telegram
      scope.
- [ ] Test stale revision, changed policy, authorization mismatch, double tap,
      concurrent tap, failure between Task and Run persistence, and restart
      recovery.

**Deliverables**: versioned proposal, bounded authorization command,
idempotent Task/Run admission, Telegram controls, and Desktop evidence.

**Exit gate**: G3.

### Phase 4: Turn a Started Run into Durable Supervised Work

- [ ] Audit the current Work supervised-run bridge from admission through
      runtime session launch, checkpoints, lifecycle actions, and terminal
      projection; remove any assumption that one provider response completes
      the whole task.
- [ ] Define the completion-evidence evaluator for `artifact_only` and
      `commit_only` against the approved acceptance criteria.
- [ ] Persist checkpoints and structured continuation reasons so restart can
      resume or expose retry without reading raw transcripts in scheduler code.
- [ ] Wire timeout, retry, resume, cancellation, provider loss, permission
      denial, and approval blockers into authoritative Run state.
- [ ] Project admitted, running, checkpoint, decision-needed, failed,
      cancelled, and result-ready milestones into bounded outbox messages.
- [ ] Add state-valid Telegram callback actions for owner decisions,
      cancel/stop, retry, and resume by calling existing Work/supervision APIs.
- [ ] Ensure late or stale runtime events cannot regress a terminal state or
      deliver obsolete progress.
- [ ] Add fake-agent deterministic tests for multi-step continuation and
      evidence-based completion, then live-provider smoke behind explicit
      environment gates.

**Deliverables**: durable long-running supervision, completion evidence,
milestone projection, and owner decision/lifecycle controls.

**Exit gate**: G4.

### Phase 5: Materialize Results, Enforce Publish Gates, and Close Delivery

- [ ] Normalize accepted results into existing Outcome/Artifact/activity
      contracts with authoritative Work Item, Task, Run, workspace, producer,
      and declaration provenance.
- [ ] Implement `artifact_only` result-ready evidence and safe Telegram
      reference selection.
- [ ] Implement `commit_only` result-ready evidence including immutable commit
      id, concise change summary, and validation result.
- [ ] Render a result-preview message with acceptance evidence, effective
      policy, remaining gates, and Desktop inspection link.
- [ ] Route required publication approval through Core approvals and the
      product-owned delivery manifest; never infer approval in runtime or the
      Telegram transport.
- [ ] Ensure ordinary Artifact declarations cannot self-promote to published.
- [ ] Add idempotent delivery primitives for the first modes and preserve the
      existing action mapping for later push/PR/preview modes.
- [ ] Target the recorded source binding even if UI selection changes after
      intake.
- [ ] Mark the golden-path projection delivered only after the transport
      receipt is persisted; retain result-ready plus retry evidence on failure.
- [ ] Add publish denial, duplicate approval, side-effect timeout, binding
      rotation/removal, unsafe local path, oversized payload, Telegram outage,
      and restart-during-send tests.

**Deliverables**: result preview, Artifact/commit evidence, governed publish
action, final source-binding delivery, and durable receipt/retry state.

**Exit gate**: G5.

### Phase 6: Prove the Installed Golden Path and Roll It Out Safely

- [ ] Add a deterministic end-to-end suite covering `/work` through delivered
      using isolated Core and Telegram fake-server state.
- [ ] Add packaged Desktop smoke that validates background services, binding
      readiness, callback polling, provider launch, Desktop projection, and
      recovery links.
- [ ] Run one real Telegram smoke with a dedicated bot/binding and an explicit
      owner against both `artifact_only` and `commit_only`; capture redacted
      evidence and remove temporary test entities afterward.
- [ ] Restart Cats at scope-proposed, admitted/running, result-ready,
      publish-pending, and delivery-pending checkpoints and prove no duplicate
      Task, Run, commit/publish action, or final message.
- [ ] Verify attachment-only input fails truthfully and does not pass a filename
      to the agent as content.
- [ ] Verify the host-offline/sleep limitation is visible in setup, status, and
      support documentation.
- [ ] Add telemetry/diagnostic counters for readiness failure, dedupe hit,
      admission result, Run terminal state, decision latency, outbox retry, and
      delivery receipt without recording message bodies or secrets.
- [ ] Gate rollout to one owner cohort, define rollback as disabling golden-path
      callbacks while retaining Core/transport records, and review failure
      evidence before expanding.
- [ ] Reconcile SPEC-114, PLAN-105, relevant older Telegram/Work docs, support
      documentation, and index/status dates after acceptance.

**Deliverables**: isolated E2E suite, packaged and real-bot evidence,
restart/failure matrix, diagnostics, rollback, and rollout notes.

**Exit gate**: G6.

## Files to Create/Modify

The exact new module names are selected during Phase 0. Expected ownership is:

| Area | Action | Description |
|------|--------|-------------|
| `src/platform/transports/telegram/polling.ts` | Modify | request callback updates and stop awaiting long execution |
| `src/platform/transports/telegram/bridge.ts` | Modify | normalize/authorize callback actions and call product commands |
| `src/platform/transports/telegram/delivery.ts` | Modify | callback acknowledgement and response/receipt mapping |
| `src/platform/transports/telegram/store/` | Modify/Create | durable action-token, ingress dedupe, outbox, attempt, and receipt state |
| `src/products/chat/state/telegramBridgeAdapter.ts` | Modify | bridge Telegram intake and outbound product events without owning lifecycle truth |
| `src/products/chat/state/workIntakeSourceContext.ts` | Modify | retain source binding and versioned scope provenance |
| `src/products/work/state/workExecutionTaskDelegate.ts` | Modify | integrate owner-bound authorization with Task preparation invariants |
| `src/products/work/api/` | Modify/Create | bounded authorization/admission, inspection, and recovery API |
| `src/products/work/renderer/` | Modify | readiness, authorization evidence, stage, blocker, result, and receipt UI |
| `src/platform/supervision/` | Modify | durable continuation, lifecycle projection, evidence, and owner decision hooks |
| `src/core/` | Modify if required | additive metadata/projection/activity and existing delivery/artifact policy integration; no new ledger by default |
| `desktop/host/` and Settings/setup surfaces | Modify | truthful background/provider/capability readiness and remediation |
| `tests/telegram-*`, `tests/work-*`, `tests/supervision-*` | Modify/Create | unit, integration, restart, duplicate, and packaged-path coverage |
| `cats-runtime` contracts/tests | Conditional | only stable runtime execution/event capability gaps proven by the trace matrix; no product orchestration ownership |

## Technical Decisions

- **Core-owned truth**: derive the golden-path stage from existing Core and
  transport receipt state; do not add Beads or a parallel job database.
- **Metadata/projection first**: use additive versioned metadata, Activities,
  links, and projections before considering a new Core record family.
- **Owner-bound admission**: Start work is a product command over a versioned
  scope, not a privileged Telegram record mutation.
- **Atomic observability**: Task plus Run admission must appear exactly once;
  implement with a transaction or an idempotent resumable saga appropriate to
  the current store.
- **Async transport**: ingress persists and acknowledges; scheduler and outbox
  carry long work. Polling is not the execution worker.
- **Milestones, not streams**: Telegram receives coalesced state changes and
  decisions, never raw runtime token/tool streams.
- **Separate publication risk**: execution confirmation preserves existing
  delivery gates; result-preview approval handles gated external side effects.
- **Receipt-defined delivery**: `completed`, `result_ready`, and `delivered`
  remain different observable states.
- **Runtime boundary preserved**: `cats-runtime` executes stable requests and
  reports capabilities/results; Cats owns semantic planning, approvals,
  lifecycle judgment, and transport delivery.

## Testing Strategy

- **Unit tests**: stage derivation, proposal digest/revision, action-token
  authorization/expiry, idempotency keys, readiness reasons, progress
  coalescing, delivery-mode gate resolution, and receipt state transitions.
- **Integration tests**: Telegram update/callback to Work Item; authorization to
  exactly one Task/Run; supervised fake-agent continuation; decision callbacks;
  Artifact/commit result; publish gate; outbox retry and receipt.
- **Concurrency/recovery tests**: duplicate and concurrent callbacks, crash
  between admission steps, restart during Run, late runtime event, ambiguous
  Telegram send, and duplicate publish authorization.
- **Security tests**: cross-binding token use, stale revision, unauthorized
  Telegram user, deep-link access, bot-token leakage scans, unsafe path/media,
  and permission-scope enforcement.
- **Packaged tests**: real desktop background-service and provider readiness,
  not only source-mode server behavior.
- **Manual smoke**: dedicated test bot and disposable task/workspace, explicit
  owner authorization, redacted evidence, and cleanup. Never reuse or mutate
  the operator's actual persisted development state as a test fixture.
- **Cross-repository compatibility**: run relevant `cats-runtime` contract
  suites only if the trace matrix identifies a runtime boundary change.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Combined authorization accidentally bypasses intake or delivery approval | High | bind command to later owner event and versioned scope; keep publication gates separate; fail closed |
| Duplicate callback or restart repeats a Run or side effect | High | stable per-stage idempotency keys, unique resolution, resumable saga/outbox, concurrency tests |
| Provider final text is mistaken for completed work | High | completion-evidence evaluator and distinct completed/result-ready/delivered projections |
| Telegram polling remains blocked by long execution | High | bounded ingress, durable scheduler continuation, per-binding concurrency, async tests |
| Desktop sleep/offline state makes the bot appear reliable when it is not | High | readiness/status truth, explicit local-host limitation, later cloud/wake decision if needed |
| Notifications become noisy or arrive out of order | Medium | milestone allowlist, coalescing, causal sequence, terminal/decision priority |
| Transport data leaks secrets or local paths | High | opaque tokens/refs, secret-owning stores, safe payload policy, leakage tests |
| Existing Chat, Work, and supervision specs diverge | Medium | Phase 0 trace matrix, reuse product APIs, cross-links, and contract tests |
| A new ledger is introduced to work around an implementation seam | Medium | ADR-112 gate: prove a Core-model gap and approve a separate ADR first |
| Real Telegram testing pollutes operator state | High | dedicated binding and isolated state, explicit owner smoke, cleanup and state-hygiene review |

## Progress Log

| Date | Update |
|------|--------|
| 2026-09-02 | Plan created with one contract phase and six gated implementation phases; no implementation started. |

---

*Created: 2026-09-02*

*Author: Codex*

*Last updated: 2026-09-02*

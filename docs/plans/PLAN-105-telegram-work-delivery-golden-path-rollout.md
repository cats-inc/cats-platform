# PLAN-105: Telegram Work Delivery Golden Path Rollout

> Roll out the Core-owned path from Telegram intake through supervised
> execution, result review, policy-gated publication, and delivery receipt.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress |
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

**Gate status after the first vertical slice (2026-09-02)**

- G0 **passed** — ADR-112 Accepted, SPEC-114 Approved, Phase 1 open questions resolved by
  owner direction.
- G1 **passed** — the shared readiness evaluator, its reason codes, localized remediation
  copy, the real permission envelope, the Desktop settings remediation panel, the writable
  capability-bootstrap Settings surface, and a truthful `/status` on both ingress modes are
  all wired, and every surface reads one evaluation.
- G2 **passed** — callback polling, opaque action tokens, the durable outbox, ordering,
  coalescing, receipt/retry behaviour, bridge-level callback acknowledgement, and
  non-blocking continuation on *both* ingress modes with one bounded per-binding
  ceiling now pass.
- G3 **passed** — versioned scope authorization plus duplicate, concurrent, and restart
  tests produce exactly one approved Task and one queued Run, and Task detail now shows the
  Telegram owner authorization evidence instead of asking for a second Start Run click
  (FR-24).
- G4 **passed for the slice** — the supervised-run bridge is connected, acceptance evidence
  is collected through the runtime delivery API, timeout/retry/resume/permission-denial all
  move authoritative Run state with state-valid owner actions on both surfaces, and a
  bounded startup sweep re-attaches a driver to runs stranded by a host restart.
- G5 **passed for the slice** — Artifact/commit evidence, publish-gate blocking,
  source-binding send, and receipt recovery pass; `commit_only` drives the real runtime
  `/delivery/repo/*` calls; and every delivery mode's publish actions now execute behind an
  ordinary Core `release_gate` approval, each action at most once. A checks wait that
  overruns is its own `pending_checks` state rather than a failure, a red build blocks the
  publish, and delivery is scoped to the recorded binding so a rotated token still works
  while a removed binding fails rather than misrouting.
- G5 → also covers the Desktop recovery surface: a failed final send is visible on Task
  detail with a retry that re-drives the same outbox row rather than sending twice.
- G6 **partial** — the deterministic end-to-end suite, the restart matrix, the
  attachment refusal check, telemetry counters, and rollout/rollback semantics all
  land. The packaged macOS smoke has now run against the published v0.1.22 artifact
  and passes, and the packaged sidecar was booted against isolated state to confirm
  it listens, serves the renderer, fails closed on protected routes and on a missing
  CSRF token, and serves the readiness, telemetry, and capability-bootstrap
  endpoints. That run found a real shipping defect (see the log below). Still
  outstanding: the *behavioural* half of the packaged smoke — binding readiness,
  callback polling, provider launch, Desktop projection, and recovery links — and
  the real-bot smoke. No provider, git, or Telegram credential has executed against
  any of this.

## Implementation Phases

### Phase 0: Approve the Contract and Build a Trace Matrix

- [x] Review and approve ADR-112's Core-ledger, layer-ownership, async-ingress,
      execution-authorization, and publish-gate decisions.
- [x] Review SPEC-114 with product wording for the accepted, scope-proposed,
      admitted, decision-needed, result-ready, and delivered messages.
- [x] Resolve the first default delivery mode and which result types Telegram
      may carry directly.
- [x] Map every SPEC-114 requirement to the current implementation, a gap, or a
      deliberately deferred follow-up.
      *All 50 FRs traced in SPEC-114 "Requirement trace". 47 done, 2 partial
      (FR-18 pending the clarification loop, FR-44 pending attachment/stable-URL
      delivery), 1 gap (FR-16). The matrix found two live defects, both fixed:
      `adjust` was offered on every proposal while `authorize` refused it, and
      Task detail offered "Start run" on a golden-path Task that already had a
      queued Run.*
- [x] Document the derivation of each golden-path projected stage from existing
      Core, supervision, Artifact/Outcome, and transport receipt state.
- [x] Confirm that no new Core record family is needed. If one is needed, stop
      and propose a focused follow-up ADR before adding it.
- [x] Define stable idempotency-key inputs for ingress, admission, owner
      decisions, publication, progress, and final delivery.
- [x] Define a temporary-state test harness and dedicated Telegram test-binding
      procedure that complies with repository state-hygiene rules.
      *Harness landed; the real-bot procedure is still written but unexercised.*

**Deliverables**: approved contracts, requirement trace matrix, projection
rules, idempotency scheme, and isolated test plan.

**Exit gate**: G0.

### Phase 1: Make Delegation Readiness Truthful and Product-Visible

- [x] Add one readiness evaluator that composes Telegram binding health,
      authorized direct owner, bound Cat, provider/model target, provider
      capability profile, workspace/project, permission envelope, effective
      delivery policy, and desktop background-service state.
- [x] Reuse that evaluator from Telegram admission, Desktop setup/status, and
      Work inspection instead of duplicating readiness rules.
      *One `evaluateBinding` closure in host composition serves both: Telegram
      admission and `GET /api/work/delivery-readiness`, which backs a Work
      settings panel. Only the admission path advances the run-scoped latches, so
      a Desktop read can never move the tool scope a pending run will execute
      under.*
- [x] Add actionable reason codes and localized remediation copy for every
      missing prerequisite.
      *50 `workDelivery.*` keys landed in `messageKeys` plus the `en` and `zh-TW`
      catalogs; every outbound golden-path message is localized at render time.*
- [x] Surface provider capability bootstrap/configuration through a supported
      Settings/onboarding path so local file editing is not the sole path.
      *`GET/POST/PUT /api/providers/capability-bootstrap` plus a panel on
      `/settings/assistants` — where the `capability_profile_missing` blocker
      links. It shows where the file is looked for, whether it parsed, the rules
      in effect, and every diagnostic (previously collected into a sink that no
      surface rendered, so a malformed file failed silently), and it installs the
      bundled example once, refusing to overwrite. The panel now authors every
      rule field and saves through a validating `PUT`; a SHA-256 revision rejects
      stale writes after an out-of-band YAML edit. Saves report `restartRequired`
      rather than implying live reload — the loaded config is passed by value into
      dispatch adapters at composition time.*
- [x] Prevent Telegram from offering Start work until the versioned proposal
      contains a currently admissible target.
- [x] Ensure `/status` continues to report binding health and identifies when
      local execution is unavailable or degraded.
      *"Continues" did not hold: transport commands were intercepted in the
      webhook route only, so on long polling — the default ingress — `/status`
      was forwarded to the assistant as chat text. Commands now run through the
      bridge, so both ingress modes answer identically. `/status` reports ingress,
      local runtime health, and delegation as separate lines. A reachable runtime
      with a non-healthy status is `degraded`; an unreachable runtime is
      `unavailable` and also blocks readiness. A readiness lookup failure still
      reports delegation as unknown while independently checking local execution.*
- [x] Add tests for missing provider binary/auth, absent capability profile,
      invalid workspace, insufficient permission, disabled binding, and stopped
      background service.
      *Covered at the evaluator, admission, and Desktop-surface levels. One test
      forces every reason code to fire and asserts each blocker's remediation
      path is a real settings route — which is how three dead links were found.*

**Deliverables**: shared readiness contract, Desktop remediation surface,
Telegram degradation messages, and readiness coverage.

**Exit gate**: G1.

### Phase 2: Repair Callback Ingress and Add Durable Async Delivery

- [x] Include `callback_query` in Telegram long-polling `allowed_updates` and
      preserve parity in webhook registration.
      *`TELEGRAM_ALLOWED_UPDATE_KINDS` is now the single source for both; the repo
      performs no `setWebhook` call today, so parity is currently a constant plus
      a regression test rather than a second call site.*
- [x] Verify callback update normalization for message-backed and supported
      message-less callback shapes.
- [x] Answer recognized callback queries before invoking long-running product
      work; classify stale, unauthorized, expired, and already-applied actions.
- [x] Replace entity-rich callback data with a compact opaque action token
      resolved through server-owned state.
- [x] Add durable ingress idempotency keyed by binding and external update.
      *Intake reuses the capture tool's source-derived key; the transport store's own
      `hasProcessedUpdate` dedupe is unchanged.*
- [x] Introduce or extend a transport delivery outbox for acknowledgements,
      proposals, progress, decisions, results, and publish results.
- [x] Persist send attempt, retry classification, Telegram response message id,
      and terminal receipt without copying bot tokens into outbox payloads.
- [x] Decouple polling/webhook continuation from assistant/runtime completion.
      Bound concurrency per binding so one long request cannot stop unrelated
      Telegram updates while preserving request-local ordering.
      *The poll loop now dispatches `bridgeTelegramWebhookToRoom` without awaiting
      it and advances the Telegram offset at dispatch. Per-room ordering is not
      re-implemented: the bridge enters its room lock synchronously, and that lock
      is FIFO, so call order is processing order. Concurrency is bounded per
      binding (default 8) and the ceiling applies backpressure to the loop rather
      than dropping updates. Trade-off recorded in code: an update whose bridge is
      still running when the next poll confirms the offset is not redelivered
      after a host crash.*
      *Webhook ingress is decoupled the same way and now shares one bounded
      dispatcher with polling, so a binding's ceiling covers both ways an update
      can arrive. Two contract changes were required and the old paths are gone:
      the 202 body is now the **ingress** receipt rather than the post-bridge one
      (routing is read from transport status/diagnostics instead), and a room-turn
      failure no longer answers 500 — Telegram has already been told the update
      was accepted, so the failure surfaces as the owner-visible delivery receipt
      and in-room runtime error the bridge already recorded. Admission is checked
      **before** `receiveUpdate` consumes the update: refusing afterwards would
      make Telegram's redelivery answer `duplicate_update` and lose the message,
      so a saturated binding answers 429 with the update untouched.*
- [x] Coalesce stale/routine progress and give decision/terminal deliveries
      higher priority.
- [x] Add duplicate update, duplicate callback, callback-answer ordering,
      transient API error, ambiguous send, and process-restart tests.
      *Callback-answer ordering is not covered: golden-path callbacks are not yet
      routed through the Telegram bridge.*

**Deliverables**: callback-capable polling/webhook ingress, opaque action
tokens, durable outbox/receipt behavior, and non-blocking update processing.

**Exit gate**: G2.

### Phase 3: Version Scope and Admit Work from One Owner Confirmation

- [x] Extend Work intake source context with the internal binding id, opaque
      source refs, proposal revision, and proposal digest while retaining
      existing conversation/message provenance.
- [x] Add a scoped proposal projection containing goal, target,
      acceptance criteria, delivery mode, side effects, gates, readiness, and
      the one focal unresolved question.
- [x] Render the proposal consistently in Telegram and Desktop with localized
      Start work, Adjust, and Cancel actions.
      *Telegram renders the proposal with a real inline keyboard; Desktop shows the
      same authorized scope on Task detail. Desktop is a read-and-recover surface,
      not a second place to press Start work.*
- [x] Invalidate old action tokens whenever an execution-relevant proposal
      field changes.
- [x] Add one product-owned authorization/admission command that verifies
      owner, binding, scope revision/digest, readiness, policy, and action
      expiry.
- [x] Make the command produce one linked ready/approved Task and one queued
      supervised Run, or an actionable non-admitted result with no observable
      partial state. Use a storage transaction where available or a resumable
      idempotent saga with a stable admission key.
- [x] Preserve the intake invariant: agent/tool activity in the creation turn
      cannot call the authorization command or manufacture the owner event.
- [x] Record approval provenance as Telegram owner authorization and expose it
      in Task detail.
- [x] Return admitted/blocked state and a safe Desktop link through the outbox.
- [x] Keep manual Desktop approval and Start Run paths for non-golden-path work,
      while avoiding a redundant second click for an already-admitted Telegram
      scope.
      *The manual approve/reject/start controls are untouched; `canStartRun` now
      also requires that no Run exists, which is exactly the golden-path shape
      (admission approves and queues in one transaction). Before this it offered
      a second click that would have started a second Run.*
- [x] Test stale revision, changed policy, authorization mismatch, double tap,
      concurrent tap, failure between Task and Run persistence, and restart
      recovery.
      *Task/Run persistence cannot fail apart: both land in one `updateCore`
      transaction, which the concurrent-tap and restart tests exercise.*

**Deliverables**: versioned proposal, bounded authorization command,
idempotent Task/Run admission, Telegram controls, and Desktop evidence.

**Exit gate**: G3.

### Phase 4: Turn a Started Run into Durable Supervised Work

- [x] Audit the current Work supervised-run bridge from admission through
      runtime session launch, checkpoints, lifecycle actions, and terminal
      projection; remove any assumption that one provider response completes
      the whole task.
      *Audit finding: `launchRuntimeForWorkSupervisedRun` sent one message and
      recorded a `decideRunLoopHandoff` decision that nothing consumed, so a run
      simply stopped after the first provider response. The golden path now owns
      its own continuation loop rather than reusing that one-shot launcher.*
- [x] Define the completion-evidence evaluator for `artifact_only` and
      `commit_only` against the approved acceptance criteria.
- [x] Persist checkpoints and structured continuation reasons so restart can
      resume or expose retry without reading raw transcripts in scheduler code.
- [x] Wire timeout, retry, resume, cancellation, provider loss, permission
      denial, and approval blockers into authoritative Run state.
      *All of them now land on the Run, including permission denial as its own
      state.*
- [x] Project admitted, running, checkpoint, decision-needed, failed,
      cancelled, and result-ready milestones into bounded outbox messages.
      *Admitted, running, decision-needed, and result-ready are projected; explicit
      checkpoint milestones await the supervised-run bridge.*
- [x] Add state-valid Telegram callback actions for owner decisions,
      cancel/stop, retry, and resume by calling existing Work/supervision APIs.
      *Cancel, retry, resume, and the publish approve/deny pair are implemented,
      and every message offers only what the projected stage permits.*
- [x] Ensure late or stale runtime events cannot regress a terminal state or
      deliver obsolete progress.
- [x] Add fake-agent deterministic tests for multi-step continuation and
      evidence-based completion, then live-provider smoke behind explicit
      environment gates.
      *Deterministic fake-agent coverage landed; the live-provider smoke is not
      written.*

**Deliverables**: durable long-running supervision, completion evidence,
milestone projection, and owner decision/lifecycle controls.

**Exit gate**: G4.

### Phase 5: Materialize Results, Enforce Publish Gates, and Close Delivery

- [x] Normalize accepted results into existing Outcome/Artifact/activity
      contracts with authoritative Work Item, Task, Run, workspace, producer,
      and declaration provenance.
- [x] Implement `artifact_only` result-ready evidence and safe Telegram
      reference selection.
- [x] Implement `commit_only` result-ready evidence including immutable commit
      id, concise change summary, and validation result.
- [x] Render a result-preview message with acceptance evidence, effective
      policy, remaining gates, and Desktop inspection link.
- [x] Route required publication approval through Core approvals and the
      product-owned delivery manifest; never infer approval in runtime or the
      Telegram transport.
- [x] Ensure ordinary Artifact declarations cannot self-promote to published.
- [x] Add idempotent delivery primitives for the first modes and preserve the
      existing action mapping for later push/PR/preview modes.
      *`commit_only` and `artifact_only` are wired through the runtime delivery API;
      push/PR/preview are wired behind a separate Core release-gate approval and
      resume from the runtime-owned delivery cwd/session captured with evidence.*
- [x] Target the recorded source binding even if UI selection changes after
      intake.
- [x] Mark the golden-path projection delivered only after the transport
      receipt is persisted; retain result-ready plus retry evidence on failure.
- [x] Add publish denial, duplicate approval, side-effect timeout, binding
      rotation/removal, unsafe local path, oversized payload, Telegram outage,
      and restart-during-send tests.

**Deliverables**: result preview, Artifact/commit evidence, governed publish
action, final source-binding delivery, and durable receipt/retry state.

**Exit gate**: G5.

### Phase 6: Prove the Installed Golden Path and Roll It Out Safely

- [x] Add a deterministic end-to-end suite covering `/work` through delivered
      using isolated Core and Telegram fake-server state.
      *`tests/work-golden-path-end-to-end.test.ts` drives a raw Telegram update
      through the real bridge, real relay, real token store, real evidence
      collector, and real outbox into isolated in-memory Core, asserting on wire
      traffic and persisted records. Only the provider and the runtime's repo
      calls are faked.*
- [ ] Add packaged Desktop smoke that validates background services, binding
      readiness, callback polling, provider launch, Desktop projection, and
      recovery links.
- [ ] Run one real Telegram smoke with a dedicated bot/binding and an explicit
      owner against both `artifact_only` and `commit_only`; capture redacted
      evidence and remove temporary test entities afterward.
- [x] Restart Cats at scope-proposed, admitted/running, result-ready,
      publish-pending, and delivery-pending checkpoints and prove no duplicate
      Task, Run, commit/publish action, or final message.
      *Covered in the end-to-end suite by rebuilding every process-local object
      around surviving Core and file-backed transport state. Publish-pending
      restart remains covered by the gated-publish suite's per-action
      idempotency tests; an interrupted Telegram send becomes owner-retryable
      `ambiguous` state rather than being sent again automatically.*
- [x] Verify attachment-only input fails truthfully and does not pass a filename
      to the agent as content.
      *End-to-end: no Work Item is captured, the owner is told why, and the
      assertion is specifically that the filename does not appear in the reply.*
- [x] Verify the host-offline/sleep limitation is visible in setup, status, and
      support documentation.
      *Documented in `docs/services.md`, including the uncomfortable part: when
      the host is asleep Telegram gets **no reply at all**, not an "offline"
      message, because the process that would answer is the one that is not
      running. When the platform is alive but its local runtime is unavailable,
      `/status` now reports that state and the shared evaluator emits
      `background_service_unavailable`; neither result proves the platform host
      has been up continuously.*
- [x] Add telemetry/diagnostic counters for readiness failure, dedupe hit,
      admission result, Run terminal state, decision latency, outbox retry, and
      delivery receipt without recording message bodies or secrets.
      *`platform/transports/work-delivery/telemetry.ts`, read through
      `GET /api/work/delivery-telemetry`. "No message bodies or secrets" is a
      property of the module rather than a rule call sites must remember: every
      counter label comes from a closed set and anything else is refused at
      runtime. Latency is counts and totals per bucket, never a sample list,
      because a sample list is a timeline of one owner's activity.*
- [x] Gate rollout to one owner cohort, define rollback as disabling golden-path
      callbacks while retaining Core/transport records, and review failure
      evidence before expanding.
      *Two gates already exist (`CATS_WORK_GOLDEN_PATH_ENABLED`, off by default,
      and an explicit `..._OWNERS` list with no trust-on-first-use). Both, plus
      the rollback semantics and the pre-expansion telemetry review, are now
      written down in `docs/services.md`, and a test proves rollback reverts
      `/work` to chat routing while every Core and transport record survives.*
- [x] Reconcile SPEC-114, PLAN-105, relevant older Telegram/Work docs, support
      documentation, and index/status dates after acceptance.
      *SPEC-114 carries the requirement trace; `docs/plans/README.md` and
      `docs/specs/README.md` status lines and dates updated; `docs/api.md`
      documents the readiness, telemetry, capability-bootstrap, and changed
      webhook contracts; `docs/services.md` documents rollout, rollback, and the
      host-offline limit. Left deliberately un-reconciled: the G6 rows, which
      stay open because no real smoke has run.*

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

## Files Created/Modified (first vertical slice, 2026-09-02)

Platform (transport-neutral, no product imports):

- `src/platform/transports/work-delivery/contracts.ts` — new. `TransportWorkOriginV1`,
  `TransportWorkDeliveryV1` + payload, stage/action enums, readiness and action-token shapes.
- `src/platform/transports/work-delivery/actionTokens.ts` — new. Bounded opaque tokens,
  constant-time lookup, fail-closed resolution, scope-change invalidation.
- `src/platform/transports/work-delivery/outbox.ts` — new. Idempotent enqueue, causal
  ordering, stale-progress suppression, ambiguous-send handling, receipts.
- `src/platform/transports/work-delivery/stageProjection.ts` — new. Pure derivation of the
  golden-path stage from Core records plus transport receipts.
- `src/platform/transports/work-delivery/readiness.ts` — new. Shared evaluator, reason
  codes, remediation keys, default delivery mode.
- `src/platform/transports/work-delivery/proposal.ts` — new. Revision/digest construction
  and delivery side-effect description.
- `src/platform/transports/work-delivery/deliveryGates.ts` — new. Outstanding-gate
  resolution including the first-slice high-side-effect rule.
- `src/platform/transports/work-delivery/inboundClassification.ts` — new. `/work` parsing
  and truthful attachment refusal.
- `src/platform/transports/work-delivery/telemetry.ts` — new. Bounded counters with
  a closed label set, so free text cannot reach a counter name.
- `src/server/routes/providerCapabilityBootstrap.ts` — new (see Phase 1).
- `src/platform/transports/telegram/commandPort.ts` — new. The command port both
  ingress modes use; an interface because answering commands needs product state.
- `src/app/server/telegramCommandSurface.ts` — new. Its host implementation, including
  the delegation status `/status` reports.
- `src/server/routes/providerCapabilityBootstrap.ts` — new. Read, install-example, and
  revision-guarded validated writes for the capability bootstrap config.
- `src/app/renderer/settings/CapabilityBootstrapSection.tsx` — new. Its Settings panel on
  `/settings/assistants`.
- `src/platform/transports/work-delivery/permissionEnvelope.ts` — new. The permission
  envelope a transport-originated run executes under. Capped at `narrow_write` for every
  delivery mode; external effects run through the gated delivery API, never provider tools.
- `src/products/work/renderer/components/settings/DeliveryReadinessSection.tsx` — new. The
  Desktop remediation panel, mounted from `/settings/work`.
- `src/products/work/renderer/api/deliveryReadiness.ts` — new. Its read of
  `GET /api/work/delivery-readiness`.
- `src/platform/transports/telegram/ingressDispatch.ts` — new. The bounded, ordering-safe
  hand-off both ingress modes use. Deliberately never refuses work; admission control
  (`isSaturated` / `waitForSlot`) belongs to the caller, before it consumes an update.
- `src/platform/transports/telegram/polling.ts` — modified. `callback_query` added to
  `allowed_updates` via a shared exported constant; the poll loop dispatches bridge work
  instead of awaiting it and exposes `drain()`.
- `src/server/routes/telegram.ts` — modified. The webhook answers 202 with the ingress
  receipt and runs the room turn detached; a saturated binding answers 429 before the
  update is consumed.

Product (Cats Work):

- `src/products/work/state/workGoldenPathService.ts` — new. The coordinator: intake, scope
  versioning, authorization, milestone projection, completion judgment, delivery.
- `src/products/work/state/workGoldenPathAdmission.ts` — new. The single product-owned
  authorization/admission command, atomic in one `updateCore` transaction.
- `src/products/work/state/workGoldenPathIntake.ts` — new. `/work` capture through the
  existing intake delegate, carrying the intake-boundary marker.
- `src/products/work/state/workCompletionEvidence.ts` — new. Evidence evaluator for
  `artifact_only` and `commit_only`.
- `src/products/work/shared/workGoldenPathMetadata.ts` — new. Additive origin/proposal
  metadata envelope with defensive reads.
- `src/products/work/shared/workGoldenPathMessages.ts` — new. Owner-visible payload
  rendering plus the pre-send safety guard.
- `src/products/work/state/workExecutionTaskDelegate.ts` — modified. Extracted
  `applyWorkExecutionTaskCreation` so the admission command can compose the same Core
  mutation inside its own transaction. No behaviour change to the tool path.

Tests:

- `tests/work-delivery-golden-path-primitives.test.ts` — new, 20 tests.
- `tests/telegram-work-delivery-golden-path.test.ts` — new, 16 tests.

Docs:

- `docs/decisions/112-*.md` — Accepted. `docs/specs/SPEC-114-*.md` — Approved.
- `docs/plans/PLAN-105-*.md` — In Progress plus this status.
- `docs/decisions/README.md`, `docs/specs/README.md`, `docs/plans/README.md` — index status.

### Telegram bridge wiring (2026-09-02, second increment)

- `src/platform/transports/work-delivery/port.ts` — new. The narrow transport seam
  (`ownsCallback` / `handleWorkCommand` / `handleActionCallback` / `refuse`), defined in
  `platform/` so no product import is needed to wire it.
- `src/platform/transports/work-delivery/contracts.ts` — payloads now carry localized text,
  inline actions, and the recorded destination (`externalConversationRef`).
- `src/platform/transports/work-delivery/inboundClassification.ts` — added
  `isTransportWorkRequestText` so the bridge only acts on `/work` traffic.
- `src/platform/transports/telegram/bridge.ts` — routes `/work` and golden-path callbacks,
  answers the callback query before any product work, and leaves everything else untouched.
- `src/platform/transports/telegram/polling.ts` — threads the port through polling and
  reconciliation.
- `src/server/routes/telegram.ts`, `src/products/chat/api/routeSupport.ts`,
  `src/app/server/requestRouter.ts`, `src/app/server/polling.ts` — thread the port through
  the webhook and both polling entry points.
- `src/app/server/transportWorkGoldenPath.ts` — new. Host composition: builds the outbox,
  service, and port, and resolves readiness from binding, Cat, and config.
- `src/app/server/dependencies.ts`, `src/app/server/contracts.ts` — construct and expose the
  bundle.
- `src/products/work/state/workGoldenPathTelegramPort.ts` — new. Port implementation plus the
  outbox sender that turns a row into one Telegram call.
- `src/products/work/shared/workGoldenPathMessages.ts` — rewritten to render localized text
  and inline action labels.
- `src/config.ts` — `transportWorkGoldenPath` rollout config (disabled by default).
- `src/shared/i18n/messageKeys.ts`, `catalogs/en.ts`, `catalogs/zh-TW.ts` — 50 new keys.
- `docs/services.md` — the four new environment variables.
- `tests/telegram-work-delivery-bridge.test.ts` — new, 9 tests.

### Supervised-run bridge (2026-09-02, third increment)

- `src/products/work/state/workGoldenPathRunner.ts` — new. The continuation loop:
  evidence-gated termination, accumulated evidence, structured checkpoints,
  cancellation and terminal-state guards.
- `src/products/work/state/workGoldenPathRuntimeExecutor.ts` — new. One supervised
  `cats-runtime` session per run, continuation prompts built from the outstanding gaps,
  and a `WorkGoldenPathEvidenceCollector` seam for commit/Artifact evidence.
- `src/products/work/state/workGoldenPathService.ts` — owner cancellation of the
  authoritative Task and Run; `markRunStatus` now takes message keys.
- `src/products/work/state/workGoldenPathAdmission.ts` — admission result carries its
  `workItemId` so the host can drive the Run without re-deriving it.
- `src/products/work/state/workGoldenPathTelegramPort.ts` — `onAdmitted` hook, fired once
  per newly admitted Run and never for a replay.
- `src/app/server/transportWorkGoldenPath.ts` — builds the runner and drives admitted work
  detached from the callback handler.
- `src/platform/transports/work-delivery/port.ts` — `cancelled` outcome.
- `src/shared/i18n/**` — cancellation copy.
- `tests/work-golden-path-supervised-run.test.ts` — new, 11 tests.

### Acceptance evidence collection (2026-09-02, fourth increment)

- `src/platform/runtime/deliveryClient.ts` — new. A narrow, defensively-parsed client for
  the runtime delivery API (`repo/status`, `repo/commit`, non-mutating artifact listing).
  `src/products/code/state/deliveryProxy.ts` speaks the same endpoints and should converge
  on this client; it was left alone to keep this change out of another product tree.
- `src/products/work/state/workGoldenPathDeliveryEvidence.ts` — new. Turns a finished turn
  into verified evidence: commits only when the worktree is actually dirty, then confirms
  the post-condition (clean worktree at a moved HEAD) rather than trusting the commit
  response. Free-text criteria stay *claims*, filtered against the proposal.
- `src/products/work/state/workGoldenPathRuntimeExecutor.ts` — asks for a bounded
  `CRITERIA-MET:` claim format, parses it, and resolves its provider target late so one
  session serves a whole run.
- `src/app/server/transportWorkGoldenPath.ts` — builds the delivery client and collector,
  and constructs the executor once.
- `tests/work-golden-path-evidence-collector.test.ts` — new, 13 tests.
- `tests/work-golden-path-supervised-run.test.ts` — 2 whole-chain tests added.

### Desktop projection (2026-09-02, fifth increment)

- `src/products/work/api/goldenPathProjection.ts` — new. Derives the Desktop view from the
  same records: source binding, authorized scope revision and digest, owner authorization
  evidence, Task/Run, stage, blockers, verified evidence, outstanding gates, delivery
  attempts, the receipt, and the available recovery actions.
- `src/products/work/api/projection.ts` — Task detail carries `goldenPath`, null for a Task
  created in Desktop.
- `src/products/work/api/index.ts` — `POST /api/work/tasks/:taskId/golden-path/retry-delivery`
  plus `retryWorkGoldenPathDelivery`, which re-drives the existing outbox row.
- `src/products/work/renderer/components/tasks/GoldenPathSection.tsx` — new. The Task detail
  panel; renders nothing for non-transport work.
- `src/products/work/renderer/state/queries/taskGoldenPathQuery.ts` — new. Reads the golden
  path from the existing Task detail endpoint rather than adding a second one.
- `src/products/work/renderer/api/workRecords.ts`, `components/tasks/TaskDetailPage.tsx`,
  `components/tasks/tasks.css`, `shared/apiPaths.ts` — wiring and styles.
- `src/app/server/dependencies.ts` — the golden-path bundle is hoisted so the chat transport
  and the Work read model share one outbox instance.
- `src/shared/i18n/**` — 43 new keys across `en` and `zh-TW`.
- `tests/work-golden-path-desktop-projection.test.ts` — new, 8 tests.

### Gated publication (2026-09-02, sixth increment)

- `src/products/work/state/workGoldenPathPublish.ts` — new. The publish decision is an
  ordinary Cats Core approval: a `pending_approval` Task bound to the Run by a
  `release_gate` binding, so it appears in the existing approval queue for free. Approving
  twice returns the recorded result instead of pushing twice; a failed side effect leaves
  the approval pending so the owner's decision is not consumed by a transport error.
- `src/platform/runtime/deliveryClient.ts` — `pushBranch` and `openPullRequest`, both
  carrying the Core approval id as the runtime's `approvalRef`.
- `src/products/work/state/workGoldenPathService.ts` — requests the approval when a gated
  result is ready, offers Publish/Deny inline, applies the decision, and delivers only
  after the external actions landed. Gate satisfaction is read from the approved Task, so
  nothing can clear a gate without leaving an approval record.
- `src/platform/transports/work-delivery/stageProjection.ts` — `result_ready` offers `deny`.
- `tests/work-golden-path-gated-publish.test.ts` — new, 8 tests.

### Timeout, retry, and resume (2026-09-02, seventh increment)

- `src/products/work/state/workGoldenPathLifecycle.ts` — new. One place answering "may this
  Run be driven again?", refusing every move that would re-drive finished work: retry only
  from `blocked`/`failed`, resume only from `queued`/`running`, and nothing at all from
  `completed`/`cancelled`. A refused action writes nothing.
- `src/products/work/state/workGoldenPathRunner.ts` — a per-step wall-clock deadline. A
  provider call cannot be cancelled from here, so a timed-out step is *abandoned*: the Run
  is blocked for the owner and the terminal-state guard makes the late result harmless.
- `src/products/work/state/workGoldenPathService.ts` — routes retry/resume, and offers only
  the recovery actions the projected stage permits so a message can never hand the owner a
  button the product would refuse.
- `src/platform/transports/work-delivery/stageProjection.ts` — `running` offers `resume`,
  because a Run can be running with nothing driving it after a restart.
- `src/products/work/api/**`, `renderer/**` — `POST .../golden-path/lifecycle/:action`,
  Desktop retry/resume buttons, and `retry_run`/`resume_run` recovery actions.
- `tests/work-golden-path-lifecycle.test.ts` — new, 10 tests.

### Startup resume (2026-09-02, eighth increment)

- `src/products/work/state/workGoldenPathRunner.ts` — `drive` is now safe to call
  concurrently for one Run: a second caller joins the first. Admission, an owner retry, and
  the startup sweep can all fire for the same Run and none of them can know about the
  others, so the invariant belongs in the runner rather than in each caller.
- `src/app/server/goldenPathStartupResume.ts` — new. Finds golden-path runs left `queued` or
  `running` by a dead host, records an ordinary `resume` lifecycle action, and re-drives
  them detached. Bounded per boot so a crash loop cannot stampede the provider, and it never
  touches a finished run or a Task created in Desktop.
- `src/app/server/startupRecovery.ts` — runs the sweep last, after transport ingress and
  orchestrator recovery have settled.
- `tests/work-golden-path-startup-resume.test.ts` — new, 8 tests.

### Permission denial (2026-09-02, ninth increment)

- `src/products/work/state/workGoldenPathRunner.ts` — `permission_denied` is its own step
  status and run outcome. The Run is `blocked`, not `failed`: the work is fine, the envelope
  is not. The refused tool and rejection code are stamped on the Run and on an Activity.
- `src/products/work/state/workGoldenPathRuntimeExecutor.ts` — maps a
  `RuntimeSupervisionRejectedError` carrying `E_TOOL_SCOPE_DENIED`/`E_NOT_AUTHORIZED` onto
  the new status. Budget and approval rejections are deliberately excluded: they are
  different conversations with the owner.
- `src/platform/supervision/runtimeBoundary.ts` — `RuntimeSupervisionContext` accepts an
  optional `policyToolScope`, defaulting to `broad_write` so no existing caller changes.
  **Without this the new state was unreachable**: the golden path passed a hardcoded
  `broad_write` grant, so the boundary could never refuse it on scope.
- `src/products/work/state/workGoldenPathTelegramPort.ts`, `src/app/server/transportWorkGoldenPath.ts`
  — the resolved permission envelope is threaded into the boundary, so an unconfigured
  workspace is refused at the boundary instead of reaching the provider.
- `src/products/work/api/goldenPathProjection.ts`, `renderer/**` — Desktop names the refused
  tool and its code so the owner knows what to grant.
- `tests/work-golden-path-permission-denial.test.ts` — new, 10 tests.

### deploy_preview and wait_for_checks (2026-09-02, tenth increment)

- `src/platform/runtime/deliveryClient.ts` — `waitForChecks` and `publishPreview`. A checks
  wait has three outcomes, not two: `completed` from the runtime only means the checks
  *stopped*, so their conclusions are read and a finished red build is a blocked publish.
  A wait that overruns returns `pending` with the runtime operation id so it can be resumed
  rather than restarted.
- `src/products/work/state/workGoldenPathPublish.ts` — `pr_with_checks` now runs
  push → open PR → wait, and `deploy_preview` runs push → publish preview. **Per-action
  idempotency**: actions that already landed are persisted on the approval Task and skipped
  on a later attempt, so coming back to a pending wait never re-pushes or re-opens the pull
  request. Partial progress is stamped without deciding the approval, because an unfinished
  wait must not consume the owner's decision.
- `src/products/work/state/workGoldenPathService.ts` — `pending_checks` tells the owner what
  has landed and what is still running, and delivers nothing.
- `tests/work-golden-path-gated-publish.test.ts` — 5 tests added (12 total).

### Binding rotation and removal (2026-09-02, eleventh increment)

- `src/products/work/state/workGoldenPathTelegramPort.ts` — delivery narrows the relay
  context to the *recorded* binding before sending. **This fixed a real FR-43 violation the
  new tests found**: the relay resolves an *active* binding from its context, which is right
  for an interactive reply and wrong here — with the original binding removed and a
  different one active, the owner's result was delivered to that other binding's chat. An
  absent binding now yields an empty context and the relay refuses.
- The same module names a missing-binding failure `binding_unavailable` and marks it
  definite rather than ambiguous, so it is not retried forever as if it were a blip.
- `src/products/work/api/goldenPathProjection.ts`, `renderer/**` — `source.present` and a
  blocker naming the binding, so the owner knows what to restore instead of watching
  deliveries fail silently.
- `tests/work-golden-path-binding-rotation.test.ts` — new, 7 tests, driving the *real*
  relay over a fake Telegram API so binding resolution is the production path.

**Still not touched, and required before this is fully user-visible:**

- `src/platform/supervision/**` — the golden path drives its own loop rather than the
  shared supervision run-loop primitives; converging them is a follow-up.
- `/settings/work` still inspects environment-backed rollout, owner, and
  workspace configuration but cannot change it. A product-owned mutation and
  reload/restart contract is a follow-up; the UI must remain read-only until
  that contract exists.

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
| 2026-09-02 | ADR-112 Accepted, SPEC-114 Approved, PLAN-105 In Progress. First end-to-end vertical slice implemented: `/work` intake -> versioned proposal -> owner-authorized admission -> supervised Run record -> completion-evidence judgment -> source-binding delivery -> persisted receipt. 36 new tests (20 primitives + 16 end-to-end) pass against isolated in-memory Core state and a fake Telegram sender. Full `npm run typecheck` passes; the dependency-graph layering guard passes. Full `npm test`: 4286 tests, 4243 pass, 40 skipped, 3 fail — all three failures are in `tests/unix-provider-scripts.test.js` and reproduce identically with this branch's changes stashed (`scripts/linux/*.sh` hit `unbound variable` under the host's bash 3.2); they are pre-existing and unrelated to this slice. Two defects were found by the new tests and fixed: a replayed `Start work` was rejected because the post-admission stage no longer allowed the action (FR-26), and outbox rows carried no owner-visible payload at all, which made `delivered` mean "a row was marked sent" rather than "a message was sent". Not yet done: Telegram bridge routing, supervised-run bridge, Desktop projection, i18n copy, runtime `/delivery/repo/*` wiring, publish-approval action, packaged and real-bot proof. |
| 2026-09-02 | Telegram bridge wired. `/work` and golden-path inline callbacks are now routed from real Telegram ingress (both long polling and webhook) into the product-owned service; callback acknowledgement follows the FR-12 durable-capture rule and never waits for long-running runtime work; proposals go out as localized messages with a real inline keyboard; delivery targets the recorded chat. Added a narrow `platform/` port so the transport needs no product import, 50 localized message keys across `en`/`zh-TW`, and a `transportWorkGoldenPath` rollout config that is disabled by default. Removed the superseded unlocalized `describeDeliverySideEffects` per the pre-release no-shim policy. 9 new bridge tests (47 golden-path tests total) plus the layering guard pass. Full `npm test`: 4295 tests, 4252 pass, 40 skipped, 3 fail — the same three pre-existing `tests/unix-provider-scripts.test.js` bash-3.2 failures as before this work, reproduced with the branch stashed. The full suite caught a real integration regression the targeted tests could not: host composition read `config.transportWorkGoldenPath.enabled` eagerly, and the many hand-written untyped `.js` config fixtures do not carry the new block, so 364 server tests failed on boot. Fixed by reading the rollout block defensively — a config assembled before this field existed means the feature is off, which is also its default; turning an opt-in flag into a hard boot requirement would have been the wrong contract. Genuinely outstanding: supervised-run bridge, Desktop projection, non-blocking polling, and the real permission-envelope check. |
| 2026-09-02 | Supervised-run bridge connected. Audit confirmed the old path stopped after one provider response: `launchRuntimeForWorkSupervisedRun` recorded a `decideRunLoopHandoff` decision that no code consumed. The golden path now drives its own continuation loop where the provider can never declare completion — after every step Cats re-evaluates the acceptance criteria and either continues with the gaps as the next instruction or accepts terminal evidence. Adds structured checkpoints, evidence accumulation across steps, mid-run cancellation, provider-loss handling, terminal-state guards against late events, an owner Cancel callback that cancels the authoritative Task and Run, and a runtime executor that reuses one supervised session per run. Admitted work is driven detached from the callback handler so ingress still returns immediately. 11 new tests (74 golden-path tests total). Full `npm test`: 4306 tests, 4263 pass, 40 skipped, 3 fail — the same three pre-existing `unix-provider-scripts` bash-3.2 failures, unrelated to this work. The full suite caught a second architectural regression: the executor called `runtimeClient.createSession`/`sendMessage` directly, which `supervision-static-boundary` forbids inside `src/products/**`. Fixed by routing every runtime call through `createSupervisedRuntimeSession` / `sendSupervisedRuntimeMessage`, so a golden-path run now carries the same budget, policy-scope, and tool-evidence supervision as any other Work run — the guard was right and the result is a better design. Single named blocker for a live end-to-end run: the `WorkGoldenPathEvidenceCollector` seam still returns nothing, so acceptance evidence needs the runtime `/delivery/repo/*` wiring. |
| 2026-09-02 | Acceptance evidence collector wired, closing the last blocker for a live run. `commit_only` now inspects the workspace through the runtime delivery API, commits only when the worktree is genuinely dirty, and then verifies the post-condition itself (clean worktree at a moved HEAD) rather than trusting the commit response; `artifact_only` lists session artifacts with `apply: false` so a declaration stays `ready` and never self-publishes (FR-38). Free-text criteria remain claims: the executor asks for a bounded `CRITERIA-MET:` line, parses it strictly, and the collector discards any criterion the proposal never stated — confident prose alone claims nothing. Whole-chain tests prove a run reaches `delivered` on a Cats-verified commit id, and that an idle agent claiming success reaches `blocked` with `no_commit_evidence` instead. Fixed a host bug found while wiring: the executor was rebuilt per step, so its session map was discarded and every step would have opened a new provider session. 15 new tests (89 golden-path tests total). Full `npm test`: 4321 tests, 4278 pass, 40 skipped, 3 fail — the same three pre-existing `unix-provider-scripts` bash-3.2 failures, unrelated to this work. |
| 2026-09-02 | Desktop projection wired. Task detail now shows a transport-originated request from the same durable records the transport uses: source binding, the exact scope revision and digest the owner authorized, the owner authorization event itself (FR-24, replacing a second Start Run click), Task/Run state, the projected stage with its rationale, blockers, verified acceptance evidence including the named post-commit check, outstanding gates, every delivery attempt, and the receipt that closed the loop. A failed final send exposes a retry that re-drives the existing outbox row, so pressing it twice cannot produce two Telegram messages; a Task created in Desktop renders no panel at all. One outbox instance is now shared between the chat transport and the Work read model. 8 new tests (97 golden-path tests total); the localization raw-string audit, supervision boundary, and dependency-graph guards all pass. Full `npm test`: 4329 tests, 4286 pass, 40 skipped, 3 fail — the same three pre-existing `unix-provider-scripts` bash-3.2 failures, unrelated to this work. |
| 2026-09-02 | Gated publication wired. A mode with external side effects now stops at `result_ready` and opens an ordinary Cats Core approval — a `pending_approval` Task bound to the Run by a `release_gate` binding — so the decision lands in the existing approval queue and no transport can infer it. The owner decides from Telegram (inline Publish / Do not publish) or Desktop; approving performs `push_branch`, or push plus `open_pull_request` for `pr_with_checks`, carrying the Core approval id as the runtime's `approvalRef` so the runtime records *which* approval authorized the side effect. Approving twice returns the recorded result rather than pushing twice, denying leaves the result local, and a failed push leaves the approval pending so a transport error cannot consume the owner's decision. Delivery happens only after the external actions landed. Fixed a real bug found by these tests: `authorize` derived its allowed actions from a hardcoded proposal list rather than the projected stage, so `publish` and `deny` could never be accepted; the stage derivation is now shared between the async and synchronous paths. 8 new tests (105 golden-path tests total). |
| 2026-09-02 | Timeout, retry, and resume wired. A step now runs against a wall-clock deadline; because a provider call cannot be cancelled from here, an overrun step is abandoned rather than killed — the Run is blocked, the owner is told, and the terminal-state guard makes the late result harmless if it ever lands (proven by releasing the abandoned step after the timeout and asserting nothing changed). Retry and resume are deliberately different: retry reopens a stuck attempt from `blocked`/`failed` and re-drives the *same* Run, resume re-attaches a driver to a live `queued`/`running` Run left behind by a restart, and both refuse outright on a `completed` or `cancelled` Run so finished work can never be delivered twice. A refused action writes nothing at all. Owner actions are offered on both Telegram and Desktop, derived from the projected stage so a message can never show a button the product would then refuse — which is what surfaced and fixed the blocked-evidence message having no retry button. 10 new tests (115 golden-path tests total). Full `npm test`: 4347 tests, 4304 pass, 40 skipped, 3 fail — the same three pre-existing `unix-provider-scripts` bash-3.2 failures, unrelated to this work. |
| 2026-09-02 | Startup resume wired. A supervised Run is driven by an in-process loop, so a host that dies mid-flight leaves the Core record alive with no driver and the owner waiting for a message nobody will send. Boot now sweeps for golden-path runs left `queued` or `running`, records an ordinary `resume` lifecycle action so a post-restart completion can still be explained, and re-drives them detached. The sweep is deliberately conservative: it never touches a `completed`, `cancelled`, `failed`, or `blocked` run, ignores Tasks created in Desktop, and is bounded per boot so a crash loop cannot stampede the provider on the very boot that is recovering. Resuming opens a *new* provider session — the old one died with the host — which is survivable only because continuation is driven by outstanding acceptance gaps rather than the agent's memory. Also moved the double-drive guard into the runner itself: `drive` now joins an in-flight call for the same Run, because admission, an owner retry, and the sweep can all fire at once and none can know about the others. 8 new tests (123 golden-path tests total). |
| 2026-09-02 | Permission denial given its own state. A supervision refusal and a provider failure look alike but need opposite responses — a failed call may succeed next time, a refused one fails identically forever — so a refusal now blocks the Run rather than failing it, names the refused tool and rejection code on the Run, an Activity, the Telegram message, and Desktop, and tells the owner that granting is what unblocks it. Writing the tests exposed that the new state was **unreachable**: the golden path passed a hardcoded `broad_write` grant with no policy snapshot, so the supervision boundary could never refuse it on scope, and the mapping would have been dead code. Fixed by threading the resolved permission envelope through a new optional `policyToolScope` on `RuntimeSupervisionContext` (defaulting to `broad_write`, so no existing caller changes) — an unconfigured workspace is now refused at the boundary instead of reaching the provider, which also begins replacing the permission-envelope placeholder. Budget and approval rejections are deliberately *not* folded into this state. 10 new tests (133 golden-path tests total). Full `npm test`: 4365 tests, 4322 pass, 40 skipped, 3 fail — the same three pre-existing `unix-provider-scripts` bash-3.2 failures, unrelated to this work. |
| 2026-09-02 | `deploy_preview` and `wait_for_checks` wired, completing the delivery-mode matrix. Two things made this more than adding two calls. First, a checks wait has three outcomes: the runtime's `completed` only means the checks stopped running, so the conclusions are read and a finished red build blocks the publish rather than passing as success, while a wait that overruns its budget is a distinct `pending_checks` state carrying the runtime operation id. Second, that pending state forced **per-action idempotency**: without it, an owner returning to a timed-out wait would re-push the branch and re-open the pull request. Actions that landed are now persisted on the approval Task and skipped on the next attempt, and partial progress is stamped *without* deciding the approval, so an unfinished wait cannot consume the owner's decision. 5 new tests (138 golden-path tests total). |
| 2026-09-02 | Binding rotation and removal handled. The tests found a real FR-43 violation: the Telegram relay resolves an *active* binding from its context, which is correct for an interactive reply but wrong for a recorded delivery — with the originating binding removed and a different one active, the owner's result was delivered into that other binding's chat. Delivery now narrows the relay context to the recorded binding, so a rotated bot token still delivers to the same chat while a removed binding fails outright rather than misrouting. A missing binding is classified as `binding_unavailable` and definite rather than ambiguous, and Desktop reports `source.present: false` with a blocker naming the binding, so repeated delivery failures come with a reason instead of silence. Restoring the binding lets the existing outbox row deliver, still to the originally recorded chat and still exactly once. 7 new tests driving the real relay over a fake Telegram API (145 golden-path tests total). Full `npm test`: 4376 tests, 4333 pass, 40 skipped, 3 fail — the same three pre-existing `unix-provider-scripts` bash-3.2 failures, unrelated to this work. |

| 2026-09-02 | Non-blocking polling continuation wired. The poll loop awaited the whole bridge call — including the assistant turn — before advancing the Telegram offset, so one long provider call froze every other room on the binding and stalled the next poll. It now dispatches and moves on. Per-room ordering is **not** re-implemented: the bridge enters its room lock synchronously at call time and that lock is FIFO, so call order remains processing order; a mutation test that removes the lock fails exactly the ordering test, and a mutation that restores the `await` fails exactly the two decoupling tests, so all six tests are load-bearing rather than tautological. Concurrency is bounded per binding and the ceiling applies backpressure to the loop rather than dropping updates. The honest cost, recorded in the code: the offset now advances at dispatch, so an update still bridging when the next poll confirms it is not redelivered after a host crash — acceptable because an admitted Run survives in Core and is recovered by the startup sweep, and unacceptable to avoid by holding a binding hostage to one slow room. `drain()` is exposed for tests but deliberately kept out of shutdown, which would trade one hang for another. Auditing the webhook path for parity found it has the *same* defect — `POST /api/providers/telegram/webhook` still awaits the bridge before answering 202, so Telegram redelivers long updates — but its 202 body returns the post-bridge receipt that several route tests assert on, so decoupling it is a separate change with a contract decision in it; it is left explicitly unchecked in Phase 2 rather than quietly folded in, and G2 stays partial for that reason. 6 new tests (151 golden-path tests total). Full `npm test`: 4382 tests, 4339 pass, 40 skipped, 3 fail — the same three pre-existing `unix-provider-scripts` bash-3.2 failures, unrelated to this work. |
| 2026-09-02 | Webhook ingress decoupled, closing the Phase 2 item and G2. The webhook had the same defect the poll loop did, with a sharper edge: Telegram waits for the response and redelivers when it takes too long, so a long assistant turn produced a held connection *and* a redelivered update. It now answers 202 on acceptance and runs the room turn detached. Two old paths were deleted rather than kept alongside, per the pre-release policy: the 202 body is now the ingress receipt instead of the post-bridge one (routing moved to transport status/diagnostics, where three route tests now read it), and a mid-bridge failure no longer answers 500 — once Telegram has been told the update was accepted there is no response left to fail on, so it surfaces as the delivery receipt and in-room `runtime_error` the bridge already recorded. The design point worth keeping: **admission is decided before the update is consumed**. `receiveUpdate` marks an update processed, so refusing after it would make Telegram's redelivery answer `duplicate_update` and lose the message outright; a saturated binding therefore answers 429 with the update untouched, and a test proves the redelivered copy is then processed for real. The bounded hand-off was extracted into `ingressDispatch.ts` and is shared by both modes, so a binding's ceiling covers either way an update arrives; it deliberately never refuses work, because a caller holding a consumed update has nowhere to put a refusal. Both new behaviours are mutation-checked: restoring the `await` fails all three new webhook tests, and moving the admission check after `receiveUpdate` fails exactly the one test that guards it. Also made the pre-existing restart test deterministic — it had been asserting on a race between the detached turn and host teardown. 3 new tests, 3 rewritten. Full `npm test`: 4385 tests, 4342 pass, 40 skipped, 3 fail — the same three pre-existing `unix-provider-scripts` bash-3.2 failures, unrelated to this work. `docs/api.md` records the new webhook contract. |
| 2026-09-02 | G1's two gaps closed. **Permission envelope**: `permissionSufficient: workspacePath !== null` was a placeholder, and the more serious half of it was the scope it granted — `broad_write`, which classifies externally-visible, destructive, and expensive tools. That silently contradicted the design's own rule that execution authorization must not clear a publish gate: a run could have pushed or deployed through its own provider tools while Cats still showed publication waiting on an owner approval. The envelope is now capped at `narrow_write` for *every* delivery mode, because external effects belong to the gated delivery API; a mode with bigger side effects needs a gate, not a wider grant. It is also now derived from what the runtime observes rather than what an operator claimed: the workspace is probed via `/delivery/repo/status`, an uninspectable path grants nothing instead of being optimistically assumed usable, and a commit-backed mode against a plain directory is refused before the run starts rather than failing deep inside a provider turn. The unverified `CATS_WORK_GOLDEN_PATH_WORKSPACE_IS_REPO` setting is deleted — the runtime answers that question now. **Desktop surface**: `GET /api/work/delivery-readiness` and a panel on `/settings/work` show the same evaluation the transport uses, from one `evaluateBinding` closure; only the admission path advances the run-scoped latches, so a Desktop read cannot move the tool scope a pending run will execute under. Writing the "every blocker links somewhere real" test found that three of the ten remediation paths — `/settings/cats/telegram`, `/settings/providers`, `/work/projects` — were not routes at all, so following a "fix this" link landed on the settings not-found page; all ten now resolve, and a test that parses the route table keeps them honest. The generic `permission_insufficient` reason is gone, replaced by `workspace_unreachable` and `workspace_not_a_repository`, because collapsing distinct prerequisites into one code is what made the old surface unactionable. 11 new tests (150 golden-path tests total), plus 10 test fixtures migrated to the envelope shape. Full `npm test`: 4396 tests, 4353 pass, 40 skipped, 3 fail — the same three pre-existing `unix-provider-scripts` bash-3.2 failures, unrelated to this work. G1 stays **partial**: its two remaining items are provider capability bootstrap having no supported Settings path, and `/status` not reporting degraded local execution — neither is a readiness gap. |
| 2026-09-02 | G1's last two Phase 1 items closed, and the gate with them. **`/status`**: the plan said "ensure `/status` *continues* to report binding health", but it never did — transport slash commands were intercepted in the webhook route only, so on long polling (the default ingress, and what the dev loop and `cats-one` boot chain use) `/status` was forwarded to the assistant as ordinary chat text. Command handling moved into the bridge behind a narrow port, so both ingress modes answer identically; the port is an interface because answering commands needs the chat store and `platform/` must not import product code. `/status` now reports ingress health and delegation state, naming every missing prerequisite, and a readiness lookup that throws reports "could not be checked" rather than ready — FR-5 forbids implying the host can honour work when that is unknown. The webhook route lost ~40 lines and its private mode-switching helpers along with them. **Capability bootstrap**: the config was file-only, and its load diagnostics were collected into a sink that no surface rendered, so a malformed file failed silently. `GET/POST /api/providers/capability-bootstrap` plus a panel on `/settings/assistants` — where the `capability_profile_missing` blocker links — now show the path, parse state, rules in effect, and diagnostics, and install the bundled example once, refusing to overwrite a file an operator may have written by hand. Two things were deliberately left out and said so rather than faked: rule authoring stays in the YAML, where each rule is documented in place; and there is no live reload, because the loaded config is passed by value into the chat dispatch adapters when the host is composed — the view reports `restartRequired` instead of pretending. 17 new tests. Full `npm test`: 4412 tests, 4369 pass, 40 skipped, 3 fail — the same three pre-existing `unix-provider-scripts` bash-3.2 failures, unrelated to this work. |
| 2026-09-02 | Phase 6 closed apart from the two credential-gated smokes, and the Phase 0 trace matrix with it. All 50 SPEC-114 requirements are now mapped in the SPEC: 46 done, 3 partial, 1 gap. Writing the matrix was worth more than the matrix: it found two live defects. **`adjust` was a button that always failed** — it was offered on every proposal while `authorize` had no branch for it, so tapping it returned `action_not_allowed`. Rather than leave it, the action is removed from the `TransportWorkAction` union entirely, which makes "offer an action nothing handles" a type error instead of a discipline problem; it returns with the FR-16 clarification loop, which is the real gap (intake captures per Telegram update ref, so a follow-up message would open a *parallel* Work Item). **Task detail offered "Start run" on a golden-path Task that already had a queued Run** — `canStartRun` checked only `status === "approved"`, but admission approves and queues in one transaction, so this was exactly the redundant second click FR-24 forbids and taking it would have started a second Run. New: a deterministic end-to-end suite that drives a raw Telegram update through the real bridge, relay, token store, evidence collector, and outbox into isolated Core, asserting on wire traffic and persisted records rather than on function returns — only the provider and the runtime's repo calls are faked; a restart matrix that rebuilds every process-local object around surviving Core state at each checkpoint and proves no duplicate Task, Run, outcome, or final message; bounded telemetry counters where "no message bodies or secrets" is enforced by a closed label set rather than by call-site discipline, read through `GET /api/work/delivery-telemetry`; and a rollback test proving `/work` reverts to chat routing with every Core and transport record intact. Documented the host-offline limit honestly in `docs/services.md`, including the part that is not reassuring: when the host is asleep Telegram gets **no reply at all**, so the absence of a `background_service_unavailable` blocker must not be read as proof of uptime. 18 new tests. Full `npm test`: 4478 tests, 4435 pass, 40 skipped, 3 fail — the same three pre-existing `unix-provider-scripts` bash-3.2 failures, unrelated to this work. |
| 2026-09-02 | Post-merge review hardening for commits `82ed9823` through `127ff568`. Removed process-global target/relay state in favor of request/run-scoped snapshots; made the callback-token/outbox ledger file-backed with atomic writes and startup recovery; changed interrupted or otherwise ambiguous Telegram sends to explicit-owner retry only and made concurrent flushes single-flight; delayed Telegram dedupe/offset acknowledgement until `/work` reaches durable Core/outbox capture; rejected dirty repository baselines; moved provider edits into runtime-owned isolated worktrees with a local-file-only tool whitelist; aligned commit/push authorization payloads with cats-runtime; carried the runtime cwd/session through evidence into gated publish; and made every repository-backed mode create verified commit evidence before push/PR/preview. Capability readiness now requires an actual matching bootstrap rule, and the trace matrix correctly keeps environment-backed Work Settings at partial. Verification: full typecheck and all builds passed; focused durability/evidence/publish/readiness/E2E suites passed (91 tests), plus the rebuilt gated-delivery suite passed (17 tests). The full 4,490-test run initially had one stale repository-mode fixture plus the three already-documented bash-3.2 Unix-helper failures; the fixture was corrected and passed in both source and compiled form, leaving only those three unrelated known failures. |
| 2026-09-02 | Cross-repo delivery blocker closed in cats-runtime. Its isolated session worktree intentionally starts on detached HEAD, but the delivery service previously committed there and then refused the same workspace at `push-branch`; therefore `push_branch`, `pr_with_checks`, and `deploy_preview` could never finish in a live run. Approved `create-commit` now creates a deterministic `cats/runtime/<session-id>` branch for runtime-owned worktree sessions before committing, after which the unchanged push/review adapters can continue. Ordinary worktree preparation remains detached, and discard/orphan cleanup removes only that reserved runtime branch namespace. Runtime typecheck and the 15 focused delivery/worktree tests pass. The full runtime suite built successfully and passed 1,913/1,915 tests; two unrelated tests exceeded their fixed five-second timeout under the serial full-suite load, then each passed alone with a 15-second timeout (Linux autostart in 5.8 s and legacy Copilot resume in 3.8 s). |
| 2026-09-02 | Closed the two remaining non-blocking G1 product gaps. Capability bootstrap is now writable from `/settings/assistants`: the structured editor covers the complete v1 selector/treatment/reason schema, server-side parsing remains authoritative, atomic YAML writes use owner-only permissions, and a file revision prevents silently overwriting an external edit. Because dispatch adapters still receive the config at composition time, a successful mutation explicitly requires restart. `/status` now reports local execution independently from ingress and delegation; runtime health maps to healthy/degraded/unavailable, an unavailable runtime blocks admission, and readiness failure cannot hide a separately observable runtime degradation. The same local-execution projection appears in Work readiness. Targeted API, renderer, command, and readiness tests pass. No new ADR was needed because this completes SPEC-114's accepted readiness contract rather than changing it. |
---

*Created: 2026-09-02*

*Author: Codex*

*Last updated: 2026-09-02 (Phases 0-5 complete; Phase 6 closed apart from the credential-gated smokes)*

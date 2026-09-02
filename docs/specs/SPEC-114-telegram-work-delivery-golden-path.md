# SPEC-114: Telegram Work Delivery Golden Path

> Define the first owner-visible path from a Telegram work request to a
> supervised result, policy-gated publication, and a durable delivery receipt.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Approved |
| **Owner** | Codex |
| **Reviewer** | Owner |
| **Related ADR** | [ADR-112](../decisions/112-adopt-a-core-owned-transport-work-delivery-golden-path.md) |
| **Related Plan** | [PLAN-105](../plans/PLAN-105-telegram-work-delivery-golden-path-rollout.md) |

## Summary

Cats Desktop with a Telegram binding must support one honest, recoverable
delegation loop:

```text
owner sends /work
  -> Cat restates scope, target, acceptance criteria, and delivery intent
  -> owner confirms that exact proposal
  -> Cats admits and supervises the work asynchronously
  -> Telegram receives milestones and any decision request
  -> Cats presents result evidence
  -> owner authorizes publication when policy requires it
  -> Telegram receives the deliverable reference and delivery receipt
```

The path composes existing Chat intake, Cats Core records, Work supervision,
delivery policy, Artifact materialization, and Telegram transport behavior. It
does not create a Telegram-only task model or a second agent ledger.

## Goals

- Let an owner delegate a bounded text task from Telegram without needing a
  second Desktop approval or Start Run action.
- Preserve an inspectable chain from the source binding through Work Item,
  Task, Run, evidence, Artifact/Outcome, and final delivery attempt.
- Keep execution and publication approvals explicit and policy-aware.
- Return useful milestone, blocker, decision, result, and receipt updates to
  the same Telegram binding.
- Survive duplicate updates, callback replays, transient Telegram failures,
  provider failures, and Cats process restarts without duplicate work.
- Give Desktop an equivalent inspection and recovery surface for every step.

## Non-Goals

- A full Work administration UI inside Telegram.
- Telegram groups, forum topics, shared-room authorization, or multi-owner
  policy in the first acceptance slice.
- Inbound Telegram attachment download or semantic ingestion in the first
  slice.
- Automatic host wake, guaranteed execution while the computer is asleep, or
  a cloud relay that runs while Cats Desktop is offline.
- Arbitrary multi-agent delegation or a new agent-to-agent ledger.
- LINE or other transport parity in this plan.
- Automatic push, pull-request, deployment, or public artifact publication
  that bypasses effective Core delivery gates.
- Treating an assistant final message as proof that the requested outcome was
  completed or delivered.

## User Stories

- As an owner, I want Telegram to tell me what Cats thinks I asked for before
  it starts changing anything.
- As an owner, I want one execution confirmation in Telegram to start the
  approved scope without opening Desktop to press Start Run.
- As an owner, I want quiet milestone updates and immediate notification when
  Cats needs a decision.
- As an owner, I want the final message to include the result, evidence, and an
  honest delivery state rather than a generic success reply.
- As an owner, I want duplicate button taps or a Cats restart to resume the
  same request rather than create another Task or side effect.
- As an operator, I want Desktop to explain missing provider, workspace,
  permission, or background-service readiness before the bot claims it can
  accept work.

## First-Slice Scope

The acceptance path uses:

- a direct Telegram chat whose user is authorized for the binding;
- one active Telegram binding mapped to one Cat and its private lane;
- one text `/work <goal>` request;
- one explicit project/workspace target selected by default or during scope
  clarification;
- a provider/model with a usable execution target and capability profile;
- `artifact_only` or `commit_only` delivery;
- inline callback actions plus a Desktop deep link;
- milestone-based outbound text and bounded artifact references.

Natural-language Work proposals may join the same path only after their
existing product-intent confirmation. Other delivery modes may join after the
same lifecycle passes their stricter publication gates.

## Requirements

### Functional Requirements

#### Readiness and availability

1. **FR-1 (Binding readiness).** Cats shall accept golden-path work only from
   an enabled Telegram binding in a healthy polling or webhook mode and from
   an authorized direct-chat owner.
2. **FR-2 (Execution readiness).** Before presenting an execution confirmation,
   Cats shall resolve a bound Cat, provider/model execution target, provider
   capability profile, project/workspace, permission envelope, and effective
   delivery policy.
3. **FR-3 (Actionable degradation).** Missing readiness shall produce a short
   Telegram explanation and a Desktop remediation link. It shall not create a
   Run or claim that work is queued when admission cannot occur.
4. **FR-4 (Product-owned setup).** Required readiness must be inspectable and
   repairable from product surfaces. A manually edited local configuration file
   shall not be the only supported setup path.
5. **FR-5 (Truthful availability).** Telegram status and acknowledgements shall
   distinguish healthy, degraded, and offline/background-service-unavailable
   behavior. The product shall not imply that local execution continues while
   the host cannot run it.
6. **FR-6 (No secret propagation).** Bot tokens and provider credentials shall
   remain in their existing secret-owning stores and shall never be copied into
   Work Item, Task, Run, Artifact, Activity, callback data, or deep-link
   metadata.

#### Ingress, identity, and acknowledgement

7. **FR-7 (Explicit baseline).** `/work <goal>` is the deterministic baseline
   entry point. The command shall be handled by product-intent intake, not the
   Telegram transport-control command router.
8. **FR-8 (Durable acceptance first).** Cats shall idempotently persist the
   source reference and durable intake anchor before sending an accepted
   acknowledgement. The acknowledgement must not wait for runtime completion.
9. **FR-9 (Source identity).** The path shall preserve at least the internal
   binding id, opaque external chat/update/message references, conversation id,
   Work Item id, and proposal revision. Raw external identifiers may remain in
   the transport store when Core needs only an opaque reference.
10. **FR-10 (Update idempotency).** A repeated Telegram update shall resolve to
    the same intake result and shall not create a second visible owner message,
    Work Item, or acknowledgement.
11. **FR-11 (Callback polling).** Long polling shall request
    `callback_query` updates in addition to the supported message update kinds.
    Webhook registration shall permit the same callback kind.
12. **FR-12 (Callback acknowledgement).** Every recognized callback shall call
    Telegram `answerCallbackQuery` promptly, before any long-running Work or
    runtime action. Failures shall be classified without losing the underlying
    product command.
13. **FR-13 (Opaque callback token).** Callback data shall contain only a
    bounded opaque action token. The server shall resolve the binding, actor,
    proposal revision, entity ids, expiry, and allowed transition and shall
    reject stale, cross-binding, or unauthorized tokens.
14. **FR-14 (Async ingress).** Polling and webhook workers may wait for bounded
    validation and persistence but shall not await the complete assistant turn,
    supervised Run, publication, or final delivery. Durable product/scheduler
    state shall carry continuation.

#### Scope proposal

15. **FR-15 (Proposal contents).** Before execution, Telegram shall show a
    concise proposal containing:
    - goal;
    - project/workspace target;
    - acceptance criteria or observable done condition;
    - effective delivery mode;
    - known material side effects and approval gates;
    - unresolved question, if any.
16. **FR-16 (One focal clarification).** When required information is missing,
    the Cat shall ask one focal clarification at a time and update the same
    durable Work Item rather than opening a parallel draft.
17. **FR-17 (Versioned scope).** Every proposal shown for confirmation shall
    have a monotonic revision and stable digest over the execution-relevant
    fields. Editing or materially clarifying the proposal invalidates older
    confirmation tokens.
18. **FR-18 (Decision actions).** A complete proposal shall expose bounded
    actions equivalent to `Start work`, `Adjust`, and `Cancel`. Labels may be
    localized, but their product commands and authorization checks shall be
    stable.
19. **FR-19 (No pre-confirmation execution).** Intake and clarification may
    capture and triage a Work Item, but shall not create an executing Run or
    perform delivery side effects before the owner authorizes the visible
    revision.

#### Execution authorization and admission

20. **FR-20 (Later owner event).** Execution authorization shall be a later
    explicit owner event than the message/action that created the Work Item.
    Agent output, tool output, and transport retry shall never count as owner
    authorization.
21. **FR-21 (Bound authorization).** Authorization shall bind the owner,
    binding, Work Item, proposal revision/digest, effective delivery intent,
    and expiry. Any mismatch shall fail closed and request a refreshed proposal.
22. **FR-22 (One product command).** A valid Start work callback shall invoke
    one idempotent product-owned authorization/admission command. Telegram code
    shall not directly edit Core Tasks or Runs.
23. **FR-23 (Atomic observable result).** That command shall either:
    - leave one ready/approved Task linked to the Work Item and one admitted
      supervised Run; or
    - leave no partial admission and return an actionable blocked/error state.
24. **FR-24 (No redundant Desktop click).** When FR-23 succeeds, the owner
    shall not need a second approval or Start Run click in Desktop for the same
    scope. Desktop shall show that Telegram authorization and its evidence.
25. **FR-25 (Existing separation preserved).** The combined command is allowed
    only because it consumes a later owner authorization over an already
    visible scope. Intake tools in the original assistant action remain unable
    to approve Tasks or start Runs.
26. **FR-26 (Admission idempotency).** Replayed callbacks, HTTP retries, or
    process recovery shall resolve to the same Task and Run. A stable admission
    key shall cover binding, Work Item, proposal revision, and action.
27. **FR-27 (Started response).** Telegram shall receive a started/blocked
    response containing the Work Item or Task reference, current projected
    stage, delivery mode, and a safe Desktop inspection link.

#### Supervised execution and progress

28. **FR-28 (Managed Run only).** Execution shall occur through the existing
    supervised Work Run and runtime boundary, never through an untracked
    provider session started by a Telegram handler.
29. **FR-29 (Durable lifecycle).** Queued, running, waiting-for-approval,
    blocked, completed, failed, and cancelled states shall remain derived from
    Core Run/supervision evidence.
30. **FR-30 (Continuation).** A provider step returning successfully does not
    by itself complete the task. Cats shall checkpoint and continue, block,
    retry, or finish according to the supervised lifecycle until an
    authoritative terminal judgment exists.
31. **FR-31 (Completion evidence).** Completion shall require evidence against
    the proposal acceptance criteria, plus an Outcome, ready Artifact, commit,
    or equivalent delivery evidence appropriate to the effective mode.
32. **FR-32 (Milestone notifications).** Cats shall return coalesced milestones
    such as admitted, running, checkpoint reached, decision needed, result
    ready, failed, and cancelled to the source binding. Token deltas and every
    tool call shall not become Telegram messages.
33. **FR-33 (Progress ordering).** Progress delivery shall be ordered per work
    request. A delayed routine milestone shall not be sent after a newer
    terminal or decision message.
34. **FR-34 (Decision requests).** A blocker or approval that requires the
    owner shall produce a concise request containing the reason, proposed
    action, consequence, and bounded actions such as Approve, Deny/Adjust,
    Retry, or Cancel, as allowed by the authoritative state.
35. **FR-35 (Lifecycle controls).** Telegram result/progress messages shall
    expose only controls valid for the current projected state. Cancel/stop,
    resume, retry, and decision actions shall call existing product or
    supervision boundaries and retain their audit evidence.
36. **FR-36 (Transport command compatibility).** Existing `/status` remains
    Telegram binding health and `/open` remains the bound private-lane entry.
    Work lifecycle controls in this slice use scoped callbacks and Desktop deep
    links rather than silently redefining those commands.

#### Result, publication, and delivery

37. **FR-37 (Result-ready message).** When execution evidence is accepted,
    Telegram shall receive a result preview with summary, acceptance evidence,
    delivery mode, Artifact/commit references, remaining gates, and a Desktop
    inspection link.
38. **FR-38 (Artifact status).** Agent/tool declarations may create draft or
    ready Artifacts under SPEC-092. Ordinary declarations shall not mark an
    Artifact published.
39. **FR-39 (Delivery mode semantics).** Cats shall use the existing modes:
    - `artifact_only` -> prepare a durable Artifact or equivalent result;
    - `commit_only` -> create a local commit and report its immutable id;
    - `push_branch` -> additionally push the approved branch;
    - `pr_with_checks` -> additionally open a pull request and wait for checks;
    - `deploy_preview` -> additionally publish a bounded preview.
40. **FR-40 (Policy gates preserved).** `manual_review_required`,
    `owner_approval_required`, and `publish_artifact_required` shall remain
    authoritative. Execution authorization shall not clear them implicitly.
41. **FR-41 (First-slice publication default).** In the first slice,
    `push_branch`, `pr_with_checks`, `deploy_preview`, and public Artifact
    publication shall require a separate result-preview authorization unless
    an approved policy explicitly establishes a narrower pre-authorized case.
42. **FR-42 (Publish idempotency).** Publication authorization and every
    external side effect shall use a stable idempotency key and persist the
    effective policy, proposal revision, owner event, action, and result.
43. **FR-43 (Source-binding delivery).** Final delivery shall target the
    originating binding by recorded identity, not whichever Telegram binding
    is currently selected in a UI.
44. **FR-44 (Safe payload).** The final Telegram result shall contain a concise
    summary and safely transportable references. Local filesystem paths,
    credentials, oversized content, or unsupported media shall not be sent as
    if Telegram can access them; Cats shall use a safe attachment, stable URL,
    or authenticated Desktop deep link as appropriate.
45. **FR-45 (Delivery receipt).** A successful final send shall persist a
    receipt containing the delivery purpose, stable idempotency key, binding,
    Work Item/Task/Run references, Telegram response message id when available,
    attempt count, and sent timestamp.
46. **FR-46 (Delivery failure).** A failed final send shall keep the result at
    `result_ready`, persist a classified error and retry state, and expose
    recovery in Desktop. It shall not relabel the work as delivered.
47. **FR-47 (Duplicate suppression).** Recovery after an ambiguous Telegram
    response shall reconcile the stable delivery key and known response before
    sending another final message where the API evidence permits it.

#### Unsupported input and inspection

48. **FR-48 (Inbound attachments).** Until attachment download and provenance
    are implemented, an inbound Telegram photo, document, audio, or other media
    shall receive an explicit unsupported/continue-in-Desktop response. A file
    label alone shall never be presented to the agent as ingested content.
49. **FR-49 (Desktop projection).** Desktop shall show the source binding,
    proposal revision, authorization evidence, Task, Run, current stage,
    blockers, outcome/artifacts, delivery policy, and final delivery state from
    the same underlying records.
50. **FR-50 (Activity trail).** Material transitions and every owner decision,
    retry, publication attempt, and delivery result shall emit bounded,
    inspectable activity/evidence without storing raw prompts or secret values.

### Non-Functional Requirements

- **Responsiveness**: intake acknowledgement and callback acknowledgement shall
  not await model execution or publication.
- **Reliability**: restart at any durable stage shall resume or expose recovery
  for the same request without duplicate admission or side effects.
- **Ordering**: work-specific outbound notifications shall preserve causal
  order and suppress stale routine progress.
- **Security**: every callback and deep link is authorization-checked; callback
  data and Core metadata contain no credentials.
- **State hygiene**: automated and manual acceptance tests use isolated state
  and a dedicated test binding. They must not write demo records into the
  operator's actual persisted development state.
- **Observability**: operators can distinguish intake, execution, result,
  publication, and transport-delivery failures.
- **Accessibility/localization**: action labels and messages use product i18n;
  state and action meaning must not depend on emoji or color alone.

## Design Overview

### Responsibility and event flow

```text
Telegram update / callback
  -> Telegram ingress: validate binding + dedupe + persist source reference
  -> Chat/Work intake: create or update Work Item and scoped proposal
  -> Telegram outbox: acknowledgement / proposal
  -> owner Start work callback
  -> Work authorization command: verify revision + approve/admit exactly once
  -> supervision + scheduler -> cats-runtime execution
  -> Core Run / Activity / Outcome / Artifact evidence
  -> milestone projector -> Telegram outbox
  -> result-ready projector -> review or publish authorization
  -> delivery primitive -> Telegram API
  -> transport receipt -> delivered projection
```

Telegram is therefore both the source decision surface and one delivery
surface, but it never becomes the source of truth for Work lifecycle state.

### Conceptual source contract

The exact storage location is an implementation decision, but persisted source
metadata must be equivalent to:

```ts
interface TransportWorkOriginV1 {
  version: 1;
  transport: 'telegram';
  bindingId: string;
  externalConversationRef: string;
  externalUpdateRef: string;
  externalMessageRef: string | null;
  conversationId: string;
  workItemId: string;
  proposalRevision: number;
  proposalDigest: string;
}
```

External references may be opaque transport-store keys. The contract never
contains a bot token.

### Conceptual delivery outbox contract

The transport needs durable intent and receipt state equivalent to:

```ts
interface TransportWorkDeliveryV1 {
  version: 1;
  idempotencyKey: string;
  bindingId: string;
  workItemId: string;
  taskId: string | null;
  runId: string | null;
  purpose: 'ack' | 'proposal' | 'progress' | 'decision' | 'result' | 'publish_result';
  state: 'pending' | 'sending' | 'sent' | 'failed';
  externalMessageRef: string | null;
  attemptCount: number;
  lastErrorCode: string | null;
}
```

This is a platform transport/outbox contract, not a new authoritative Core
work record. Core Activities may refer to its opaque idempotency key and
receipt.

### Owner-visible message sequence

| Moment | Required content | Primary actions |
|--------|------------------|-----------------|
| Accepted | stable request reference and what Cats is checking | Open in Cats |
| Scope proposed | goal, target, done condition, delivery, side effects | Start work, Adjust, Cancel |
| Admitted | Task reference, current state, delivery mode | View, Cancel when valid |
| Milestone | concise new information only | View |
| Decision needed | reason, consequence, proposed action | state-valid approve/deny/retry/cancel |
| Result ready | summary, evidence, Artifact/commit reference, remaining gates | Deliver/Publish when required, Adjust, View |
| Delivered | what was delivered, where, immutable reference, receipt state | View |

## Acceptance Criteria

- [ ] A healthy direct Telegram binding accepts a text `/work` request,
      persists one Work Item, and acknowledges before runtime work starts.
- [ ] Polling receives inline callback queries and promptly answers each
      recognized callback.
- [ ] The proposal shows target, acceptance criteria, delivery mode, and side
      effects before execution.
- [ ] No Task Run starts before a later valid owner confirmation.
- [ ] One Start work callback creates/resolves exactly one approved Task and
      one supervised Run without a Desktop Start Run click.
- [ ] Replaying the source update or callback returns the existing records and
      causes no duplicate Run.
- [ ] The polling/webhook ingress remains able to process other updates while
      the Run executes.
- [ ] Telegram receives ordered, coalesced milestones and a decision request
      when the Run blocks on owner input.
- [ ] A provider's final response alone does not mark work complete; accepted
      outcome/delivery evidence is required.
- [ ] `artifact_only` produces a ready Artifact/result reference; `commit_only`
      returns a commit id and validation evidence.
- [ ] A gated publication action waits for a result-preview approval and a
      duplicate approval does not repeat the side effect.
- [ ] Successful final Telegram delivery persists a receipt; failed delivery
      remains recoverable and is not projected as delivered.
- [ ] Restart tests pass at scope-proposed, admitted/running, result-ready, and
      pending-delivery stages without duplicate records or sends.
- [ ] Missing provider, capability profile, workspace, permission, or binding
      readiness fails with an actionable Telegram/Desktop explanation.
- [ ] Inbound attachment-only input is rejected truthfully rather than reduced
      to a filename passed to the agent.
- [ ] Desktop shows the same source, scope, authorization, execution, result,
      policy, and receipt chain.
- [ ] Automated fixtures use temporary isolated Core and Telegram transport
      state; a real-bot smoke uses a dedicated test binding and explicit owner
      authorization.

## Dependencies

- [ADR-016: Treat Telegram as Boss Cat Inbox, Not Room Mirror](../decisions/016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [ADR-022: Own Chat Delivery Policy in Product](../decisions/022-own-chat-delivery-policy-in-product.md)
- [ADR-082: Recast the Orchestrator as a Capability Shell with Policy-Dial Supervision](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [ADR-101: Use the Direct-Audience Cat for Slash-Mode Work Intake](../decisions/101-use-direct-audience-cat-for-slash-mode-work-intake.md)
- [ADR-103: Use Preset-Neutral Product Intent Intake](../decisions/103-use-preset-neutral-product-intent-intake.md)
- [ADR-105: Adopt a Phase-Scoped Work Tool Surface](../decisions/105-adopt-phase-scoped-work-tool-surface.md)
- [SPEC-017: Telegram Inbox and Room Routing](./SPEC-017-telegram-inbox-and-room-routing.md)
- [SPEC-024: Chat Delivery Policy and Governance Levels](./SPEC-024-chat-delivery-policy-and-governance-levels.md)
- [SPEC-038: Telegram Bot Commands and Transport Control Surface](./SPEC-038-telegram-bot-commands-and-transport-control-surface.md)
- [SPEC-082: Cats Work Agent Supervision and Tool Boundary](./SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
- [SPEC-092: Code Artifact Declaration Contract](./SPEC-092-code-artifact-declaration-contract.md)
- [SPEC-107: Preset-Neutral Product Intent Intake](./SPEC-107-preset-neutral-product-intent-intake.md)
- [SPEC-109: Phase-Scoped Work Tool Surface](./SPEC-109-phase-scoped-work-tool-surface.md)

## Open Questions

- [ ] Should the first default delivery mode be inferred from workspace type
      (`commit_only` for repos, `artifact_only` otherwise) or chosen explicitly
      during onboarding?
- [ ] Should durable transport outbox rows live in the existing Telegram store
      with Core Activity references, or behind a transport-neutral platform
      outbox interface from the first implementation?
- [ ] Which Artifact kinds may be attached directly to Telegram, and which must
      use an authenticated Desktop/web link?
- [ ] What routine milestone coalescing window gives useful visibility without
      turning Telegram into a tool-call log?
- [ ] Which higher-side-effect delivery policy, if any, may safely pre-authorize
      publication in the initial execution confirmation?
- [ ] Is always-on behavior limited to truthful Desktop background-service
      status, or should a later cloud relay / wake architecture be proposed?

## References

- [Telegram Bot API: getUpdates](https://core.telegram.org/bots/api#getupdates)
- [Telegram Bot API: CallbackQuery](https://core.telegram.org/bots/api#callbackquery)
- [Telegram Bot API: answerCallbackQuery](https://core.telegram.org/bots/api#answercallbackquery)
- [ADR-112: Adopt a Core-Owned Transport Work Delivery Golden Path](../decisions/112-adopt-a-core-owned-transport-work-delivery-golden-path.md)

---

*Created: 2026-09-02*

*Author: Codex*

*Last updated: 2026-09-02*

*Related Plan: [PLAN-105](../plans/PLAN-105-telegram-work-delivery-golden-path-rollout.md)*

## Requirement trace (2026-09-02)

Every FR mapped to what implements it, or to an explicit gap. A table is used
here because the content is genuinely a three-column mapping.

Status values: **done** — implemented and covered by a test; **partial** — some
of the requirement holds, with the shortfall named; **gap** — not implemented;
**deferred** — deliberately out of the first slice.

| FR | Status | Where it lives / what is missing |
|----|--------|----------------------------------|
| FR-1 Binding readiness | done | `platform/transports/work-delivery/readiness.ts`; admission fails closed in `workGoldenPathService.receiveRequest` |
| FR-2 Execution readiness | done | Same evaluator; `executionTargetId` resolved per request in `app/server/transportWorkGoldenPath.ts` |
| FR-3 Actionable degradation | done | All blockers reported at once, each with a localized key and a settings path; `renderNotReadyMessage` |
| FR-4 Product-owned setup | done | `GET /api/work/delivery-readiness` + `DeliveryReadinessSection` on `/settings/work`; capability bootstrap on `/settings/assistants` |
| FR-5 Truthful availability | done | `/status` reports ingress health and delegation state; an unresolvable readiness lookup reports "could not be checked", never ready |
| FR-6 No secret propagation | done | `assertSafeTransportPayload`; opaque action tokens carry no entities |
| FR-7 Explicit baseline | done | `inboundClassification.ts` |
| FR-8 Durable acceptance first | done | `workGoldenPathIntake.ts` reuses the capture tool, keyed by update ref |
| FR-9 Source identity | done | `TransportWorkOriginV1` in the Work Item metadata envelope |
| FR-10 Update idempotency | done | Relay `markProcessedUpdate` at ingress; capture keyed by `externalUpdateRef` |
| FR-11 Callback polling | done | `TELEGRAM_ALLOWED_UPDATE_KINDS` |
| FR-12 Callback acknowledgement | done | `routeTelegramGoldenPathUpdate` answers before product work |
| FR-13 Opaque callback token | done | `actionTokens.ts`; 18 random bytes, server-side resolution |
| FR-14 Async ingress | done | `ingressDispatch.ts`, shared by polling and webhook, bounded per binding |
| FR-15 Proposal contents | done | `renderProposalMessage` |
| FR-16 One focal clarification | **gap** | Not implemented. Intake captures per Telegram update ref, so a clarification reply would open a *parallel* Work Item rather than revising the same one. The `adjust` action has been withdrawn from proposals until this exists — see the note below. |
| FR-17 Versioned scope | done | `proposal.ts` revision + digest over execution-relevant fields |
| FR-18 Decision actions | partial | `start_work`, `cancel`, `view`, and the later `publish`/`deny`/`retry`/`resume` are offered and handled. `adjust` is withdrawn pending FR-16. |
| FR-19 No pre-confirmation execution | done | Intake triages to `ready` only; no Run exists until `authorize` |
| FR-20 Later owner event | done | Admission requires a distinct callback bound to a revision + digest |
| FR-21 Bound authorization | done | Token resolution checks binding, owner, expiry before scope |
| FR-22 One product command | done | `workGoldenPathAdmission.ts` |
| FR-23 Atomic observable result | done | Task creation, approval, and Run upsert land in one `updateCore` |
| FR-24 No redundant Desktop click | done | Task detail shows the Telegram authorization as the approval evidence |
| FR-25 Existing separation preserved | done | Intake goes through the capture delegate, which cannot approve or start |
| FR-26 Admission idempotency | done | Deterministic `resolveWorkGoldenPathRunId(admissionKey)` |
| FR-27 Started response | done | Admission enqueues a started/blocked message |
| FR-28 Managed Run only | done | `workGoldenPathRuntimeExecutor.ts` routes through the supervision boundary |
| FR-29 Durable lifecycle | done | Core Run status transitions plus the startup resume sweep |
| FR-30 Continuation | done | `workGoldenPathRunner.ts`: a successful step is not completion |
| FR-31 Completion evidence | done | `workCompletionEvidence.ts`; commit id must match `/^[0-9a-f]{7,40}$/u` |
| FR-32 Milestone notifications | done | Outbox coalescing of routine progress |
| FR-33 Progress ordering | done | Causal `sequence` per work item in `outbox.ts` |
| FR-34 Decision requests | done | `notifyDecisionNeeded` |
| FR-35 Lifecycle controls | done | Cancel/retry/resume offered from the projected stage |
| FR-36 Transport command compatibility | done | `/status` and `/open` unchanged in meaning; lifecycle uses scoped callbacks. Commands now answer on *both* ingress modes, which they did not before. |
| FR-37 Result-ready message | done | `renderDecisionMessage` / result payloads |
| FR-38 Artifact status | done | `previewArtifacts` uses `apply: false`; declarations stay `ready` |
| FR-39 Delivery mode semantics | done | `deliveryGates.ts` + `workGoldenPathPublish.ts` |
| FR-40 Policy gates preserved | done | High-side-effect modes always retain `owner_approval_required`; provider tool scope capped at `narrow_write` so execution cannot clear a gate |
| FR-41 First-slice publication default | done | Every publish action sits behind a Core `release_gate` approval |
| FR-42 Publish idempotency | done | Per-action `alreadyPerformed`; partial progress stamped without deciding the approval |
| FR-43 Source-binding delivery | done | `scopeContextToBinding` |
| FR-44 Safe payload | partial | Summary, deep link, and bounded actions only; `assertSafeTransportPayload` rejects local paths and secrets. Attachment upload and stable URLs are **not** implemented, so an artifact is referenced by deep link rather than sent. |
| FR-45 Delivery receipt | done | Outbox receipt; `delivered` is defined by a sent receipt, not by the Run |
| FR-46 Delivery failure | done | A failed send keeps the result undelivered with a retry offer |
| FR-47 Duplicate suppression | done | An ambiguous send stays `pending`; retry re-drives the same row |
| FR-48 Inbound attachments | done | Attachment-only `/work` is refused truthfully; no filename is passed as content |
| FR-49 Desktop projection | done | `api/goldenPathProjection.ts` + `GoldenPathSection.tsx` |
| FR-50 Activity trail | done | Lifecycle and owner decisions write Core Activities |

### Open follow-ups

- **FR-16 / FR-18 (clarification loop).** `adjust` was offered on every proposal
  but `authorize` never handled it, so tapping it returned `action_not_allowed`.
  The action is withdrawn rather than left lying. Implementing it needs intake to
  revise the *same* Work Item from a follow-up message instead of capturing a new
  one per update ref.
- **FR-44 (attachment/stable URL delivery).** Deferred with the rest of outbound
  attachment handling; the deep link is the safe reference in the meantime.
- **Gate G6.** No provider, git, or Telegram credential has executed against any
  of this. Packaged Desktop and real-bot smokes are outstanding.

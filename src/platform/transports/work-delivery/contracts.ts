/**
 * Transport work-delivery golden-path contracts (SPEC-114 / ADR-112).
 *
 * These shapes are deliberately transport-neutral and deliberately *not* Cats
 * Core record families. ADR-112 section 1 keeps Work Items, Tasks, Runs,
 * Approvals, Outcomes, Artifacts, and Activities as the only authoritative work
 * ledger; everything here is either additive provenance that rides on existing
 * Core metadata, or transport-owned outbox/receipt state that Core Activities
 * may reference by opaque key.
 */

import type { CoreDeliveryGate, CoreDeliveryMode } from '../../../core/types.js';

/** Transports that can originate golden-path work. Telegram is the first. */
export type TransportWorkChannel = 'telegram';

/**
 * Durable source provenance for one transport-originated work request.
 *
 * External references are opaque transport-store keys: SPEC-114 FR-6 and FR-9
 * forbid copying bot tokens or raw credentials into Core, and Core only ever
 * needs to be able to point back at the transport store.
 */
export interface TransportWorkOriginV1 {
  version: 1;
  transport: TransportWorkChannel;
  bindingId: string;
  externalConversationRef: string;
  externalUpdateRef: string;
  externalMessageRef: string | null;
  conversationId: string;
  workItemId: string;
  proposalRevision: number;
  proposalDigest: string;
}

/** Why a transport message is being sent. Drives ordering and coalescing. */
export type TransportWorkDeliveryPurpose =
  | 'ack'
  | 'proposal'
  | 'progress'
  | 'decision'
  | 'result'
  | 'publish_result';

/** Lifecycle of one outbox row. `ambiguous` requires explicit owner retry. */
export type TransportWorkDeliveryState =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'ambiguous';

/**
 * One durable outbound intent plus its receipt.
 *
 * `idempotencyKey` is the whole point: a duplicate callback, a retry, or a
 * process restart must resolve to this same row rather than send a second
 * Telegram message (SPEC-114 FR-42, FR-45, FR-47).
 */
export interface TransportWorkDeliveryV1 {
  version: 1;
  idempotencyKey: string;
  bindingId: string;
  /**
   * Where this message goes, captured at intake.
   *
   * FR-43: the destination is the binding that *originated* the request, not
   * whichever binding a UI happens to have selected when the send fires.
   */
  externalConversationRef: string;
  workItemId: string;
  taskId: string | null;
  runId: string | null;
  purpose: TransportWorkDeliveryPurpose;
  payload: TransportWorkDeliveryPayload;
  state: TransportWorkDeliveryState;
  externalMessageRef: string | null;
  attemptCount: number;
  lastErrorCode: string | null;
  /** Monotonic per work item; lets a late routine progress send be dropped. */
  sequence: number;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

/**
 * The owner-visible golden-path stage.
 *
 * ADR-112 section 2: this is a *projection* with explicit derivation rules, not
 * a second state machine. It is always recomputed from authoritative Core
 * records plus transport receipts, so it can never drift on its own.
 */
export type TransportWorkStage =
  | 'received'
  | 'scope_proposed'
  | 'execution_authorized'
  | 'admitted'
  | 'running'
  | 'decision_needed'
  | 'result_ready'
  | 'publish_authorized'
  | 'delivered'
  | 'failed'
  | 'cancelled';

/**
 * Bounded owner actions a stage may expose. Labels are localized elsewhere.
 *
 * There is deliberately no `adjust`: it was offered on every proposal while
 * `authorize` refused it. Removing it from the union makes that class of
 * mistake a type error rather than a discipline problem. It returns with the
 * FR-16 clarification loop, together with a handler.
 */
export type TransportWorkAction =
  | 'start_work'
  | 'cancel'
  | 'approve'
  | 'deny'
  | 'retry'
  | 'resume'
  | 'publish'
  | 'view';

/**
 * The owner-visible content of one outbound message.
 *
 * Deliberately narrow: text plus an optional authenticated Desktop link. FR-44
 * forbids sending local filesystem paths or credentials as though Telegram
 * could reach them, so the renderer never puts a path in here.
 */
export interface TransportWorkDeliveryPayload {
  /** Already localized. The transport renders it verbatim. */
  text: string;
  deepLink: string | null;
  /**
   * Inline actions to attach. `label` is localized; `callbackData` is the
   * bounded opaque token and is the only part the external user can echo back.
   */
  actions: TransportWorkPayloadAction[];
}

export interface TransportWorkPayloadAction {
  action: TransportWorkAction;
  callbackData: string;
  label: string;
}

/**
 * The execution-relevant scope shown to the owner before anything runs.
 *
 * `revision` and `digest` exist so that a confirmation can be bound to exactly
 * the text the owner saw (FR-17, FR-21). Changing any field below must produce
 * a new digest and invalidate outstanding action tokens.
 */
export interface TransportWorkProposalV1 {
  version: 1;
  revision: number;
  digest: string;
  goal: string;
  targetLabel: string;
  projectId: string | null;
  workspacePath: string | null;
  acceptanceCriteria: string[];
  deliveryMode: CoreDeliveryMode;
  deliveryGates: CoreDeliveryGate[];
  sideEffects: string[];
  openQuestion: string | null;
  createdAt: string;
}

/** Reason codes shared by Telegram and Desktop readiness surfaces (FR-3). */
export const TRANSPORT_WORK_READINESS_REASONS = [
  'binding_disabled',
  'binding_unhealthy',
  'owner_not_authorized',
  'cat_not_bound',
  'execution_target_missing',
  'capability_profile_missing',
  'workspace_missing',
  'workspace_unreachable',
  'workspace_not_a_repository',
  'workspace_not_clean',
  'delivery_policy_unresolved',
  'background_service_unavailable',
] as const;

export type TransportWorkReadinessReason =
  (typeof TRANSPORT_WORK_READINESS_REASONS)[number];

export interface TransportWorkReadinessBlocker {
  reason: TransportWorkReadinessReason;
  /** Stable remediation key resolved through product i18n, never raw copy. */
  remediationKey: string;
  /** Deep link path for Desktop remediation. Never carries a secret. */
  remediationPath: string | null;
}

export interface TransportWorkReadiness {
  ready: boolean;
  blockers: TransportWorkReadinessBlocker[];
}

/**
 * A bounded opaque action token (FR-13).
 *
 * Only `token` ever reaches `callback_data`; every field below is resolved
 * server-side so a forged or replayed button cannot widen its own authority.
 */
export interface TransportWorkActionTokenV1 {
  version: 1;
  token: string;
  bindingId: string;
  ownerActorId: string;
  externalUserRef: string;
  workItemId: string;
  proposalRevision: number;
  proposalDigest: string;
  action: TransportWorkAction;
  issuedAt: string;
  expiresAt: string;
}

export type TransportWorkActionTokenRejection =
  | 'unknown_token'
  | 'expired'
  | 'stale_revision'
  | 'digest_mismatch'
  | 'cross_binding'
  | 'unauthorized_owner'
  | 'action_not_allowed';

export type TransportWorkActionTokenResolution =
  | { status: 'resolved'; token: TransportWorkActionTokenV1 }
  | { status: 'rejected'; reason: TransportWorkActionTokenRejection };

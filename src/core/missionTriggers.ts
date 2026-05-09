// Schedule and Trigger are *rules*, not entities (per ADR-081 / terminology
// "Managed Work and Execution Terms"). This module defines the canonical
// shapes for: (a) how a mission may be configured to launch, and (b) the
// concrete event that actually starts a run. They live as type-only
// definitions so any caller — Work intake, Code dispatcher, Companion
// background sweeps, transport ingress — can describe a mission's launch
// without inventing a parallel vocabulary.

import type {
  AgentId,
  ConversationId,
  CoreRecordMetadata,
  MissionId,
  RunId,
  TransportBindingId,
} from './types.js';

export type MissionScheduleRuleKind = 'cron' | 'manual';

export interface MissionCronScheduleRule {
  kind: 'cron';
  /** A standard 5- or 6-field cron expression. Validation lives at the
   *  scheduler boundary, not in the type. */
  cronExpression: string;
  /** IANA timezone (e.g. "Asia/Taipei") or null when the operator wants
   *  the platform default. */
  timezone: string | null;
  /** Optional ISO-8601 instant after which the rule should stop firing.
   *  Null when the rule has no end. */
  expiresAt: string | null;
}

export interface MissionManualScheduleRule {
  kind: 'manual';
  /** Human-readable note about who is expected to launch this mission. */
  note: string | null;
}

export type MissionScheduleRule =
  | MissionCronScheduleRule
  | MissionManualScheduleRule;

export type MissionTriggerKind =
  | 'cron'
  | 'transport_ingress'
  | 'owner_action'
  | 'workflow_continuation'
  | 'webhook';

export interface MissionCronTriggerEvent {
  kind: 'cron';
  /** Reference back to the schedule rule that fired this trigger, when
   *  the rule itself is durable (e.g. persisted on a mission template).
   *  Null when the cron tick was launched ad-hoc by an operator. */
  scheduleRuleId: string | null;
  firedAt: string;
}

export interface MissionTransportIngressTriggerEvent {
  kind: 'transport_ingress';
  transportBindingId: TransportBindingId | null;
  conversationId: ConversationId | null;
  receivedAt: string;
}

export interface MissionOwnerActionTriggerEvent {
  kind: 'owner_action';
  ownerActorId: AgentId;
  invokedAt: string;
  reason: string | null;
}

export interface MissionWorkflowContinuationTriggerEvent {
  kind: 'workflow_continuation';
  parentMissionId: MissionId | null;
  parentRunId: RunId | null;
  continuedAt: string;
}

export interface MissionWebhookTriggerEvent {
  kind: 'webhook';
  /** Free-form source identifier, e.g. "github.pull_request",
   *  "linear.issue.updated". Validation belongs at the webhook adapter. */
  source: string;
  receivedAt: string;
  metadata: CoreRecordMetadata;
}

export type MissionTriggerEvent =
  | MissionCronTriggerEvent
  | MissionTransportIngressTriggerEvent
  | MissionOwnerActionTriggerEvent
  | MissionWorkflowContinuationTriggerEvent
  | MissionWebhookTriggerEvent;

const SCHEDULE_RULE_KINDS: ReadonlySet<MissionScheduleRuleKind> = new Set([
  'cron',
  'manual',
]);

const TRIGGER_EVENT_KINDS: ReadonlySet<MissionTriggerKind> = new Set([
  'cron',
  'transport_ingress',
  'owner_action',
  'workflow_continuation',
  'webhook',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isStringPresent(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isMissionScheduleRule(value: unknown): value is MissionScheduleRule {
  if (!isPlainObject(value)) {
    return false;
  }
  const kind = value.kind;
  if (typeof kind !== 'string' || !SCHEDULE_RULE_KINDS.has(kind as MissionScheduleRuleKind)) {
    return false;
  }
  if (kind === 'cron') {
    return isStringPresent(value.cronExpression)
      && isStringOrNull(value.timezone)
      && isStringOrNull(value.expiresAt);
  }
  // manual
  return isStringOrNull(value.note);
}

export function isMissionTriggerEvent(value: unknown): value is MissionTriggerEvent {
  if (!isPlainObject(value)) {
    return false;
  }
  const kind = value.kind;
  if (typeof kind !== 'string' || !TRIGGER_EVENT_KINDS.has(kind as MissionTriggerKind)) {
    return false;
  }
  switch (kind) {
    case 'cron':
      return isStringOrNull(value.scheduleRuleId)
        && isStringPresent(value.firedAt);
    case 'transport_ingress':
      return isStringOrNull(value.transportBindingId)
        && isStringOrNull(value.conversationId)
        && isStringPresent(value.receivedAt);
    case 'owner_action':
      return isStringPresent(value.ownerActorId)
        && isStringPresent(value.invokedAt)
        && isStringOrNull(value.reason);
    case 'workflow_continuation':
      return isStringOrNull(value.parentMissionId)
        && isStringOrNull(value.parentRunId)
        && isStringPresent(value.continuedAt);
    case 'webhook':
      return isStringPresent(value.source)
        && isStringPresent(value.receivedAt)
        && isPlainObject(value.metadata);
    default:
      return false;
  }
}

/** Mission metadata key used by callers that want to durably attach a
 *  trigger event to a mission record. Keep callers in sync with this
 *  constant so projections and reads can find the trigger reliably. */
export const MISSION_METADATA_TRIGGER_KEY = 'trigger' as const;

/** Mission metadata key used to attach the schedule rule (if any) under
 *  which the mission is configured to launch. Schedule rules can also be
 *  stored on mission templates outside Core. */
export const MISSION_METADATA_SCHEDULE_KEY = 'schedule' as const;

export function readMissionTriggerEventFromMetadata(
  metadata: CoreRecordMetadata,
): MissionTriggerEvent | null {
  const candidate = metadata[MISSION_METADATA_TRIGGER_KEY];
  return isMissionTriggerEvent(candidate) ? candidate : null;
}

export function readMissionScheduleRuleFromMetadata(
  metadata: CoreRecordMetadata,
): MissionScheduleRule | null {
  const candidate = metadata[MISSION_METADATA_SCHEDULE_KEY];
  return isMissionScheduleRule(candidate) ? candidate : null;
}

export function withMissionTriggerEvent(
  metadata: CoreRecordMetadata,
  trigger: MissionTriggerEvent,
): CoreRecordMetadata {
  return { ...metadata, [MISSION_METADATA_TRIGGER_KEY]: trigger };
}

export function withMissionScheduleRule(
  metadata: CoreRecordMetadata,
  rule: MissionScheduleRule,
): CoreRecordMetadata {
  return { ...metadata, [MISSION_METADATA_SCHEDULE_KEY]: rule };
}

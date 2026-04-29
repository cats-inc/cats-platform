export const SCHEDULER_STATE_VERSION = 1 as const;

export type ScheduleKind = 'once' | 'daily';
export type ScheduleTriggerReason = 'due' | 'manual_test' | 'startup_misfire' | 'retry';
export type ScheduleTargetKind = 'cat' | 'agent';
export type ScheduleMissionPolicy = 'per_fire';
export type ScheduleConcurrencyPolicy = 'skip' | 'queue' | 'replace';
export type ScheduleMisfirePolicy = 'skip' | 'fire_once' | 'fire_all';
export type ScheduleRetryBackoff = 'none' | 'fixed' | 'exponential';
export type ScheduleTriggerReceiptStatus =
  | 'claimed'
  | 'admitted'
  | 'duplicate'
  | 'skipped'
  | 'failed';

export interface ScheduleTargetRef {
  kind: ScheduleTargetKind;
  id: string;
}

export type ScheduleDefinition =
  | { kind: 'once'; fireAt: string }
  | { kind: 'daily'; time: string };

export interface MissionTemplate {
  target: ScheduleTargetRef;
  originSurface: 'schedule';
  intent: string;
  conversationTarget?: { conversationId: string } | null;
  transportTargets?: Array<{ platform: string; bindingId: string }>;
  resourceScopes?: Array<Record<string, unknown>>;
  toolScopes?: string[];
  approvalPolicy?: Record<string, unknown>;
  outputPolicy?: Record<string, unknown>;
}

export interface ScheduleExecutionPolicy {
  missionPolicy: ScheduleMissionPolicy;
  concurrencyPolicy: ScheduleConcurrencyPolicy;
  misfirePolicy: ScheduleMisfirePolicy;
  retryPolicy: {
    maxAttempts: number;
    backoff: ScheduleRetryBackoff;
  };
}

export interface ScheduleRule {
  id: string;
  title: string;
  enabled: boolean;
  revision: number;
  timezone: string;
  schedule: ScheduleDefinition;
  missionTemplate: MissionTemplate;
  executionPolicy: ScheduleExecutionPolicy;
  createdAt: string;
  updatedAt: string;
  createdByActorId: string;
  nextFireAt: string | null;
  lastFireAt: string | null;
  lastRunId: string | null;
  lastFailure: string | null;
}

export interface ScheduleTriggerMetadata {
  ruleId: string;
  ruleRevision: number;
  scheduledFireAt: string;
  actualFireAt: string;
  idempotencyKey: string;
  reason: ScheduleTriggerReason;
  triggerReceiptId?: string;
  originalTargetRef?: ScheduleTargetRef;
}

export interface ScheduleTriggerReceipt {
  id: string;
  ruleId: string;
  ruleRevision: number;
  scheduledFireAt: string;
  actualFireAt: string;
  idempotencyKey: string;
  reason: ScheduleTriggerReason;
  status: ScheduleTriggerReceiptStatus;
  missionId: string | null;
  runId: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface SchedulerState {
  version: typeof SCHEDULER_STATE_VERSION;
  updatedAt: string;
  rules: ScheduleRule[];
  triggerReceipts: ScheduleTriggerReceipt[];
}

export interface ScheduleRuleCreateInput {
  id?: string;
  title: string;
  enabled?: boolean;
  timezone: string;
  schedule: unknown;
  missionTemplate: unknown;
  executionPolicy?: unknown;
  createdByActorId: string;
}

export interface ScheduleRuleUpdateInput {
  title?: string;
  enabled?: boolean;
  timezone?: string;
  schedule?: unknown;
  missionTemplate?: unknown;
  executionPolicy?: unknown;
}

export interface ScheduleTriggerClaimInput {
  ruleId: string;
  ruleRevision: number;
  scheduledFireAt: string;
  actualFireAt: string;
  idempotencyKey: string;
  reason: ScheduleTriggerReason;
  metadata?: Record<string, unknown>;
}

export interface ScheduleTriggerReceiptUpdate {
  status: Exclude<ScheduleTriggerReceiptStatus, 'claimed' | 'duplicate'>;
  missionId?: string | null;
  runId?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
}

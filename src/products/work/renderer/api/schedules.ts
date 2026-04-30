import { expectJson } from './http.js';
import { messageKeys, t as translate } from '../../../../shared/i18n/index.js';
import {
  WORK_API_SCHEDULES_PATH,
  buildWorkApiSchedulePath,
  buildWorkApiScheduleTestFirePath,
} from '../../shared/apiPaths.js';

export type WorkScheduleKind = 'once' | 'daily';
export type WorkScheduleTriggerReason = 'due' | 'manual_test' | 'startup_misfire' | 'retry';
export type WorkScheduleTriggerReceiptStatus =
  | 'claimed'
  | 'admitted'
  | 'duplicate'
  | 'skipped'
  | 'failed';
export type WorkScheduleConcurrencyPolicy = 'skip' | 'queue' | 'replace';
export type WorkScheduleMisfirePolicy = 'skip' | 'fire_once' | 'fire_all';
export type WorkScheduleRetryBackoff = 'none' | 'fixed' | 'exponential';

export type WorkScheduleDefinition =
  | { kind: 'once'; fireAt: string }
  | { kind: 'daily'; time: string };

export type WorkScheduleTargetRef =
  | { kind: 'cat'; id: string }
  | { kind: 'agent'; id: string };

export interface WorkScheduleMissionTemplate {
  target: WorkScheduleTargetRef;
  originSurface: 'schedule';
  intent: string;
  conversationTarget?: { conversationId: string } | null;
  transportTargets?: Array<{ platform: string; bindingId: string }>;
  resourceScopes?: Array<Record<string, unknown>>;
  toolScopes?: string[];
  approvalPolicy?: Record<string, unknown>;
  outputPolicy?: Record<string, unknown>;
}

export interface WorkScheduleExecutionPolicy {
  missionPolicy: 'per_fire';
  concurrencyPolicy: WorkScheduleConcurrencyPolicy;
  misfirePolicy: WorkScheduleMisfirePolicy;
  retryPolicy: {
    maxAttempts: number;
    backoff: WorkScheduleRetryBackoff;
    pauseAfterConsecutiveFailures: number | null;
  };
}

export interface WorkScheduleRetryState {
  attempt: number;
  maxAttempts: number;
  nextRetryAt: string;
  originalScheduledFireAt: string;
  lastError: string;
  failedReceiptId: string;
}

export interface WorkScheduleRule {
  id: string;
  title: string;
  enabled: boolean;
  revision: number;
  timezone: string;
  schedule: WorkScheduleDefinition;
  missionTemplate: WorkScheduleMissionTemplate;
  executionPolicy: WorkScheduleExecutionPolicy;
  createdAt: string;
  updatedAt: string;
  createdByActorId: string;
  nextFireAt: string | null;
  lastFireAt: string | null;
  lastRunId: string | null;
  lastFailure: string | null;
  consecutiveFailures?: number;
  retryState?: WorkScheduleRetryState | null;
  pausedAt?: string | null;
  pauseReason?: string | null;
}

export interface WorkScheduleTriggerReceipt {
  id: string;
  ruleId: string;
  ruleRevision: number;
  scheduledFireAt: string;
  actualFireAt: string;
  idempotencyKey: string;
  reason: WorkScheduleTriggerReason;
  status: WorkScheduleTriggerReceiptStatus;
  missionId: string | null;
  runId: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface WorkScheduleListResponse {
  rules: WorkScheduleRule[];
  triggerReceipts: WorkScheduleTriggerReceipt[];
}

export interface WorkScheduleRuleResponse {
  rule: WorkScheduleRule;
  triggerReceipts: WorkScheduleTriggerReceipt[];
}

export type WorkScheduleCreateInput = Omit<
  WorkScheduleRule,
  | 'id'
  | 'revision'
  | 'createdAt'
  | 'updatedAt'
  | 'createdByActorId'
  | 'nextFireAt'
  | 'lastFireAt'
  | 'lastRunId'
  | 'lastFailure'
> & {
  id?: string;
};

export type WorkScheduleUpdateInput = Partial<Pick<
  WorkScheduleCreateInput,
  'title' | 'enabled' | 'timezone' | 'schedule' | 'missionTemplate' | 'executionPolicy'
>>;

export interface WorkScheduleAdmissionResult {
  status: 'admitted' | 'duplicate' | 'skipped' | 'failed';
  rule: WorkScheduleRule;
  triggerReceipt: WorkScheduleTriggerReceipt;
  mission?: unknown;
  run?: unknown;
  message?: string | null;
}

export async function listWorkSchedules(
  signal?: AbortSignal,
  errorMessage = translate(messageKeys.workSchedulesListLoadErrorFallback),
): Promise<WorkScheduleListResponse> {
  const response = await fetch(WORK_API_SCHEDULES_PATH, { signal });
  return expectJson<WorkScheduleListResponse>(response, errorMessage);
}

export async function createWorkSchedule(
  input: WorkScheduleCreateInput,
  errorMessage = translate(messageKeys.workScheduleCreateFailed),
): Promise<WorkScheduleRuleResponse> {
  const response = await fetch(WORK_API_SCHEDULES_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return expectJson<WorkScheduleRuleResponse>(response, errorMessage);
}

export async function updateWorkSchedule(
  scheduleId: string,
  input: WorkScheduleUpdateInput,
  errorMessage = translate(messageKeys.workScheduleUpdateFailed),
): Promise<WorkScheduleRuleResponse> {
  const response = await fetch(buildWorkApiSchedulePath(scheduleId), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return expectJson<WorkScheduleRuleResponse>(response, errorMessage);
}

export async function testFireWorkSchedule(
  scheduleId: string,
  errorMessage = translate(messageKeys.workScheduleTestFireFailed),
): Promise<WorkScheduleAdmissionResult> {
  const response = await fetch(buildWorkApiScheduleTestFirePath(scheduleId), {
    method: 'POST',
  });
  return expectJson<WorkScheduleAdmissionResult>(response, errorMessage);
}

export async function removeWorkSchedule(
  scheduleId: string,
  errorMessage = translate(messageKeys.workScheduleDeleteFailed),
): Promise<{ removed: boolean; ruleId: string }> {
  const response = await fetch(buildWorkApiSchedulePath(scheduleId), {
    method: 'DELETE',
  });
  return expectJson<{ removed: boolean; ruleId: string }>(
    response,
    errorMessage,
  );
}

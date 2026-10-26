import { MediaImageError, type MediaImageExecution } from './imageExecution.js';

export interface CatImagePolicy {
  schemaVersion: 1;
  id: string;
  revision: number;
  accountId: string;
  ownerActorId: string;
  catId: string;
  enabled: boolean;
  manual: boolean;
  proactive: boolean;
  targetId: string;
  profileId: string;
  profileRevision: string;
  agentConfigId: string;
  dailyLimit: number;
  totalLimit: number;
  minIntervalMinutes: number;
  timeZone: string;
  windowStart: string;
  windowEnd: string;
  expiresAt: string;
  conversationId: string;
  bindingId: string;
  bindingRevision: string;
  updatedAt: string;
}

export interface CatImageCaller {
  accountId: string;
  ownerActorId: string;
  catId: string;
  conversationId: string;
  runtimeSessionId: string;
  trigger: 'manual' | 'heartbeat';
}

export interface CatImageJob extends MediaImageExecution {
  schemaVersion: 1;
  requestId: string;
  accountId: string;
  ownerActorId: string;
  catId: string;
  conversationId: string;
  runtimeSessionId: string;
  trigger: 'manual' | 'heartbeat';
  caption: string;
  policyId: string;
  policyRevision: number;
  bindingId: string;
  bindingRevision: string;
  createdAt: string;
  updatedAt: string;
  cancelRequestedAt: string | null;
  runtimeTerminalObserved: boolean;
  dispatchState: 'held' | 'released' | 'submitted';
}

export interface CatImageRequest { requestId: string; prompt: string; caption: string; }

export interface CatImageDelivery {
  schemaVersion: 1;
  id: string;
  jobId: string;
  assetSha256: string;
  conversationId: string;
  bindingId: string;
  bindingRevision: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'uncertain' | 'suppressed';
  attempts: number;
  attemptId: string | null;
  nextAttemptAt: string;
  updatedAt: string;
  messageId: string | null;
  transportMessageId: string | null;
  receiptId: string | null;
  error: string | null;
  /** Owner stopped future delivery; an uncertain past outcome remains uncertain. */
  abandonedAt?: string | null;
}

const clock = /^([01]\d|2[0-3]):([0-5]\d)$/;
const key = (value: unknown, max = 200): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const positive = (value: unknown, maximum: number): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= maximum;

export function validateCatImagePolicy(value: unknown): CatImagePolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MediaImageError('invalid_image_policy');
  const policy = value as Record<string, unknown>;
  if (policy.schemaVersion !== 1 || !positive(policy.revision, Number.MAX_SAFE_INTEGER)
    || !['id', 'accountId', 'ownerActorId', 'catId', 'targetId', 'profileId', 'profileRevision',
      'agentConfigId', 'conversationId', 'bindingId', 'bindingRevision'].every((name) => key(policy[name]))
    || !['enabled', 'manual', 'proactive'].every((name) => typeof policy[name] === 'boolean')
    || !positive(policy.dailyLimit, 100) || !positive(policy.totalLimit, 10000)
    || !positive(policy.minIntervalMinutes, 10080) || Number(policy.dailyLimit) > Number(policy.totalLimit)
    || typeof policy.windowStart !== 'string' || !clock.test(policy.windowStart)
    || typeof policy.windowEnd !== 'string' || !clock.test(policy.windowEnd)
    || typeof policy.expiresAt !== 'string' || !Number.isFinite(Date.parse(policy.expiresAt))
    || typeof policy.updatedAt !== 'string' || !Number.isFinite(Date.parse(policy.updatedAt))
    || !key(policy.timeZone, 100)) throw new MediaImageError('invalid_image_policy');
  try { new Intl.DateTimeFormat('en', { timeZone: policy.timeZone }); }
  catch { throw new MediaImageError('invalid_image_policy'); }
  return structuredClone(policy) as unknown as CatImagePolicy;
}

export function imagePolicyDay(policy: Pick<CatImagePolicy, 'timeZone'>, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: policy.timeZone, year: 'numeric',
    month: '2-digit', day: '2-digit' }).format(now);
}

export function isImagePolicyTime(policy: CatImagePolicy, now: Date): boolean {
  if (!Number.isFinite(now.getTime()) || Date.parse(policy.expiresAt) <= now.getTime()) return false;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: policy.timeZone,
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;
  const time = hour + ':' + minute;
  return policy.windowStart === policy.windowEnd
    || (policy.windowStart < policy.windowEnd
      ? time >= policy.windowStart && time < policy.windowEnd
      : time >= policy.windowStart || time < policy.windowEnd);
}

export function authorizeCatImagePolicy(policy: CatImagePolicy | undefined, caller: CatImageCaller, now: Date): CatImagePolicy {
  if (!policy || !policy.enabled || policy.accountId !== caller.accountId
    || policy.ownerActorId !== caller.ownerActorId || policy.catId !== caller.catId
    || policy.conversationId !== caller.conversationId
    || !(caller.trigger === 'heartbeat' ? policy.proactive : policy.manual)) {
    throw new MediaImageError('image_not_authorized', 403);
  }
  if (!Number.isFinite(now.getTime()) || Date.parse(policy.expiresAt) <= now.getTime()) {
    throw new MediaImageError('image_policy_expired', 403);
  }
  if (caller.trigger === 'heartbeat' && !isImagePolicyTime(policy, now)) {
    throw new MediaImageError('image_policy_outside_window', 403);
  }
  return policy;
}

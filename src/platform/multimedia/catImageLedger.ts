import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { IMAGE_ID, IMAGE_PROVIDERS, type RuntimeImageProvider } from '../../runtime/images.js';
import type { RuntimeImageJob } from '../../runtime/images.js';
import { IMAGE_PREEXECUTION_REFUSALS, isActiveImage, MediaImageError, type MediaImagePatch } from './imageExecution.js';
import {
  authorizeCatImagePolicy, imagePolicyDay, validateCatImagePolicy,
  type CatImageCaller, type CatImageDelivery, type CatImageJob, type CatImagePolicy, type CatImageRequest,
} from './catImagePolicy.js';

type SqlValue = string | number | null;
interface Statement {
  get(...values: SqlValue[]): Record<string, unknown> | undefined;
  all(...values: SqlValue[]): Array<Record<string, unknown>>;
  run(...values: SqlValue[]): unknown;
}
interface Database {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
}
interface SqliteModule { DatabaseSync: new (filename: string) => Database; }

const require = createRequire(import.meta.url);
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const callerKey = (caller: Pick<CatImageCaller, 'accountId' | 'ownerActorId' | 'catId'>): string =>
  hash([caller.accountId, caller.ownerActorId, caller.catId]);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const statuses = new Set(['submitting', 'running', 'collecting', 'succeeded', 'failed', 'cancelling', 'cancelled', 'interrupted']);
const parse = (row: Record<string, unknown> | undefined): unknown => row ? JSON.parse(String(row.document)) : undefined;

function jobFrom(row: Record<string, unknown> | undefined): CatImageJob | undefined {
  const value = parse(row);
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MediaImageError('media_state_invalid', 503);
  const job = value as Record<string, unknown>;
  if (job.schemaVersion !== 1 || typeof job.id !== 'string' || !IMAGE_ID.test(job.id)
    || typeof job.requestId !== 'string' || !IMAGE_ID.test(job.requestId)
    || !['accountId', 'ownerActorId', 'catId', 'conversationId', 'runtimeSessionId', 'policyId',
      'bindingId', 'bindingRevision', 'targetId', 'profileId', 'profileRevision', 'agentConfigId'].every((key) => text(job[key]))
    || !Number.isSafeInteger(job.policyRevision) || Number(job.policyRevision) < 1
    || typeof job.status !== 'string' || !statuses.has(job.status)
    || !['manual', 'heartbeat'].includes(String(job.trigger))
    || !IMAGE_PROVIDERS.includes(job.provider as RuntimeImageProvider)
    || typeof job.instance !== 'string' || job.operation !== 'image.generate'
    || typeof job.prompt !== 'string' || typeof job.caption !== 'string' || typeof job.runtimeTerminalObserved !== 'boolean'
    || !['held', 'released', 'submitted'].includes(String(job.dispatchState))
    || !Number.isFinite(Date.parse(String(job.createdAt))) || !Number.isFinite(Date.parse(String(job.updatedAt)))
    || (job.cancelRequestedAt !== null && !Number.isFinite(Date.parse(String(job.cancelRequestedAt))))
    || !Array.isArray(job.warnings) || !job.warnings.every((warning) => typeof warning === 'string')
    || (job.error !== null && typeof job.error !== 'string')) throw new MediaImageError('media_state_invalid', 503);
  if (job.output !== null) {
    if (!job.output || typeof job.output !== 'object') throw new MediaImageError('media_state_invalid', 503);
    const output = job.output as Record<string, unknown>;
    if (!['image/jpeg', 'image/png'].includes(String(output.mimeType)) || !Number.isSafeInteger(output.bytes)
      || Number(output.bytes) < 4 || Number(output.bytes) > 8 * 1024 * 1024
      || !Number.isSafeInteger(output.width) || !Number.isSafeInteger(output.height)
      || Number(output.width) < 1 || Number(output.width) > 4096 || Number(output.height) < 1 || Number(output.height) > 4096
      || typeof output.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(output.sha256)) {
      throw new MediaImageError('media_state_invalid', 503);
    }
  }
  return value as CatImageJob;
}

/**
 * New, isolated multimedia data; existing App jobs and images keep their original representation.
 * SQLite transactions reserve policy budget and request identity together across Platform processes.
 * Unknown/damaged databases are refused, never reset; SQLite rollback/WAL handles interrupted writes.
 * Loading SQLite is lazy so older Node hosts retain their existing App capabilities.
 */
export class CatImageLedger {
  private readonly database: Database;

  constructor(filename: string) {
    if (!path.isAbsolute(filename)) throw new MediaImageError('invalid_media_store');
    let sqlite: SqliteModule;
    try { sqlite = require('node:sqlite') as SqliteModule; }
    catch { throw new MediaImageError('media_storage_unavailable', 503); }
    mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    this.database = new sqlite.DatabaseSync(filename);
    try {
      this.database.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
      const initialVersion = this.database.prepare('PRAGMA user_version').get()?.user_version;
      if (initialVersion !== 0 && initialVersion !== 1) throw new MediaImageError('media_state_unsupported', 503);
      this.transaction(() => {
        const version = this.database.prepare('PRAGMA user_version').get()?.user_version;
        if (version === 1) return;
        if (version !== 0 || this.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length) {
          throw new MediaImageError('media_state_unsupported', 503);
        }
          this.database.exec(`
            CREATE TABLE policies (caller_key TEXT PRIMARY KEY, document TEXT NOT NULL) STRICT;
            CREATE TABLE budget_clocks (caller_key TEXT PRIMARY KEY, time_zone TEXT NOT NULL,
              pending_zone TEXT, pending_day TEXT, changed_at INTEGER NOT NULL) STRICT;
            CREATE TABLE jobs (id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE,
              caller_key TEXT NOT NULL, status TEXT NOT NULL, terminal_observed INTEGER NOT NULL DEFAULT 0,
              created_at INTEGER NOT NULL, document TEXT NOT NULL) STRICT;
            CREATE TABLE reservations (job_id TEXT PRIMARY KEY REFERENCES jobs(id), caller_key TEXT NOT NULL,
              bucket TEXT NOT NULL, admitted_at INTEGER NOT NULL, released INTEGER NOT NULL DEFAULT 0) STRICT;
            CREATE TABLE deliveries (id TEXT PRIMARY KEY, job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id),
              status TEXT NOT NULL, document TEXT NOT NULL) STRICT;
            CREATE TABLE maintenance (id INTEGER PRIMARY KEY CHECK(id=1), resetting INTEGER NOT NULL) STRICT;
            INSERT INTO maintenance(id,resetting) VALUES(1,0);
            CREATE INDEX caller_jobs ON jobs(caller_key, created_at);
            CREATE INDEX caller_reservations ON reservations(caller_key, admitted_at);
            PRAGMA user_version=1;
          `);
      });
      if (this.database.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') throw new MediaImageError('media_state_invalid', 503);
      // Verify expected structure before making any updates to an existing file.
      for (const table of ['policies', 'budget_clocks', 'jobs', 'reservations', 'deliveries', 'maintenance']) this.database.prepare('SELECT * FROM ' + table + ' LIMIT 0').all();
      this.execBusy('PRAGMA journal_mode=WAL;');
    } catch (error) { this.database.close(); throw error; }
  }

  close(): void { this.database.close(); }

  clearForReset(): void {
    this.transaction(() => this.database.exec('DELETE FROM deliveries; DELETE FROM reservations; DELETE FROM jobs; DELETE FROM policies; DELETE FROM budget_clocks; UPDATE maintenance SET resetting=0 WHERE id=1;'));
  }

  beginReset(): void {
    this.transaction(() => {
      if (this.database.prepare("SELECT id FROM jobs WHERE status IN ('submitting','running','collecting','cancelling') OR (status='interrupted' AND terminal_observed=0) LIMIT 1").get()
        || this.database.prepare("SELECT id FROM deliveries WHERE status='sending' OR (status='uncertain' AND json_extract(document,'$.abandonedAt') IS NULL) LIMIT 1").get()) {
        throw new MediaImageError('image_service_busy', 409);
      }
      this.database.exec('UPDATE maintenance SET resetting=1 WHERE id=1');
    });
  }

  cancelReset(): void { this.database.exec('UPDATE maintenance SET resetting=0 WHERE id=1'); }

  private assertWritable(): void {
    if (this.database.prepare('SELECT resetting FROM maintenance WHERE id=1').get()?.resetting !== 0) {
      throw new MediaImageError('media_reset_in_progress', 503);
    }
  }

  delivery(jobId: string): CatImageDelivery | undefined {
    const value = parse(this.database.prepare('SELECT document FROM deliveries WHERE job_id=?').get(jobId));
    if (value === undefined) return undefined;
    const item = value as CatImageDelivery;
    if (!item || item.schemaVersion !== 1 || item.id !== jobId || item.jobId !== jobId
      || !['pending', 'sending', 'sent', 'failed', 'uncertain', 'suppressed'].includes(item.status)
      || !Number.isSafeInteger(item.attempts) || item.attempts < 0 || typeof item.assetSha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(item.assetSha256) || !Number.isFinite(Date.parse(item.updatedAt))
      || !Number.isFinite(Date.parse(item.nextAttemptAt))) throw new MediaImageError('media_state_invalid', 503);
    return item;
  }

  ensureDelivery(jobId: string, now: Date): CatImageDelivery {
    return this.transaction(() => {
      this.assertWritable();
      const previous = this.delivery(jobId); if (previous) return previous;
      const job = this.get(jobId);
      if (!job || job.status !== 'succeeded' || !job.output) throw new MediaImageError('image_not_ready', 409);
      const delivery: CatImageDelivery = { schemaVersion: 1, id: job.id, jobId: job.id, assetSha256: job.output.sha256,
        conversationId: job.conversationId, bindingId: job.bindingId, bindingRevision: job.bindingRevision,
        status: 'pending', attempts: 0, attemptId: null, nextAttemptAt: now.toISOString(), updatedAt: now.toISOString(),
        messageId: null, transportMessageId: null, receiptId: null, error: null };
      this.database.prepare('INSERT INTO deliveries(id,job_id,status,document) VALUES(?,?,?,?)')
        .run(delivery.id, job.id, delivery.status, JSON.stringify(delivery));
      return delivery;
    });
  }

  /** Claim before any external side effect. Lost acknowledgements are never automatically retried. */
  claimDelivery(jobId: string, now: Date): CatImageDelivery | undefined {
    return this.transaction(() => {
      this.assertWritable();
      const delivery = this.delivery(jobId);
      if (!delivery || delivery.status !== 'pending' || Date.parse(delivery.nextAttemptAt) > now.getTime()) return;
      const next: CatImageDelivery = { ...delivery, status: 'sending', attempts: delivery.attempts + 1,
        attemptId: randomUUID(), updatedAt: now.toISOString(), error: null };
      this.writeDelivery(next); return next;
    });
  }

  assertDeliveryClaim(jobId: string, attemptId: string): void {
    const current = this.delivery(jobId);
    if (!current || current.status !== 'sending' || current.attemptId !== attemptId) {
      throw new MediaImageError('image_delivery_claim_lost', 409);
    }
  }

  private writeDelivery(delivery: CatImageDelivery): void {
    this.database.prepare('UPDATE deliveries SET status=?,document=? WHERE job_id=?')
      .run(delivery.status, JSON.stringify(delivery), delivery.jobId);
  }

  finishDelivery(jobId: string, attemptId: string, patch: Partial<Pick<CatImageDelivery,
    'status' | 'messageId' | 'transportMessageId' | 'receiptId' | 'error' | 'nextAttemptAt'>>, now: Date): CatImageDelivery | undefined {
    return this.transaction(() => {
      const delivery = this.delivery(jobId);
      if (!delivery || delivery.status !== 'sending' || delivery.attemptId !== attemptId) return delivery;
      const next = { ...delivery, ...patch, updatedAt: now.toISOString() };
      this.writeDelivery(next); return next;
    });
  }

  recoverDeliveries(now: Date): void {
    this.transaction(() => {
      for (const row of this.database.prepare("SELECT job_id FROM deliveries WHERE status='sending'").all()) {
        const delivery = this.delivery(String(row.job_id))!;
        if (now.getTime() - Date.parse(delivery.updatedAt) < 120000) continue;
        this.writeDelivery({ ...delivery, status: 'uncertain', error: 'delivery_acknowledgement_missing', updatedAt: now.toISOString() });
      }
    });
  }

  retryDelivery(jobId: string, now: Date): CatImageDelivery {
    return this.transaction(() => {
      this.assertWritable();
      const delivery = this.delivery(jobId);
      if (!delivery || !['failed', 'uncertain'].includes(delivery.status)) throw new MediaImageError('image_delivery_not_retryable', 409);
      const next: CatImageDelivery = { ...delivery, status: 'pending', attemptId: null, abandonedAt: null,
        error: null, nextAttemptAt: now.toISOString(), updatedAt: now.toISOString() };
      this.writeDelivery(next); return next;
    });
  }

  abandonDelivery(jobId: string, now: Date): CatImageDelivery {
    return this.transaction(() => {
      this.assertWritable();
      const current = this.delivery(jobId);
      if (!current || current.status === 'sent' || current.status === 'sending') throw new MediaImageError('image_delivery_in_progress', 409);
      const next: CatImageDelivery = { ...current, status: current.status === 'uncertain' ? 'uncertain' : 'suppressed',
        attemptId: null, abandonedAt: now.toISOString(), updatedAt: now.toISOString(),
        error: current.status === 'uncertain' ? 'delivery_abandoned_outcome_unknown' : 'delivery_abandoned' };
      this.writeDelivery(next); return next;
    });
  }

  private execBusy(sql: string): void {
    const deadline = Date.now() + 5000;
    const sleeper = new Int32Array(new SharedArrayBuffer(4));
    for (;;) {
      try { this.database.exec(sql); return; } catch (error) {
        const code = (error as { errcode?: unknown }).errcode;
        if ((code !== 5 && code !== 6) || Date.now() >= deadline) throw error;
        Atomics.wait(sleeper, 0, 0, 10);
      }
    }
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.exec('COMMIT');
      return result;
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }

  policy(caller: Pick<CatImageCaller, 'accountId' | 'ownerActorId' | 'catId'>): CatImagePolicy | undefined {
    const value = parse(this.database.prepare('SELECT document FROM policies WHERE caller_key=?').get(callerKey(caller)));
    return value === undefined ? undefined : validateCatImagePolicy(value);
  }

  policies(): CatImagePolicy[] {
    return this.database.prepare('SELECT document FROM policies').all().map((row) => validateCatImagePolicy(parse(row)));
  }

  /** Owner route supplies identity; a model has no access to this method or to policy mutations. */
  savePolicy(value: CatImagePolicy, expectedRevision: number): CatImagePolicy {
    const policy = validateCatImagePolicy(value);
    return this.transaction(() => {
      const previous = this.policy(policy);
      this.assertWritable();
      if (policy.enabled && this.policies().some(other => other.enabled && other.ownerActorId === policy.ownerActorId
        && other.catId === policy.catId && other.accountId !== policy.accountId)) throw new MediaImageError('image_owner_scope_conflict', 409);
      if ((previous?.revision ?? 0) !== expectedRevision || policy.revision !== expectedRevision + 1
        || (previous && previous.id !== policy.id)) throw new MediaImageError('image_policy_changed', 409);
      const now = new Date(policy.updatedAt);
      if (!previous) {
        this.database.prepare('INSERT INTO budget_clocks(caller_key,time_zone,changed_at) VALUES(?,?,?)')
          .run(callerKey(policy), policy.timeZone, now.getTime());
      } else {
        const zone = this.budgetZone(policy, now);
        // A timezone edit takes effect for budgets after the current calendar bucket ends.
        // It changes allowed-window calculations immediately, but never resets today's usage.
        this.database.prepare('UPDATE budget_clocks SET pending_zone=?,pending_day=?,changed_at=? WHERE caller_key=?')
          .run(policy.timeZone === zone ? null : policy.timeZone,
            policy.timeZone === zone ? null : imagePolicyDay({ timeZone: zone }, now), now.getTime(), callerKey(policy));
      }
      this.database.prepare('INSERT INTO policies(caller_key,document) VALUES(?,?) ON CONFLICT(caller_key) DO UPDATE SET document=excluded.document')
        .run(callerKey(policy), JSON.stringify(policy));
      return policy;
    });
  }

  get(id: string): CatImageJob | undefined {
    if (!IMAGE_ID.test(id)) throw new MediaImageError('invalid_image_request');
    return jobFrom(this.database.prepare('SELECT document FROM jobs WHERE id=?').get(id));
  }

  list(caller?: Pick<CatImageCaller, 'accountId' | 'ownerActorId' | 'catId'>): CatImageJob[] {
    const rows = caller
      ? this.database.prepare('SELECT document FROM jobs WHERE caller_key=? ORDER BY created_at DESC').all(callerKey(caller))
      : this.database.prepare('SELECT document FROM jobs ORDER BY created_at DESC').all();
    return rows.map((row) => jobFrom(row)!);
  }

  private budgetZone(caller: Pick<CatImageCaller, 'accountId' | 'ownerActorId' | 'catId'>, now: Date): string {
    const clock = this.database.prepare('SELECT * FROM budget_clocks WHERE caller_key=?').get(callerKey(caller));
    if (!clock || typeof clock.time_zone !== 'string') throw new MediaImageError('media_state_invalid', 503);
    if (typeof clock.pending_zone === 'string' && now.getTime() > Number(clock.changed_at)
      && imagePolicyDay({ timeZone: clock.time_zone }, now) !== clock.pending_day) {
      this.database.prepare('UPDATE budget_clocks SET time_zone=pending_zone,pending_zone=NULL,pending_day=NULL WHERE caller_key=?')
        .run(callerKey(caller));
      return clock.pending_zone;
    }
    return clock.time_zone;
  }

  private budgetInside(caller: Pick<CatImageCaller, 'accountId' | 'ownerActorId' | 'catId'>, policy: CatImagePolicy, now: Date) {
    const rows = this.database.prepare('SELECT bucket,admitted_at FROM reservations WHERE caller_key=? AND released=0').all(callerKey(caller));
    const timeZone = this.budgetZone(caller, now);
    const bucket = imagePolicyDay({ timeZone }, now);
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const daily = rows.filter((row) => formatter.format(new Date(Number(row.admitted_at))) === bucket).length;
    return { dailyUsed: daily, totalUsed: rows.length, bucket, timeZone, timeZonePending: timeZone !== policy.timeZone,
      lastAdmittedAt: rows.reduce<number | null>((last, row) => Math.max(last ?? 0, Number(row.admitted_at)), null) };
  }

  budget(caller: Pick<CatImageCaller, 'accountId' | 'ownerActorId' | 'catId'>, policy: CatImagePolicy, now: Date) {
    return this.transaction(() => this.budgetInside(caller, policy, now));
  }

  admit(caller: CatImageCaller, request: CatImageRequest, expectedRevision: number, now: Date, deferUntilTurnEnd = false): { job: CatImageJob; created: boolean } {
    if (!caller.runtimeSessionId || !IMAGE_ID.test(request.requestId) || !request.prompt.trim()
      || Array.from(request.prompt).length > 2000 || request.caption.length > 1024) throw new MediaImageError('invalid_image_request');
    return this.transaction(() => {
      this.assertWritable();
      const policy = authorizeCatImagePolicy(this.policy(caller), caller, now);
      if (policy.revision !== expectedRevision) throw new MediaImageError('image_policy_changed', 409);
      const requestKey = hash([callerKey(caller), request.requestId]);
      const existing = jobFrom(this.database.prepare('SELECT document FROM jobs WHERE request_key=?').get(requestKey));
      if (existing) {
        if (existing.prompt !== request.prompt.trim() || existing.caption !== request.caption.trim()
          || existing.conversationId !== caller.conversationId || existing.trigger !== caller.trigger
          || existing.targetId !== policy.targetId || existing.profileId !== policy.profileId
          || existing.profileRevision !== policy.profileRevision || existing.agentConfigId !== policy.agentConfigId) {
          throw new MediaImageError('image_request_conflict', 409);
        }
        return { job: existing, created: false };
      }
      const budget = this.budgetInside(caller, policy, now);
      if (budget.dailyUsed >= policy.dailyLimit || budget.totalUsed >= policy.totalLimit) throw new MediaImageError('image_budget_exhausted', 429);
      if (budget.lastAdmittedAt !== null && now.getTime() - budget.lastAdmittedAt < policy.minIntervalMinutes * 60000) {
        throw new MediaImageError('image_interval_active', 429);
      }
      if (this.database.prepare("SELECT id FROM jobs WHERE json_extract(document,'$.ownerActorId')=? AND json_extract(document,'$.catId')=? AND (status IN ('submitting','running','collecting','cancelling') OR (status='interrupted' AND terminal_observed=0)) LIMIT 1")
        .get(caller.ownerActorId, caller.catId)) throw new MediaImageError('image_service_busy', 429);
      if (this.database.prepare('SELECT count(*) count FROM jobs').get()?.count as number >= 100000) {
        throw new MediaImageError('image_storage_limit', 409);
      }
      // The transaction persists the request-key mapping before any RPC. Use a standard UUID
      // for native providers rather than imposing hash bits on their session ID format.
      const id = randomUUID();
      const provider = /^([a-z]+)\/(.+)$/.exec(policy.targetId);
      if (!provider || !IMAGE_PROVIDERS.includes(provider[1] as RuntimeImageProvider)) throw new MediaImageError('image_profile_unavailable', 503);
      const at = now.toISOString();
      const job: CatImageJob = { schemaVersion: 1, id, requestId: request.requestId,
        accountId: caller.accountId, ownerActorId: caller.ownerActorId, catId: caller.catId,
        conversationId: caller.conversationId, runtimeSessionId: caller.runtimeSessionId, trigger: caller.trigger,
        caption: request.caption.trim(), policyId: policy.id, policyRevision: policy.revision,
        bindingId: policy.bindingId, bindingRevision: policy.bindingRevision,
        targetId: policy.targetId, provider: provider[1] as CatImageJob['provider'], instance: provider[2]!,
        profileId: policy.profileId, profileRevision: policy.profileRevision, agentConfigId: policy.agentConfigId,
        operation: 'image.generate', prompt: request.prompt.trim(), status: 'submitting',
        agentModel: null, agentEffort: null, error: null, warnings: [], executionOutcome: null, output: null,
        createdAt: at, updatedAt: at, cancelRequestedAt: null, runtimeTerminalObserved: false,
        dispatchState: deferUntilTurnEnd ? 'held' : 'released' };
      this.database.prepare('INSERT INTO jobs(id,request_key,caller_key,status,created_at,document) VALUES(?,?,?,?,?,?)')
        .run(id, requestKey, callerKey(caller), job.status, now.getTime(), JSON.stringify(job));
      this.database.prepare('INSERT INTO reservations(job_id,caller_key,bucket,admitted_at) VALUES(?,?,?,?)')
        .run(id, callerKey(caller), budget.bucket, now.getTime());
      return { job, created: true };
    });
  }

  releaseTurn(runtimeSessionId: string, now: Date): CatImageJob[] {
    return this.transaction(() => this.list().filter(job => job.runtimeSessionId === runtimeSessionId
      && job.dispatchState === 'held' && job.status === 'submitting').map(job => {
      const next: CatImageJob = { ...job, dispatchState: 'released', updatedAt: now.toISOString() };
      this.database.prepare('UPDATE jobs SET document=? WHERE id=?').run(JSON.stringify(next), job.id);
      return next;
    }));
  }

  claimDispatch(id: string, now: Date): boolean {
    return this.transaction(() => {
      this.assertWritable();
      const job = this.get(id);
      if (!job || job.status !== 'submitting' || job.dispatchState !== 'released') return false;
      const policy = authorizeCatImagePolicy(this.policy(job), job, now);
      if (policy.id !== job.policyId || policy.revision !== job.policyRevision || policy.bindingId !== job.bindingId
        || policy.bindingRevision !== job.bindingRevision) throw new MediaImageError('image_not_authorized', 403);
      const next: CatImageJob = { ...job, dispatchState: 'submitted', updatedAt: now.toISOString() };
      this.database.prepare('UPDATE jobs SET document=? WHERE id=?').run(JSON.stringify(next), id);
      return true;
    });
  }

  cancelUndispatched(id: string, now: Date): boolean {
    return this.transaction(() => {
      const job = this.get(id);
      if (!job || job.dispatchState === 'submitted' || !isActiveImage(job)) return false;
      const next: CatImageJob = { ...job, status: 'cancelled', error: 'cancelled',
        cancelRequestedAt: now.toISOString(), updatedAt: now.toISOString() };
      this.database.prepare('UPDATE jobs SET status=?,document=? WHERE id=?').run(next.status, JSON.stringify(next), id);
      // Atomic claim proves Runtime never received this attempt.
      this.database.prepare('UPDATE reservations SET released=1 WHERE job_id=?').run(id);
      return true;
    });
  }

  update(id: string, patch: MediaImagePatch, now: Date): CatImageJob | undefined {
    return this.transaction(() => {
      const job = this.get(id);
      if (!job || !isActiveImage(job)) return job;
      if (job.status === 'cancelling' && patch.status !== 'cancelled' && patch.status !== 'interrupted'
        && patch.status !== 'cancelling') return job;
      const next: CatImageJob = { ...job, ...patch, updatedAt: now.toISOString(),
        cancelRequestedAt: patch.status === 'cancelling' ? job.cancelRequestedAt ?? now.toISOString() : job.cancelRequestedAt };
      this.database.prepare('UPDATE jobs SET status=?,document=? WHERE id=?').run(next.status, JSON.stringify(next), id);
      this.releaseInside(next);
      return next;
    });
  }

  private releaseInside(job: CatImageJob): boolean {
    if (job.status !== 'failed' || !job.error || !IMAGE_PREEXECUTION_REFUSALS.has(job.error)) return false;
    const reservation = this.database.prepare('SELECT released FROM reservations WHERE job_id=?').get(job.id);
    if (!reservation || reservation.released !== 0) return false;
    this.database.prepare('UPDATE reservations SET released=1 WHERE job_id=? AND released=0').run(job.id);
    return true;
  }

  releaseReservation(id: string): boolean {
    return this.transaction(() => {
      const job = this.get(id);
      return job ? this.releaseInside(job) : false;
    });
  }

  observeRuntime(id: string, remote: RuntimeImageJob, now: Date): void {
    this.transaction(() => {
      const job = this.get(id);
      if (!job || remote.id !== id || remote.targetId !== job.targetId || remote.prompt !== job.prompt
        || remote.profileId !== job.profileId || remote.profileRevision !== job.profileRevision
        || remote.agentConfigId !== job.agentConfigId) throw new MediaImageError('invalid_image');
      if (!['succeeded', 'failed', 'cancelled', 'interrupted'].includes(remote.status) || job.runtimeTerminalObserved) return;
      const next = { ...job, runtimeTerminalObserved: true, updatedAt: now.toISOString() };
      this.database.prepare('UPDATE jobs SET terminal_observed=1,document=? WHERE id=?').run(JSON.stringify(next), id);
    });
  }

  /** Recovery queries the same Runtime receipt; it never creates another admission or reservation. */
  recover(id: string, now: Date): CatImageJob | undefined {
    return this.transaction(() => {
      const job = this.get(id);
      if (!job || job.status !== 'interrupted' || job.runtimeTerminalObserved) return job;
      const next = { ...job, status: job.cancelRequestedAt ? 'cancelling' as const : 'running' as const,
        error: null, updatedAt: now.toISOString() };
      this.database.prepare('UPDATE jobs SET status=?,document=? WHERE id=?').run(next.status, JSON.stringify(next), id);
      return next;
    });
  }
}

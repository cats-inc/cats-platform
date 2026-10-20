import type { RuntimeClient, RuntimeObservedSessionPayload, RuntimeSessionStreamEvent } from '../../../runtime/client.js';
import { readRuntimeWorkspaceActivity, type RuntimeWorkspaceActivitySnapshot } from '../../../runtime/workspaceActivity.js';
import type { ConversationExecutionInspector, ConversationExecutionInspection,
  ConversationExecutionAttempt, ConversationExecutionParticipant, ConversationExecutionBinding } from '../../../shared/conversationExecutionInspection.js';
import type { CodeConversationWorkAreas, CodeParticipantWorkAreas, CodeWorkAreaCheckout } from '../shared/workAreas.js';

const MAX_CACHE = 128;
const MAX_BYTES = 256 * 1024;
interface Retained {
  snapshot: RuntimeWorkspaceActivitySnapshot | null;
  connected: boolean;
  currentRunId: string | null;
  mappings: Map<string, ConversationExecutionBinding>;
  request: number;
  streamGeneration: number;
  pendingEpoch: string | null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function boundedId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f\x7f]/u.test(value);
}
function key(context: ConversationExecutionInspection, participant: ConversationExecutionParticipant,
  attempt: ConversationExecutionAttempt): string {
  return JSON.stringify([context.conversationId, participant.canonicalParticipantId, attempt.sessionId, attempt.startedAt]);
}
function sameBinding(a: ConversationExecutionBinding, b: ConversationExecutionBinding): boolean {
  return a.sessionId === b.sessionId && a.turnId === b.turnId && a.laneId === b.laneId
    && a.runId === b.runId && a.targetStateId === b.targetStateId;
}

export interface CodeWorkAreasService {
  authorized(conversationId: string): Promise<boolean>;
  read(conversationId: string): Promise<CodeConversationWorkAreas | null>;
  watch(conversationId: string, emit: (value: CodeConversationWorkAreas | null) => Promise<void>,
    signal: AbortSignal): Promise<void>;
}

/** Bounded, memory-only read model. The injected engine remains the attribution authority. */
export function createCodeWorkAreasService(options: {
  inspector: ConversationExecutionInspector;
  runtime: Pick<RuntimeClient, 'observeSession' | 'streamSession'>;
  reconcileMs?: number;
  inspectTimeoutMs?: number;
}): CodeWorkAreasService {
  const cache = new Map<string, Retained>();
  let requestSequence = 0;
  let pendingInspections = 0;
  let liveStreams = 0;
  let watchers = 0;
  let pendingDeliveries = 0;
  const interval = options.reconcileMs ?? 2000;

  async function contextFor(id: string) {
    const context = await options.inspector.read(id);
    if (!context || !context.owned || context.origin !== 'code' || context.conversationId !== id) {
      for (const cacheKey of cache.keys()) if (JSON.parse(cacheKey)[0] === id) cache.delete(cacheKey);
      return null;
    }
    const allowed = new Set(context.participants.flatMap(p => p.attempts.map(a => key(context, p, a))));
    for (const cacheKey of cache.keys()) if (JSON.parse(cacheKey)[0] === id && !allowed.has(cacheKey)) cache.delete(cacheKey);
    return context;
  }

  function retain(cacheKey: string): Retained {
    let value = cache.get(cacheKey);
    if (!value) {
      value = { snapshot: null, connected: false, currentRunId: null, mappings: new Map(), request: 0,
        streamGeneration: 0, pendingEpoch: null };
      cache.set(cacheKey, value);
    }
    while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
    return value;
  }

  function acceptSnapshot(retained: Retained, snapshot: RuntimeWorkspaceActivitySnapshot, authoritative: boolean): boolean {
    const previous = retained.snapshot;
    if ((!previous || previous.observationEpoch !== snapshot.observationEpoch) && !authoritative) {
      if (retained.pendingEpoch !== snapshot.observationEpoch) retained.streamGeneration++;
      retained.pendingEpoch = snapshot.observationEpoch;
      retained.connected = false;
      return false;
    }
    if (!previous || previous.observationEpoch !== snapshot.observationEpoch || snapshot.revision > previous.revision) {
      if (previous && previous.observationEpoch !== snapshot.observationEpoch) retained.mappings.clear();
      retained.snapshot = snapshot;
    }
    return true;
  }

  function mapRuns(retained: Retained, payload: RuntimeObservedSessionPayload,
    context: ConversationExecutionInspection, participant: ConversationExecutionParticipant,
    attempt: ConversationExecutionAttempt): void {
    const inspection = record(payload.session.inspection);
    const current = record(inspection.currentRun);
    retained.currentRunId = boundedId(current.id) ? current.id : null;
    for (const candidate of [current, record(inspection.lastRun)]) {
      const metadata = record(record(candidate.wake).metadata);
      if (!boundedId(candidate.id)
        || metadata.conversationId !== context.conversationId || metadata.channelId !== context.channelId
        || metadata.targetId !== participant.participantId) continue;
      const binding = attempt.bindings.find(item => item.turnId === metadata.turnId
        && item.laneId === metadata.laneId && item.targetStateId === metadata.targetStateId);
      if (binding) retained.mappings.set(candidate.id, { ...binding });
    }
    for (const [id, binding] of retained.mappings) if (!attempt.bindings.some(item => sameBinding(item, binding))) retained.mappings.delete(id);
    while (retained.mappings.size > 64) retained.mappings.delete(retained.mappings.keys().next().value!);
  }

  async function inspect(context: ConversationExecutionInspection, participant: ConversationExecutionParticipant,
    attempt: ConversationExecutionAttempt): Promise<void> {
    const retained = retain(key(context, participant, attempt));
    if (pendingInspections >= 4) { retained.connected = false; return; }
    const request = ++requestSequence;
    const streamGeneration = retained.streamGeneration;
    retained.request = request;
    pendingInspections++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Keep the unresolved-call cap until the underlying request actually settles.
      const pending = Promise.resolve().then(() => options.runtime.observeSession(attempt.sessionId))
        .finally(() => { pendingInspections--; });
      const payload = await Promise.race([pending, new Promise<null>(resolve => {
        timer = setTimeout(() => resolve(null), options.inspectTimeoutMs ?? 3000);
      })]);
      if (retained.request !== request) return;
      if (!payload || payload.session.id !== attempt.sessionId) { retained.connected = false; return; }
      const snapshot = readRuntimeWorkspaceActivity(record(payload.session.inspection).workspaceActivity, attempt.sessionId);
      if (!snapshot) {
        retained.snapshot = null; retained.mappings.clear(); retained.currentRunId = null;
        retained.connected = false;
        return;
      }
      // A new epoch arrived after this inspection began; it must be reconciled by a later read.
      if (retained.streamGeneration !== streamGeneration) { retained.connected = false; return; }
      retained.pendingEpoch = null;
      acceptSnapshot(retained, snapshot, true);
      mapRuns(retained, payload, context, participant, attempt);
      retained.connected = true;
    } catch { if (retained.request === request) retained.connected = false; }
    finally { if (timer) clearTimeout(timer); }
  }

  function project(context: ConversationExecutionInspection): CodeConversationWorkAreas {
    const result: CodeConversationWorkAreas = { schemaVersion: 1, conversationId: context.conversationId,
      channelId: context.channelId, codespace: { path: context.rootPath }, participants: [], truncated: context.truncated };
    for (const participant of context.participants) {
      const output: CodeParticipantWorkAreas = { participantId: participant.participantId,
        canonicalParticipantId: participant.canonicalParticipantId, name: participant.name.slice(0, 200),
        sourceKind: participant.sourceKind, sourceRefId: participant.sourceRefId,
        coordinator: participant.coordinator, executions: [], repositories: [] };
      const checkouts = new Map<string, CodeWorkAreaCheckout>();
      for (const attempt of participant.attempts) {
        const retained = cache.get(key(context, participant, attempt));
        const snapshot = retained?.snapshot;
        const live = Boolean(retained?.connected && attempt.current && attempt.attached);
        const execution = { sessionId: attempt.sessionId, current: attempt.current,
          continuity: !snapshot ? 'not_reported' as const : !retained?.connected ? 'interrupted' as const
            : live ? 'current' as const : 'last_known' as const,
          coverage: snapshot ? { ...snapshot.coverage } : { status: 'unsupported' as const, reason: 'not_reported' },
          observationEpoch: snapshot?.observationEpoch ?? null, revision: snapshot?.revision ?? null,
          observedAt: snapshot?.observedAt ?? null, startupCwd: snapshot?.startupCwd ?? null,
          runtimeCwd: snapshot?.runtimeCwd ?? null };
        output.executions.push(execution);
        if (!snapshot || !retained) continue;
        result.truncated ||= snapshot.truncated;
        for (const row of snapshot.workspaces) {
          const operations = [...row.runningOperations, ...row.recentOperations].flatMap(operation => {
            const binding = retained.mappings.get(operation.executionId);
            if (!binding || !attempt.bindings.some(item => sameBinding(item, binding))) {
              execution.coverage = { status: 'partial', reason: 'execution_attribution_unverified' };
              return [];
            }
            const active = live && operation.state === 'running' && retained.currentRunId === operation.executionId
              && attempt.activeBindings.some(item => sameBinding(item, binding));
            return [{ ...operation, sessionId: attempt.sessionId, turnId: binding.turnId,
              laneId: binding.laneId, runId: binding.runId, active,
              displayState: operation.state === 'running' && !active ? 'unknown' as const : operation.state }];
          });
          if (!operations.length && row.association !== 'session_binding') continue;
          let checkout = checkouts.get(row.checkoutId);
          if (!checkout) {
            checkout = { checkoutId: row.checkoutId, executionLocationId: row.executionLocationId,
              path: row.path, repository: row.repository ? { ...row.repository } : null,
              kind: row.kind, branch: row.branch, detachedCommit: row.detachedCommit,
              management: row.management, verification: row.verification,
              association: row.association, identityObservedAt: row.identityObservedAt, operations: [] };
            checkouts.set(row.checkoutId, checkout);
          }
          checkout.operations.push(...operations);
        }
      }
      for (const checkout of [...checkouts.values()].slice(0, 32)) {
        checkout.operations.sort((a, b) => Number(b.active) - Number(a.active)
          || b.startedAt.localeCompare(a.startedAt));
        if (checkout.operations.length > 16) { checkout.operations.length = 16; result.truncated = true; }
        const id = checkout.repository?.id ?? `directory:${checkout.checkoutId}`;
        let repository = output.repositories.find(entry => entry.id === id && entry.executionLocationId === checkout.executionLocationId);
        if (!repository) {
          repository = { id, label: checkout.repository?.label ?? null,
            executionLocationId: checkout.executionLocationId, checkouts: [] };
          output.repositories.push(repository);
        }
        repository.checkouts.push(checkout);
      }
      result.truncated ||= checkouts.size > 32;
      result.participants.push(output);
    }
    // Aggregate limits apply in addition to Runtime's per-session 64 KiB bound.
    while (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_BYTES && result.participants.length) {
      result.truncated = true;
      const participant = [...result.participants].reverse().find(item => item.repositories.length > 0);
      if (participant) {
        const repository = participant.repositories.at(-1)!;
        repository.checkouts.pop();
        if (!repository.checkouts.length) participant.repositories.pop();
      } else {
        const withExecutions = [...result.participants].reverse().find(item => item.executions.length);
        if (withExecutions) withExecutions.executions.pop();
        else result.participants.pop();
      }
    }
    return result;
  }

  async function read(id: string, refresh = true): Promise<CodeConversationWorkAreas | null> {
    const context = await contextFor(id);
    if (!context) return null;
    if (refresh) {
      const attempts = context.participants.flatMap(participant => participant.attempts.map(attempt => ({ participant, attempt })))
        .sort((a, b) => Number(b.attempt.current) - Number(a.attempt.current)).slice(0, 32);
      let index = 0;
      await Promise.all(Array.from({ length: Math.min(4, attempts.length) }, async () => {
        while (index < attempts.length) {
          const entry = attempts[index++];
          await inspect(context, entry.participant, entry.attempt);
        }
      }));
    }
    // Async inspection never extends attribution after removal, replacement or cleanup.
    const current = await contextFor(id);
    return current ? project(current) : null;
  }

  return {
    authorized: async id => Boolean(await contextFor(id)),
    read,
    async watch(id, emit, signal) {
      if (watchers >= 8 || pendingDeliveries >= 8) throw new Error('work_area_watch_limit');
      watchers++;
      const streams = new Map<string, { controller: AbortController; live: boolean; retryAt: number; cacheKey: string }>();
      let stopped = signal.aborted;
      let running: Promise<void> | undefined;
      let pending = false;
      let reconcile = true;
      let last = '';
      let delivering = false;
      let queued: { value: CodeConversationWorkAreas | null } | undefined;
      let finish!: () => void;
      const done = new Promise<void>(resolve => { finish = resolve; });
      const stop = () => { stopped = true; queued = undefined; finish(); };
      // Output backpressure must not delay ownership/lease reconciliation. Retain only
      // one in-flight delivery and the latest replacement; a stuck sink is globally bounded.
      const deliver = (value: CodeConversationWorkAreas | null) => {
        queued = { value };
        const pump = () => {
          if (stopped || delivering || !queued) return;
          const next = queued.value; queued = undefined;
          if (pendingDeliveries >= 8) { stop(); return; }
          delivering = true; pendingDeliveries++;
          void Promise.resolve().then(() => emit(next)).catch(stop).finally(() => {
            pendingDeliveries--; delivering = false;
            if (next === null) stop(); else pump();
          });
        };
        pump();
      };
      const schedule = (inspectRuntime: boolean) => {
        if (stopped) return;
        pending = true; reconcile ||= inspectRuntime;
        if (running) return;
        running = (async () => {
          while (pending && !stopped) {
            pending = false;
            const context = await contextFor(id);
            const wanted = new Map<string, { participant: ConversationExecutionParticipant; attempt: ConversationExecutionAttempt }>();
            if (context) for (const participant of context.participants) for (const attempt of participant.attempts) {
              if (attempt.current && attempt.attached) wanted.set(attempt.sessionId, { participant, attempt });
            }
            for (const [sessionId, stream] of streams) if (!wanted.has(sessionId)) {
              stream.controller.abort(); streams.delete(sessionId);
            }
            if (context) for (const [sessionId, entry] of wanted) {
              const prior = streams.get(sessionId);
              const cacheKey = key(context, entry.participant, entry.attempt);
              if (prior && prior.cacheKey !== cacheKey) { prior.controller.abort(); streams.delete(sessionId); }
              else if (prior?.live || prior && prior.retryAt > Date.now()) continue;
              if (liveStreams >= 32) continue;
              const stream = { controller: new AbortController(), live: true, retryAt: 0, cacheKey };
              streams.set(sessionId, stream); liveStreams++;
              // Start subscription before inspection. Runtime replays the latest snapshot on attach.
              void Promise.resolve().then(() => options.runtime.streamSession(sessionId, async (event: RuntimeSessionStreamEvent) => {
                if (stopped || streams.get(sessionId) !== stream || stream.controller.signal.aborted) return;
                if (event.event !== 'workspace_activity') return;
                const snapshot = readRuntimeWorkspaceActivity(event.data.workspaceActivity, sessionId);
                if (!snapshot) return;
                const retained = retain(key(context, entry.participant, entry.attempt));
                const accepted = acceptSnapshot(retained, snapshot, false);
                const unknownRun = snapshot.workspaces.some(row => [...row.runningOperations, ...row.recentOperations]
                  .some(operation => !retained.mappings.has(operation.executionId)));
                schedule(!accepted || unknownRun);
              }, { signal: stream.controller.signal })).catch(() => {}).finally(() => {
                liveStreams--; stream.live = false; stream.retryAt = Date.now() + interval;
                const retained = cache.get(key(context, entry.participant, entry.attempt));
                if (retained && streams.get(sessionId) === stream) retained.connected = false;
                if (!stopped && streams.get(sessionId) === stream) schedule(false);
              });
            }
            const refresh = reconcile; reconcile = false;
            const value = await read(id, refresh);
            if (stopped) break;
            const serialized = JSON.stringify(value);
            const outputBlocked = delivering;
            if (serialized !== last) { last = serialized; deliver(value); }
            if (!value) {
              // Revoke subscriptions even if an earlier delivery never drains.
              for (const stream of streams.values()) stream.controller.abort();
              streams.clear();
              if (outputBlocked) stop();
              break;
            }
          }
        })().catch(stop).finally(() => {
          running = undefined;
          if (pending && !stopped) schedule(false);
        });
      };
      const abort = stop;
      signal.addEventListener('abort', abort, { once: true });
      const unsubscribe = options.inspector.subscribe?.(() => schedule(false));
      const timer = setInterval(() => { if (stopped) finish(); else schedule(true); }, interval);
      try {
        if (signal.aborted) abort(); else schedule(true);
        await done;
      } finally {
        stop(); clearInterval(timer); unsubscribe?.(); signal.removeEventListener('abort', abort);
        for (const stream of streams.values()) stream.controller.abort();
        watchers--;
      }
    },
  };
}

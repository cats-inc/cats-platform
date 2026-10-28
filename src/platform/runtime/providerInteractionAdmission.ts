import type { CoreStore } from '../../core/store.js';
import type { CatsCoreState, CoreRunRecord } from '../../core/types.js';
import type { RuntimeClient, RuntimeSessionCreateInput, RuntimeSessionResumeInput } from '../../runtime/client.js';
import { PLATFORM_INTERACTION_HOST } from '../../shared/providerInteractions.js';
import { randomUUID } from 'node:crypto';

export const PROVIDER_RUN_ADMISSION_CONFLICT = 'E_PROVIDER_RUN_ADMISSION_CONFLICT';
class ProviderRunAdmissionConflict extends Error {
  readonly code = PROVIDER_RUN_ADMISSION_CONFLICT;
  constructor() { super('This run already owns a provider session admission.'); }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function providerRunSession(run: CoreRunRecord): string | null {
  const entry = record(run.metadata.providerInteraction);
  return entry.version === 1 && typeof entry.sessionId === 'string' ? entry.sessionId : null;
}

export function canControlProviderRun(core: CatsCoreState, run: CoreRunRecord, admission = false): boolean {
  const conversation = core.conversations.find(c => c.id === run.conversationId);
  const task = core.tasks.find(t => t.id === run.taskId);
  const mission = core.missions.find(m => m.id === run.metadata.missionId && m.conversationId === run.conversationId);
  return !!conversation?.sourceChannelId && conversation.status !== 'archived'
    && (task ? task.ownerActorId === core.ownerProfile.actorId : !!mission)
    && (admission || record(run.metadata.providerInteraction).ended !== true)
    && (admission ? ['queued', 'running', 'blocked'] : ['running']).includes(run.status) && !run.completedAt;
}

/** Register supervised Work sessions before their first message can ask a human.
 * Only product links are durable; raw requests and answers stay in Runtime.
 * Read-only/allowlist/budget fields pass through unchanged.
 */
export function withProviderRunInteractions(runtime: RuntimeClient, store: CoreStore,
  canHostConversation: (conversationId: string) => Promise<boolean> = async () => false): RuntimeClient {
  async function recordEnded(sessionId: string, closed: boolean) {
    await store.updateCore(core => {
      for (const run of core.runs.filter(r => providerRunSession(r) === sessionId)) {
        run.metadata = { ...run.metadata, providerInteraction: { ...record(run.metadata.providerInteraction), ended: true,
          ...(closed ? { cleanupRequired: false } : {}) } };
      }
      return core;
    });
  }
  return new Proxy(runtime, {
    get(target, key) {
      if (key === 'createSession') return async (input: RuntimeSessionCreateInput) => {
        const metadata = input.context?.metadata;
        const runId = metadata?.supervisionProduct === 'cats-work' && typeof metadata.supervisionRunId === 'string'
          ? metadata.supervisionRunId : null;
        const core = runId ? await store.readCore() : null;
        const run = core?.runs.find(r => r.id === runId);
        if (run && (run.completedAt || ['completed', 'failed', 'cancelled'].includes(run.status))) {
          throw new Error('The owning Work run has ended.');
        }
        if (!core || !run || !canControlProviderRun(core, run, true)
          || !run.conversationId || !await canHostConversation(run.conversationId)) return target.createSession(input);
        const admissionId = randomUUID();
        await store.updateCore(latest => {
          const current = latest.runs.find(r => r.id === run.id);
          if (!current || current.conversationId !== run.conversationId || !canControlProviderRun(latest, current, true)) {
            throw new Error('The owning Work run ended before session admission.');
          }
          const previous = record(current.metadata.providerInteraction);
          if (previous.admissionId || previous.sessionId && (previous.ended !== true || previous.cleanupRequired === true)
            || previous.version !== undefined && previous.version !== 1) {
            throw new ProviderRunAdmissionConflict();
          }
          current.metadata = { ...current.metadata, providerInteraction: { version: 1, admissionId } };
          return latest;
        });
        let session;
        try { session = await target.createSession({ ...input, interactionHost: PLATFORM_INTERACTION_HOST }); }
        catch (error) {
          await store.updateCore(latest => {
            const current = latest.runs.find(r => r.id === run.id);
            if (current && record(current.metadata.providerInteraction).admissionId === admissionId) {
              current.metadata = { ...current.metadata, providerInteraction: { version: 1, interrupted: true } };
            }
            return latest;
          });
          throw error;
        }
        let attached = false;
        try {
          if (!await canHostConversation(run.conversationId)) throw new Error('The owning conversation is no longer available.');
          let eligible = false;
          await store.updateCore(latest => {
            const current = latest.runs.find(r => r.id === run.id);
            if (!current || current.conversationId !== run.conversationId || !canControlProviderRun(latest, current, true)
              || current.status !== run.status
              || record(current.metadata.providerInteraction).admissionId !== admissionId) return latest;
            const supervision = record(current.metadata.supervision);
            current.metadata = { ...current.metadata, providerInteraction: { version: 1, sessionId: session.id },
              supervision: { ...supervision, runtimeBridge: { ...record(supervision.runtimeBridge), status: 'started', sessionId: session.id } } };
            if (metadata?.supervisionSurface === 'work-supervised-run-loop') {
              current.status = 'running';
              current.startedAt ??= new Date().toISOString();
            }
            eligible = true;
            return latest;
          });
          attached = eligible && await canHostConversation(run.conversationId);
        } finally {
          if (!attached) {
            let closed = false;
            try { await target.closeSession(session.id); closed = true; } catch {}
            // Keep a late worker identity even if cleanup cannot be confirmed.
            // A confirmed close permits a later explicit retry, without reviving
            // either the old callback or a lost in-flight admission.
            await store.updateCore(latest => {
              const current = latest.runs.find(r => r.id === run.id);
              if (current && (record(current.metadata.providerInteraction).admissionId === admissionId || providerRunSession(current) === session.id)) {
                current.metadata = { ...current.metadata,
                  providerInteraction: { version: 1, sessionId: session.id, ended: true, cleanupRequired: !closed } };
              }
              return latest;
            });
          }
        }
        if (!attached) throw new Error('The owning Work run ended before session admission.');
        return session;
      };
      if ((key === 'cancelSession' || key === 'closeSession') && typeof target[key] === 'function') return async (sessionId: string) => {
        await target[key](sessionId);
        await recordEnded(sessionId, key === 'closeSession');
      };
      if (key === 'resumeSession' && target.resumeSession) return async (sessionId: string, input?: RuntimeSessionResumeInput) => {
        const core = await store.readCore();
        const run = core.runs.find(r => providerRunSession(r) === sessionId);
        if (run && (!canControlProviderRun(core, run, true) || record(run.metadata.providerInteraction).cleanupRequired === true
          || !run.conversationId || !await canHostConversation(run.conversationId))) throw new Error('The owning Work run is no longer active.');
        const session = await target.resumeSession!(sessionId, run ? { ...input, interactionHost: PLATFORM_INTERACTION_HOST } : input);
        if (run) {
          let attached = false;
          try {
            let eligible = false;
            await store.updateCore(latest => {
              const current = latest.runs.find(r => r.id === run.id);
              if (current && providerRunSession(current) === sessionId && canControlProviderRun(latest, current, true)) {
                current.metadata = { ...current.metadata, providerInteraction: { version: 1, sessionId, ended: false } };
                eligible = true;
              }
              return latest;
            });
            attached = eligible && !!run.conversationId && await canHostConversation(run.conversationId);
          } finally {
            if (!attached) { await target.closeSession(sessionId); await recordEnded(sessionId, true); }
          }
          if (!attached) throw new Error('The owning Work run ended during resume.');
        }
        return session;
      };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

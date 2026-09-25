import type { ChatState } from '../api/contracts.js';
import type { RuntimeClient, RuntimeProviderDiagnosticsPayload } from '../../../platform/runtime/client.js';
import type {
  ProviderAgentBoundedObservation, ProviderAgentDecision,
} from '../../../platform/orchestration/providerAgentDecision.js';
import type { ProviderAgentAdapterResult } from '../../../platform/orchestration/providerAgentAdapter.js';
import {
  createSupervisedToolRegistry,
} from '../../../platform/supervision/toolRegistry.js';
import {
  createInMemoryToolEvidenceSink, createToolBoundary,
} from '../../../platform/supervision/toolBoundary.js';
import { knowledgeDigest } from '../../../platform/knowledge/productKnowledge.js';
import {
  collaborationSnapshot, collaborationToolManifests, executeCollaborationRead,
  isCollaborationTool, PREPARE_COLLABORATION, INSPECT_COLLABORATION_CONTEXT,
  type CollaborationReadReceipt, type CollaborationReport, type CollaborationPreparation,
} from './orchestratorCollaboration.js';

export async function runCollaborationDecisionLoop(input: {
  state: ChatState;
  channelId: string;
  goal: string;
  observation: ProviderAgentBoundedObservation;
  runtimeClient: RuntimeClient;
  readState?: () => Promise<ChatState>;
  isCancelled?: () => boolean;
  report: (report: CollaborationReport) => void;
  request: (state: ChatState, observation: ProviderAgentBoundedObservation,
    runtime: RuntimeClient, sessionId: string | null, receipts: CollaborationReadReceipt[])
    => Promise<ProviderAgentAdapterResult>;
}): Promise<ProviderAgentDecision | null> {
  const receipts: CollaborationReadReceipt[] = [];
  const registry = createSupervisedToolRegistry();
  collaborationToolManifests().forEach((manifest) => registry.register(manifest));
  const boundary = createToolBoundary({ registry, evidenceSink: createInMemoryToolEvidenceSink() });
  const duration = Math.min(input.observation.budget.maxDurationMs ?? 30_000, 30_000);
  const deadline = Date.now() + duration;
  const maxTokens = Math.min(input.observation.budget.maxTokens ?? 8000, 8000);
  let tokens = 0;
  let requestsStarted = 0;
  let responsesReceived = 0;
  let missingUsage = false;
  let sessionId: string | null = null;
  let stopped = false;
  let entered = false;
  let deliveredCount = 0;
  let preparation: CollaborationPreparation | undefined;
  let pendingReport: CollaborationReport | undefined;
  const baselineUserRevision = userRevision(input.state);
  const original = collaborationSnapshot(input.state, input.channelId, input.observation);
  if (!original) return null;

  const cleanupSession = async (id: string, cancel: boolean) => {
    const cleanup = async () => {
      if (cancel) await input.runtimeClient.cancelSession(id).catch(() => {});
      await input.runtimeClient.closeSession(id).catch(() => {});
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([cleanup(), new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 1000);
    })]).finally(() => clearTimeout(timer));
  };
  const runtime = new Proxy(input.runtimeClient, {
    get(target, property) {
      if (property === 'createSession') return async (...args: Parameters<RuntimeClient['createSession']>) => {
        const created = await target.createSession(...args);
        sessionId = created.id;
        if (stopped) {
          await cleanupSession(created.id, true);
          throw new Error('collaboration_stopped');
        }
        return created;
      };
      if (property === 'sendMessage') return async (...args: Parameters<RuntimeClient['sendMessage']>) => {
        if (stopped) throw new Error('collaboration_stopped');
        requestsStarted += 1;
        const response = await target.sendMessage(...args);
        // Even malformed JSON, rejected decisions and native activity consume
        // usage. Capture before parsing; ordinary first decisions keep their fallback.
        responsesReceived += 1;
        if (Number.isFinite(response.tokensUsed) && response.tokensUsed > 0) tokens += response.tokensUsed;
        else missingUsage = true;
        return response;
      };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  async function bounded<T>(operation: () => Promise<T>): Promise<T> {
    if (input.isCancelled?.()) throw new Error('cancelled');
    if (Date.now() >= deadline || (entered && tokens >= maxTokens)) throw new Error('budget_exhausted');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    try {
      return await Promise.race([operation(), new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('budget_exhausted')), Math.max(1, deadline - Date.now()));
        poll = setInterval(() => {
          if (input.isCancelled?.()) reject(new Error('cancelled'));
        }, 100);
      })]);
    } finally {
      clearTimeout(timeout);
      clearInterval(poll);
    }
  }
  function userRevision(state: ChatState): string {
    const messages = state.channels.find((channel) => channel.id === input.channelId)?.messages ?? [];
    const latest = messages.filter((message) => message.senderKind === 'user').at(-1);
    return knowledgeDigest(JSON.stringify(latest ? { id: latest.id, body: latest.body } : null));
  }
  async function currentState(): Promise<ChatState> {
    const state = input.readState ? await bounded(input.readState) : input.state;
    const snapshot = collaborationSnapshot(state, input.channelId, input.observation);
    const user = userRevision(state);
    if (!snapshot || snapshot.revision !== original!.revision || user !== baselineUserRevision) {
      throw new Error('stale_context');
    }
    return state;
  }
  function report(reason?: string) {
    pendingReport = { schemaVersion: 1, revision: original!.revision,
      status: reason ? 'stopped' : preparation?.status ?? 'inspected',
      ...(reason ? { reason } : { preparation }),
      feedbackDelivered: deliveredCount === receipts.length, receipts,
      preparationUsage: { limits: { maxDurationMs: duration, maxTokens },
        requestsStarted, responsesReceived, measuredTokens: tokens,
        complete: requestsStarted === responsesReceived && !missingUsage },
    };
  }

  try {
    // Runtime has no measured currency usage here; do not silently ignore a monetary hard limit.
    if (input.observation.budget.maxCostUsd !== undefined) throw new Error('unsupported_cost_budget');
    await currentState();
    for (let call = 0; call < 5; call += 1) {
      const state = await currentState();
      const final = Boolean(preparation) || receipts.length >= 4;
      const observation: ProviderAgentBoundedObservation = {
        ...input.observation,
        observationId: `${input.observation.observationId}:collaboration:${call}`,
        goal: input.goal.slice(0, 2000),
        availableTools: final ? [] : entered
          ? input.observation.availableTools.filter(({ manifest }) => isCollaborationTool(manifest.name))
          : input.observation.availableTools,
        budget: { maxDurationMs: Math.max(1, deadline - Date.now()), maxTokens: maxTokens - tokens, hardStop: true },
      };
      const response = await bounded(() => input.request(state, observation, runtime, sessionId, receipts));
      sessionId = response.sessionId;
      deliveredCount = receipts.length;
      const decision = response.decision;
      const selectedRead = decision.kind === 'tool_request' && isCollaborationTool(decision.toolName);
      if (!entered && !selectedRead) {
        await currentState();
        return decision;
      }
      entered ||= selectedRead;
      if (missingUsage || requestsStarted !== responsesReceived) throw new Error('usage_unavailable');
      await currentState();
      if (Date.now() >= deadline || tokens >= maxTokens || input.isCancelled?.()) {
        throw new Error(input.isCancelled?.() ? 'cancelled' : 'budget_exhausted');
      }
      if (final) {
        report(preparation ? undefined : 'operation_limit');
        return null;
      }
      if (decision.kind !== 'tool_request' || !isCollaborationTool(decision.toolName)) {
        if (entered) { report(); return null; }
        return decision;
      }
      entered = true;
      let diagnostics: RuntimeProviderDiagnosticsPayload | undefined;
      if (decision.toolName !== INSPECT_COLLABORATION_CONTEXT) {
        try {
          diagnostics = await bounded(() => input.runtimeClient.getProviderDiagnostics({
            probe: 'light', scope: 'availability',
          }));
        } catch {
          if (Date.now() >= deadline || input.isCancelled?.()) throw new Error('budget_exhausted');
          // Availability probe failure means unknown, never ready.
        }
      }
      const refreshed = await currentState();
      const snapshot = collaborationSnapshot(refreshed, input.channelId, input.observation)!;
      const result = await boundary.invoke<unknown, unknown>({
        toolName: decision.toolName, input: decision.input,
        actionId: decision.decisionId, runId: observation.runId, actorRef: observation.actor.actorRef,
        grant: { parentToolScope: observation.policy.parentToolScope ?? observation.policy.dials.toolScope,
          policyToolScope: observation.policy.dials.toolScope },
        execute: (toolInput) => executeCollaborationRead({
          toolName: decision.toolName, toolInput, snapshot, goal: input.goal, receipts, diagnostics,
        }),
      });
      const receipt = { toolName: decision.toolName, decisionId: decision.decisionId, result };
      if (JSON.stringify([...receipts, receipt]).length > 24_000) throw new Error('budget_exhausted');
      receipts.push(receipt);
      if (decision.toolName === PREPARE_COLLABORATION && result.status === 'applied') {
        preparation = result.result as CollaborationPreparation;
      }
    }
    report('operation_limit');
    return null;
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (!entered && requestsStarted === 0 && !['cancelled', 'stale_context', 'unsupported_cost_budget',
      'Native tool activity is not part of collaboration preparation.'].includes(code)) return null;
    const reason = input.isCancelled?.() ? 'cancelled'
      : ['cancelled', 'stale_context', 'unsupported_cost_budget'].includes(code) ? code
        : Date.now() >= deadline || tokens >= maxTokens || code === 'budget_exhausted' ? 'budget_exhausted'
          : missingUsage || code === 'usage_unavailable' ? 'usage_unavailable' : 'decision_or_read_failed';
    // An attempted inference failure is terminal. Without a report, dispatch
    // would fall through to another ordinary Chat inference outside this budget.
    report(reason);
    return null;
  } finally {
    stopped = true;
    if (sessionId) await cleanupSession(sessionId, deliveredCount !== receipts.length || !preparation);
    if (pendingReport && pendingReport.status !== 'stopped') {
      try { await currentState(); } catch {
        pendingReport = { ...pendingReport, status: 'stopped', reason: 'stale_context', preparation: undefined };
      }
    }
    if (pendingReport) input.report(pendingReport);
  }
}

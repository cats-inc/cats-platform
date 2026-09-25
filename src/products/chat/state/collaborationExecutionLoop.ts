import type { ChatState, ChatMessageChoiceResponse } from '../api/contracts.js';
import type { ProviderAgentBoundedObservation, ProviderAgentDecision } from '../../../platform/orchestration/providerAgentDecision.js';
import type { ProviderAgentAdapterResult } from '../../../platform/orchestration/providerAgentAdapter.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import { createSupervisedToolRegistry } from '../../../platform/supervision/toolRegistry.js';
import { createInMemoryToolEvidenceSink, createToolBoundary } from '../../../platform/supervision/toolBoundary.js';
import type { CollaborationReadReceipt, CollaborationReport } from './orchestratorCollaboration.js';
import { createChatCollaborationExecution, type ChatCollaborationExecutionOptions } from './collaborationExecution.js';
import { collaborationExecutionManifests, isCollaborationExecutionTool, REQUEST_COLLABORATION_ROLE,
  REQUEST_COLLABORATION_EXECUTION, ENSURE_COLLABORATION_CONVERSATION, ENSURE_COLLABORATION_PARTICIPANTS,
  INSPECT_COLLABORATION_WORK } from './collaborationExecutionSurface.js';
import { collaborationSummary, collaborationFeedbackSummary, readCollaborationIntent, writeCollaborationAudit,
  type CollaborationExecutionSummary } from '../../work/state/collaborationRecords.js';
import { boundedCollaboration, recordCollaborationUsage, stopCollaboration, settleCleanup,
  markSessionClosed, executeCollaborationRole, type CollaborationExecutionPort } from '../../work/state/collaborationExecution.js';

function feedbackProjection(receipts: CollaborationReadReceipt[]): CollaborationReadReceipt[] {
  return receipts.map((receipt) => receipt.result.status !== 'applied' ? structuredClone(receipt)
    : { ...receipt, result: { ...receipt.result,
      // Only the fixed execution delegates produce applied receipts in this loop.
      result: collaborationFeedbackSummary(receipt.result.result as CollaborationExecutionSummary) } });
}

export async function runCollaborationExecutionLoop(input: ChatCollaborationExecutionOptions & {
  observation: ProviderAgentBoundedObservation;
  report: (report: CollaborationReport) => void;
  request: (state: ChatState, observation: ProviderAgentBoundedObservation, runtime: RuntimeClient,
    sessionId: string | null, receipts: CollaborationReadReceipt[]) => Promise<ProviderAgentAdapterResult>;
}): Promise<ProviderAgentDecision | null> {
  let port: CollaborationExecutionPort | undefined;
  let sessionId: string | null = null;
  let stopped = false;
  let deliveredCount = 0;
  let reason: string | undefined;
  let usageFailure: unknown;
  const cleanup = async (id: string) => settleCleanup(async () => {
    await input.runtimeClient.cancelSession(id);
    await input.runtimeClient.closeSession(id);
  });
  const runtime = new Proxy(input.runtimeClient, { get(target, property) {
    if (property === 'createSession') return async (...args: Parameters<RuntimeClient['createSession']>) => {
      const created = await target.createSession(...args);
      sessionId = created.id;
      // A late response is recovery evidence even after the operation is fenced.
      await input.chatStore.updateCore((core) => {
        const intent = readCollaborationIntent(core, port!.intentId);
        return intent ? writeCollaborationAudit(core, { ...intent,
          coordinatorSessionId: created.id, coordinatorClosed: false }) : core;
      });
      if (stopped) {
        if (await cleanup(created.id)) await markSessionClosed(input.chatStore, port!.intentId, 'coordinator');
        throw new Error('collaboration_stopped');
      }
      await port!.current();
      return created;
    };
    if (property === 'sendMessage') return async (...args: Parameters<RuntimeClient['sendMessage']>) => {
      const response = await target.sendMessage(...args);
      // Rejected JSON/native activity still consumed provider tokens. Persist
      // measured usage before decision parsing and policy validation can throw.
      try { await recordCollaborationUsage(port!, response.tokensUsed); }
      catch (error) { usageFailure = error; throw error; }
      return response;
    };
    const value = Reflect.get(target, property);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  try {
    if (input.observation.actor.actorRef !== 'orchestrator'
      || !['narrow_write', 'broad_write'].includes(input.observation.policy.dials.toolScope)
      || input.observation.policy.dials.autonomy === 'none') throw new Error('scope_denied');
    if (input.observation.budget.maxCostUsd !== undefined) throw new Error('unsupported_cost_budget');
    const execution = await createChatCollaborationExecution(input);
    port = execution.port;
    if (!execution.created) return null;
    const registry = createSupervisedToolRegistry();
    collaborationExecutionManifests().forEach((manifest) => registry.register(manifest));
    const boundary = createToolBoundary({ registry, evidenceSink: createInMemoryToolEvidenceSink() });
    const persistReceipt = async (receipt: CollaborationReadReceipt) => input.chatStore.updateCore((core) => {
      const latest = readCollaborationIntent(core, port!.intentId)!;
      const receipts = [...latest.receipts, receipt];
      if (receipts.length > 8) throw new Error('feedback_limit');
      return writeCollaborationAudit(core, { ...latest, receipts });
    });
    const invoke = async (toolName: string, value: unknown, decisionId: string, actorRef: string) => {
      const intent = await port!.current();
      if (intent.receipts.length >= 8 || JSON.stringify(feedbackProjection(intent.receipts)).length > 24_000) throw new Error('feedback_limit');
      const receipt = { toolName, decisionId,
        result: await boundary.invoke<unknown, unknown>({ toolName, input: value,
          actionId: decisionId, runId: intent.id, actorRef,
          grant: toolName === INSPECT_COLLABORATION_WORK
            ? { parentToolScope: 'read_only', policyToolScope: 'read_only' }
            : { parentToolScope: input.observation.policy.parentToolScope ?? input.observation.policy.dials.toolScope,
              policyToolScope: input.observation.policy.dials.toolScope },
          execute: (request) => execution.execute(toolName, request) }) };
      await persistReceipt(receipt);
      // An unusually large identity/reason must stop further work, never erase
      // an outcome whose effect already happened. The adapter also bounds delivery.
      if (JSON.stringify(feedbackProjection((await port!.current()).receipts)).length > 24_000) throw new Error('feedback_limit');
      if (receipt.result.status !== 'applied') {
        await stopCollaboration(input.chatStore, input.runtimeClient, intent.id, 'operation_rejected');
      }
      return receipt;
    };
    const drainRole = async (role: 'implementation' | 'review', decisionId: string) => {
      await executeCollaborationRole(port!, role);
      await invoke(INSPECT_COLLABORATION_WORK, {}, `${decisionId}:host-result`, 'host-work-runner');
    };
    const drainExecution = async (decisionId: string) => {
      if (!(await port!.current()).executionRequested) throw new Error('execution_request_required');
      for (const name of [ENSURE_COLLABORATION_CONVERSATION, ENSURE_COLLABORATION_PARTICIPANTS]) {
        const current = await port!.current();
        if (!['admitted', 'running'].includes(current.status)) return;
        if (name === ENSURE_COLLABORATION_CONVERSATION ? current.conversationId : current.membershipVerified) continue;
        if ((await invoke(name, {}, `${decisionId}:${name}`, 'host-collaboration')).result.status !== 'applied') return;
      }
      for (const role of ['implementation', 'review'] as const) {
        const current = await port!.current();
        if (!['admitted', 'running'].includes(current.status)) return;
        if (['result_ready', 'reviewed'].includes(current.stages[role].status)) continue;
        // Reserve both queue and inspection receipts before any expensive work.
        if (current.receipts.length > 6) throw new Error('feedback_limit');
        if (current.stages[role].status === 'pending'
          && (await invoke(REQUEST_COLLABORATION_ROLE, { role }, `${decisionId}:${role}`, 'host-collaboration')).result.status !== 'applied') return;
        if ((await port!.current()).stages[role].status !== 'queued') throw new Error('role_in_progress');
        await drainRole(role, `${decisionId}:${role}`);
      }
    };
    for (let call = 0; call < 9; call += 1) {
      const intent = await port.current();
      const final = !['admitted', 'running'].includes(intent.status) || intent.receipts.length >= 7;
      const observation: ProviderAgentBoundedObservation = { ...input.observation,
        observationId: `${input.observation.observationId}:execution:${call}`, goal: intent.goal,
        availableTools: final ? [] : input.observation.availableTools.filter(({ manifest }) => isCollaborationExecutionTool(manifest.name)),
        budget: { maxDurationMs: Math.max(1, Date.parse(intent.deadline) - Date.now()),
          maxTokens: Math.max(1, intent.budget.maxTokens - intent.tokensUsed), hardStop: true },
      };
      const state = await input.chatStore.read();
      const result = await boundedCollaboration(port, () => input.request(state, observation, runtime, sessionId, feedbackProjection(intent.receipts)));
      sessionId = result.sessionId;
      deliveredCount = intent.receipts.length;
      const decision = result.decision;
      if (final) {
        if (['admitted', 'running'].includes(intent.status)) reason = 'operation_limit';
        break;
      }
      if (decision.kind !== 'tool_request' || !isCollaborationExecutionTool(decision.toolName)) {
        reason = 'coordinator_stopped'; break;
      }
      // Acceptance is durable before the host considers any expensive operation.
      const receipt = await invoke(decision.toolName, decision.input, decision.decisionId, 'orchestrator');
      if (receipt.result.status === 'applied' && decision.toolName === REQUEST_COLLABORATION_EXECUTION) {
        await drainExecution(decision.decisionId);
      }
      if (receipt.result.status === 'applied' && decision.toolName === REQUEST_COLLABORATION_ROLE) {
        const role = (decision.input as { role: 'implementation' | 'review' }).role;
        // Work derives authority from the persisted owner choice, never from this tool result.
        await drainRole(role, decision.decisionId);
      }
    }
  } catch (error) {
    // The Runtime boundary wraps callback failures; retain our budget reason.
    const failure = usageFailure ?? error;
    const message = failure instanceof Error ? failure.message : '';
    reason = ['cancelled', 'budget_exhausted', 'stale_context', 'usage_unavailable',
      'unsupported_cost_budget', 'owner_confirmation_required', 'repository_required',
      'approval_revoked', 'run_stopped', 'membership_changed', 'feedback_limit'].includes(message) ? message : 'collaboration_failed';
  } finally {
    stopped = true;
    if (port && reason) {
      const latest = readCollaborationIntent(await input.chatStore.readCore(), port.intentId);
      if (latest && ['admitted', 'running'].includes(latest.status)) {
        await stopCollaboration(input.chatStore, input.runtimeClient, port.intentId, reason);
      } else if (latest?.reason) {
        // Failed reporting must not overwrite the retained execution failure.
        reason = latest.reason;
      }
    }
    if (sessionId && await cleanup(sessionId) && port) await markSessionClosed(input.chatStore, port.intentId, 'coordinator');
    const intent = port ? readCollaborationIntent(await input.chatStore.readCore(), port.intentId) : null;
    reason = intent?.reason ?? reason;
    input.report({ schemaVersion: 1, revision: intent?.contextRevision ?? '',
      status: intent ? 'inspected' : 'stopped', ...(reason ? { reason } : {}),
      receipts: intent?.receipts ?? [], feedbackDelivered: deliveredCount === (intent?.receipts.length ?? 0),
      ...(intent ? { execution: collaborationSummary(intent) } : {}) });
  }
  return null;
}

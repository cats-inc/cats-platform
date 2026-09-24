import type { ChatState, ChatMessageChoiceResponse } from '../api/contracts.js';
import type { ProviderAgentBoundedObservation, ProviderAgentDecision } from '../../../platform/orchestration/providerAgentDecision.js';
import type { ProviderAgentAdapterResult } from '../../../platform/orchestration/providerAgentAdapter.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import { createSupervisedToolRegistry } from '../../../platform/supervision/toolRegistry.js';
import { createInMemoryToolEvidenceSink, createToolBoundary } from '../../../platform/supervision/toolBoundary.js';
import type { CollaborationReadReceipt, CollaborationReport } from './orchestratorCollaboration.js';
import { createChatCollaborationExecution, type ChatCollaborationExecutionOptions } from './collaborationExecution.js';
import { collaborationExecutionManifests, isCollaborationExecutionTool, REQUEST_COLLABORATION_ROLE,
  INSPECT_COLLABORATION_WORK } from './collaborationExecutionSurface.js';
import { collaborationSummary, readCollaborationIntent, writeCollaborationAudit } from '../../work/state/collaborationRecords.js';
import { boundedCollaboration, recordCollaborationUsage, stopCollaboration, settleCleanup,
  markSessionClosed, executeCollaborationRole, type CollaborationExecutionPort } from '../../work/state/collaborationExecution.js';

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
      if (receipts.length > 8 || JSON.stringify(receipts.slice(-4)).length > 24_000) throw new Error('feedback_limit');
      return writeCollaborationAudit(core, { ...latest, receipts });
    });
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
      const result = await boundedCollaboration(port, () => input.request(state, observation, runtime, sessionId, intent.receipts.slice(-4)));
      sessionId = result.sessionId;
      deliveredCount = intent.receipts.length;
      await recordCollaborationUsage(port, result.runtimeMessage.tokensUsed);
      const decision = result.decision;
      if (final) {
        if (['admitted', 'running'].includes(intent.status)) reason = 'operation_limit';
        break;
      }
      if (decision.kind !== 'tool_request' || !isCollaborationExecutionTool(decision.toolName)) {
        reason = 'coordinator_stopped'; break;
      }
      const receipt = { toolName: decision.toolName, decisionId: decision.decisionId,
        result: await boundary.invoke<unknown, unknown>({ toolName: decision.toolName,
          input: decision.input, actionId: decision.decisionId, runId: intent.id, actorRef: 'orchestrator',
          grant: { parentToolScope: observation.policy.parentToolScope ?? observation.policy.dials.toolScope,
            policyToolScope: observation.policy.dials.toolScope },
          execute: (value) => execution.execute(decision.toolName, value) }) };
      // Acceptance is durable before the host considers any expensive operation.
      await persistReceipt(receipt);
      if (receipt.result.status === 'applied' && decision.toolName === REQUEST_COLLABORATION_ROLE) {
        const role = (decision.input as { role: 'implementation' | 'review' }).role;
        // Work derives authority from the persisted owner choice, never from this tool result.
        await executeCollaborationRole(port, role);
        const inspection = await boundary.invoke<unknown, unknown>({ toolName: INSPECT_COLLABORATION_WORK,
          input: {}, actionId: `${decision.decisionId}:host-result`, runId: intent.id, actorRef: 'host-work-runner',
          grant: { parentToolScope: 'read_only', policyToolScope: 'read_only' },
          execute: () => execution.execute(INSPECT_COLLABORATION_WORK, {}) });
        await persistReceipt({ toolName: INSPECT_COLLABORATION_WORK,
          decisionId: `${decision.decisionId}:host-result`, result: inspection });
      }
      if (receipt.result.status !== 'applied') {
        await stopCollaboration(input.chatStore, input.runtimeClient, intent.id, 'operation_rejected');
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    reason = ['cancelled', 'budget_exhausted', 'stale_context', 'usage_unavailable',
      'unsupported_cost_budget', 'owner_confirmation_required', 'repository_required',
      'approval_revoked', 'run_stopped', 'membership_changed'].includes(message) ? message : 'collaboration_failed';
  } finally {
    stopped = true;
    if (port && reason) await stopCollaboration(input.chatStore, input.runtimeClient, port.intentId, reason);
    if (sessionId && await cleanup(sessionId) && port) await markSessionClosed(input.chatStore, port.intentId, 'coordinator');
    const intent = port ? readCollaborationIntent(await input.chatStore.readCore(), port.intentId) : null;
    input.report({ schemaVersion: 1, revision: intent?.contextRevision ?? '',
      status: intent ? 'inspected' : 'stopped', ...(reason ? { reason } : {}),
      receipts: intent?.receipts ?? [], feedbackDelivered: deliveredCount === (intent?.receipts.length ?? 0),
      ...(intent ? { execution: collaborationSummary(intent) } : {}) });
  }
  return null;
}

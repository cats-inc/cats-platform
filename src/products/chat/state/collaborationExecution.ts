import type { ChatState, ChatMessageChoiceResponse } from '../api/contracts.js';
import type { CatsCoreState } from '../../../core/types.js';
import { createCatActorId } from '../../../core/actors.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import type { RuntimeDeliveryClient } from '../../../platform/runtime/deliveryClient.js';
import type { ToolResult } from '../../../platform/supervision/contracts.js';
import type { ChatStore } from './store.js';
import { createChannel, assignCatToChannel, requireChannel } from './model/index.js';
import { syncCoreStateWithChatState } from './core-projection/index.js';
import { resolveChannelCanonicalIdentity } from '../shared/channelCanonicalIdentity.js';
import { resolveChannelParticipantAssignments } from '../shared/channelParticipants.js';
import { isCatPartOfChatProduct } from '../shared/directMessageSelectors.js';
import { knowledgeDigest } from '../../../platform/knowledge/productKnowledge.js';
import { collaborationExecutionRevision, resolveCollaborationOwnerChoice,
  ENSURE_COLLABORATION_CONVERSATION, ENSURE_COLLABORATION_PARTICIPANTS,
  REQUEST_COLLABORATION_ROLE, REQUEST_COLLABORATION_EXECUTION, INSPECT_COLLABORATION_WORK, STOP_COLLABORATION_WORK } from './collaborationExecutionSurface.js';
import { admitCollaboration, collaborationIntentId, collaborationDigest, readCollaborationIntent,
  writeCollaborationIntent, collaborationSummary, updateCollaborationChild,
  type CollaborationWorker, type WorkCollaborationIntent } from '../../work/state/collaborationRecords.js';
import { requestCollaborationRole, requestCollaborationExecution, stopCollaboration, assertCollaborationBudget,
  type CollaborationExecutionPort } from '../../work/state/collaborationExecution.js';

export interface ChatCollaborationExecutionOptions {
  chatStore: ChatStore;
  runtimeClient: RuntimeClient;
  deliveryClient: RuntimeDeliveryClient;
  channelId: string;
  choiceResponse?: ChatMessageChoiceResponse | null;
  isCancelled?: () => boolean;
  publish?: (channelId: string, action: 'created' | 'updated') => void;
  runChatMutation?: <T>(channelId: string, operation: () => Promise<T>) => Promise<T>;
}

function latestUser(state: ChatState, channelId: string) {
  return requireChannel(state, channelId).messages.filter((message) => message.senderKind === 'user').at(-1);
}

function assertContext(chat: ChatState, core: CatsCoreState, intent: WorkCollaborationIntent): void {
  const original = requireChannel(chat, intent.sourceChannelId).messages.find((entry) => entry.id === intent.originalMessageId);
  const confirmation = latestUser(chat, intent.sourceChannelId);
  const choice = resolveCollaborationOwnerChoice(chat, intent.sourceChannelId, confirmation?.choiceResponse);
  const confirmations = requireChannel(chat, intent.sourceChannelId).messages;
  const anchorIndex = confirmations.findIndex((entry) => entry.id === intent.confirmationMessageId);
  const equivalentConfirmations = anchorIndex >= 0 && confirmations.slice(anchorIndex)
    .filter((entry) => entry.senderKind === 'user').every((entry) => {
      const repeated = resolveCollaborationOwnerChoice(chat, intent.sourceChannelId, entry.choiceResponse);
      return repeated?.proposalMessageId === intent.proposalMessageId
        && collaborationDigest(repeated.proposal) === intent.proposalDigest;
    });
  if (core.ownerProfile.actorId !== intent.ownerActorId || !equivalentConfirmations
    || !choice || collaborationDigest(choice.proposal) !== intent.proposalDigest
    || !original || knowledgeDigest(original.body) !== intent.originalGoalDigest
    || intent.goal !== original.body || intent.expectedOutput !== choice.proposal.expectedOutput
    || intent.workers.implementation.catId !== choice.proposal.implementer.id
    || intent.workers.review.catId !== choice.proposal.reviewer.id
    || intent.budget.maxTokens !== choice.proposal.budget.maxTokens
    || intent.budget.maxDurationMs !== choice.proposal.budget.maxDurationMs
    || intent.conversationIntent !== choice.proposal.conversation.intent
    || collaborationExecutionRevision(chat, intent.sourceChannelId) !== intent.contextRevision) throw new Error('stale_context');
  const parent = core.tasks.find((entry) => entry.id === intent.id);
  const active = ['admitted', 'running'].includes(intent.status);
  if (active && parent?.status === 'cancelled') throw new Error('cancelled');
  if (active && !['approved', 'in_progress'].includes(parent?.status ?? '')) throw new Error('task_stopped');
  if (parent?.approval.status !== 'approved') throw new Error('approval_revoked');
  for (const role of ['implementation', 'review'] as const) {
    const stage = intent.stages[role];
    const task = core.tasks.find((entry) => entry.id === stage.taskId);
    const run = core.runs.find((entry) => entry.id === stage.runId);
    if (active && (task?.status === 'cancelled'
      || (stage.status === 'running' && run?.status !== 'running')
      || (['queued', 'starting'].includes(stage.status) && run?.status !== 'queued'))) throw new Error('run_stopped');
    const waitingReview = role === 'review' && !intent.implementationEvidence;
    if (task?.approval.status !== (waitingReview ? 'pending' : 'approved')) throw new Error('approval_revoked');
    if (task.parentTaskId !== intent.id || task.assignedActorIds.length !== 1
      || task.assignedActorIds[0] !== intent.workers[role].actorId) throw new Error('assignment_changed');
    const expectedStatus = stage.status === 'pending' ? (waitingReview ? 'pending_approval' : 'approved')
      : ['queued', 'starting', 'running'].includes(stage.status) ? 'in_progress'
        : ['result_ready', 'reviewed'].includes(stage.status) ? 'completed' : stage.status;
    if (active && task.status !== expectedStatus) throw new Error('task_stopped');
  }
  if (intent.channelId) {
    const target = requireChannel(chat, intent.channelId);
    if (target.originSurface !== 'chat' || target.channelKind === 'direct_message'
      || target.status === 'archived' || target.repoPath !== intent.workspacePath
      || resolveChannelCanonicalIdentity(chat, target.id).conversationId !== intent.conversationId) throw new Error('stale_context');
    if (intent.conversationIntent === 'create' && (target.runtimeWorkspaceKind !== 'worktree'
      || target.runtimeWorkspaceAccess !== 'read_write' || target.runtimePermissionMode !== 'whitelist')) throw new Error('stale_context');
    if (intent.membershipVerified) {
      for (const worker of Object.values(intent.workers)) {
        const member = resolveChannelParticipantAssignments(target).find((entry) => entry.sourceKind === 'cat'
          && entry.sourceRefId === worker.catId && entry.status === 'active');
        if (!member || collaborationDigest([member.execution.target, member.execution.modelSelection ?? null])
          !== collaborationDigest([worker.target, worker.modelSelection ?? null])
          || !core.participants.some((entry) => entry.conversationId === intent.conversationId
            && entry.agentId === worker.actorId && entry.status === 'active')) throw new Error('membership_changed');
      }
    }
  }
}

/** Owner admission and Chat mutations share the persistent Chat/Core writer. */
export async function createChatCollaborationExecution(options: ChatCollaborationExecutionOptions) {
  const store = options.chatStore;
  if (!store.updateSnapshot) throw new Error('atomic_store_required');
  let intentId = '';
  let created = false;
  await store.updateSnapshot(({ chat, core }) => {
    if (options.isCancelled?.()) throw new Error('cancelled');
    const choice = resolveCollaborationOwnerChoice(chat, options.channelId, options.choiceResponse);
    const confirmation = latestUser(chat, options.channelId);
    if (!choice || !confirmation || collaborationDigest(confirmation.choiceResponse) !== collaborationDigest(options.choiceResponse)) {
      throw new Error('owner_confirmation_required');
    }
    intentId = collaborationIntentId(options.channelId, choice.proposalMessageId);
    const existing = readCollaborationIntent(core, intentId);
    if (existing) {
      if (existing.proposalDigest !== collaborationDigest(choice.proposal)
        || existing.originalGoalDigest !== choice.originalGoalDigest) throw new Error('collaboration_input_conflict');
      return { chat, core }; // A duplicate can inspect its original attempt, never continue it.
    }
    const proposal = choice.proposal;
    const source = requireChannel(chat, options.channelId);
    if (proposal.executionRevision !== collaborationExecutionRevision(chat, options.channelId)) throw new Error('stale_context');
    if (!source.repoPath?.trim() || source.originSurface !== 'chat' || source.channelKind === 'direct_message'
      || source.status === 'archived') throw new Error('repository_required');
    if (!Number.isInteger(proposal.budget.maxDurationMs) || proposal.budget.maxDurationMs <= 0
      || proposal.budget.maxDurationMs > 3600000 || !Number.isInteger(proposal.budget.maxTokens)
      || proposal.budget.maxTokens <= 0 || proposal.budget.maxTokens > 100000) throw new Error('invalid_budget');
    const worker = (catId: string): CollaborationWorker => {
      const cat = chat.cats.find((entry) => entry.id === catId);
      if (!cat || cat.status !== 'active' || !isCatPartOfChatProduct(cat)
        || cat.id === chat.bossCatId) throw new Error('cat_unavailable');
      const assigned = resolveChannelParticipantAssignments(source).find((entry) => entry.status === 'active'
        && entry.sourceKind === 'cat' && entry.sourceRefId === catId);
      const target = assigned?.execution.target ?? cat.defaultExecutionTarget;
      if (!target.provider) throw new Error('cat_unconfigured');
      return { catId, actorId: createCatActorId(catId), name: cat.name, target: structuredClone(target),
        modelSelection: structuredClone(assigned?.execution.modelSelection ?? cat.defaultModelSelection ?? null) };
    };
    const admitted = admitCollaboration(core, {
      sourceChannelId: source.id, sourceConversationId: resolveChannelCanonicalIdentity(chat, source.id).conversationId,
      proposalMessageId: choice.proposalMessageId, originalMessageId: choice.originalMessageId,
      originalGoalDigest: choice.originalGoalDigest, confirmationMessageId: confirmation.id,
      proposalDigest: collaborationDigest(proposal), ownerActorId: core.ownerProfile.actorId,
      goal: proposal.goal, expectedOutput: proposal.expectedOutput, conversationIntent: proposal.conversation.intent,
      contextRevision: proposal.executionRevision!, workspacePath: source.repoPath,
      budget: { maxDurationMs: proposal.budget.maxDurationMs, maxTokens: proposal.budget.maxTokens },
      workers: { implementation: worker(proposal.implementer.id), review: worker(proposal.reviewer.id) },
    });
    created = admitted.created;
    return { chat, core: admitted.core };
  });
  const port: CollaborationExecutionPort = {
    coreStore: store, runtimeClient: options.runtimeClient, deliveryClient: options.deliveryClient,
    intentId, isCancelled: options.isCancelled,
    current: async () => {
      // One snapshot lock: do not combine independently read Chat and Core versions.
      let result!: WorkCollaborationIntent;
      await store.updateSnapshot!(({ chat, core }) => {
        result = readCollaborationIntent(core, intentId)!;
        assertContext(chat, core, result);
        return { chat, core };
      });
      return result;
    },
    mutate: async (mutator) => {
      await store.updateSnapshot!(({ chat, core }) => {
        const intent = readCollaborationIntent(core, intentId)!;
        assertContext(chat, core, intent);
        if (options.isCancelled?.()) throw new Error('cancelled');
        return { chat, core: mutator(core, intent) };
      });
    },
  };
  async function ensureChat(participants: boolean): Promise<void> {
    let changed: { id: string; action: 'created' | 'updated' } | undefined;
    const mutate = () => store.updateSnapshot!(({ chat, core }) => {
      const intent = readCollaborationIntent(core, intentId)!;
      assertContext(chat, core, intent);
      if (!['admitted', 'running'].includes(intent.status)) throw new Error('collaboration_stopped');
      if (options.isCancelled?.()) throw new Error('cancelled');
      assertCollaborationBudget(intent);
      let next = chat;
      if (!participants && !intent.channelId) {
        if (intent.conversationIntent === 'reuse_current') intent.channelId = intent.sourceChannelId;
        else {
          const source = requireChannel(chat, intent.sourceChannelId);
          next = createChannel(chat, { title: intent.goal.slice(0, 100), topic: intent.goal, originSurface: 'chat',
            repoPath: intent.workspacePath, roomMode: 'chat_channel',
            responseLanguage: source.responseLanguage, runtimeWorkspaceKind: 'worktree',
            runtimeWorkspaceAccess: 'read_write', runtimePermissionMode: 'whitelist' });
          intent.channelId = next.selectedChannelId!;
          next.selectedChannelId = chat.selectedChannelId;
          changed = { id: intent.channelId, action: 'created' };
        }
        intent.conversationId = resolveChannelCanonicalIdentity(next, intent.channelId).conversationId;
      }
      if (participants) {
        if (!intent.channelId) throw new Error('conversation_required');
        if (intent.membershipVerified) return { chat, core };
        const target = requireChannel(next, intent.channelId);
        const active = resolveChannelParticipantAssignments(target).filter((entry) => entry.status === 'active');
        const missing = Object.values(intent.workers).filter((worker) => !active.some((entry) =>
          entry.sourceKind === 'cat' && entry.sourceRefId === worker.catId));
        if (active.length + missing.length > chat.capabilities.maxChatParticipants) throw new Error('participant_limit');
        for (const worker of Object.values(intent.workers)) next = assignCatToChannel(next, intent.channelId, {
          catId: worker.catId, provider: worker.target.provider!, instance: worker.target.instance ?? undefined,
          model: worker.target.model ?? undefined, modelSelection: worker.modelSelection,
        });
        intent.membershipVerified = true;
        changed = { id: intent.channelId, action: 'updated' };
      }
      intent.contextRevision = collaborationExecutionRevision(next, intent.sourceChannelId);
      let projected = syncCoreStateWithChatState(next, core);
      for (const role of ['implementation', 'review'] as const) {
        const task = projected.tasks.find((entry) => entry.id === intent.stages[role].taskId)!;
        projected = updateCollaborationChild(projected, intent, role, task.status);
      }
      projected = writeCollaborationIntent(projected, intent);
      assertContext(next, projected, intent);
      return { chat: next, core: projected };
    });
    if (options.runChatMutation) {
      const intent = readCollaborationIntent(await store.readCore(), intentId)!;
      await options.runChatMutation(intent.sourceChannelId, () => intent.channelId && intent.channelId !== intent.sourceChannelId
        ? options.runChatMutation!(intent.channelId, mutate) : mutate());
    } else await mutate();
    if (changed) options.publish?.(changed.id, changed.action);
  }
  async function execute(toolName: string, value: unknown): Promise<ToolResult<unknown>> {
    const object = value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : null;
    if (!object || Object.keys(object).some((key) => key !== 'role' || toolName !== REQUEST_COLLABORATION_ROLE)
      || (toolName === REQUEST_COLLABORATION_ROLE && !['implementation', 'review'].includes(String(object.role)))) {
      return { status: 'rejected', error: { code: 'E_SCHEMA_INVALID', message: 'Use only the server-bound operation input.' } };
    }
    if (toolName === REQUEST_COLLABORATION_EXECUTION) await requestCollaborationExecution(port);
    else if (toolName === ENSURE_COLLABORATION_CONVERSATION) await ensureChat(false);
    else if (toolName === ENSURE_COLLABORATION_PARTICIPANTS) await ensureChat(true);
    else if (toolName === REQUEST_COLLABORATION_ROLE) await requestCollaborationRole(port, object.role as 'implementation' | 'review');
    else if (toolName === STOP_COLLABORATION_WORK) await stopCollaboration(store, options.runtimeClient, intentId, 'cancelled');
    else if (toolName !== INSPECT_COLLABORATION_WORK) return { status: 'rejected', error: {
      code: 'E_TOOL_SCOPE_DENIED', message: 'Unknown collaboration operation.' } };
    const intent = readCollaborationIntent(await store.readCore(), intentId)!;
    return { status: 'applied', result: { ...collaborationSummary(intent),
      ...(toolName === REQUEST_COLLABORATION_EXECUTION ? { request: { status: 'accepted', runtimeStarted: false } } : {}) } };
  }
  return { port, created, execute };
}

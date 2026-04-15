import type { ChatState } from '../../api/contracts.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import type { RoutingTarget } from '../mentionRouter.js';
import { createExplicitProviderModelSelection } from '../../../../shared/providerSelection.js';
import { mergeRuntimeInvocationContextMetadata } from '../runtime-dispatch/context.js';
import {
  buildChannelView,
  requireChannel,
  setChannelChatCwd,
  setChannelOrchestratorLease,
  setChannelParticipantExecutionTarget,
  setChannelPendingExecutionTarget,
  setGlobalOrchestratorExecutionTarget,
} from '../model/index.js';
import { findAssignedParticipant } from '../../shared/channelParticipants.js';
import {
  ensureChannelAttachmentWorkspace,
  syncChannelAttachmentsToWorkspace,
} from '../workspace.js';
import {
  resolveOrchestratorExecutionTarget,
  resolveRuntimeEnvelopeForTarget,
} from '../runtimeTargeting.js';
import {
  appendFailedRuntimeSessionMessage,
  appendStartedRuntimeSessionMessage,
  type RuntimeEnvelopeCanonicalMetadata,
} from './shared.js';
import {
  setErroredSession,
  setStartedSession,
} from './state.js';
import type { ChannelTaskExecutionContext } from './taskExecution.js';

export interface RuntimeSessionExecutionTarget {
  provider: string;
  instance: string | null;
  model: string | null;
  modelSelection: Awaited<ReturnType<RuntimeClient['createSession']>>['modelSelection'] | null;
}

export interface CreatedTargetRuntimeSession {
  session: Awaited<ReturnType<RuntimeClient['createSession']>>;
  executionTarget: RuntimeSessionExecutionTarget;
}

export interface TargetSessionLifecycleMetadata extends RuntimeEnvelopeCanonicalMetadata {
  targetStateId: string | null;
  laneId: string | null;
  now: Date;
}

export async function syncTargetSessionAttachmentWorkspace(input: {
  channelId: string;
  state: ChatState;
  runtimeDataDir: string | undefined;
  targetWorkspacePath: string | null;
}): Promise<void> {
  if (!input.targetWorkspacePath) {
    return;
  }

  const attachmentWorkspacePath = await ensureChannelAttachmentWorkspace({
    channelId: input.channelId,
    repoPath: requireChannel(input.state, input.channelId).repoPath,
    chatCwd: requireChannel(input.state, input.channelId).chatCwd,
    runtimeDataDir: input.runtimeDataDir,
  });
  await syncChannelAttachmentsToWorkspace({
    attachmentWorkspacePath,
    targetWorkspacePath: input.targetWorkspacePath,
  });
}

export async function createOrchestratorTargetRuntimeSession(input: {
  state: ChatState;
  channelId: string;
  spawnCwd: string | null;
  workspaceKind: 'source' | 'sandbox';
  runtimeClient: RuntimeClient;
  dispatchContextMetadata?: Record<string, unknown>;
  taskExecutionContext: ChannelTaskExecutionContext | undefined;
  runtimeEnvelope: Awaited<ReturnType<typeof resolveRuntimeEnvelopeForTarget>>;
}): Promise<CreatedTargetRuntimeSession> {
  const sessionTarget = resolveOrchestratorExecutionTarget(
    input.state,
    requireChannel(input.state, input.channelId),
  );
  const session = await input.runtimeClient.createSession({
    provider: sessionTarget.provider,
    instance: sessionTarget.instance,
    model: sessionTarget.model,
    modelSelection:
      sessionTarget.modelSelection
      ?? createExplicitProviderModelSelection(sessionTarget.model),
    cwd: input.spawnCwd,
    workspaceKind: input.workspaceKind,
    workspaceAccess: 'read_write',
    context: mergeRuntimeInvocationContextMetadata(
      input.runtimeEnvelope.context,
      input.dispatchContextMetadata ?? {},
    ),
    skills: input.runtimeEnvelope.skills,
    ...(input.taskExecutionContext?.executionRequest ?? {}),
  });

  return {
    session,
    executionTarget: {
      provider: session.provider,
      instance: sessionTarget.instance ?? null,
      model: session.model ?? sessionTarget.model,
      modelSelection:
        session.modelSelection
        ?? sessionTarget.modelSelection
        ?? null,
    },
  };
}

export async function createParticipantTargetRuntimeSession(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  spawnCwd: string | null;
  workspaceKind: 'source' | 'sandbox';
  runtimeClient: RuntimeClient;
  dispatchContextMetadata?: Record<string, unknown>;
  taskExecutionContext: ChannelTaskExecutionContext | undefined;
  runtimeEnvelope: Awaited<ReturnType<typeof resolveRuntimeEnvelopeForTarget>>;
}): Promise<CreatedTargetRuntimeSession> {
  const participant = findAssignedParticipant(
    buildChannelView(input.state, input.channelId),
    input.target.participantId,
  );
  if (!participant) {
    throw new Error('Target participant is no longer assigned to the selected chat.');
  }

  const session = await input.runtimeClient.createSession({
    provider: participant.execution.target.provider,
    instance: participant.execution.target.instance,
    model: participant.execution.target.model,
    modelSelection:
      participant.execution.modelSelection
      ?? createExplicitProviderModelSelection(participant.execution.target.model),
    cwd: input.spawnCwd,
    workspaceKind: input.workspaceKind,
    workspaceAccess: 'read_write',
    context: mergeRuntimeInvocationContextMetadata(
      input.runtimeEnvelope.context,
      input.dispatchContextMetadata ?? {},
    ),
    skills: input.runtimeEnvelope.skills,
    ...(input.taskExecutionContext?.executionRequest ?? {}),
  });

  return {
    session,
    executionTarget: {
      provider: session.provider,
      instance: participant.execution.target.instance ?? null,
      model: session.model ?? participant.execution.target.model,
      modelSelection:
        session.modelSelection
        ?? participant.execution.modelSelection
        ?? null,
    },
  };
}

export function persistCreatedTargetExecutionTarget(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  executionTarget: RuntimeSessionExecutionTarget;
  now: Date;
}): ChatState {
  if (input.target.participantKind === 'orchestrator') {
    const runtimeChannel = requireChannel(input.state, input.channelId);
    return runtimeChannel.composerMode === 'solo' && runtimeChannel.pendingProvider
      ? setChannelPendingExecutionTarget(
        input.state,
        input.channelId,
        input.executionTarget,
        input.now,
      )
      : setGlobalOrchestratorExecutionTarget(
        input.state,
        input.executionTarget,
        input.now,
      );
  }

  return setChannelParticipantExecutionTarget(
    input.state,
    input.channelId,
    input.target.participantId,
    input.executionTarget,
    input.now,
  );
}

export function persistStartedTargetSession(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  session: Awaited<ReturnType<RuntimeClient['createSession']>>;
  targetLabelProvider: string | null;
  targetLabelInstance: string | null;
  spawnCwd: string | null;
  metadata: TargetSessionLifecycleMetadata;
}): ChatState {
  let nextState = setStartedSession(
    input.state,
    input.channelId,
    input.target.participantKind === 'cat'
      ? { participantId: input.target.participantId }
      : 'orchestrator',
    input.session,
    input.metadata.now,
    input.metadata.laneId,
  );
  if (!input.spawnCwd && input.session.cwd) {
    nextState = setChannelChatCwd(
      nextState,
      input.channelId,
      input.session.cwd,
      input.metadata.now,
    );
  }

  return appendStartedRuntimeSessionMessage(
    nextState,
    input.channelId,
    {
      target: input.target,
      provider: input.targetLabelProvider,
      instance: input.targetLabelInstance,
      session: input.session,
      now: input.metadata.now,
      targetStateId: input.metadata.targetStateId,
      laneId: input.metadata.laneId,
      conversationId: input.metadata.conversationId,
      containerId: input.metadata.containerId,
      transportBindingId: input.metadata.transportBindingId,
      incrementUnread: false,
    },
  );
}

export function persistFailedTargetSessionStart(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  error: string;
  targetLabelProvider: string | null;
  targetLabelInstance: string | null;
  metadata: TargetSessionLifecycleMetadata;
}): ChatState {
  const erroredState = input.target.participantKind === 'cat'
    ? setErroredSession(
      input.state,
      input.channelId,
      { participantId: input.target.participantId },
      input.error,
      input.metadata.now,
    )
    : setErroredSession(
      input.state,
      input.channelId,
      'orchestrator',
      input.error,
      input.metadata.now,
    );

  return appendFailedRuntimeSessionMessage(
    erroredState,
    input.channelId,
    {
      target: input.target,
      provider: input.targetLabelProvider,
      instance: input.targetLabelInstance,
      error: input.error,
      now: input.metadata.now,
      targetStateId: input.metadata.targetStateId,
      laneId: input.metadata.laneId,
      conversationId: input.metadata.conversationId,
      containerId: input.metadata.containerId,
      transportBindingId: input.metadata.transportBindingId,
    },
  );
}

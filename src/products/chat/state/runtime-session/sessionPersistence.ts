import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import type {
  ChatState,
} from '../../api/contracts.js';
import type { RoutingTarget } from '../mentionRouter.js';
import {
  requireChannel,
  setChannelChatCwd,
  setChannelParticipantExecutionTarget,
  setChannelPendingExecutionTarget,
  setGlobalOrchestratorExecutionTarget,
} from '../model/index.js';
import {
  ensureChannelAttachmentWorkspace,
  syncChannelAttachmentsToWorkspace,
} from '../workspace.js';
import {
  appendFailedRuntimeSessionMessage,
  appendStartedRuntimeSessionMessage,
} from './shared.js';
import {
  setErroredSession,
  setStartedSession,
} from './state.js';
import type {
  RuntimeSessionExecutionTarget,
  TargetSessionLifecycleMetadata,
} from './sessionStart.js';

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

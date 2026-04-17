import type { ChatState } from '../../api/contracts.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import type { RoutingTarget } from '../mentionRouter.js';
import { createExplicitProviderModelSelection } from '../../../../shared/providerSelection.js';
import { mergeRuntimeInvocationContextMetadata } from '../runtime-dispatch/context.js';
import {
  buildChannelView,
  requireChannel,
} from '../model/index.js';
import { findAssignedParticipant } from '../../shared/channelParticipants.js';
import {
  resolveOrchestratorExecutionTarget,
  resolveRuntimeEnvelopeForTarget,
} from '../runtimeTargeting.js';
import type { RuntimeEnvelopeCanonicalMetadata } from './shared.js';
import type { ChannelTaskExecutionContext } from './taskExecution.js';
import type { ResolvedChannelRuntimeSessionPolicy } from './policy.js';

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

export async function createOrchestratorTargetRuntimeSession(input: {
  state: ChatState;
  channelId: string;
  sessionPolicy: ResolvedChannelRuntimeSessionPolicy;
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
    cwd: input.sessionPolicy.spawnCwd,
    workspaceKind: input.sessionPolicy.workspaceKind,
    workspaceAccess: input.sessionPolicy.workspaceAccess,
    permissionMode: input.sessionPolicy.permissionMode,
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
  sessionPolicy: ResolvedChannelRuntimeSessionPolicy;
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
    cwd: input.sessionPolicy.spawnCwd,
    workspaceKind: input.sessionPolicy.workspaceKind,
    workspaceAccess: input.sessionPolicy.workspaceAccess,
    permissionMode: input.sessionPolicy.permissionMode,
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

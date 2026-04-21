import type { AppShellPayload } from '../api/workspaceContracts.js';
import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import type { RuntimeSessionPolicy } from '../../../shared/runtimeSessionPolicy.js';
import type { CreateParallelChatGroupInput } from './api/chat.js';
import {
  createParallelChatGroup,
  encodeAttachmentFiles,
  sendParallelChatMessage,
} from './api/index.js';
import type { WorkspaceExecutionTargetValue } from './hooks/useWorkspaceComposerSubmit.js';
import {
  resolveDraftAudienceParticipantIds,
  type DraftTemporaryParticipant,
} from './draftChatUtils.js';
import { createDraftChannelTitle } from './workspaceChatUtils.js';
import type { DraftParallelBranchState } from './draftParallelBranches.js';

export interface ParallelDispatchRequestState {
  kind: 'parallel';
  channelId: string;
  groupId: string;
  channelIds: string[];
}

function isChannelDispatchRunning(
  payload: AppShellPayload,
  channelId: string,
): boolean {
  return payload.chat.channels.some((channel) =>
    channel.id === channelId && channel.routingStatus === 'running');
}

function isAnyParallelChatDispatchRunning(
  payload: AppShellPayload,
  channelIds: string[],
): boolean {
  return channelIds.some((channelId) => isChannelDispatchRunning(payload, channelId));
}

export interface SubmitNewParallelChatDraftOptions {
  body: string;
  payload: AppShellPayload;
  originSurface: PlatformSurfaceId;
  draftCwd: string | null;
  draftSessionPolicy?: RuntimeSessionPolicy | null;
  draftFiles: File[];
  draftParallelBranches: DraftParallelBranchState<WorkspaceExecutionTargetValue>[];
  draftParallelChatTargets: WorkspaceExecutionTargetValue[];
  draftParticipantCatIds?: string[];
  draftTemporaryParticipants?: DraftTemporaryParticipant[];
  buildChannelPath: (channelId: string) => string;
  signal?: AbortSignal;
}

export interface SubmitNewParallelChatDraftResult {
  createdAppShell: AppShellPayload;
  dispatchAppShell: AppShellPayload;
  rollbackPath: string;
  dispatchRequest: ParallelDispatchRequestState | null;
}

export function buildParallelChatDraftCreateInput(input: {
  body: string;
  existingCount: number;
  originSurface: PlatformSurfaceId;
  draftCwd: string | null;
  draftSessionPolicy?: RuntimeSessionPolicy | null;
  draftParallelBranches: DraftParallelBranchState<WorkspaceExecutionTargetValue>[];
  draftParallelChatTargets: WorkspaceExecutionTargetValue[];
  draftParticipantCatIds?: string[];
  draftTemporaryParticipants?: DraftTemporaryParticipant[];
}): CreateParallelChatGroupInput {
  return {
    title: createDraftChannelTitle(input.body, input.existingCount),
    originSurface: input.originSurface,
    repoPath: input.draftCwd ?? undefined,
    ...(input.draftSessionPolicy === undefined
      ? {}
      : { runtimeSessionPolicy: input.draftSessionPolicy }),
    targets: input.draftParallelChatTargets.map((target, index) => {
      const branchTarget = input.draftParallelBranches[index]?.target;
      return {
        provider: target.provider,
        instance: target.instance ?? null,
        model: target.model ?? null,
        modelSelection: target.modelSelection ?? null,
        audienceKeys: branchTarget?.audienceKeys
          ?? input.draftParallelBranches[index]?.audienceKeys
          ?? [],
        ...(branchTarget?.cwd === undefined ? {} : { cwd: branchTarget.cwd }),
        ...(branchTarget?.runtimeSessionPolicy === undefined
          ? {}
          : { runtimeSessionPolicy: branchTarget.runtimeSessionPolicy }),
      };
    }),
    participantCatIds: input.draftParticipantCatIds ?? [],
    temporaryParticipants: (input.draftTemporaryParticipants ?? []).map((participant) => ({
      participantId: participant.participantId,
      name: participant.name,
      provider: participant.provider,
      instance: participant.instance ?? undefined,
      model: participant.model ?? undefined,
      modelSelection: participant.modelSelection ?? null,
      roleHint: participant.roleHint ?? undefined,
    })),
  };
}

export async function submitNewParallelChatDraft({
  body,
  payload,
  originSurface,
  draftCwd,
  draftSessionPolicy,
  draftFiles,
  draftParallelBranches,
  draftParallelChatTargets,
  draftParticipantCatIds = [],
  draftTemporaryParticipants = [],
  buildChannelPath,
  signal,
}: SubmitNewParallelChatDraftOptions): Promise<SubmitNewParallelChatDraftResult> {
  if (draftParallelChatTargets.length < 2) {
    throw new Error('Choose at least two parallel chats before sending.');
  }

  const created = await createParallelChatGroup(
    buildParallelChatDraftCreateInput({
      body,
      existingCount: payload.chat.channels.length,
      originSurface,
      draftCwd,
      draftSessionPolicy,
      draftParallelBranches,
      draftParallelChatTargets,
      draftParticipantCatIds,
      draftTemporaryParticipants,
    }),
    signal,
  );
  const activeChannelId =
    created.appShell.chat.selectedChannelId
      ? created.appShell.chat.selectedChannelId
      : created.group.members[0]?.channelId ?? null;
  if (!activeChannelId) {
    throw new Error('Parallel chat was created without an active thread.');
  }

  const encodedAttachments = draftFiles.length > 0
    ? await encodeAttachmentFiles(draftFiles)
    : undefined;
  const dispatch = await sendParallelChatMessage(created.group.id, {
    activeChannelId,
    body,
    attachments: encodedAttachments,
    channelInputs: created.group.memberChannelIds.map((channelId, index) => {
      const branch = draftParallelBranches[index];
      if (!branch) {
        return { channelId };
      }
      const branchAudienceKeys = branch.target.audienceKeys ?? branch.audienceKeys;
      const branchWorkflowShape = branch.target.workflowShape ?? branch.workflowShape;
      const recipientParticipantIds = branchAudienceKeys.length > 0
        ? resolveDraftAudienceParticipantIds({
            draftParticipantCatIds,
            draftTemporaryParticipants,
            draftAudienceKeys: branchAudienceKeys,
            maxAudienceParticipants:
              payload.chat.capabilities.maxAudienceParticipants ?? Number.POSITIVE_INFINITY,
          })
        : [];
      return {
        channelId,
        messageMetadata: recipientParticipantIds.length > 0
          ? {
              recipientParticipantIds,
              workflowShape: branchWorkflowShape,
            }
          : undefined,
      };
    }),
  }, signal);

  return {
    createdAppShell: created.appShell,
    dispatchAppShell: dispatch.appShell,
    rollbackPath: buildChannelPath(activeChannelId),
    dispatchRequest: isAnyParallelChatDispatchRunning(
      dispatch.appShell,
      created.group.memberChannelIds,
    )
      ? {
          kind: 'parallel',
          channelId: activeChannelId,
          groupId: created.group.id,
          channelIds: created.group.memberChannelIds,
        }
      : null,
  };
}

export interface SubmitParallelCompareMessageOptions {
  body: string;
  payload: AppShellPayload;
  compareGroupId: string;
  channelId: string;
  channelFiles: File[];
  signal?: AbortSignal;
}

export interface SubmitParallelCompareMessageResult {
  dispatchAppShell: AppShellPayload;
  dispatchRequest: ParallelDispatchRequestState | null;
}

export async function submitParallelCompareMessage({
  body,
  payload,
  compareGroupId,
  channelId,
  channelFiles,
  signal,
}: SubmitParallelCompareMessageOptions): Promise<SubmitParallelCompareMessageResult> {
  const activeGroupChannelIds = payload.chat.parallelChatGroups.find((group) =>
    group.id === compareGroupId,
  )?.memberChannelIds ?? [channelId];
  const encodedAttachments = channelFiles.length > 0
    ? await encodeAttachmentFiles(channelFiles)
    : undefined;
  const dispatch = await sendParallelChatMessage(compareGroupId, {
    activeChannelId: channelId,
    body,
    attachments: encodedAttachments,
  }, signal);

  return {
    dispatchAppShell: dispatch.appShell,
    dispatchRequest: isAnyParallelChatDispatchRunning(dispatch.appShell, activeGroupChannelIds)
      ? {
          kind: 'parallel',
          channelId,
          groupId: compareGroupId,
          channelIds: activeGroupChannelIds,
        }
      : null,
  };
}

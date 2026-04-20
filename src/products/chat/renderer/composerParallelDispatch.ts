import type { AppShellPayload } from '../api/contracts.js';
import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import {
  createParallelChatGroup,
  encodeAttachmentFiles,
  sendParallelChatMessage,
} from './api/index.js';
import type { ExecutionTargetValue } from '../../shared/renderer/components/ExecutionTarget.js';
import { createDraftChannelTitle } from './chatUtils.js';
import {
  resolveDraftAudienceParticipantIds,
  type DraftTemporaryParticipant,
} from './chatUtils.js';
import { buildChannelPath } from '../shared/channelPaths.js';
import type { DraftParallelBranchState } from '../../shared/renderer/draftParallelBranches.js';

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
  draftFiles: File[];
  draftParallelBranches: DraftParallelBranchState<ExecutionTargetValue>[];
  draftParallelChatTargets: ExecutionTargetValue[];
  draftParticipantCatIds?: string[];
  draftTemporaryParticipants?: DraftTemporaryParticipant[];
  signal?: AbortSignal;
}

export interface SubmitNewParallelChatDraftResult {
  createdAppShell: AppShellPayload;
  dispatchAppShell: AppShellPayload;
  rollbackPath: string;
  dispatchRequest: ParallelDispatchRequestState | null;
}

export async function submitNewParallelChatDraft({
  body,
  payload,
  originSurface,
  draftCwd,
  draftFiles,
  draftParallelBranches,
  draftParallelChatTargets,
  draftParticipantCatIds = [],
  draftTemporaryParticipants = [],
  signal,
}: SubmitNewParallelChatDraftOptions): Promise<SubmitNewParallelChatDraftResult> {
  if (draftParallelChatTargets.length < 2) {
    throw new Error('Choose at least two parallel chats before sending.');
  }

  const created = await createParallelChatGroup({
    title: createDraftChannelTitle(body, payload.chat.channels.length),
    originSurface,
    repoPath: draftCwd ?? undefined,
    targets: draftParallelChatTargets.map((target, index) => ({
      provider: target.provider,
      instance: target.instance ?? null,
      model: target.model ?? null,
      modelSelection: target.modelSelection ?? null,
      audienceKeys: draftParallelBranches[index]?.audienceKeys ?? [],
    })),
    participantCatIds: draftParticipantCatIds,
    temporaryParticipants: draftTemporaryParticipants.map((participant) => ({
      participantId: participant.participantId,
      name: participant.name,
      provider: participant.provider,
      instance: participant.instance ?? undefined,
      model: participant.model ?? undefined,
      modelSelection: participant.modelSelection ?? null,
      roleHint: participant.roleHint ?? undefined,
    })),
  }, signal);
  const activeChannelId =
    created.appShell.chat.selectedChannelId
    && created.group.memberChannelIds.includes(created.appShell.chat.selectedChannelId)
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
      const recipientParticipantIds = branch.audienceKeys.length > 0
        ? resolveDraftAudienceParticipantIds({
            draftParticipantCatIds,
            draftTemporaryParticipants,
            draftAudienceKeys: branch.audienceKeys,
            maxAudienceParticipants:
              payload.chat.capabilities.maxAudienceParticipants ?? Number.POSITIVE_INFINITY,
          })
        : [];
      return {
        channelId,
        messageMetadata: recipientParticipantIds.length > 0
          ? {
              recipientParticipantIds,
              workflowShape: branch.workflowShape,
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

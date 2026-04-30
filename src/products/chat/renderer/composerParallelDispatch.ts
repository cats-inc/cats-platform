import type { AppShellPayload } from '../api/contracts.js';
import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import type { DraftRoomWorkflowShape } from '../../../shared/roomRouting.js';
import type { RuntimeSessionPolicy } from '../../../shared/runtimeSessionPolicy.js';
import {
  createParallelChatGroup,
  encodeAttachmentFiles,
  sendParallelChatMessage,
} from './api/index.js';
import type { ExecutionTargetValue } from '../../shared/renderer/components/ExecutionTarget.js';
import {
  createDraftChannelTitle,
  type ChatUtilsTranslator,
} from './chatUtils.js';
import {
  resolveDraftAudienceParticipantIds,
  type DraftTemporaryParticipant,
} from './chatUtils.js';
import { buildChannelPath as buildChatChannelPath } from '../shared/channelPaths.js';
import type { DraftParallelTargetBranchFields } from '../../shared/renderer/draftParallelTargets.js';
import {
  assertNoBranchAttachmentOverrides,
  createDraftLeadContext,
  resolveBranch,
} from '../../shared/renderer/draftBranchResolution.js';
import {
  createTranslator,
  messageKeys,
} from '../../../shared/i18n/index.js';

type ParallelDispatchTarget = ExecutionTargetValue & DraftParallelTargetBranchFields;

const defaultParallelDispatchTranslator = createTranslator('en');

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
  draftWorkflowShape?: DraftRoomWorkflowShape;
  draftAudienceKeys?: string[] | null;
  draftParallelChatTargets: ParallelDispatchTarget[];
  draftParticipantCatIds?: string[];
  draftTemporaryParticipants?: DraftTemporaryParticipant[];
  buildChannelPath?: (channelId: string) => string;
  t?: ChatUtilsTranslator;
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
  draftSessionPolicy,
  draftFiles,
  draftWorkflowShape,
  draftAudienceKeys,
  draftParallelChatTargets,
  draftParticipantCatIds = [],
  draftTemporaryParticipants = [],
  buildChannelPath = buildChatChannelPath,
  t = defaultParallelDispatchTranslator,
  signal,
}: SubmitNewParallelChatDraftOptions): Promise<SubmitNewParallelChatDraftResult> {
  if (draftParallelChatTargets.length < 2) {
    throw new Error(t(messageKeys.chatComposerErrorChooseTwoParallelChats));
  }
  assertNoBranchAttachmentOverrides(draftParallelChatTargets, t);
  const leadContext = createDraftLeadContext({
    composerDraft: body,
    draftCwd,
    draftRuntimeSessionPolicy: draftSessionPolicy,
    draftFiles,
    draftWorkflowShape,
    draftAudienceKeys,
  });
  const resolvedBranches = draftParallelChatTargets.map((target) =>
    resolveBranch(target, leadContext));

  const created = await createParallelChatGroup({
    title: createDraftChannelTitle(body, payload.chat.channels.length, t),
    originSurface,
    repoPath: draftCwd ?? undefined,
    ...(draftSessionPolicy === undefined
      ? {}
      : { runtimeSessionPolicy: draftSessionPolicy }),
    targets: draftParallelChatTargets.map((target, index) => {
      const resolvedBranch = resolvedBranches[index]!;
      return {
        provider: target.provider,
        instance: target.instance ?? null,
        model: target.model ?? null,
        modelSelection: target.modelSelection ?? null,
        audienceKeys: resolvedBranch.effectiveAudienceKeys,
        ...(target.cwd === undefined ? {} : { cwd: target.cwd }),
        ...(target.runtimeSessionPolicy === undefined
          ? {}
          : { runtimeSessionPolicy: target.runtimeSessionPolicy }),
      };
    }),
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
    throw new Error(t(messageKeys.chatComposerErrorNoActiveParallelThread));
  }

  const encodedAttachments = draftFiles.length > 0
    ? await encodeAttachmentFiles(draftFiles)
    : undefined;
  const dispatch = await sendParallelChatMessage(created.group.id, {
    activeChannelId,
    body,
    attachments: encodedAttachments,
    channelInputs: created.group.memberChannelIds.map((channelId, index) => {
      const resolvedBranch = resolvedBranches[index];
      if (!resolvedBranch) {
        return { channelId };
      }
      const branchAudienceKeys = resolvedBranch.effectiveAudienceKeys;
      const branchWorkflowShape = resolvedBranch.effectiveWorkflowShape;
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
        body: resolvedBranch.effectivePrompt,
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

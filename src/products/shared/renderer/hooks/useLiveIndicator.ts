import { useEffect, useMemo, useRef, useState } from 'react';

import {
  buildChatConversationId,
  buildChatLaneId,
} from '../../../../shared/chatCoreIds.js';
import { buildExecutionLabel } from '../../../../shared/executionLabel.js';
import {
  applyLiveIndicatorEvent,
  createWaitingLiveIndicatorState,
  EMPTY_LIVE_INDICATOR,
  hasLiveIndicatorIdentity,
  hasVisibleAssistantReplyAfterMessage,
  hasVisibleLiveIndicatorSpeakerReplyAfterMessage,
  projectLiveIndicatorStateFromSegments,
  resolveLiveIndicatorSpeakerState,
  resolvePrimaryLiveIndicatorSegment,
  type LiveIndicatorSegmentState,
  type LiveIndicatorState,
} from '../../../../shared/liveIndicator.js';
import { pushBrowserLiveTrace } from '../../../../shared/liveTrace.js';
import { isComposerDispatchBusy } from '../../../../shared/composer.js';
import { isOptimisticDraftChannelId } from '../../channelPaths.js';

export type {
  LiveIndicatorContentBlock,
  LiveIndicatorEventEntry,
  LiveIndicatorSegmentState,
  LiveIndicatorState,
  LiveToolEntry,
} from '../../../../shared/liveIndicator.js';
export { EMPTY_LIVE_INDICATOR } from '../../../../shared/liveIndicator.js';

const LIVE_INDICATOR_RETRY_DELAY_MS = 150;
const LIVE_INDICATOR_RETRY_LIMIT = 8;

export interface LiveIndicatorSelectedChannelLike {
  orchestratorLease?: {
    sessionId?: string | null;
    laneId?: string | null;
    status?: string | null;
    startedAt?: string | null;
  } | null;
  assignedParticipants?: Array<{
    participantId: string;
    execution?: {
      lease?: {
        sessionId?: string | null;
        laneId?: string | null;
        status?: string | null;
        startedAt?: string | null;
      } | null;
    } | null;
  }> | null;
  messages?: Array<{
    id: string;
    senderKind: string;
    senderName?: string;
    metadata?: Record<string, unknown> | null | undefined;
    createdAt: string;
  }>;
  roomRouting: {
    defaultRecipientId: string | null;
    lastOutcome?: {
      turnId?: string | null;
      resolvedTargets?: Array<unknown>;
    } | null;
    workflow: {
      activeTurn?: {
        id?: string | null;
        status: string | null;
        sourceMessageId?: string | null;
        startedAt?: string | null;
        workflowShape?: string | null;
        targetStatuses?: Array<{
        status: string | null;
        id?: string | null;
        queuedAt?: string | null;
        startedAt?: string | null;
        participant: {
          participantKind?: string | null;
          participantId: string;
          participantName?: string | null;
        };
        }>;
        events?: Array<{
          kind?: string | null;
          targets?: Array<unknown>;
        }>;
      } | null;
    };
  };
  composerMode: string;
  pendingProvider: string | null;
  pendingInstance: string | null;
}

export interface LiveIndicatorStreamDecisionInput {
  channelId: string | null;
  busy: string;
  routingStatus?: string | null;
}

export interface SequencedLiveIndicatorStreamCursor {
  sessionId: string;
  laneId: string | null;
  targetStateId: string | null;
  sourceMessageId: string | null;
  streamSeq: number;
  streamSeqIndex: number;
}

interface WaitingIndicatorInputs {
  sourceMessageId: string | null;
  laneId: string | null;
  targetStateId: string | null;
  participantId: string | null;
  catId: string | null;
  speakerLabel: string | null;
  revealIdentity: boolean;
  defaultRecipientCatId: string | null;
  fallbackSpeakerLabel: string | null;
  sessionStartedAt: string | null;
  requiresSessionStartConfirmation: boolean;
}

export function shouldConnectLiveIndicatorStream(
  channelId: string | null,
  busy: string,
  _routingStatus?: string | null,
): boolean {
  if (!isComposerDispatchBusy(busy) || !channelId) {
    return false;
  }

  return !isOptimisticDraftChannelId(channelId);
}

export function resolveLiveIndicatorSpeakerLabel(
  selectedChannel: LiveIndicatorSelectedChannelLike | null,
): string | null {
  if (!selectedChannel || selectedChannel.roomRouting.defaultRecipientId) {
    return null;
  }

  if (selectedChannel.composerMode !== 'solo' || !selectedChannel.pendingProvider) {
    return null;
  }

  return buildExecutionLabel(
    selectedChannel.pendingProvider,
    selectedChannel.pendingInstance,
    null,
  );
}

function resolveWorkflowTargetLaneId(
  turnId: string | null | undefined,
  targetStateId: string | null | undefined,
  participantId: string | null | undefined,
): string | null {
  const normalizedTurnId = turnId?.trim() || null;
  const normalizedTargetStateId = targetStateId?.trim() || null;
  const normalizedParticipantId = participantId?.trim() || null;
  return normalizedTurnId && normalizedTargetStateId && normalizedParticipantId
    ? buildChatLaneId(normalizedTurnId, normalizedTargetStateId, normalizedParticipantId)
    : null;
}

function resolveWaitingSpeakerState(
  selectedChannel: LiveIndicatorSelectedChannelLike | null,
): {
  sourceMessageId: string | null;
  laneId: string | null;
  targetStateId: string | null;
  participantId: string | null;
  catId: string | null;
  speakerLabel: string | null;
  revealIdentity: boolean;
} {
  const activeTurn = selectedChannel?.roomRouting.workflow.activeTurn ?? null;
  const activeTargets = activeTurn?.targetStatuses?.filter((target) =>
    target.status === 'running' || target.status === 'pending') ?? [];
  const nextTarget = activeTargets[0];
  if (!nextTarget) {
    return {
      sourceMessageId: activeTurn?.sourceMessageId?.trim() || null,
      laneId: null,
      targetStateId: null,
      participantId: null,
      catId: null,
      speakerLabel: null,
      revealIdentity: false,
    };
  }

  const hasVisibleAssistantReply = activeTurn?.sourceMessageId
    ? hasVisibleAssistantReplyAfterMessage(
      selectedChannel?.messages ?? [],
      activeTurn.sourceMessageId,
    )
    : false;
  const revealIdentity = activeTurn?.workflowShape === 'concurrent' || hasVisibleAssistantReply;

  return {
    sourceMessageId: activeTurn?.sourceMessageId?.trim() || null,
    laneId: resolveWorkflowTargetLaneId(
      activeTurn?.id ?? null,
      nextTarget.id ?? null,
      nextTarget.participant.participantId,
    ),
    targetStateId: nextTarget.id?.trim() || null,
    participantId: nextTarget.participant.participantId,
    catId: null,
    speakerLabel: nextTarget.participant.participantName?.trim() || null,
    revealIdentity,
  };
}

interface WaitingSessionState {
  sessionStartedAt: string | null;
  requiresSessionStartConfirmation: boolean;
}

function hasLiveLeaseStatus(
  status: string | null | undefined,
): boolean {
  return status === 'ready' || status === 'initializing';
}

function resolveTargetLease(
  selectedChannel: LiveIndicatorSelectedChannelLike | null,
  participantId: string | null,
  laneId: string | null = null,
): {
  sessionId: string | null;
  startedAt: string | null;
} | null {
  if (!selectedChannel || !participantId) {
    return null;
  }

  if (participantId === 'orchestrator') {
    const leaseStatus = readTraceString(selectedChannel.orchestratorLease?.status);
    const leaseLaneId = readTraceString(selectedChannel.orchestratorLease?.laneId);
    if (leaseStatus && !hasLiveLeaseStatus(leaseStatus)) {
      return {
        sessionId: null,
        startedAt: null,
      };
    }
    if (laneId && leaseLaneId && leaseLaneId !== laneId) {
      return {
        sessionId: null,
        startedAt: null,
      };
    }
    return {
      sessionId: readTraceString(selectedChannel.orchestratorLease?.sessionId),
      startedAt: readTraceString(selectedChannel.orchestratorLease?.startedAt),
    };
  }

  const participantLease =
    selectedChannel.assignedParticipants?.find((participant) => participant.participantId === participantId)
      ?.execution?.lease
    ?? null;
  const leaseStatus = readTraceString(participantLease?.status);
  const leaseLaneId = readTraceString(participantLease?.laneId);
  if (leaseStatus && !hasLiveLeaseStatus(leaseStatus)) {
    return {
      sessionId: null,
      startedAt: null,
    };
  }
  if (laneId && leaseLaneId && leaseLaneId !== laneId) {
    return {
      sessionId: null,
      startedAt: null,
    };
  }

  return {
    sessionId: readTraceString(participantLease?.sessionId),
    startedAt: readTraceString(participantLease?.startedAt),
  };
}

export function resolveWaitingSessionState(
  selectedChannel: LiveIndicatorSelectedChannelLike | null,
  participantId: string | null,
  targetStateId: string | null = null,
  laneId: string | null = null,
): WaitingSessionState {
  const activeTurnId = readTraceString(
    selectedChannel?.roomRouting.workflow.activeTurn?.id,
  );
  const activeTurnStartedAt = readTraceString(
    selectedChannel?.roomRouting.workflow.activeTurn?.startedAt,
  );
  const targetStatus = selectedChannel?.roomRouting.workflow.activeTurn?.targetStatuses?.find((target) => {
    const targetLaneId = resolveWorkflowTargetLaneId(
      activeTurnId,
      target.id ?? null,
      target.participant.participantId,
    );
    if (laneId && targetLaneId === laneId) {
      return true;
    }
    if (targetStateId && target.id?.trim() === targetStateId) {
      return true;
    }
    return participantId !== null && target.participant.participantId === participantId;
  }) ?? null;
  const targetActivationAt = readTraceString(targetStatus?.startedAt)
    ?? readTraceString(targetStatus?.queuedAt)
    ?? activeTurnStartedAt;
  if (!participantId || !targetActivationAt) {
    return {
      sessionStartedAt: null,
      requiresSessionStartConfirmation: false,
    };
  }

  const lease = resolveTargetLease(selectedChannel, participantId, laneId);
  const sessionId = lease?.sessionId ?? null;
  const sessionStartedAt = lease?.startedAt ?? null;
  if (!sessionId || !sessionStartedAt) {
    return {
      sessionStartedAt: targetActivationAt,
      requiresSessionStartConfirmation: true,
    };
  }

  const targetActivationTimestamp = Date.parse(targetActivationAt);
  const sessionTimestamp = Date.parse(sessionStartedAt);
  if (Number.isNaN(targetActivationTimestamp) || Number.isNaN(sessionTimestamp)) {
    return {
      sessionStartedAt,
      requiresSessionStartConfirmation: false,
    };
  }

  return {
    sessionStartedAt,
    requiresSessionStartConfirmation: sessionTimestamp >= targetActivationTimestamp,
  };
}

export function shouldRetryLiveIndicatorSessionClose(
  input: LiveIndicatorStreamDecisionInput & {
    eventType: string;
  },
): boolean {
  return input.eventType === 'session_closed'
    && defaultShouldConnectStream(input);
}

function hasRenderableLiveIndicatorContent(
  state: LiveIndicatorState,
): boolean {
  return state.contentBlocks.length > 0
    || state.progressText.trim().length > 0
    || state.events.length > 0;
}

export function shouldPinLiveIndicatorUntilPersistedReply(
  previous: LiveIndicatorState,
  selectedChannel: LiveIndicatorSelectedChannelLike | null,
): boolean {
  if (
    !previous.active
    || previous.phase === 'waiting'
    || !hasRenderableLiveIndicatorContent(previous)
  ) {
    return false;
  }

  const activeTurnSourceMessageId =
    selectedChannel?.roomRouting.workflow.activeTurn?.sourceMessageId ?? null;
  if (!activeTurnSourceMessageId) {
    return false;
  }

  if (hasLiveIndicatorIdentity(previous) || previous.laneId || previous.targetStateId) {
    return !hasVisibleLiveIndicatorSpeakerReplyAfterMessage(
      selectedChannel?.messages ?? [],
      activeTurnSourceMessageId,
      previous,
    );
  }

  return !hasVisibleAssistantReplyAfterMessage(
    selectedChannel?.messages ?? [],
    activeTurnSourceMessageId,
  );
}

export function resolveWaitingIndicatorStateTransition(input: {
  previous: LiveIndicatorState;
  waitingState: LiveIndicatorState;
  selectedChannel: LiveIndicatorSelectedChannelLike | null;
  previousChannelId: string | null;
  channelId: string | null;
}): LiveIndicatorState {
  if (input.previousChannelId !== input.channelId || !input.previous.active) {
    return input.waitingState;
  }

  if (shouldPinLiveIndicatorUntilPersistedReply(input.previous, input.selectedChannel)) {
    return input.previous;
  }

  if (input.previous.phase === 'streaming') {
    return mergeWaitingIndicatorTimelineState(input.previous, input.waitingState);
  }

  if (input.previous.phase === 'waiting' && !hasRenderableLiveIndicatorContent(input.previous)) {
    return replaceWaitingIndicatorTimelineIdentity(input.previous, input.waitingState);
  }

  if (input.previous.phase === 'sealed') {
    if (
      doesWaitingIndicatorLogicalIdentityMatch(input.previous, input.waitingState)
      && !shouldAllowSameSpeakerWaitingFollowup(input.selectedChannel)
    ) {
      return input.previous;
    }
    return mergeWaitingIndicatorTimelineState(input.previous, input.waitingState);
  }

  return input.previous;
}

function doesLiveIndicatorIdentityMatch(
  left: LiveIndicatorState,
  right: LiveIndicatorState,
): boolean {
  return left.segmentIndex === right.segmentIndex
    && doesLiveIndicatorLogicalIdentityMatch(left, right);
}

function doesLiveIndicatorLogicalIdentityMatch(
  left: Pick<
    LiveIndicatorState | LiveIndicatorSegmentState,
    'sourceMessageId' | 'laneId' | 'targetStateId' | 'participantId' | 'catId' | 'speakerLabel'
  >,
  right: Pick<
    LiveIndicatorState | LiveIndicatorSegmentState,
    'sourceMessageId' | 'laneId' | 'targetStateId' | 'participantId' | 'catId' | 'speakerLabel'
  >,
): boolean {
  const leftSourceMessageId = left.sourceMessageId ?? null;
  const rightSourceMessageId = right.sourceMessageId ?? null;
  const leftLaneId = left.laneId ?? null;
  const rightLaneId = right.laneId ?? null;
  const leftTargetStateId = left.targetStateId ?? null;
  const rightTargetStateId = right.targetStateId ?? null;
  const leftParticipantId = left.participantId ?? null;
  const rightParticipantId = right.participantId ?? null;
  const leftCatId = left.catId ?? null;
  const rightCatId = right.catId ?? null;
  const leftSpeakerLabel = left.speakerLabel ?? null;
  const rightSpeakerLabel = right.speakerLabel ?? null;

  if (leftLaneId !== null && rightLaneId !== null) {
    return leftLaneId === rightLaneId;
  }

  if (leftTargetStateId !== null && rightTargetStateId !== null) {
    return leftTargetStateId === rightTargetStateId;
  }

  return leftSourceMessageId === rightSourceMessageId
    && leftParticipantId === rightParticipantId
    && leftCatId === rightCatId
    && leftSpeakerLabel === rightSpeakerLabel;
}

function doesWaitingIndicatorLogicalIdentityMatch(
  previous: LiveIndicatorState,
  waitingState: LiveIndicatorState,
): boolean {
  const previousSegment = resolvePrimaryLiveIndicatorSegment(previous);
  const waitingSegment = resolvePrimaryLiveIndicatorSegment(waitingState);
  return (
    (
      previousSegment != null
      && waitingSegment != null
      && doesLiveIndicatorLogicalIdentityMatch(previousSegment, waitingSegment)
    )
    || doesLiveIndicatorLogicalIdentityMatch(previous, waitingState)
  );
}

function shouldAllowSameSpeakerWaitingFollowup(
  selectedChannel: LiveIndicatorSelectedChannelLike | null,
): boolean {
  return selectedChannel?.roomRouting.workflow.activeTurn?.workflowShape === 'solo';
}

function shouldAdvanceWaitingSegmentIndex(
  previousSegment: LiveIndicatorSegmentState | null,
  waitingSegment: LiveIndicatorSegmentState | null,
): boolean {
  if (!previousSegment || !waitingSegment) {
    return false;
  }

  if (previousSegment.laneId && waitingSegment.laneId) {
    return previousSegment.laneId === waitingSegment.laneId;
  }

  if (previousSegment.targetStateId && waitingSegment.targetStateId) {
    return previousSegment.targetStateId === waitingSegment.targetStateId;
  }

  if (!previousSegment.sourceMessageId || !waitingSegment.sourceMessageId) {
    return false;
  }

  if (previousSegment.sourceMessageId !== waitingSegment.sourceMessageId) {
    return false;
  }

  if (previousSegment.participantId && waitingSegment.participantId) {
    return previousSegment.participantId === waitingSegment.participantId;
  }

  if (previousSegment.catId && waitingSegment.catId) {
    return previousSegment.catId === waitingSegment.catId;
  }

  return previousSegment.speakerLabel != null
    && waitingSegment.speakerLabel != null
    && previousSegment.speakerLabel === waitingSegment.speakerLabel;
}

interface SequentialTurnTargetIdentity {
  participantId: string | null;
  participantName: string | null;
}

function readSequentialTurnTargetIdentity(
  target: unknown,
): SequentialTurnTargetIdentity | null {
  if (!target || typeof target !== 'object') {
    return null;
  }

  const candidate = target as {
    participantId?: unknown;
    participantName?: unknown;
  };
  return {
    participantId: typeof candidate.participantId === 'string'
      ? candidate.participantId.trim() || null
      : null,
    participantName: typeof candidate.participantName === 'string'
      ? candidate.participantName.trim() || null
      : null,
  };
}

function resolveSequentialTurnTargetOrder(
  activeTurn: NonNullable<LiveIndicatorSelectedChannelLike['roomRouting']['workflow']['activeTurn']>,
  lastOutcome: LiveIndicatorSelectedChannelLike['roomRouting']['lastOutcome'] | null | undefined,
): SequentialTurnTargetIdentity[] {
  const turnStartedEvent = activeTurn.events?.find((event) => event.kind === 'turn_started') ?? null;
  const turnStartedTargets = turnStartedEvent?.targets
    ?.map((target) => readSequentialTurnTargetIdentity(target))
    .filter((target): target is SequentialTurnTargetIdentity => target !== null) ?? [];
  if (turnStartedTargets.length > 0) {
    return turnStartedTargets;
  }

  if (!lastOutcome || lastOutcome.turnId !== activeTurn.id) {
    return [];
  }

  return lastOutcome.resolvedTargets
    ?.map((target) => readSequentialTurnTargetIdentity(target))
    .filter((target): target is SequentialTurnTargetIdentity => target !== null) ?? [];
}

function resolveSequentialTurnTargetIndex(
  orderedTargets: SequentialTurnTargetIdentity[],
  segment: LiveIndicatorSegmentState,
): number {
  if (segment.participantId) {
    const participantIndex = orderedTargets.findIndex((target) =>
      target.participantId === segment.participantId);
    if (participantIndex >= 0) {
      return participantIndex;
    }
  }

  if (segment.speakerLabel) {
    return orderedTargets.findIndex((target) => target.participantName === segment.speakerLabel);
  }

  return -1;
}

function reindexWaitingSegment(
  previousSegment: LiveIndicatorSegmentState | null,
  waitingSegment: LiveIndicatorSegmentState | null,
): LiveIndicatorSegmentState {
  if (!waitingSegment) {
    throw new Error('reindexWaitingSegment requires a waiting segment');
  }

  if (!shouldAdvanceWaitingSegmentIndex(previousSegment, waitingSegment)) {
    return waitingSegment;
  }

  return resolvePrimaryLiveIndicatorSegment(createWaitingLiveIndicatorState({
    sourceMessageId: waitingSegment.sourceMessageId,
    laneId: waitingSegment.laneId,
    targetStateId: waitingSegment.targetStateId,
    participantId: waitingSegment.participantId,
    catId: waitingSegment.catId,
    speakerLabel: waitingSegment.speakerLabel,
    revealIdentity: true,
    segmentIndex: previousSegment!.segmentIndex + 1,
  })) ?? waitingSegment;
}

function mergeWaitingIndicatorTimelineState(
  previous: LiveIndicatorState,
  waitingState: LiveIndicatorState,
): LiveIndicatorState {
  const waitingSegment = resolvePrimaryLiveIndicatorSegment(waitingState);
  if (!waitingSegment) {
    return previous;
  }

  const previousSegment = resolvePrimaryLiveIndicatorSegment(previous);
  if (!previous.active || !previousSegment) {
    return waitingState;
  }

  if (previousSegment.phase === 'waiting') {
    if (doesLiveIndicatorIdentityMatch(previous, waitingState)) {
      return previous;
    }
    const nextWaitingSegment = reindexWaitingSegment(previousSegment, waitingSegment);
    return projectLiveIndicatorStateFromSegments([
      ...previous.segments.slice(0, -1),
      nextWaitingSegment,
    ]);
  }

  const sealedPrevious = previousSegment.phase === 'sealed'
    ? previousSegment
    : {
        ...previousSegment,
        phase: 'sealed' as const,
      };
  const nextWaitingSegment = reindexWaitingSegment(sealedPrevious, waitingSegment);
  return projectLiveIndicatorStateFromSegments([
    ...previous.segments.slice(0, -1),
    sealedPrevious,
    nextWaitingSegment,
  ]);
}

function replaceWaitingIndicatorTimelineIdentity(
  previous: LiveIndicatorState,
  waitingState: LiveIndicatorState,
): LiveIndicatorState {
  const waitingSegment = resolvePrimaryLiveIndicatorSegment(waitingState);
  if (!waitingSegment) {
    return previous;
  }

  const previousSegment = resolvePrimaryLiveIndicatorSegment(previous);
  if (!previous.active || !previousSegment) {
    return waitingState;
  }

  if (previousSegment.phase !== 'waiting') {
    return previous;
  }

  if (doesLiveIndicatorIdentityMatch(previous, waitingState)) {
    return previous;
  }

  if (doesWaitingIndicatorLogicalIdentityMatch(previous, waitingState)) {
    return previous;
  }

  return projectLiveIndicatorStateFromSegments([
    ...previous.segments.slice(0, -1),
    waitingSegment,
  ]);
}

export function shouldPromoteStreamingBubbleToWaitingSpeaker(
  previous: LiveIndicatorState,
  waitingState: LiveIndicatorState,
  selectedChannel: LiveIndicatorSelectedChannelLike | null,
): boolean {
  if (
    !previous.active
    || previous.phase !== 'streaming'
    || !waitingState.active
    || waitingState.phase !== 'waiting'
    || !hasLiveIndicatorIdentity(waitingState)
    || doesLiveIndicatorIdentityMatch(previous, waitingState)
  ) {
    return false;
  }

  if (
    doesWaitingIndicatorLogicalIdentityMatch(previous, waitingState)
    && !shouldAllowSameSpeakerWaitingFollowup(selectedChannel)
  ) {
    return false;
  }

  const sourceMessageId = selectedChannel?.roomRouting.workflow.activeTurn?.sourceMessageId ?? null;
  if (!sourceMessageId) {
    return false;
  }

  return hasVisibleLiveIndicatorSpeakerReplyAfterMessage(
    selectedChannel?.messages ?? [],
    sourceMessageId,
    previous,
  );
}

export function shouldPromoteSealedBubbleToWaitingSpeaker(
  previous: LiveIndicatorState,
  waitingState: LiveIndicatorState,
  selectedChannel: LiveIndicatorSelectedChannelLike | null,
): boolean {
  if (
    !previous.active
    || previous.phase !== 'sealed'
    || !waitingState.active
    || waitingState.phase !== 'waiting'
    || !hasLiveIndicatorIdentity(waitingState)
    || doesLiveIndicatorIdentityMatch(previous, waitingState)
  ) {
    return false;
  }

  if (
    doesWaitingIndicatorLogicalIdentityMatch(previous, waitingState)
    && !shouldAllowSameSpeakerWaitingFollowup(selectedChannel)
  ) {
    return false;
  }

  const sourceMessageId = selectedChannel?.roomRouting.workflow.activeTurn?.sourceMessageId ?? null;
  if (!sourceMessageId) {
    return false;
  }

  return hasVisibleLiveIndicatorSpeakerReplyAfterMessage(
    selectedChannel?.messages ?? [],
    sourceMessageId,
    previous,
  );
}

export function shouldReconnectLiveIndicatorAfterSourceError(
  current: LiveIndicatorState,
  selectedChannel: LiveIndicatorSelectedChannelLike | null,
): boolean {
  const primarySegment = resolvePrimaryLiveIndicatorSegment(current);
  if (primarySegment?.phase === 'sealed') {
    return false;
  }

  if (shouldPinLiveIndicatorUntilPersistedReply(current, selectedChannel)) {
    return false;
  }

  return true;
}

export function shouldReconnectLiveIndicatorAfterOngoingWorkflow(
  current: LiveIndicatorState,
  selectedChannel: LiveIndicatorSelectedChannelLike | null,
): boolean {
  const primarySegment = resolvePrimaryLiveIndicatorSegment(current);
  const activeTurn = selectedChannel?.roomRouting.workflow.activeTurn ?? null;
  const activeTurnSourceMessageId = activeTurn?.sourceMessageId?.trim() || null;
  const currentSourceMessageId = primarySegment?.sourceMessageId ?? current.sourceMessageId;

  if (
    primarySegment?.phase !== 'sealed'
    || !activeTurn
    || (activeTurn.status !== 'running' && activeTurn.status !== 'pending')
    || !activeTurnSourceMessageId
    || !currentSourceMessageId
    || currentSourceMessageId !== activeTurnSourceMessageId
  ) {
    return false;
  }

  const activeTargets = activeTurn.targetStatuses?.filter((target) =>
    target.status === 'running' || target.status === 'pending') ?? [];
  if (activeTargets.length > 0) {
    return activeTargets.some((target) => {
      const targetLaneId = resolveWorkflowTargetLaneId(
        activeTurn.id ?? null,
        target.id ?? null,
        target.participant.participantId,
      );
      if (primarySegment.laneId && targetLaneId) {
        return targetLaneId !== primarySegment.laneId;
      }

      const targetStateId = target.id?.trim() || null;
      if (primarySegment.targetStateId && targetStateId) {
        return targetStateId !== primarySegment.targetStateId;
      }

      const participantId = target.participant.participantId?.trim() || null;
      if (primarySegment.participantId && participantId) {
        return participantId !== primarySegment.participantId;
      }

      const participantName = target.participant.participantName?.trim() || null;
      return participantName !== (primarySegment.speakerLabel ?? null);
    });
  }

  if (activeTurn.workflowShape !== 'sequential') {
    return true;
  }

  const lastOutcome = selectedChannel?.roomRouting.lastOutcome ?? null;
  const orderedTargets = resolveSequentialTurnTargetOrder(activeTurn, lastOutcome);
  if (orderedTargets.length > 0) {
    const currentTargetIndex = resolveSequentialTurnTargetIndex(orderedTargets, primarySegment);
    if (currentTargetIndex >= 0) {
      return currentTargetIndex < orderedTargets.length - 1;
    }
  }

  const turnStartedEvent = activeTurn.events?.find((event) => event.kind === 'turn_started') ?? null;
  const totalTurnTargets = turnStartedEvent?.targets?.length
    ?? (
      lastOutcome?.turnId === activeTurn.id
        ? lastOutcome?.resolvedTargets?.length
        : null
    )
    ?? null;
  if (!totalTurnTargets) {
    return true;
  }

  const knownTargetIds = new Set(
    activeTurn.targetStatuses
      ?.map((target) => resolveWorkflowTargetLaneId(
        activeTurn.id ?? null,
        target.id ?? null,
        target.participant.participantId,
      ) ?? target.id?.trim() ?? null)
      .filter((targetId): targetId is string => Boolean(targetId)) ?? [],
  );
  if (primarySegment.laneId || primarySegment.targetStateId) {
    knownTargetIds.add(primarySegment.laneId ?? primarySegment.targetStateId!);
  }

  return knownTargetIds.size < totalTurnTargets;
}
export function shouldIgnoreSealedSessionClose(
  current: LiveIndicatorState,
  waitingState: LiveIndicatorState,
): boolean {
  const primarySegment = resolvePrimaryLiveIndicatorSegment(current);
  if (primarySegment?.phase !== 'sealed') {
    return false;
  }

  return !shouldReconnectLiveIndicatorAfterSessionClose(current, waitingState);
}

export function shouldReconnectLiveIndicatorAfterSessionClose(
  current: LiveIndicatorState,
  waitingState: LiveIndicatorState,
): boolean {
  const currentSegment = resolvePrimaryLiveIndicatorSegment(current);
  const waitingSegment = resolvePrimaryLiveIndicatorSegment(waitingState);
  if (!waitingSegment) {
    return false;
  }

  if (!currentSegment) {
    return true;
  }

  if (waitingSegment.laneId && currentSegment.laneId) {
    return waitingSegment.laneId !== currentSegment.laneId;
  }

  if (waitingSegment.targetStateId && currentSegment.targetStateId) {
    return waitingSegment.targetStateId !== currentSegment.targetStateId;
  }

  return !doesLiveIndicatorLogicalIdentityMatch(currentSegment, waitingSegment);
}

function defaultShouldShowWaitingIndicator(
  input: LiveIndicatorStreamDecisionInput,
): boolean {
  return isComposerDispatchBusy(input.busy) && Boolean(input.channelId);
}

function defaultShouldConnectStream(
  input: LiveIndicatorStreamDecisionInput,
): boolean {
  return shouldConnectLiveIndicatorStream(
    input.channelId,
    input.busy,
    input.routingStatus,
  );
}

export function advanceSequencedLiveIndicatorStreamCursor(
  previous: SequencedLiveIndicatorStreamCursor | null,
  data: Record<string, unknown>,
): {
  accept: boolean;
  cursor: SequencedLiveIndicatorStreamCursor | null;
} {
  const sessionId = readTraceString(data.sessionId);
  const laneId = readTraceString(data.laneId);
  const targetStateId = readTraceString(data.targetStateId);
  const sourceMessageId = readTraceString(data.sourceMessageId);
  const streamSeq = typeof data.streamSeq === 'number' && Number.isFinite(data.streamSeq)
    ? data.streamSeq
    : null;
  const streamSeqIndex = typeof data.streamSeqIndex === 'number' && Number.isFinite(data.streamSeqIndex)
    ? data.streamSeqIndex
    : null;

  if (!sessionId || streamSeq === null || streamSeqIndex === null) {
    return {
      accept: true,
      cursor: previous,
    };
  }

  if (
    previous
    && previous.sessionId === sessionId
    && previous.sourceMessageId === sourceMessageId
    && doesSequencedStreamCursorTargetMatch(previous, {
      laneId,
      targetStateId,
    })
    && (
      streamSeq < previous.streamSeq
      || (streamSeq === previous.streamSeq && streamSeqIndex <= previous.streamSeqIndex)
    )
  ) {
    return {
      accept: false,
      cursor: previous,
    };
  }

  return {
    accept: true,
    cursor: {
      sessionId,
      laneId,
      targetStateId,
      sourceMessageId,
      streamSeq,
      streamSeqIndex,
    },
  };
}

function doesSequencedStreamCursorTargetMatch(
  previous: SequencedLiveIndicatorStreamCursor,
  next: {
    laneId: string | null;
    targetStateId: string | null;
  },
): boolean {
  if (previous.laneId && next.laneId) {
    return previous.laneId === next.laneId;
  }

  if (previous.targetStateId && next.targetStateId) {
    return previous.targetStateId === next.targetStateId;
  }

  return previous.laneId === next.laneId
    && previous.targetStateId === next.targetStateId;
}

export function useLiveIndicator<
  TSelectedChannel extends LiveIndicatorSelectedChannelLike = LiveIndicatorSelectedChannelLike,
>(options: {
  channelId: string | null;
  busy: string;
  selectedChannel: TSelectedChannel | null;
  debugTraceEnabled?: boolean;
  resolveRoutingStatus?: (selectedChannel: TSelectedChannel | null) => string | null;
  shouldShowWaitingIndicator?: (input: LiveIndicatorStreamDecisionInput) => boolean;
  shouldConnectStream?: (input: LiveIndicatorStreamDecisionInput) => boolean;
}): LiveIndicatorState {
  const {
    channelId,
    busy,
    selectedChannel,
    debugTraceEnabled = false,
    resolveRoutingStatus,
    shouldShowWaitingIndicator = defaultShouldShowWaitingIndicator,
    shouldConnectStream = defaultShouldConnectStream,
  } = options;
  const [state, setState] = useState<LiveIndicatorState>(EMPTY_LIVE_INDICATOR);
  const sourceRef = useRef<EventSource | null>(null);
  const stateRef = useRef<LiveIndicatorState>(EMPTY_LIVE_INDICATOR);
  const selectedChannelRef = useRef<TSelectedChannel | null>(selectedChannel);
  const previousChannelIdRef = useRef<string | null>(null);
  const streamCursorRef = useRef<SequencedLiveIndicatorStreamCursor | null>(null);

  const defaultRecipientCatId = selectedChannel?.roomRouting.defaultRecipientId ?? null;
  const routingStatus = resolveRoutingStatus?.(selectedChannel) ?? null;
  const activeTurn = selectedChannel?.roomRouting.workflow.activeTurn ?? null;
  const speakerLabel = defaultRecipientCatId
    ? null
    : resolveLiveIndicatorSpeakerLabel(selectedChannel);
  const waitingSpeakerState = useMemo(
    () => resolveWaitingSpeakerState(selectedChannel),
    [activeTurn, selectedChannel?.messages],
  );
  const waitingSessionState = useMemo(
    () => resolveWaitingSessionState(
      selectedChannel,
      waitingSpeakerState.participantId,
      waitingSpeakerState.targetStateId,
      waitingSpeakerState.laneId,
    ),
    [
      selectedChannel,
      waitingSpeakerState.participantId,
      waitingSpeakerState.targetStateId,
      waitingSpeakerState.laneId,
    ],
  );
  const waitingIndicatorInputs = useMemo<WaitingIndicatorInputs>(
    () => ({
      sourceMessageId: waitingSpeakerState.sourceMessageId,
      laneId: waitingSpeakerState.laneId,
      targetStateId: waitingSpeakerState.targetStateId,
      participantId: waitingSpeakerState.participantId,
      catId: waitingSpeakerState.catId,
      speakerLabel: waitingSpeakerState.speakerLabel,
      revealIdentity: waitingSpeakerState.revealIdentity,
      defaultRecipientCatId,
      fallbackSpeakerLabel: speakerLabel,
      sessionStartedAt: waitingSessionState.sessionStartedAt,
      requiresSessionStartConfirmation: waitingSessionState.requiresSessionStartConfirmation,
    }),
    [
      waitingSpeakerState.sourceMessageId,
      waitingSpeakerState.laneId,
      defaultRecipientCatId,
      speakerLabel,
      waitingSpeakerState.catId,
      waitingSpeakerState.targetStateId,
      waitingSpeakerState.participantId,
      waitingSpeakerState.revealIdentity,
      waitingSpeakerState.speakerLabel,
      waitingSessionState.sessionStartedAt,
      waitingSessionState.requiresSessionStartConfirmation,
    ],
  );
  const waitingIndicatorInputsRef = useRef<WaitingIndicatorInputs>(waitingIndicatorInputs);

  function createCurrentWaitingState(): LiveIndicatorState {
    const current = waitingIndicatorInputsRef.current;
    return createWaitingLiveIndicatorState({
      sourceMessageId: current.sourceMessageId,
      laneId: current.laneId,
      targetStateId: current.targetStateId,
      participantId: current.revealIdentity ? current.participantId : null,
      catId: current.revealIdentity ? current.catId : current.defaultRecipientCatId,
      speakerLabel: current.revealIdentity ? current.speakerLabel : current.fallbackSpeakerLabel,
      revealIdentity: current.revealIdentity,
      sessionStartedAt: current.sessionStartedAt,
      requiresSessionStartConfirmation: current.requiresSessionStartConfirmation,
    });
  }

  function traceBrowser(event: string, input: {
    turnId?: string | null;
    laneId?: string | null;
    sourceMessageId?: string | null;
    targetStateId?: string | null;
    sessionId?: string | null;
    participantId?: string | null;
    catId?: string | null;
    speakerLabel?: string | null;
    reason?: string | null;
    details?: Record<string, unknown> | null;
    signature?: string | null;
  } = {}): void {
    if (!debugTraceEnabled) {
      return;
    }

    const activeTurnId = readTraceString(selectedChannelRef.current?.roomRouting.workflow.activeTurn?.id);
    const primarySegment = resolvePrimaryLiveIndicatorSegment(stateRef.current);
    pushBrowserLiveTrace({
      event,
      channelId,
      conversationId: channelId ? buildChatConversationId(channelId) : null,
      turnId: readTraceString(input.turnId) ?? activeTurnId,
      laneId: readTraceString(input.laneId) ?? primarySegment?.laneId ?? stateRef.current.laneId,
      sourceMessageId:
        readTraceString(input.sourceMessageId)
        ?? primarySegment?.sourceMessageId
        ?? stateRef.current.sourceMessageId,
      targetStateId:
        readTraceString(input.targetStateId)
        ?? primarySegment?.targetStateId
        ?? stateRef.current.targetStateId,
      sessionId: readTraceString(input.sessionId),
      participantId: readTraceString(input.participantId),
      catId: readTraceString(input.catId),
      speakerLabel: readTraceString(input.speakerLabel),
      reason: readTraceString(input.reason),
      details: input.details ?? null,
      signature: input.signature ?? null,
    });
  }

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    selectedChannelRef.current = selectedChannel;
  }, [selectedChannel]);

  useEffect(() => {
    waitingIndicatorInputsRef.current = waitingIndicatorInputs;
  }, [waitingIndicatorInputs]);

  useEffect(() => {
    const shouldShowWaiting = shouldShowWaitingIndicator({
      channelId,
      busy,
      routingStatus,
    });
    const previousChannelId = previousChannelIdRef.current;
    previousChannelIdRef.current = channelId;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;

    function updateIndicatorState(
      updater: (previous: LiveIndicatorState) => LiveIndicatorState,
    ): void {
      setState((previous) => {
        const next = updater(previous);
        stateRef.current = next;
        return next;
      });
    }

    function clearReconnectTimer(): void {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function closeSource(): void {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    }

    function scheduleReconnect(): void {
      if (
        disposed
        || reconnectAttempts >= LIVE_INDICATOR_RETRY_LIMIT
        || !shouldConnectStream({ channelId, busy, routingStatus })
      ) {
        return;
      }

      reconnectAttempts += 1;
      closeSource();
      clearReconnectTimer();
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!disposed) {
          openSource();
        }
      }, LIVE_INDICATOR_RETRY_DELAY_MS);
    }

    function handleEvent(e: MessageEvent): void {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(e.data as string) as Record<string, unknown>;
      } catch {
        return;
      }

      const streamCursorDecision = advanceSequencedLiveIndicatorStreamCursor(
        streamCursorRef.current,
        data,
      );
      if (!streamCursorDecision.accept) {
        traceBrowser('stream_event_deduped', {
          turnId: readTraceString(data.turnId),
          laneId: readTraceString(data.laneId),
          sourceMessageId: readTraceString(data.sourceMessageId),
          targetStateId: readTraceString(data.targetStateId),
          sessionId: readTraceString(data.sessionId),
          participantId: readTraceString(data.participantId),
          catId: readTraceString(data.catId),
          speakerLabel: readTraceString(data.speakerLabel),
          reason: 'stale_replayed_event',
          details: {
            eventType: (data.type as string) ?? e.type,
            streamSeq: typeof data.streamSeq === 'number' ? data.streamSeq : null,
            streamSeqIndex: typeof data.streamSeqIndex === 'number' ? data.streamSeqIndex : null,
          },
        });
        return;
      }
      streamCursorRef.current = streamCursorDecision.cursor;

      reconnectAttempts = 0;

      const eventType = (data.type as string) ?? e.type;
      const waitingState = createCurrentWaitingState();
      const shouldRetrySessionClose = eventType === 'session_closed'
        && shouldConnectStream({ channelId, busy, routingStatus });
      const primarySegment = resolvePrimaryLiveIndicatorSegment(stateRef.current);
      const shouldReconnectFollowupTarget = shouldRetrySessionClose
        && shouldReconnectLiveIndicatorAfterSessionClose(stateRef.current, waitingState);
      const shouldReconnectOngoingWorkflow = shouldRetrySessionClose
        && shouldReconnectLiveIndicatorAfterOngoingWorkflow(
          stateRef.current,
          selectedChannelRef.current,
        );
      const shouldPinReplyCommit = shouldRetrySessionClose
        && shouldPinLiveIndicatorUntilPersistedReply(stateRef.current, selectedChannelRef.current);
      const shouldIgnoreSealedBoundary = shouldRetrySessionClose
        && shouldIgnoreSealedSessionClose(stateRef.current, waitingState)
        && !shouldReconnectOngoingWorkflow;

      traceBrowser('stream_event', {
        turnId: readTraceString(data.turnId),
        laneId: readTraceString(data.laneId),
        sourceMessageId: readTraceString(data.sourceMessageId),
        targetStateId: readTraceString(data.targetStateId),
        sessionId: readTraceString(data.sessionId),
        participantId: readTraceString(data.participantId),
        catId: readTraceString(data.catId),
        speakerLabel: readTraceString(data.speakerLabel),
        reason: shouldRetrySessionClose ? 'session_close_reconnect' : null,
        details: {
          eventType,
          busy,
          routingStatus,
        },
      });

      updateIndicatorState((previous) => {
        if (!previous.active) {
          return previous;
        }
        if (shouldRetrySessionClose) {
          if (shouldIgnoreSealedBoundary) {
            traceBrowser('stream_session_close_ignored', {
              turnId: readTraceString(data.turnId),
              laneId: previous.laneId,
              sourceMessageId: previous.sourceMessageId,
              targetStateId: previous.targetStateId,
              participantId: previous.participantId,
              catId: previous.catId,
              speakerLabel: previous.speakerLabel,
              reason: 'sealed_segment_already_completed',
            });
            return previous;
          }
          if (shouldPinReplyCommit) {
            traceBrowser('stream_reply_commit_pending', {
              turnId: readTraceString(data.turnId),
              laneId: previous.laneId,
              sourceMessageId: previous.sourceMessageId,
              targetStateId: previous.targetStateId,
              participantId: previous.participantId,
              catId: previous.catId,
              speakerLabel: previous.speakerLabel,
              reason: 'pin_until_persisted_reply',
            });
            return previous;
          }
          if (!shouldReconnectFollowupTarget && !shouldReconnectOngoingWorkflow) {
            traceBrowser('stream_session_close_no_followup', {
              turnId: readTraceString(data.turnId),
              laneId: previous.laneId,
              sourceMessageId: previous.sourceMessageId,
              targetStateId: previous.targetStateId,
              participantId: previous.participantId,
              catId: previous.catId,
              speakerLabel: previous.speakerLabel,
              reason: 'no_distinct_followup_target',
            });
            return previous;
          }
          if (!shouldReconnectFollowupTarget) {
            traceBrowser('stream_session_close_reconnect', {
              turnId: readTraceString(data.turnId),
              laneId: previous.laneId,
              sourceMessageId: previous.sourceMessageId,
              targetStateId: previous.targetStateId,
              participantId: previous.participantId,
              catId: previous.catId,
              speakerLabel: previous.speakerLabel,
              reason: 'ongoing_workflow_boundary',
            });
            return previous;
          }
          const nextSpeakerState = resolveLiveIndicatorSpeakerState(waitingState, data);
          traceBrowser('stream_waiting_restart', {
            turnId: readTraceString(data.turnId),
            laneId: nextSpeakerState.laneId,
            sourceMessageId: nextSpeakerState.sourceMessageId,
            targetStateId: nextSpeakerState.targetStateId,
            participantId: readTraceString(data.participantId),
            catId: nextSpeakerState.catId,
            speakerLabel: nextSpeakerState.speakerLabel,
            reason: 'session_close_reconnect',
          });
          return mergeWaitingIndicatorTimelineState(previous, waitingState);
        }
        return applyLiveIndicatorEvent(previous, eventType, data);
      });

      if (
        shouldRetrySessionClose
        && !shouldIgnoreSealedBoundary
        && (shouldReconnectFollowupTarget || shouldReconnectOngoingWorkflow)
      ) {
        scheduleReconnect();
      }
    }

    function openSource(): void {
      if (disposed || !shouldConnectStream({ channelId, busy, routingStatus })) {
        return;
      }

      closeSource();
      const source = new EventSource(`/api/channels/${channelId}/stream`);
      sourceRef.current = source;
      traceBrowser('stream_connect', {
        turnId: activeTurn?.id ?? null,
        laneId: waitingIndicatorInputsRef.current.laneId,
        sourceMessageId: waitingIndicatorInputsRef.current.sourceMessageId,
        targetStateId: waitingIndicatorInputsRef.current.targetStateId,
        reason: 'open_source',
        details: {
          busy,
          routingStatus,
        },
      });

      source.addEventListener('progress', handleEvent);
      source.addEventListener('text', handleEvent);
      source.addEventListener('tool_use', handleEvent);
      source.addEventListener('tool_result', handleEvent);
      source.addEventListener('content_block', handleEvent);
      source.addEventListener('result', handleEvent);
      source.addEventListener('error', handleEvent);
      source.addEventListener('session_closed', handleEvent);
      source.onerror = () => {
        if (disposed || source !== sourceRef.current) {
          return;
        }
        const waitingState = createCurrentWaitingState();
        const shouldReconnectFollowupTarget = shouldReconnectLiveIndicatorAfterSessionClose(
          stateRef.current,
          waitingState,
        );
        const shouldReconnectOngoingWorkflow = shouldReconnectLiveIndicatorAfterOngoingWorkflow(
          stateRef.current,
          selectedChannelRef.current,
        );
        const shouldReconnectAfterSourceTermination = shouldReconnectFollowupTarget
          || shouldReconnectOngoingWorkflow
          || shouldReconnectLiveIndicatorAfterSourceError(
            stateRef.current,
            selectedChannelRef.current,
          );
        if (!shouldReconnectAfterSourceTermination) {
          traceBrowser('stream_source_error_ignored', {
            turnId: selectedChannelRef.current?.roomRouting.workflow.activeTurn?.id ?? null,
            laneId: stateRef.current.laneId,
            sourceMessageId: stateRef.current.sourceMessageId,
            targetStateId: stateRef.current.targetStateId,
            participantId: stateRef.current.participantId,
            catId: stateRef.current.catId,
            speakerLabel: stateRef.current.speakerLabel,
            reason: 'reply_commit_or_sealed_segment',
            details: {
              phase: resolvePrimaryLiveIndicatorSegment(stateRef.current)?.phase ?? null,
            },
          });
          closeSource();
          return;
        }
        if (shouldReconnectFollowupTarget) {
          updateIndicatorState((previous) => mergeWaitingIndicatorTimelineState(previous, waitingState));
        }
        traceBrowser('stream_source_error', {
          turnId: selectedChannelRef.current?.roomRouting.workflow.activeTurn?.id ?? null,
          laneId: shouldReconnectFollowupTarget
            ? waitingIndicatorInputsRef.current.laneId
            : stateRef.current.laneId,
          sourceMessageId: shouldReconnectFollowupTarget
            ? waitingIndicatorInputsRef.current.sourceMessageId
            : stateRef.current.sourceMessageId,
          targetStateId: shouldReconnectFollowupTarget
            ? waitingIndicatorInputsRef.current.targetStateId
            : stateRef.current.targetStateId,
          reason: shouldReconnectFollowupTarget
            ? 'eventsource_terminated_followup_handoff'
            : shouldReconnectOngoingWorkflow
              ? 'eventsource_terminated_running_workflow'
            : 'eventsource_terminated',
          details: {
            busy,
            routingStatus,
          },
        });
        closeSource();
        scheduleReconnect();
      };
    }

    if (!shouldShowWaiting) {
      clearReconnectTimer();
      closeSource();
      if (shouldPinLiveIndicatorUntilPersistedReply(stateRef.current, selectedChannelRef.current)) {
        traceBrowser('indicator_pin_pending_reply', {
          turnId: selectedChannelRef.current?.roomRouting.workflow.activeTurn?.id ?? null,
          laneId: stateRef.current.laneId,
          sourceMessageId: stateRef.current.sourceMessageId,
          targetStateId: stateRef.current.targetStateId,
          participantId: stateRef.current.participantId,
          catId: stateRef.current.catId,
          speakerLabel: stateRef.current.speakerLabel,
          reason: 'waiting_not_needed_but_reply_not_persisted',
          details: {
            phase: resolvePrimaryLiveIndicatorSegment(stateRef.current)?.phase ?? null,
          },
        });
        return undefined;
      }
      traceBrowser('indicator_reset', {
        turnId: activeTurn?.id ?? null,
        laneId: waitingIndicatorInputsRef.current.laneId,
        sourceMessageId: waitingIndicatorInputsRef.current.sourceMessageId,
        targetStateId: waitingIndicatorInputsRef.current.targetStateId,
        reason: 'waiting_not_needed',
        details: {
          busy,
          routingStatus,
        },
        signature: `indicator_reset::${channelId ?? ''}::${busy}::${routingStatus ?? ''}`,
      });
      stateRef.current = EMPTY_LIVE_INDICATOR;
      setState(EMPTY_LIVE_INDICATOR);
      return undefined;
    }

    const waitingState = createCurrentWaitingState();
    if (previousChannelId !== channelId) {
      streamCursorRef.current = null;
    }
    setState((previous) => {
      const next = resolveWaitingIndicatorStateTransition({
        previous,
        waitingState,
        selectedChannel: selectedChannelRef.current,
        previousChannelId,
        channelId,
      });
      stateRef.current = next;
      return next;
    });
    traceBrowser('waiting_started', {
      turnId: activeTurn?.id ?? null,
      laneId: waitingIndicatorInputs.laneId,
      sourceMessageId: waitingIndicatorInputs.sourceMessageId,
      targetStateId: waitingIndicatorInputs.targetStateId,
      participantId: waitingIndicatorInputs.revealIdentity
        ? waitingIndicatorInputs.participantId
        : null,
      catId: waitingIndicatorInputs.revealIdentity
        ? waitingIndicatorInputs.catId
        : waitingIndicatorInputs.defaultRecipientCatId,
      speakerLabel: waitingIndicatorInputs.revealIdentity
        ? waitingIndicatorInputs.speakerLabel
        : waitingIndicatorInputs.fallbackSpeakerLabel,
      reason: shouldConnectStream({ channelId, busy, routingStatus })
        ? 'awaiting_stream_attach'
        : 'waiting_without_stream',
      details: {
        busy,
        routingStatus,
      },
    });

    if (!shouldConnectStream({ channelId, busy, routingStatus })) {
      clearReconnectTimer();
      closeSource();
      return undefined;
    }

    openSource();

    return () => {
      disposed = true;
      clearReconnectTimer();
      closeSource();
    };
  }, [
    busy,
    channelId,
    debugTraceEnabled,
    routingStatus,
    shouldConnectStream,
    shouldShowWaitingIndicator,
  ]);

  useEffect(() => {
    const shouldShowWaiting = shouldShowWaitingIndicator({
      channelId,
      busy,
      routingStatus,
    });
    if (!shouldShowWaiting) {
      return;
    }

    const waitingState = createCurrentWaitingState();
    setState((previous) => {
      if (
        shouldPromoteStreamingBubbleToWaitingSpeaker(
          previous,
          waitingState,
          selectedChannelRef.current,
        )
      ) {
        const next = mergeWaitingIndicatorTimelineState(previous, waitingState);
        stateRef.current = next;
        return next;
      }

      if (
        shouldPromoteSealedBubbleToWaitingSpeaker(
          previous,
          waitingState,
          selectedChannelRef.current,
        )
      ) {
        const next = mergeWaitingIndicatorTimelineState(previous, waitingState);
        stateRef.current = next;
        return next;
      }

      if (!previous.active || previous.phase !== 'waiting') {
        return previous;
      }

      const next = replaceWaitingIndicatorTimelineIdentity(previous, waitingState);
      stateRef.current = next;
      return next;
    });
  }, [
    busy,
    channelId,
    routingStatus,
    selectedChannel,
    shouldShowWaitingIndicator,
    waitingIndicatorInputs,
  ]);

  return state;
}

function readTraceString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

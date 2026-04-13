import {
  normalizeRuntimeContentBlock,
  type LiveIndicatorContentBlock,
} from './runtimeContentBlocks.js';
import { isBrowserLiveTraceEnabled, pushBrowserLiveTrace } from './liveTrace.js';
export type { LiveIndicatorContentBlock } from './runtimeContentBlocks.js';

export interface LiveToolEntry {
  toolName: string;
  toolId: string;
  done: boolean;
}

export interface LiveIndicatorEventEntry {
  eventType: 'progress' | 'text' | 'tool_use' | 'tool_result' | 'result' | 'error';
  label: string;
  text: string;
  tone: 'default' | 'active' | 'success' | 'error';
  kind: string | null;
  toolName: string | null;
  toolId: string | null;
}

export type LiveIndicatorSegmentPhase = 'waiting' | 'streaming' | 'sealed';

export interface LiveIndicatorSegmentState {
  id: string;
  phase: LiveIndicatorSegmentPhase;
  targetStateId: string | null;
  segmentIndex: number;
  participantId: string | null;
  catId: string | null;
  activeCatIds: string[];
  catName: string | null;
  speakerLabel: string | null;
  sessionStartedAt: string | null;
  requiresSessionStartConfirmation: boolean;
  progressText: string;
  progressKind: string | null;
  tools: LiveToolEntry[];
  contentBlocks: LiveIndicatorContentBlock[];
  events: LiveIndicatorEventEntry[];
}

export interface LiveIndicatorState {
  active: boolean;
  phase: 'idle' | LiveIndicatorSegmentPhase;
  targetStateId: string | null;
  segmentIndex: number;
  participantId: string | null;
  catId: string | null;
  activeCatIds: string[];
  catName: string | null;
  speakerLabel: string | null;
  sessionStartedAt: string | null;
  requiresSessionStartConfirmation: boolean;
  progressText: string;
  progressKind: string | null;
  tools: LiveToolEntry[];
  contentBlocks: LiveIndicatorContentBlock[];
  events: LiveIndicatorEventEntry[];
  segments: LiveIndicatorSegmentState[];
}

export interface LiveIndicatorTranscriptMessageLike {
  id: string;
  channelId?: string;
  senderKind: string;
  senderName?: string;
  metadata?: Record<string, unknown> | null | undefined;
  createdAt: string;
}

const MAX_LIVE_INDICATOR_BLOCKS = 12;
const MAX_LIVE_INDICATOR_EVENTS = 8;
const MAX_EVENT_TEXT = 220;

export const EMPTY_LIVE_INDICATOR: LiveIndicatorState = {
  active: false,
  phase: 'idle',
  targetStateId: null,
  segmentIndex: 0,
  participantId: null,
  catId: null,
  activeCatIds: [],
  catName: null,
  speakerLabel: null,
  sessionStartedAt: null,
  requiresSessionStartConfirmation: false,
  progressText: '',
  progressKind: null,
  tools: [],
  contentBlocks: [],
  events: [],
  segments: [],
};

function buildLiveIndicatorSegmentId(input: {
  targetStateId: string | null;
  participantId: string | null;
  catId: string | null;
  speakerLabel: string | null;
  segmentIndex: number;
}): string {
  const identity = input.targetStateId
    ?? input.participantId
    ?? input.catId
    ?? readString(input.speakerLabel)
    ?? 'anonymous';
  return `${identity}:segment:${input.segmentIndex}`;
}

export function createLiveIndicatorSegmentState(input: {
  phase: LiveIndicatorSegmentPhase;
  targetStateId?: string | null;
  segmentIndex?: number;
  participantId?: string | null;
  catId?: string | null;
  activeCatIds?: string[];
  catName?: string | null;
  speakerLabel?: string | null;
  sessionStartedAt?: string | null;
  requiresSessionStartConfirmation?: boolean;
  progressText?: string;
  progressKind?: string | null;
  tools?: LiveToolEntry[];
  contentBlocks?: LiveIndicatorContentBlock[];
  events?: LiveIndicatorEventEntry[];
  id?: string | null;
}): LiveIndicatorSegmentState {
  const catId = input.catId ?? null;
  const segmentIndex = input.segmentIndex ?? 0;
  const activeCatIds = input.activeCatIds?.filter((id) => id.trim().length > 0)
    ?? (catId ? [catId] : []);
  return {
    id: input.id?.trim() || buildLiveIndicatorSegmentId({
      targetStateId: input.targetStateId ?? null,
      participantId: input.participantId ?? null,
      catId,
      speakerLabel: input.speakerLabel ?? null,
      segmentIndex,
    }),
    phase: input.phase,
    targetStateId: input.targetStateId ?? null,
    segmentIndex,
    participantId: input.participantId ?? null,
    catId,
    activeCatIds,
    catName: input.catName ?? null,
    speakerLabel: input.speakerLabel ?? null,
    sessionStartedAt: input.sessionStartedAt ?? null,
    requiresSessionStartConfirmation: input.requiresSessionStartConfirmation === true,
    progressText: input.progressText ?? '',
    progressKind: input.progressKind ?? null,
    tools: input.tools ?? [],
    contentBlocks: input.contentBlocks ?? [],
    events: input.events ?? [],
  };
}

export function resolvePrimaryLiveIndicatorSegment(
  liveIndicator: LiveIndicatorState | null | undefined,
): LiveIndicatorSegmentState | null {
  const segments = resolveLiveIndicatorSegments(liveIndicator);
  if (!liveIndicator?.active || segments.length === 0) {
    return null;
  }

  return segments.at(-1) ?? null;
}

export function resolveLiveIndicatorSegments(
  liveIndicator: LiveIndicatorState | null | undefined,
): LiveIndicatorSegmentState[] {
  if (!liveIndicator?.active) {
    return [];
  }

  if (liveIndicator.segments.length > 0) {
    return liveIndicator.segments;
  }

  if (liveIndicator.phase === 'idle') {
    return [];
  }

  return [
    createLiveIndicatorSegmentState({
      phase: liveIndicator.phase,
      targetStateId: liveIndicator.targetStateId,
      segmentIndex: liveIndicator.segmentIndex,
      participantId: liveIndicator.participantId,
      catId: liveIndicator.catId,
      activeCatIds: liveIndicator.activeCatIds,
      catName: liveIndicator.catName,
      speakerLabel: liveIndicator.speakerLabel,
      sessionStartedAt: liveIndicator.sessionStartedAt,
      requiresSessionStartConfirmation: liveIndicator.requiresSessionStartConfirmation,
      progressText: liveIndicator.progressText,
      progressKind: liveIndicator.progressKind,
      tools: liveIndicator.tools,
      contentBlocks: liveIndicator.contentBlocks,
      events: liveIndicator.events,
    }),
  ];
}

export function projectLiveIndicatorStateFromSegments(
  segments: ReadonlyArray<LiveIndicatorSegmentState>,
  active = segments.length > 0,
): LiveIndicatorState {
  const normalizedSegments = [...segments];
  const primary = normalizedSegments.at(-1) ?? null;
  if (!primary || !active) {
    return EMPTY_LIVE_INDICATOR;
  }

  return {
    active: true,
    phase: primary.phase,
    targetStateId: primary.targetStateId,
    segmentIndex: primary.segmentIndex,
    participantId: primary.participantId,
    catId: primary.catId,
    activeCatIds: primary.activeCatIds,
    catName: primary.catName,
    speakerLabel: primary.speakerLabel,
    sessionStartedAt: primary.sessionStartedAt,
    requiresSessionStartConfirmation: primary.requiresSessionStartConfirmation,
    progressText: primary.progressText,
    progressKind: primary.progressKind,
    tools: primary.tools,
    contentBlocks: primary.contentBlocks,
    events: primary.events,
    segments: normalizedSegments,
  };
}

function replacePrimaryLiveIndicatorSegment(
  previous: LiveIndicatorState,
  nextSegment: LiveIndicatorSegmentState,
): LiveIndicatorState {
  if (!previous.active || previous.segments.length === 0) {
    return projectLiveIndicatorStateFromSegments([nextSegment]);
  }

  return projectLiveIndicatorStateFromSegments([
    ...previous.segments.slice(0, -1),
    nextSegment,
  ]);
}

function appendLiveIndicatorSegment(
  previous: LiveIndicatorState,
  nextSegment: LiveIndicatorSegmentState,
): LiveIndicatorState {
  const previousPrimary = resolvePrimaryLiveIndicatorSegment(previous);
  if (!previousPrimary) {
    return projectLiveIndicatorStateFromSegments([nextSegment]);
  }

  const sealedPrimary = previousPrimary.phase === 'sealed'
    ? previousPrimary
    : {
        ...previousPrimary,
        phase: 'sealed' as const,
      };

  return projectLiveIndicatorStateFromSegments([
    ...previous.segments.slice(0, -1),
    sealedPrimary,
    nextSegment,
  ]);
}

function updatePrimaryLiveIndicatorSegment(
  previous: LiveIndicatorState,
  updater: (segment: LiveIndicatorSegmentState) => LiveIndicatorSegmentState,
): LiveIndicatorState {
  const primary = resolvePrimaryLiveIndicatorSegment(previous);
  if (!primary) {
    return previous;
  }

  return replacePrimaryLiveIndicatorSegment(previous, updater(primary));
}

function segmentHasTextContent(
  segment: LiveIndicatorSegmentState,
): boolean {
  return segment.contentBlocks.some(
    (block) => block.kind === 'text' && block.text.trim().length > 0,
  );
}

function segmentHasOnlySyntheticTextFallback(
  segment: LiveIndicatorSegmentState,
): boolean {
  return segment.contentBlocks.length > 0
    && segment.contentBlocks.every((block) => isSyntheticFallbackTextBlock(block));
}

function isSameLogicalContentBlock(
  left: Pick<LiveIndicatorContentBlock, 'id' | 'index' | 'kind'>,
  right: Pick<LiveIndicatorContentBlock, 'id' | 'index' | 'kind'>,
): boolean {
  return left.id === right.id || (left.index === right.index && left.kind === right.kind);
}

function segmentHasMaterializedContent(
  segment: LiveIndicatorSegmentState,
): boolean {
  return segment.contentBlocks.length > 0
    || segment.progressText.trim().length > 0
    || segment.events.length > 0
    || segment.tools.length > 0;
}

export function createWaitingLiveIndicatorState(input: {
  participantId?: string | null;
  catId: string | null;
  speakerLabel: string | null;
  revealIdentity?: boolean;
  targetStateId?: string | null;
  segmentIndex?: number;
}): LiveIndicatorState {
  const revealIdentity = input.revealIdentity === true;
  return projectLiveIndicatorStateFromSegments([
    createLiveIndicatorSegmentState({
      phase: 'waiting',
      // Target-state identity is internal routing state, not user-facing identity.
      // Keep it even for anonymous waiting bubbles so persisted segments can retire
      // the correct live segment once the reply lands.
      targetStateId: input.targetStateId ?? null,
      segmentIndex: input.segmentIndex ?? 0,
      participantId: revealIdentity ? input.participantId ?? null : null,
      catId: revealIdentity ? input.catId : null,
      speakerLabel: revealIdentity ? input.speakerLabel : null,
    }),
  ]);
}

export function resolveLiveIndicatorSpeakerState(
  previous: LiveIndicatorState,
  data: Record<string, unknown>,
): Pick<
  LiveIndicatorSegmentState,
  'targetStateId' | 'participantId' | 'catId' | 'activeCatIds' | 'speakerLabel'
> {
  const previousSegment = resolvePrimaryLiveIndicatorSegment(previous);
  const previousTargetStateId = previousSegment?.targetStateId ?? previous.targetStateId;
  const hasParticipantId = Object.prototype.hasOwnProperty.call(data, 'participantId');
  const hasCatId = Object.prototype.hasOwnProperty.call(data, 'catId');
  const hasSpeakerLabel = Object.prototype.hasOwnProperty.call(data, 'speakerLabel');
  const hasTargetStateId = Object.prototype.hasOwnProperty.call(data, 'targetStateId');
  const nextParticipantId = hasParticipantId
    ? readNullableString(data.participantId)
    : previousSegment?.participantId ?? previous.participantId;
  const nextCatId = hasCatId
    ? readNullableString(data.catId)
    : previousSegment?.catId ?? previous.catId;
  const nextSpeakerLabel = hasSpeakerLabel
    ? readNullableString(data.speakerLabel)
    : previousSegment?.speakerLabel ?? previous.speakerLabel;

  return {
    targetStateId: hasTargetStateId
      ? (readNullableString(data.targetStateId) ?? previousTargetStateId)
      : previousTargetStateId,
    participantId: nextParticipantId,
    catId: nextCatId,
    activeCatIds: nextCatId ? [nextCatId] : [],
    speakerLabel: nextSpeakerLabel,
  };
}

function resolveLiveIndicatorSessionState(
  previous: LiveIndicatorState,
  data: Record<string, unknown>,
): Pick<LiveIndicatorSegmentState, 'sessionStartedAt' | 'requiresSessionStartConfirmation'> {
  const previousSegment = resolvePrimaryLiveIndicatorSegment(previous);
  const hasSessionStartedAt = Object.prototype.hasOwnProperty.call(data, 'sessionStartedAt');
  const hasSessionStartConfirmation = Object.prototype.hasOwnProperty.call(
    data,
    'requiresSessionStartConfirmation',
  );

  return {
    sessionStartedAt: hasSessionStartedAt
      ? readNullableString(data.sessionStartedAt)
      : previousSegment?.sessionStartedAt ?? previous.sessionStartedAt,
    requiresSessionStartConfirmation: hasSessionStartConfirmation
      ? data.requiresSessionStartConfirmation === true
      : previousSegment?.requiresSessionStartConfirmation
        ?? previous.requiresSessionStartConfirmation,
  };
}

export function applyLiveIndicatorEvent(
  previous: LiveIndicatorState,
  eventType: string,
  data: Record<string, unknown>,
): LiveIndicatorState {
  if (!previous.active) {
    return previous;
  }

  const nextState = prepareLiveIndicatorStateForEvent(previous, eventType, data);

  switch (eventType) {
    case 'progress':
      return applyProgressEvent(nextState, data);
    case 'text':
      return applyTextEvent(nextState, data);
    case 'tool_use':
      return applyToolUseEvent(nextState, data);
    case 'tool_result':
      return applyToolResultEvent(nextState, data);
    case 'content_block':
      return applyContentBlockEvent(nextState, data);
    case 'result':
      return applyResultEvent(nextState);
    case 'session_closed': {
      const currentSegment = resolvePrimaryLiveIndicatorSegment(nextState);
      return currentSegment?.phase === 'waiting' ? nextState : applyResultEvent(nextState);
    }
    case 'error':
      return applyErrorEvent(nextState, data);
    default:
      return nextState;
  }
}

function shouldStartNewSegmentForEvent(
  previousSegment: LiveIndicatorSegmentState | null,
  nextSpeakerState: Pick<
    LiveIndicatorSegmentState,
    'targetStateId' | 'participantId' | 'catId' | 'speakerLabel'
  >,
  eventType: string,
  data: Record<string, unknown>,
): boolean {
  if (!previousSegment) {
    return false;
  }

  const identityChanged =
    previousSegment.targetStateId !== nextSpeakerState.targetStateId
    || previousSegment.participantId !== nextSpeakerState.participantId
    || previousSegment.catId !== nextSpeakerState.catId
    || previousSegment.speakerLabel !== nextSpeakerState.speakerLabel;
  if (previousSegment.phase === 'sealed') {
    if (eventType === 'content_block') {
      const block = normalizeRuntimeContentBlock(data);
      if (
        block
        && previousSegment.contentBlocks.some((candidate) => isSameLogicalContentBlock(candidate, block))
      ) {
        return false;
      }
    }
    return true;
  }

  if (identityChanged) {
    return segmentHasMaterializedContent(previousSegment);
  }

  if (previousSegment.phase === 'waiting' && !segmentHasMaterializedContent(previousSegment)) {
    return false;
  }

  if (previousSegment.phase === 'streaming' && !segmentHasMaterializedContent(previousSegment)) {
    return false;
  }

  switch (eventType) {
    case 'progress':
    case 'tool_use':
    case 'tool_result':
    case 'error':
      return segmentHasTextContent(previousSegment);
    case 'content_block': {
      const block = normalizeRuntimeContentBlock(data);
      if (!block) {
        return false;
      }
      if (block.kind === 'text') {
        if (segmentHasOnlySyntheticTextFallback(previousSegment)) {
          return false;
        }
        const hasSameBlock = previousSegment.contentBlocks.some(
          (candidate) => candidate.id === block.id,
        );
        return segmentHasTextContent(previousSegment) && !hasSameBlock;
      }
      return segmentHasTextContent(previousSegment);
    }
    default:
      return false;
  }
}

function createNextLiveIndicatorSegment(
  previousSegment: LiveIndicatorSegmentState | null,
  nextSpeakerState: Pick<
    LiveIndicatorSegmentState,
    'targetStateId' | 'participantId' | 'catId' | 'activeCatIds' | 'speakerLabel'
  >,
  nextSessionState: Pick<
    LiveIndicatorSegmentState,
    'sessionStartedAt' | 'requiresSessionStartConfirmation'
  >,
  phase: LiveIndicatorSegmentPhase,
): LiveIndicatorSegmentState {
  const sameTarget = previousSegment?.targetStateId != null
    && previousSegment.targetStateId === nextSpeakerState.targetStateId;
  return createLiveIndicatorSegmentState({
    phase,
    targetStateId: nextSpeakerState.targetStateId,
    segmentIndex: sameTarget ? previousSegment.segmentIndex + 1 : 0,
    participantId: nextSpeakerState.participantId,
    catId: nextSpeakerState.catId,
    activeCatIds: nextSpeakerState.activeCatIds,
    speakerLabel: nextSpeakerState.speakerLabel,
    sessionStartedAt: nextSessionState.sessionStartedAt,
    requiresSessionStartConfirmation: nextSessionState.requiresSessionStartConfirmation,
  });
}

function prepareLiveIndicatorStateForEvent(
  previous: LiveIndicatorState,
  eventType: string,
  data: Record<string, unknown>,
): LiveIndicatorState {
  const previousSegment = resolvePrimaryLiveIndicatorSegment(previous);
  const nextSpeakerState = resolveLiveIndicatorSpeakerState(previous, data);
  const nextSessionState = resolveLiveIndicatorSessionState(previous, data);

  if (
    shouldStartNewSegmentForEvent(
      previousSegment,
      nextSpeakerState,
      eventType,
      data,
    )
  ) {
    return appendLiveIndicatorSegment(
      previous,
      createNextLiveIndicatorSegment(
        previousSegment,
        nextSpeakerState,
        nextSessionState,
        eventType === 'session_closed' ? 'waiting' : 'streaming',
      ),
    );
  }

  if (!previousSegment) {
    return projectLiveIndicatorStateFromSegments([
      createNextLiveIndicatorSegment(null, nextSpeakerState, nextSessionState, 'waiting'),
    ]);
  }

  return updatePrimaryLiveIndicatorSegment(previous, (segment) => ({
    ...segment,
    ...nextSpeakerState,
    ...nextSessionState,
    id: buildLiveIndicatorSegmentId({
      targetStateId: nextSpeakerState.targetStateId,
      participantId: nextSpeakerState.participantId,
      catId: nextSpeakerState.catId,
      speakerLabel: nextSpeakerState.speakerLabel,
      segmentIndex: segment.segmentIndex,
    }),
  }));
}

export function buildLiveIndicatorScrollKey(
  liveIndicator: LiveIndicatorState | null | undefined,
): string {
  if (!liveIndicator) {
    return '';
  }

  const segments = resolveLiveIndicatorSegments(liveIndicator);
  return [
    liveIndicator.active ? '1' : '0',
    segments
      .map((segment) => [
        segment.id,
        segment.phase,
        segment.targetStateId ?? '',
        String(segment.segmentIndex),
        segment.participantId ?? '',
        segment.activeCatIds.join('|'),
        segment.catId ?? '',
        segment.speakerLabel ?? '',
        segment.sessionStartedAt ?? '',
        segment.requiresSessionStartConfirmation ? '1' : '0',
        segment.progressText ?? '',
        segment.tools
          .map((tool) => `${tool.toolId}:${tool.toolName}:${tool.done ? '1' : '0'}`)
          .join('|'),
        segment.contentBlocks
          .map((block) => [
            block.id,
            String(block.index),
            block.kind,
            block.status,
            block.title ?? '',
            block.text,
            block.toolId ?? '',
          ].join(':'))
          .join('|'),
        segment.events
          .map((event) => [
            event.eventType,
            event.label,
            event.text,
            event.tone,
            event.kind ?? '',
            event.toolId ?? '',
          ].join(':'))
          .join('|'),
      ].join('~'))
      .join('::'),
  ].join('::');
}

export function resolveVisibleLiveIndicator<TMessage extends LiveIndicatorTranscriptMessageLike>(
  liveIndicator: LiveIndicatorState | null | undefined,
  messages: ReadonlyArray<TMessage>,
  activeTurnUpdatedAt: string | null | undefined,
  sessionMessages: ReadonlyArray<TMessage> = messages,
): LiveIndicatorState | null {
  if (!liveIndicator?.active) {
    return liveIndicator ?? null;
  }

  const sourceSegments = resolveLiveIndicatorSegments(liveIndicator);
  const visibleSegments = sourceSegments.filter((segment, index) => {
    if (
      (segment.phase === 'waiting' || segment.phase === 'streaming')
      && segment.requiresSessionStartConfirmation
      && !hasConfirmedLiveIndicatorSessionStart(
        sessionMessages,
        projectLiveIndicatorStateFromSegments([segment]),
        segment.sessionStartedAt,
      )
    ) {
      return false;
    }
    if (hasVisiblePersistedSegment(messages, segment)) {
      return false;
    }
    if (
      index > 0
      && segment.contentBlocks.length === 0
      && sourceSegments.slice(0, index).some((s) => s.contentBlocks.length > 0)
    ) {
      return false;
    }
    return true;
  });

  if (visibleSegments.length === 0) {
    return null;
  }

  const normalizedVisibleIndicator = (
    visibleSegments.length === sourceSegments.length
    && liveIndicator.segments.length === 0
  )
    ? liveIndicator
    : projectLiveIndicatorStateFromSegments(visibleSegments);
  if (!activeTurnUpdatedAt) {
    return normalizedVisibleIndicator;
  }

  const activeTurnTimestamp = Date.parse(activeTurnUpdatedAt);
  if (Number.isNaN(activeTurnTimestamp)) {
    return normalizedVisibleIndicator;
  }

  const primarySegment = resolvePrimaryLiveIndicatorSegment(normalizedVisibleIndicator);
  if (primarySegment?.targetStateId && primarySegment.phase !== 'sealed') {
    traceLiveIndicatorVisibility({
      liveIndicator: normalizedVisibleIndicator,
      messages,
      activeTurnUpdatedAt,
      visible: true,
      reason: 'segment_timeline_visible',
      latestReplyTimestamp: Number.NEGATIVE_INFINITY,
    });
    return normalizedVisibleIndicator;
  }

  if (hasLiveIndicatorIdentity(normalizedVisibleIndicator)) {
    const latestSpeakerReplyTimestamp = resolveLatestVisibleReplyTimestamp(
      messages,
      (message) => doesMessageMatchLiveIndicatorSpeaker(message, normalizedVisibleIndicator),
    );
    const visible = latestSpeakerReplyTimestamp < activeTurnTimestamp;
    traceLiveIndicatorVisibility({
      liveIndicator: normalizedVisibleIndicator,
      messages,
      activeTurnUpdatedAt,
      visible,
      reason: visible ? 'speaker_still_streaming' : 'same_speaker_reply_visible',
      latestReplyTimestamp: latestSpeakerReplyTimestamp,
    });
    return visible ? normalizedVisibleIndicator : null;
  }

  const latestVisibleReplyTimestamp = resolveLatestVisibleReplyTimestamp(messages);
  const visible = latestVisibleReplyTimestamp < activeTurnTimestamp;
  traceLiveIndicatorVisibility({
    liveIndicator: normalizedVisibleIndicator,
    messages,
    activeTurnUpdatedAt,
    visible,
    reason: visible ? 'visible_before_identity' : 'reply_after_active_turn',
    latestReplyTimestamp: latestVisibleReplyTimestamp,
  });
  return visible ? normalizedVisibleIndicator : null;
}

export function resolveTranscriptFollowState<TMessage extends LiveIndicatorTranscriptMessageLike>(
  liveIndicator: LiveIndicatorState | null | undefined,
  messages: ReadonlyArray<TMessage>,
  activeTurnUpdatedAt: string | null | undefined,
  sessionMessages: ReadonlyArray<TMessage> = messages,
): {
  visibleLiveIndicator: LiveIndicatorState | null;
  transcriptScrollKey: string;
} {
  const visibleLiveIndicator = resolveVisibleLiveIndicator(
    liveIndicator,
    messages,
    activeTurnUpdatedAt,
    sessionMessages,
  );
  const lastMessage = messages.at(-1);

  return {
    visibleLiveIndicator,
    transcriptScrollKey: [
      messages.length,
      lastMessage?.id ?? '',
      lastMessage?.createdAt ?? '',
      buildLiveIndicatorScrollKey(visibleLiveIndicator),
    ].join('::'),
  };
}

function applyProgressEvent(
  previous: LiveIndicatorState,
  data: Record<string, unknown>,
): LiveIndicatorState {
  const text = summarizeEventText(data.text);
  const metadata = asRecord(data.metadata);
  const kind = typeof metadata?.kind === 'string' ? metadata.kind : null;
  if (!text) {
    return updatePrimaryLiveIndicatorSegment(previous, (segment) => ({
      ...segment,
      phase: 'streaming',
      ...(kind ? { progressKind: kind } : {}),
    }));
  }

  return updatePrimaryLiveIndicatorSegment(previous, (segment) => ({
    ...segment,
    phase: 'streaming',
    progressText: text,
    progressKind: kind,
    events: appendLiveIndicatorEvent(segment.events, {
      eventType: 'progress',
      label: progressLabel(kind),
      text,
      tone: kind === 'reasoning' ? 'default' : 'active',
      kind,
      toolName: null,
      toolId: null,
    }),
  }));
}

function applyTextEvent(
  previous: LiveIndicatorState,
  data: Record<string, unknown>,
): LiveIndicatorState {
  const textChunk = typeof data.text === 'string' ? data.text : '';
  const summarizedText = summarizeEventText(data.text);
  if (!textChunk && !summarizedText) {
    return updatePrimaryLiveIndicatorSegment(previous, (segment) => ({
      ...segment,
      phase: 'streaming',
    }));
  }

  return updatePrimaryLiveIndicatorSegment(previous, (segment) => ({
    ...segment,
    phase: 'streaming',
    progressText: '',
    progressKind: null,
    contentBlocks: synthesizeTextContentBlock(segment.contentBlocks, textChunk),
    events: summarizedText
      ? appendLiveIndicatorEvent(segment.events, {
        eventType: 'text',
        label: 'Text',
        text: summarizedText,
        tone: 'default',
        kind: 'text',
        toolName: null,
        toolId: null,
      })
      : segment.events,
  }));
}

function synthesizeTextContentBlock(
  contentBlocks: LiveIndicatorContentBlock[],
  textChunk: string,
): LiveIndicatorContentBlock[] {
  if (!textChunk) {
    return contentBlocks;
  }

  if (contentBlocks.some((block) => !isSyntheticFallbackTextBlock(block))) {
    return contentBlocks;
  }

  const lastBlock = contentBlocks.at(-1);
  if (lastBlock?.kind === 'text' && lastBlock.status === 'streaming') {
    return contentBlocks.map((block) =>
      block.id === lastBlock.id
        ? { ...block, text: block.text + textChunk }
        : block,
    );
  }

  const nextIndex = contentBlocks.length > 0
    ? Math.max(...contentBlocks.map((block) => block.index)) + 1
    : 0;

  return [
    ...contentBlocks,
    {
      id: `text:${nextIndex}`,
      index: nextIndex,
      kind: 'text' as const,
      status: 'streaming' as const,
      title: null,
      text: textChunk,
      toolName: null,
      toolId: null,
      metadata: {
        syntheticTextFallback: true,
      },
    },
  ].slice(-MAX_LIVE_INDICATOR_BLOCKS);
}

function isSyntheticFallbackTextBlock(
  block: LiveIndicatorContentBlock,
): boolean {
  return block.kind === 'text' && block.metadata?.syntheticTextFallback === true;
}

function applyToolUseEvent(
  previous: LiveIndicatorState,
  data: Record<string, unknown>,
): LiveIndicatorState {
  const toolName = readString(data.toolName) || 'tool';
  const toolId = readString(data.toolId);
  return updatePrimaryLiveIndicatorSegment(previous, (segment) => {
    const nextTools = appendPendingTool(segment.tools, {
      toolName,
      toolId: toolId || toolName,
    });

    return {
      ...segment,
      phase: 'streaming',
      tools: nextTools,
      events: appendLiveIndicatorEvent(segment.events, {
        eventType: 'tool_use',
        label: 'Tool',
        text: `Started ${toolName}`,
        tone: 'active',
        kind: 'tool',
        toolName,
        toolId: toolId || toolName,
      }),
    };
  });
}

function applyToolResultEvent(
  previous: LiveIndicatorState,
  data: Record<string, unknown>,
): LiveIndicatorState {
  const toolId = readString(data.toolId);
  const previousSegment = resolvePrimaryLiveIndicatorSegment(previous);
  const toolName = readString(data.toolName)
    || findToolName(previousSegment?.tools ?? [], toolId)
    || 'tool';
  const resultText = summarizeEventText(data.text);
  const isError = data.isError === true;
  const text = resultText
    ? `${isError ? 'Failed' : 'Completed'} ${toolName}: ${resultText}`
    : `${isError ? 'Failed' : 'Completed'} ${toolName}`;

  return updatePrimaryLiveIndicatorSegment(previous, (segment) => ({
    ...segment,
    phase: 'streaming',
    tools: markToolDone(segment.tools, toolId, toolName),
    events: appendLiveIndicatorEvent(segment.events, {
      eventType: 'tool_result',
      label: isError ? 'Tool Error' : 'Tool',
      text,
      tone: isError ? 'error' : 'success',
      kind: 'tool',
      toolName,
      toolId: toolId || toolName,
    }),
  }));
}

function applyResultEvent(previous: LiveIndicatorState): LiveIndicatorState {
  const primary = resolvePrimaryLiveIndicatorSegment(previous);
  const hasTextContent = primary
    ? primary.contentBlocks.some((block) => block.kind === 'text' && block.text.trim().length > 0)
    : false;
  const text = hasTextContent ? '' : (previous.progressText || 'Finalizing...');
  return updatePrimaryLiveIndicatorSegment(previous, (segment) => ({
    ...segment,
    phase: 'sealed',
    progressKind: hasTextContent ? null : 'finalizing',
    progressText: text,
    events: appendLiveIndicatorEvent(segment.events, {
      eventType: 'result',
      label: 'Result',
      text: 'Turn completed.',
      tone: 'success',
      kind: 'finalizing',
      toolName: null,
      toolId: null,
    }),
  }));
}

function applyContentBlockEvent(
  previous: LiveIndicatorState,
  data: Record<string, unknown>,
): LiveIndicatorState {
  const block = normalizeRuntimeContentBlock(data);
  if (!block) {
    return previous;
  }

  return updatePrimaryLiveIndicatorSegment(previous, (segment) => {
    const baseContentBlocks = block.kind === 'text' && segmentHasOnlySyntheticTextFallback(segment)
      ? []
      : segment.contentBlocks;
    const nextContentBlocks = [
      ...baseContentBlocks.filter((candidate) => !isSameLogicalContentBlock(candidate, block)),
      block,
    ]
      .sort((left, right) => left.index - right.index)
      .slice(-MAX_LIVE_INDICATOR_BLOCKS);

    return {
      ...segment,
      phase: segment.phase === 'sealed' ? 'sealed' : 'streaming',
      contentBlocks: nextContentBlocks,
    };
  });
}

function applyErrorEvent(
  previous: LiveIndicatorState,
  data: Record<string, unknown>,
): LiveIndicatorState {
  const text = summarizeEventText(data.text) || 'Finishing...';
  return updatePrimaryLiveIndicatorSegment(previous, (segment) => ({
    ...segment,
    phase: 'sealed',
    progressKind: 'error',
    progressText: text,
    events: appendLiveIndicatorEvent(segment.events, {
      eventType: 'error',
      label: 'Error',
      text,
      tone: 'error',
      kind: 'error',
      toolName: null,
      toolId: null,
    }),
  }));
}

function appendPendingTool(
  tools: LiveToolEntry[],
  next: Pick<LiveToolEntry, 'toolName' | 'toolId'>,
): LiveToolEntry[] {
  if (tools.some((tool) => tool.toolId === next.toolId && !tool.done)) {
    return tools;
  }

  return [...tools, { ...next, done: false }];
}

function markToolDone(
  tools: LiveToolEntry[],
  toolId: string | null,
  toolName: string,
): LiveToolEntry[] {
  let matched = false;
  const next = tools.map((tool) => {
    if (
      (toolId && tool.toolId === toolId)
      || (!toolId && !matched && tool.toolName === toolName && !tool.done)
    ) {
      matched = true;
      return { ...tool, done: true };
    }
    return tool;
  });

  if (!matched) {
    return [...next, { toolName, toolId: toolId || toolName, done: true }];
  }

  return next;
}

function findToolName(
  tools: LiveToolEntry[],
  toolId: string | null,
): string | null {
  if (!toolId) {
    return null;
  }
  return tools.find((tool) => tool.toolId === toolId)?.toolName ?? null;
}

function appendLiveIndicatorEvent(
  events: LiveIndicatorEventEntry[],
  next: LiveIndicatorEventEntry,
): LiveIndicatorEventEntry[] {
  if (!next.text) {
    return events;
  }

  const previous = events.at(-1);
  if (
    previous
    && previous.eventType === next.eventType
    && previous.text === next.text
    && previous.toolId === next.toolId
  ) {
    return events;
  }

  if (previous && previous.eventType === 'text' && next.eventType === 'text') {
    const mergedText = summarizeEventText(`${previous.text} ${next.text}`);
    const merged = {
      ...previous,
      text: mergedText,
    } satisfies LiveIndicatorEventEntry;
    return trimLiveIndicatorEvents([...events.slice(0, -1), merged]);
  }

  return trimLiveIndicatorEvents([...events, next]);
}

function trimLiveIndicatorEvents(
  events: LiveIndicatorEventEntry[],
): LiveIndicatorEventEntry[] {
  if (events.length <= MAX_LIVE_INDICATOR_EVENTS) {
    return events;
  }
  return events.slice(events.length - MAX_LIVE_INDICATOR_EVENTS);
}

function progressLabel(kind: string | null): string {
  switch (kind) {
    case 'tool':
      return 'Tool';
    case 'reasoning':
      return 'Reasoning';
    case 'plan':
      return 'Plan';
    case 'command':
      return 'Command';
    case 'files':
      return 'Files';
    case 'model_state':
      return 'Model';
    case 'session':
      return 'Session';
    default:
      return 'Progress';
  }
}

function summarizeEventText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const singleLine = value.replace(/\s+/g, ' ').trim();
  if (!singleLine) {
    return '';
  }
  return singleLine.length > MAX_EVENT_TEXT
    ? `${singleLine.slice(0, MAX_EVENT_TEXT - 1)}…`
    : singleLine;
}

export function hasVisibleAssistantReplyAfterMessage<TMessage extends {
  id: string;
  senderKind: string;
}>(
  messages: ReadonlyArray<TMessage>,
  messageId: string,
): boolean {
  const sourceIndex = messages.findIndex((message) => message.id === messageId);
  if (sourceIndex === -1) {
    return false;
  }

  return messages.slice(sourceIndex + 1).some((message) =>
    message.senderKind === 'agent' || message.senderKind === 'orchestrator');
}

export function hasVisibleLiveIndicatorSpeakerReplyAfterMessage<
  TMessage extends LiveIndicatorTranscriptMessageLike,
>(
  messages: ReadonlyArray<TMessage>,
  messageId: string,
  liveIndicator: LiveIndicatorState,
): boolean {
  const sourceIndex = messages.findIndex((message) => message.id === messageId);
  if (sourceIndex === -1) {
    return false;
  }

  return messages.slice(sourceIndex + 1).some((message) =>
    isVisibleAssistantReply(message) && doesMessageMatchLiveIndicatorSpeaker(message, liveIndicator));
}

export function hasVisibleSessionStartAfterMessage<TMessage extends {
  id: string;
  senderKind: string;
  metadata?: Record<string, unknown> | null | undefined;
}>(
  messages: ReadonlyArray<TMessage>,
  messageId: string,
): boolean {
  const sourceIndex = messages.findIndex((message) => message.id === messageId);
  if (sourceIndex === -1) {
    return false;
  }

  return messages.slice(sourceIndex + 1).some((message) => {
    if (message.senderKind !== 'system') {
      return false;
    }
    const metadata = asRecord(message.metadata);
    return readString(metadata?.event) === 'session_started';
  });
}

function resolveLatestVisibleReplyTimestamp<TMessage extends LiveIndicatorTranscriptMessageLike>(
  messages: ReadonlyArray<TMessage>,
  predicate?: (message: TMessage) => boolean,
): number {
  return messages.reduce((latestTimestamp, message) => {
    if (!isVisibleAssistantReply(message) || (predicate && !predicate(message))) {
      return latestTimestamp;
    }

    const messageTimestamp = Date.parse(message.createdAt);
    if (Number.isNaN(messageTimestamp)) {
      return latestTimestamp;
    }

    return Math.max(latestTimestamp, messageTimestamp);
  }, Number.NEGATIVE_INFINITY);
}

function isVisibleAssistantReply(
  message: LiveIndicatorTranscriptMessageLike,
): boolean {
  return message.senderKind !== 'user' && message.senderKind !== 'system';
}

export function hasLiveIndicatorIdentity(
  liveIndicator: LiveIndicatorState | null | undefined,
): boolean {
  if (!liveIndicator?.active) {
    return false;
  }

  return Boolean(
    readString(liveIndicator.participantId)
    || readString(liveIndicator.speakerLabel)
    || liveIndicator.catId
    || liveIndicator.activeCatIds.some((id) => id.trim().length > 0)
  );
}

function doesMessageMatchLiveIndicatorSpeaker(
  message: LiveIndicatorTranscriptMessageLike,
  liveIndicator: LiveIndicatorState,
): boolean {
  const messageTargetId = readMessageTargetId(message);
  const liveTargetId = readString(liveIndicator.participantId)
    ?? liveIndicator.catId
    ?? liveIndicator.activeCatIds.find((id) => id.trim().length > 0)
    ?? null;
  if (messageTargetId && liveTargetId && messageTargetId === liveTargetId) {
    return true;
  }

  const liveSpeakerLabel = readString(liveIndicator.speakerLabel);
  if (!liveSpeakerLabel) {
    return false;
  }

  return readString(message.senderName) === liveSpeakerLabel
    || readMessageExecutionLabelSnapshot(message) === liveSpeakerLabel;
}

function hasConfirmedLiveIndicatorSessionStart<TMessage extends LiveIndicatorTranscriptMessageLike>(
  messages: ReadonlyArray<TMessage>,
  liveIndicator: LiveIndicatorState,
  sessionStartedAt: string | null,
): boolean {
  const sessionStartFloorTimestamp = (() => {
    if (!sessionStartedAt) {
      return null;
    }

    const timestamp = Date.parse(sessionStartedAt);
    return Number.isNaN(timestamp) ? null : timestamp;
  })();

  return messages.some((message) => {
    if (readMessageEvent(message) !== 'session_started') {
      return false;
    }

    const messageTimestamp = Date.parse(message.createdAt);
    if (
      Number.isNaN(messageTimestamp)
      || (
        sessionStartFloorTimestamp != null
        && messageTimestamp < sessionStartFloorTimestamp
      )
    ) {
      return false;
    }

    const liveParticipantId = readString(liveIndicator.participantId);
    if (liveParticipantId) {
      const messageTargetId = readMessageTargetId(message);
      if (messageTargetId) {
        return messageTargetId === liveParticipantId;
      }

      if (liveParticipantId === 'orchestrator') {
        return readMessageTargetKind(message) === 'orchestrator';
      }

      return false;
    }

    return readMessageTargetKind(message) === 'orchestrator';
  });
}

function traceLiveIndicatorVisibility<TMessage extends LiveIndicatorTranscriptMessageLike>(input: {
  liveIndicator: LiveIndicatorState;
  messages: ReadonlyArray<TMessage>;
  activeTurnUpdatedAt: string;
  visible: boolean;
  reason: string;
  latestReplyTimestamp: number;
}): void {
  if (!isBrowserLiveTraceEnabled()) {
    return;
  }

  const lastMessage = input.messages.at(-1);
  pushBrowserLiveTrace({
    event: 'visibility_decision',
    channelId: lastMessage?.channelId ?? null,
    speakerLabel: input.liveIndicator.speakerLabel,
    participantId: input.liveIndicator.participantId,
    catId: input.liveIndicator.catId,
    activeTurnUpdatedAt: input.activeTurnUpdatedAt,
    visible: input.visible,
    reason: input.reason,
    details: {
      phase: input.liveIndicator.phase,
      lastMessageId: lastMessage?.id ?? null,
      latestReplyAt:
        Number.isFinite(input.latestReplyTimestamp) && input.latestReplyTimestamp > Number.NEGATIVE_INFINITY
          ? new Date(input.latestReplyTimestamp).toISOString()
          : null,
    },
    signature: [
      input.liveIndicator.phase,
      input.liveIndicator.participantId ?? '',
      input.liveIndicator.speakerLabel ?? '',
      input.liveIndicator.catId ?? '',
      input.activeTurnUpdatedAt,
      input.visible ? '1' : '0',
      input.reason,
      lastMessage?.id ?? '',
    ].join('::'),
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readMessageTargetId(
  message: LiveIndicatorTranscriptMessageLike,
): string | null {
  const metadata = asRecord(message.metadata);
  return readString(metadata?.targetId)
    || readString(metadata?.sourceRefId)
    || readString(metadata?.participantId);
}

function readMessageTargetStateId(
  message: LiveIndicatorTranscriptMessageLike,
): string | null {
  const metadata = asRecord(message.metadata);
  return readString(metadata?.targetStateId);
}

function readMessageTargetKind(
  message: LiveIndicatorTranscriptMessageLike,
): string | null {
  const metadata = asRecord(message.metadata);
  return readString(metadata?.targetKind);
}

function readMessageEvent(
  message: LiveIndicatorTranscriptMessageLike,
): string | null {
  const metadata = asRecord(message.metadata);
  return readString(metadata?.event);
}

function readMessageSegmentIndex(
  message: LiveIndicatorTranscriptMessageLike,
): number | null {
  const metadata = asRecord(message.metadata);
  return typeof metadata?.segmentIndex === 'number' && Number.isFinite(metadata.segmentIndex)
    ? metadata.segmentIndex
    : null;
}

function readMessageExecutionLabelSnapshot(
  message: LiveIndicatorTranscriptMessageLike,
): string | null {
  const metadata = asRecord(message.metadata);
  return readString(metadata?.executionLabelSnapshot);
}

function hasVisiblePersistedSegment<TMessage extends LiveIndicatorTranscriptMessageLike>(
  messages: ReadonlyArray<TMessage>,
  segment: LiveIndicatorSegmentState,
): boolean {
  if (segment.targetStateId) {
    const exactMatch = messages.some((message) =>
      isVisibleAssistantReply(message)
      && readMessageEvent(message) === 'assistant_turn_segment'
      && readMessageTargetStateId(message) === segment.targetStateId
      && readMessageSegmentIndex(message) === segment.segmentIndex);
    if (exactMatch) {
      return true;
    }
    if (segment.segmentIndex > 0) {
      return messages.some((message) =>
        isVisibleAssistantReply(message)
        && readMessageEvent(message) === 'assistant_turn_segment'
        && readMessageTargetStateId(message) === segment.targetStateId
        && readMessageSegmentIndex(message) === 0);
    }
    return false;
  }

  if (segment.phase === 'sealed' && segment.participantId) {
    return messages.some((message) =>
      isVisibleAssistantReply(message)
      && readMessageEvent(message) === 'assistant_turn_segment'
      && readMessageSegmentIndex(message) === segment.segmentIndex
      && readMessageTargetId(message) === segment.participantId);
  }

  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]!.senderKind === 'user') { lastUserIndex = i; break; }
  }
  return messages.some((message, index) =>
    index > lastUserIndex
    && isVisibleAssistantReply(message)
    && readMessageEvent(message) === 'assistant_turn_segment'
    && readMessageSegmentIndex(message) === segment.segmentIndex);
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function readNullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return readString(value);
}

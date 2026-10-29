import { ConversationContentBlock, ConversationSegmentBody, ConversationResponse } from '@cats-inc/platform-ui-web';
import { sanitizeConversationBlock } from '../../../../../shared/conversationPresentation.js';
import type { CSSProperties } from 'react';

import type {
  ChatCat,
  ConcurrentChatPresentationMode,
} from '../../../api/workspaceContracts.js';
import type {
  LiveIndicatorSegmentState,
} from '../../hooks/useLiveIndicator.js';
import type { LiveIndicatorContentBlock } from '../../../../../shared/runtimeContentBlocks.js';
import { catInitials } from '../../workspaceChatUtils.js';
import { normalizeVisibleOrchestratorLabel } from '../../../../../shared/orchestratorLabel.js';
import {
  messageKeys,
  t as enTranslator,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../../shared/i18n/index.js';
import {
  hasVisibleLiveIndicatorSegmentActivity,
} from '../../../../../shared/liveIndicator.js';
import { MessageBody } from '../MessageBody.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';
import {
  shouldRenderLiveTranscriptBlock,
  shouldShowLiveTranscriptTrailingDots,
  stripLeadingLiveTranscriptBlankLines,
} from './liveTranscriptBlockSupport.js';
import type { ConcurrentClusterAction } from './concurrentClusterUiState.js';
import { CompareCardsLayout } from './CompareCardsLayout.js';
import { FocusRailLayout } from './FocusRailLayout.js';
import { isAdminCat } from '../../../catGroups.js';

export interface ConcurrentClusterRendererProps<Participant> {
  mode: ConcurrentChatPresentationMode;
  segments: LiveIndicatorSegmentState[];
  cats: ChatCat[];
  selectedChannelId: string;
  disabledMentionNames: string[];
  liveSpeakerParticipant: Participant | null;
  liveSpeakerParticipantCat: ChatCat | null;
  resolveLiveIndicatorSegmentParticipant: (
    segment: LiveIndicatorSegmentState,
  ) => Participant | null;
  resolveParticipantCatRecord: (
    participant: Participant | null,
  ) => ChatCat | null;
  buildParticipantAvatarClassName: (
    participant: Participant,
    options?: { transcript?: boolean; catRecord?: ChatCat | null },
  ) => string;
  buildParticipantAvatarStyle: (
    participant: Participant,
    catRecord?: ChatCat | null,
  ) => CSSProperties | undefined;
  resolveParticipantAvatarUrl: (
    participant: Participant,
    catRecord?: ChatCat | null,
  ) => string | null;
  resolveParticipantDisplayName: (
    participant: Participant,
    catRecord?: ChatCat | null,
  ) => string;
  showProgressDetails: boolean;
  actions?: ReadonlyArray<ConcurrentClusterAction>;
}

export type ClusterLayoutProps<Participant> = Omit<
  ConcurrentClusterRendererProps<Participant>,
  'mode' | 'actions'
>;

export interface ResolvedSegmentPresentation<Participant> {
  segmentParticipant: Participant | null;
  segmentParticipantCat: ChatCat | null;
  segmentParticipantDisplayName: string | null;
  speakerCat: ChatCat | null;
  speakerLabel: string | null;
  renderedBlocks: JSX.Element[];
  showTrailingDots: boolean;
  shouldRender: boolean;
}

export function extractSegmentPlainText(
  segment: LiveIndicatorSegmentState,
): string {
  return [...segment.contentBlocks]
    .sort((left, right) => left.index - right.index)
    .filter((block) => block.kind === 'text' && block.text.trim())
    .map((block) => block.text)
    .join('\n');
}

export async function copySegmentPlainTextToClipboard(
  text: string,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Ignore clipboard failures.
  }
}

export function renderContentBlockSegment(
  block: LiveIndicatorContentBlock,
  cats: ChatCat[],
  channelId: string,
  disabledMentionNames: string[],
  showProgressDetails: boolean,
  translate: (key: MessageKey, values?: MessageInterpolationValues) => string = enTranslator,
): JSX.Element | null {
  if (!shouldRenderLiveTranscriptBlock(block, showProgressDetails)
    || (block.kind === 'text' && !stripLeadingLiveTranscriptBlankLines(block.text).trim())
    || (block.kind === 'status' && !block.text)) return null;
  return <ConversationContentBlock key={block.id}
    block={sanitizeConversationBlock(block.kind === 'status' ? { ...block, text: localizeCatsOwnedLiveText(block.text, null, translate) } : block)}
    showProgressDetails={showProgressDetails}
    labels={{ tool: translate(messageKeys.chatConcurrentToolLabel), input: translate(messageKeys.chatConversationToolInput),
      result: translate(messageKeys.chatConversationToolResult), noResult: translate(messageKeys.chatConversationNoResult), error: translate(messageKeys.chatConversationToolError) }}
    renderText={text => <MessageBody body={text} cats={cats} channelId={channelId}
      disabledMentionNames={disabledMentionNames} format="markdown" />} />;
}

export function resolveSegmentPresentation<Participant>(
  segment: LiveIndicatorSegmentState,
  isPrimarySegment: boolean,
  props: ClusterLayoutProps<Participant>,
  translate: (key: MessageKey, values?: MessageInterpolationValues) => string = enTranslator,
): ResolvedSegmentPresentation<Participant> {
  const {
    cats,
    liveSpeakerParticipant,
    liveSpeakerParticipantCat,
    resolveLiveIndicatorSegmentParticipant,
    resolveParticipantCatRecord,
    selectedChannelId,
    disabledMentionNames,
    showProgressDetails,
    resolveParticipantDisplayName,
  } = props;

  const resolvedSegmentParticipant = resolveLiveIndicatorSegmentParticipant(segment);
  const resolvedSegmentParticipantCat = resolveParticipantCatRecord(resolvedSegmentParticipant);
  const normalizedStreamSpeakerLabel = (() => {
    const value = segment.speakerLabel?.trim();
    if (segment.participantId === 'orchestrator') {
      return normalizeVisibleOrchestratorLabel(value);
    }
    return value || null;
  })();
  const hasExplicitSegmentIdentity = Boolean(
    resolvedSegmentParticipant
    || segment.catId
    || normalizedStreamSpeakerLabel,
  );
  const segmentParticipant = resolvedSegmentParticipant
    ?? (!hasExplicitSegmentIdentity && isPrimarySegment ? liveSpeakerParticipant : null);
  const segmentParticipantCat = resolvedSegmentParticipant
    ? resolvedSegmentParticipantCat
    : (!hasExplicitSegmentIdentity && isPrimarySegment ? liveSpeakerParticipantCat : null);
  const segmentParticipantDisplayName = segmentParticipant
    ? resolveParticipantDisplayName(segmentParticipant, segmentParticipantCat)
    : null;
  const speakerCat = segment.catId
    ? cats.find((cat) => cat.id === segment.catId) ?? null
    : null;
  const speakerLabel = segmentParticipantDisplayName
    ?? segmentParticipantCat?.name
    ?? speakerCat?.name
    ?? normalizedStreamSpeakerLabel;
  const sortedBlocks = [...segment.contentBlocks].sort(
    (left, right) => left.index - right.index,
  );
  const lastBlock = sortedBlocks.at(-1);
  const showTrailingDots = shouldShowLiveTranscriptTrailingDots(segment.phase, lastBlock);
  const renderedBlocks = sortedBlocks
    .map((block) =>
      renderContentBlockSegment(
        block,
        cats,
        selectedChannelId,
        disabledMentionNames,
        showProgressDetails,
        translate,
      ),
    )
    .filter((block): block is JSX.Element => block != null);
  const hasSegmentIdentity = Boolean(
    segment.participantId || segment.catId || segment.speakerLabel,
  );
  const shouldRender =
    segment.phase === 'waiting'
    || renderedBlocks.length > 0
    || (showProgressDetails && segment.progressText.trim().length > 0)
    || (
      segment.phase === 'streaming'
      && (hasVisibleLiveIndicatorSegmentActivity(segment) || hasSegmentIdentity)
    )
    || showTrailingDots;

  return {
    segmentParticipant,
    segmentParticipantCat,
    segmentParticipantDisplayName,
    speakerCat,
    speakerLabel,
    renderedBlocks,
    showTrailingDots,
    shouldRender,
  };
}

export function resolveSegmentAccessibleName<Participant>(
  presentation: ResolvedSegmentPresentation<Participant>,
  translate: (key: MessageKey, values?: MessageInterpolationValues) => string = enTranslator,
): string {
  return (
    presentation.segmentParticipantDisplayName
    ?? presentation.segmentParticipantCat?.name
    ?? presentation.speakerCat?.name
    ?? presentation.speakerLabel?.trim()
    ?? translate(messageKeys.chatFocusRailUnnamedResponseLabel)
  );
}

export function buildSegmentCopyLabel<Participant>(
  presentation: ResolvedSegmentPresentation<Participant>,
  translate: (key: MessageKey, values?: MessageInterpolationValues) => string = enTranslator,
): string {
  const accessibleName = resolveSegmentAccessibleName(
    presentation,
    translate,
  );
  const unnamedResponseLabel = translate(messageKeys.chatFocusRailUnnamedResponseLabel);
  return accessibleName === unnamedResponseLabel
    ? translate(messageKeys.chatConcurrentCopyUnnamedResponseLabel)
    : translate(messageKeys.chatConcurrentCopyLabeledResponseLabel, {
      speakerName: accessibleName,
    });
}

export function SegmentSpeakerHeader<Participant>({
  segmentParticipant,
  segmentParticipantCat,
  speakerCat,
  speakerLabel,
  buildParticipantAvatarClassName,
  buildParticipantAvatarStyle,
  resolveParticipantAvatarUrl,
  resolveParticipantDisplayName,
}: {
  segmentParticipant: Participant | null;
  segmentParticipantCat: ChatCat | null;
  speakerCat: ChatCat | null;
  speakerLabel: string | null;
  buildParticipantAvatarClassName: ConcurrentClusterRendererProps<Participant>['buildParticipantAvatarClassName'];
  buildParticipantAvatarStyle: ConcurrentClusterRendererProps<Participant>['buildParticipantAvatarStyle'];
  resolveParticipantAvatarUrl: ConcurrentClusterRendererProps<Participant>['resolveParticipantAvatarUrl'];
  resolveParticipantDisplayName: ConcurrentClusterRendererProps<Participant>['resolveParticipantDisplayName'];
}): JSX.Element | null {
  if (segmentParticipant) {
    return (
      <div className="transcriptMessageTop">
        <div
          className={buildParticipantAvatarClassName(
            segmentParticipant,
            { transcript: true, catRecord: segmentParticipantCat },
          )}
          style={buildParticipantAvatarStyle(segmentParticipant, segmentParticipantCat)}
        >
          {resolveParticipantAvatarUrl(segmentParticipant, segmentParticipantCat)
            ? null
            : catInitials(resolveParticipantDisplayName(segmentParticipant, segmentParticipantCat))}
        </div>
        <strong>{resolveParticipantDisplayName(segmentParticipant, segmentParticipantCat)}</strong>
      </div>
    );
  }
  if (speakerCat) {
    return (
      <div className="transcriptMessageTop">
        <div
          className={isAdminCat(speakerCat)
            ? 'catAvatar catAvatarBoss transcriptAvatar'
            : 'catAvatar transcriptAvatar'}
          style={speakerCat.avatarUrl
            ? {
                backgroundImage: `url(${speakerCat.avatarUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : speakerCat.avatarColor ? { background: speakerCat.avatarColor } : undefined}
        >
          {speakerCat.avatarUrl ? null : catInitials(speakerCat.name)}
        </div>
        <strong>{speakerCat.name}</strong>
      </div>
    );
  }
  if (speakerLabel) {
    return (
      <div className="transcriptMessageTop">
        <strong>{speakerLabel}</strong>
      </div>
    );
  }
  return null;
}

export function SegmentSpeakerInlineSummary<Participant>({
  segmentParticipant,
  segmentParticipantCat,
  speakerCat,
  speakerLabel,
  buildParticipantAvatarClassName,
  buildParticipantAvatarStyle,
  resolveParticipantAvatarUrl,
  resolveParticipantDisplayName,
}: {
  segmentParticipant: Participant | null;
  segmentParticipantCat: ChatCat | null;
  speakerCat: ChatCat | null;
  speakerLabel: string | null;
  buildParticipantAvatarClassName: ConcurrentClusterRendererProps<Participant>['buildParticipantAvatarClassName'];
  buildParticipantAvatarStyle: ConcurrentClusterRendererProps<Participant>['buildParticipantAvatarStyle'];
  resolveParticipantAvatarUrl: ConcurrentClusterRendererProps<Participant>['resolveParticipantAvatarUrl'];
  resolveParticipantDisplayName: ConcurrentClusterRendererProps<Participant>['resolveParticipantDisplayName'];
}): JSX.Element | null {
  if (segmentParticipant) {
    return (
      <span className="focusRailSecondaryIdentity">
        <span
          className={buildParticipantAvatarClassName(
            segmentParticipant,
            { transcript: true, catRecord: segmentParticipantCat },
          )}
          style={buildParticipantAvatarStyle(segmentParticipant, segmentParticipantCat)}
        >
          {resolveParticipantAvatarUrl(segmentParticipant, segmentParticipantCat)
            ? null
            : catInitials(resolveParticipantDisplayName(segmentParticipant, segmentParticipantCat))}
        </span>
        <span className="focusRailSecondaryName">
          {resolveParticipantDisplayName(segmentParticipant, segmentParticipantCat)}
        </span>
      </span>
    );
  }
  if (speakerCat) {
    return (
      <span className="focusRailSecondaryIdentity">
        <span
          className={isAdminCat(speakerCat)
            ? 'catAvatar catAvatarBoss transcriptAvatar'
            : 'catAvatar transcriptAvatar'}
          style={speakerCat.avatarUrl
            ? {
                backgroundImage: `url(${speakerCat.avatarUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : speakerCat.avatarColor ? { background: speakerCat.avatarColor } : undefined}
        >
          {speakerCat.avatarUrl ? null : catInitials(speakerCat.name)}
        </span>
        <span className="focusRailSecondaryName">{speakerCat.name}</span>
      </span>
    );
  }
  if (speakerLabel) {
    return <span className="focusRailSecondaryName">{speakerLabel}</span>;
  }
  return null;
}

export function SegmentContentBody({
  segment,
  renderedBlocks,
  showTrailingDots,
  showProgressDetails,
}: {
  segment: LiveIndicatorSegmentState;
  renderedBlocks: JSX.Element[];
  showTrailingDots: boolean;
  showProgressDetails: boolean;
}): JSX.Element | null {
  const { t } = useI18n();
  return <ConversationSegmentBody phase={segment.phase} blocks={segment.contentBlocks}
    renderedBlocks={renderedBlocks} showTrailingDots={showTrailingDots}
    showProgressDetails={showProgressDetails}
    progressText={localizeCatsOwnedLiveText(segment.progressText, segment.progressKind, t)}
    labels={{ tool: t(messageKeys.chatConcurrentToolLabel), input: t(messageKeys.chatConversationToolInput),
      result: t(messageKeys.chatConversationToolResult), noResult: t(messageKeys.chatConversationNoResult), error: t(messageKeys.chatConversationToolError) }} />;
}

function localizeCatsOwnedLiveText(
  text: string,
  progressKind: string | null | undefined,
  translate: (key: MessageKey, values?: MessageInterpolationValues) => string,
): string {
  if (progressKind === 'finalizing') {
    return translate(messageKeys.chatConcurrentProgressFinalizing);
  }
  switch (text) {
    case 'Finalizing...':
      return translate(messageKeys.chatConcurrentProgressFinalizing);
    case 'Finishing...':
      return translate(messageKeys.chatConcurrentProgressFinishing);
    case 'Runtime stream unavailable':
      return translate(messageKeys.chatConcurrentErrorRuntimeStreamUnavailable);
    case 'Proxy error':
      return translate(messageKeys.chatConcurrentErrorProxy);
    default:
      return text;
  }
}

function InlineStackLayout<Participant>(props: ClusterLayoutProps<Participant>): JSX.Element {
  const {
    segments,
    buildParticipantAvatarClassName,
    buildParticipantAvatarStyle,
    resolveParticipantAvatarUrl,
    resolveParticipantDisplayName,
    showProgressDetails,
  } = props;
  const { t } = useI18n();
  const primarySegmentId = segments.at(-1)?.id ?? null;
  return (
    <>
      {segments.map((segment) => {
        const isPrimarySegment = segment.id === primarySegmentId;
        const presentation = resolveSegmentPresentation(segment, isPrimarySegment, props, t);
        if (!presentation.shouldRender) {
          return null;
        }
        const sealedPlainText = segment.phase === 'sealed'
          ? extractSegmentPlainText(segment)
          : '';
        const showCopyAction = sealedPlainText.trim().length > 0;
        return (
          <ConversationResponse key={segment.id}
            response={{ version: 1, id: segment.id, phase: segment.phase, blocks: segment.contentBlocks }}
            speaker={<SegmentSpeakerHeader
                segmentParticipant={presentation.segmentParticipant}
                segmentParticipantCat={presentation.segmentParticipantCat}
                speakerCat={presentation.speakerCat}
                speakerLabel={presentation.speakerLabel}
                buildParticipantAvatarClassName={buildParticipantAvatarClassName}
                buildParticipantAvatarStyle={buildParticipantAvatarStyle}
                resolveParticipantAvatarUrl={resolveParticipantAvatarUrl}
                resolveParticipantDisplayName={resolveParticipantDisplayName}
              />}
            renderedBlocks={presentation.renderedBlocks}
            showTrailingDots={presentation.showTrailingDots}
            showProgressDetails={showProgressDetails}
            progressText={localizeCatsOwnedLiveText(segment.progressText, segment.progressKind, t)}
            labels={{ tool: t(messageKeys.chatConcurrentToolLabel), input: t(messageKeys.chatConversationToolInput),
              result: t(messageKeys.chatConversationToolResult), noResult: t(messageKeys.chatConversationNoResult), error: t(messageKeys.chatConversationToolError) }}
            copyLabel={buildSegmentCopyLabel(presentation, t)}
            onCopy={showCopyAction ? () => { void copySegmentPlainTextToClipboard(sealedPlainText); } : undefined}
          />
        );
      })}
    </>
  );
}

function ClusterActionBar({
  actions,
}: {
  actions: ReadonlyArray<ConcurrentClusterAction>;
}): JSX.Element {
  return (
    <div className="clusterActionBar">
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          className="clusterActionButton"
          onClick={action.onSelect}
          title={action.title}
          disabled={action.disabled === true}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

export function ConcurrentClusterRenderer<Participant>(
  props: ConcurrentClusterRendererProps<Participant>,
): JSX.Element {
  const { mode, actions = [], ...layoutProps } = props;
  const layout = (() => {
    switch (mode) {
      case 'compare_cards':
        return <CompareCardsLayout {...layoutProps} />;
      case 'focus_rail':
        return <FocusRailLayout {...layoutProps} />;
      case 'adaptive':
      case 'inline_stack':
      default:
        return <InlineStackLayout {...layoutProps} />;
    }
  })();
  if (actions.length === 0) {
    return layout;
  }
  return (
    <div className="clusterActionBarWrapper">
      {layout}
      <ClusterActionBar actions={actions} />
    </div>
  );
}

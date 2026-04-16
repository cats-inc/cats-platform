import type { CSSProperties } from 'react';

import type { ChatCat } from '../../../api/contracts.js';
import type { ConcurrentChatPresentationMode } from '../../../api/contracts.js';
import type { LiveIndicatorSegmentState } from '../../hooks/useLiveIndicator.js';
import type { LiveIndicatorContentBlock } from '../../../../../shared/runtimeContentBlocks.js';
import { catInitials } from '../../chatUtils.js';
import { normalizeVisibleOrchestratorLabel } from '../../../../../shared/orchestratorLabel.js';
import {
  hasVisibleLiveIndicatorSegmentActivity,
} from '../../../../../shared/liveIndicator.js';
import { MessageBody } from '../MessageBody.js';
import {
  shouldRenderLiveTranscriptBlock,
  shouldShowLiveTranscriptTrailingDots,
  stripLeadingLiveTranscriptBlankLines,
} from '../../../../shared/renderer/components/chat-view/liveTranscriptBlockSupport.js';
import type {
  ResolvedChannelParticipant,
} from '../../../shared/channelParticipants.js';
import type { ConcurrentClusterAction } from './concurrentClusterUiState.js';
import { CompareCardsLayout } from './CompareCardsLayout.js';
import { FocusRailLayout } from './FocusRailLayout.js';

export interface ConcurrentClusterRendererProps {
  mode: ConcurrentChatPresentationMode;
  segments: LiveIndicatorSegmentState[];
  cats: ChatCat[];
  bossCatId: string | null;
  selectedChannelId: string;
  disabledMentionNames: string[];
  liveSpeakerParticipant: ResolvedChannelParticipant | null;
  liveSpeakerParticipantCat: ChatCat | null;
  resolveLiveIndicatorSegmentParticipant: (
    segment: LiveIndicatorSegmentState,
  ) => ResolvedChannelParticipant | null;
  resolveParticipantCatRecord: (
    participant: ResolvedChannelParticipant | null,
  ) => ChatCat | null;
  buildParticipantAvatarClassName: (
    participant: ResolvedChannelParticipant,
    options?: { transcript?: boolean; catRecord?: ChatCat | null },
  ) => string;
  buildParticipantAvatarStyle: (
    participant: ResolvedChannelParticipant,
    catRecord?: ChatCat | null,
  ) => CSSProperties | undefined;
  resolveParticipantAvatarUrl: (
    participant: ResolvedChannelParticipant,
    catRecord?: ChatCat | null,
  ) => string | null;
  resolveParticipantDisplayName: (
    participant: ResolvedChannelParticipant,
    catRecord?: ChatCat | null,
  ) => string;
  showProgressDetails: boolean;
  actions?: ReadonlyArray<ConcurrentClusterAction>;
}

export type ClusterLayoutProps = Omit<ConcurrentClusterRendererProps, 'mode' | 'actions'>;

export interface ResolvedSegmentPresentation {
  segmentParticipant: ResolvedChannelParticipant | null;
  segmentParticipantCat: ChatCat | null;
  speakerCat: ChatCat | null;
  speakerLabel: string | null;
  renderedBlocks: JSX.Element[];
  showTrailingDots: boolean;
  shouldRender: boolean;
}

export function renderContentBlockSegment(
  block: LiveIndicatorContentBlock,
  cats: ChatCat[],
  channelId: string,
  disabledMentionNames: string[],
  showProgressDetails: boolean,
): JSX.Element | null {
  if (!shouldRenderLiveTranscriptBlock(block, showProgressDetails)) {
    return null;
  }

  if (block.kind === 'text') {
    const text = stripLeadingLiveTranscriptBlankLines(block.text);
    if (!text.trim()) {
      return null;
    }
    return (
      <MessageBody
        key={block.id}
        body={text}
        cats={cats}
        channelId={channelId}
        disabledMentionNames={disabledMentionNames}
      />
    );
  }

  if (block.kind === 'tool') {
    return (
      <div key={block.id} className={block.status === 'streaming' ? 'toolSegmentChip' : 'toolSegmentChip toolSegmentChipDone'}>
        <span className="toolSegmentChipName">{block.toolName ?? block.title ?? 'tool'}</span>
        {block.text ? (
          <span className="toolSegmentChipDetail">{block.text}</span>
        ) : null}
      </div>
    );
  }

  if (block.kind === 'status' && block.text) {
    return (
      <p key={block.id} className="typingStatusText">{block.text}</p>
    );
  }

  return null;
}

export function resolveSegmentPresentation(
  segment: LiveIndicatorSegmentState,
  isPrimarySegment: boolean,
  props: ClusterLayoutProps,
): ResolvedSegmentPresentation {
  const {
    cats,
    liveSpeakerParticipant,
    liveSpeakerParticipantCat,
    resolveLiveIndicatorSegmentParticipant,
    resolveParticipantCatRecord,
    selectedChannelId,
    disabledMentionNames,
    showProgressDetails,
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
  const speakerCat = segment.catId
    ? cats.find((cat) => cat.id === segment.catId) ?? null
    : null;
  const speakerLabel = segmentParticipant?.name
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
    speakerCat,
    speakerLabel,
    renderedBlocks,
    showTrailingDots,
    shouldRender,
  };
}

export function SegmentSpeakerHeader({
  segmentParticipant,
  segmentParticipantCat,
  speakerCat,
  speakerLabel,
  bossCatId,
  buildParticipantAvatarClassName,
  buildParticipantAvatarStyle,
  resolveParticipantAvatarUrl,
  resolveParticipantDisplayName,
}: {
  segmentParticipant: ResolvedChannelParticipant | null;
  segmentParticipantCat: ChatCat | null;
  speakerCat: ChatCat | null;
  speakerLabel: string | null;
  bossCatId: string | null;
  buildParticipantAvatarClassName: ConcurrentClusterRendererProps['buildParticipantAvatarClassName'];
  buildParticipantAvatarStyle: ConcurrentClusterRendererProps['buildParticipantAvatarStyle'];
  resolveParticipantAvatarUrl: ConcurrentClusterRendererProps['resolveParticipantAvatarUrl'];
  resolveParticipantDisplayName: ConcurrentClusterRendererProps['resolveParticipantDisplayName'];
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
          className={speakerCat.id === bossCatId
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

export function SegmentSpeakerInlineSummary({
  segmentParticipant,
  segmentParticipantCat,
  speakerCat,
  speakerLabel,
  bossCatId,
  buildParticipantAvatarClassName,
  buildParticipantAvatarStyle,
  resolveParticipantAvatarUrl,
  resolveParticipantDisplayName,
}: {
  segmentParticipant: ResolvedChannelParticipant | null;
  segmentParticipantCat: ChatCat | null;
  speakerCat: ChatCat | null;
  speakerLabel: string | null;
  bossCatId: string | null;
  buildParticipantAvatarClassName: ConcurrentClusterRendererProps['buildParticipantAvatarClassName'];
  buildParticipantAvatarStyle: ConcurrentClusterRendererProps['buildParticipantAvatarStyle'];
  resolveParticipantAvatarUrl: ConcurrentClusterRendererProps['resolveParticipantAvatarUrl'];
  resolveParticipantDisplayName: ConcurrentClusterRendererProps['resolveParticipantDisplayName'];
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
          className={speakerCat.id === bossCatId
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
  if (segment.phase === 'waiting') {
    return <span className="typingDots"><span /><span /><span /></span>;
  }
  if (renderedBlocks.length === 0) {
    if (showProgressDetails && segment.progressText) {
      return <p className="typingStatusText">{segment.progressText}</p>;
    }
    if (segment.phase === 'streaming' && hasVisibleLiveIndicatorSegmentActivity(segment)) {
      return <span className="typingDots"><span /><span /><span /></span>;
    }
    if (showTrailingDots) {
      return <span className="typingDots"><span /><span /><span /></span>;
    }
    return null;
  }
  return (
    <>
      {renderedBlocks}
      {showTrailingDots ? (
        <span className="typingDots"><span /><span /><span /></span>
      ) : null}
    </>
  );
}

function InlineStackLayout(props: ClusterLayoutProps): JSX.Element {
  const { segments, bossCatId, buildParticipantAvatarClassName, buildParticipantAvatarStyle, resolveParticipantAvatarUrl, resolveParticipantDisplayName, showProgressDetails } = props;
  const primarySegmentId = segments.at(-1)?.id ?? null;
  return (
    <>
      {segments.map((segment) => {
        const isPrimarySegment = segment.id === primarySegmentId;
        const presentation = resolveSegmentPresentation(segment, isPrimarySegment, props);
        if (!presentation.shouldRender) {
          return null;
        }
        return (
          <article key={segment.id} className="transcriptMessageStack transcriptMessageStackAgent typingIndicator">
            <div className="transcriptMessage transcriptMessageAgent">
              <SegmentSpeakerHeader
                segmentParticipant={presentation.segmentParticipant}
                segmentParticipantCat={presentation.segmentParticipantCat}
                speakerCat={presentation.speakerCat}
                speakerLabel={presentation.speakerLabel}
                bossCatId={bossCatId}
                buildParticipantAvatarClassName={buildParticipantAvatarClassName}
                buildParticipantAvatarStyle={buildParticipantAvatarStyle}
                resolveParticipantAvatarUrl={resolveParticipantAvatarUrl}
                resolveParticipantDisplayName={resolveParticipantDisplayName}
              />
              <SegmentContentBody
                segment={segment}
                renderedBlocks={presentation.renderedBlocks}
                showTrailingDots={presentation.showTrailingDots}
                showProgressDetails={showProgressDetails}
              />
            </div>
          </article>
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

export function ConcurrentClusterRenderer(props: ConcurrentClusterRendererProps): JSX.Element {
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

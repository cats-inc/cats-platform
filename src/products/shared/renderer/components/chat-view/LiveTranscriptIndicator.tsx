import type {
  ConcurrentChatPresentationMode,
  ChatCat,
} from '../../../api/workspaceContracts.js';
import type { LiveIndicatorState, LiveIndicatorSegmentState } from '../../hooks/useLiveIndicator.js';
import { resolveLiveIndicatorSegments } from '../../../../../shared/liveIndicator.js';
import { ConcurrentClusterRenderer, type ConcurrentClusterRendererProps } from './ConcurrentClusterRenderer.js';
import type { ConcurrentClusterAction } from './concurrentClusterUiState.js';

export interface LiveTranscriptIndicatorProps<Participant> extends Omit<
  ConcurrentClusterRendererProps<Participant>,
  'mode' | 'segments' | 'actions' | 'cats'
> {
  cats: ChatCat[];
  liveIndicator: LiveIndicatorState;
  concurrentPresentationMode?: ConcurrentChatPresentationMode;
  concurrentActions?: ReadonlyArray<ConcurrentClusterAction>;
}

export function LiveTranscriptIndicator<Participant>(
  props: LiveTranscriptIndicatorProps<Participant>,
): JSX.Element | null {
  const {
    liveIndicator,
    concurrentPresentationMode = 'inline_stack',
    concurrentActions,
  } = props;

  const segments = resolveLiveIndicatorSegments(liveIndicator);
  if (segments.length === 0) {
    return null;
  }

  return (
    <ConcurrentClusterRenderer
      mode={segments.length > 1 ? concurrentPresentationMode : 'inline_stack'}
      segments={segments as LiveIndicatorSegmentState[]}
      cats={props.cats}
      bossCatId={props.bossCatId}
      selectedChannelId={props.selectedChannelId}
      disabledMentionNames={props.disabledMentionNames}
      liveSpeakerParticipant={props.liveSpeakerParticipant}
      liveSpeakerParticipantCat={props.liveSpeakerParticipantCat}
      resolveLiveIndicatorSegmentParticipant={props.resolveLiveIndicatorSegmentParticipant}
      resolveParticipantCatRecord={props.resolveParticipantCatRecord}
      buildParticipantAvatarClassName={props.buildParticipantAvatarClassName}
      buildParticipantAvatarStyle={props.buildParticipantAvatarStyle}
      resolveParticipantAvatarUrl={props.resolveParticipantAvatarUrl}
      resolveParticipantDisplayName={props.resolveParticipantDisplayName}
      showProgressDetails={props.showProgressDetails}
      actions={segments.length > 1 ? concurrentActions : []}
    />
  );
}

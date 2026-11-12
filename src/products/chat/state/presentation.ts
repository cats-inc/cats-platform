import type { CatsCoreState } from '../../../core/types.js';
import type { ChatChannelState } from '../api/contracts.js';
import type { MessagePage, MessagePresentationPlacement } from '../shared/transcript.js';
import type { ChatMetadata } from './store.js';

/** Read model only. Never feed headers or a window to a snapshot mutation. */
export interface ChatPresentationSnapshot {
  metadata: ChatMetadata;
  headers: Omit<ChatChannelState, 'messages'>[];
  selected: { channel: ChatChannelState; page: MessagePage; placements: MessagePresentationPlacement[] } | null;
  core: CatsCoreState;
  awaitingReplyChannelIds: string[];
}

export interface ChatMessageWindow {
  metadata: ChatMetadata;
  channel: ChatChannelState;
  page: MessagePage;
  core: CatsCoreState;
  placements: MessagePresentationPlacement[];
}

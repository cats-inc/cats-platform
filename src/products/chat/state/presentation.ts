import type { CatsCoreState } from '../../../core/types.js';
import type { ChatChannelState } from '../api/contracts.js';
import type { MessagePage, MessagePresentationPlacement } from '../../shared/transcript.js';
import type { ChatMetadata } from './store.js';

/** Read model only. Never feed headers or a window to a snapshot mutation. */
export interface ChatCatalogSnapshot {
  /** Native operation revision, captured with these headers/Core; never reused. */
  revision?: string;
  metadata: ChatMetadata;
  headers: Omit<ChatChannelState, 'messages'>[];
  core: CatsCoreState;
}

export interface ChatPresentationSnapshot extends ChatCatalogSnapshot {
  selected: { channel: ChatChannelState; page: MessagePage; placements: MessagePresentationPlacement[] } | null;
  awaitingReplyChannelIds: string[];
}

export interface ChatMessageWindow {
  metadata: ChatMetadata;
  channel: ChatChannelState;
  page: MessagePage;
  core: CatsCoreState;
  placements: MessagePresentationPlacement[];
}

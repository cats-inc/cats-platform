import type { ChatState } from './contracts.js';
import type { ChatPresentationSnapshot, ChatMessageWindow } from '../state/presentation.js';
import type { TranscriptChannelView } from '../../shared/transcript.js';
import { buildChannelView } from '../state/model/index.js';
import { enrichConversationPresentation } from '../shared/conversationPresentationView.js';

/** Transient input for read-model builders only. Never pass it to a store mutation. */
export function presentationChat(snapshot: ChatPresentationSnapshot): ChatState {
  return { ...snapshot.metadata, channels: snapshot.headers.map(header =>
    snapshot.selected?.channel.id === header.id ? snapshot.selected.channel : { ...header, messages: [] }) };
}

export function presentedChannelWindow(snapshot: ChatMessageWindow): TranscriptChannelView {
  const state: ChatState = { ...snapshot.metadata, channels: [snapshot.channel] };
  const { total, nextCursor, orderRevision, historyRevision, archive, archiveActions } = snapshot.page;
  const messagePage = { total, nextCursor, orderRevision, historyRevision, windowCount: snapshot.page.messages.length,
    ...(archive ? { archive } : {}), ...(archiveActions ? { archiveActions } : {}) };
  const view: TranscriptChannelView = { ...buildChannelView(state, snapshot.channel), messagePage };
  return enrichConversationPresentation(view, snapshot.core, snapshot.placements);
}

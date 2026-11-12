import { readConversationPresentation, conversationPlainText } from '@cats-inc/platform-ui-web/contracts';
import type { CatsCoreState } from '../../../core/types.js';
import type { ChatChannelView, ChatMessage } from '../api/contracts.js';
import { buildChatConversationId } from '../../../shared/chatCoreIds.js';
import { presentationTargetKey, type TranscriptChannelView, type MessagePresentationPlacement } from '../../shared/transcript.js';

/** Display-only enrichment. This must never enter prompts or completion repair. */
export function enrichConversationPresentation(view: ChatChannelView, core: CatsCoreState,
  placements?: readonly MessagePresentationPlacement[]): ChatChannelView {
  let messages = [...view.messages];
  const bounded = Boolean((view as TranscriptChannelView).messagePage);
  const visibleIds = new Set(messages.map(message => message.id));
  const placementByKey = new Map(placements?.map(placement => [placement.key, placement]));
  const snapshots = new Map<string, CatsCoreState['segments'][number]>();
  for (const segment of core.segments) {
    if (segment.conversationId !== buildChatConversationId(view.id)
      || segment.metadata?.event !== 'conversation_presentation' || segment.metadata.channelId !== view.id) continue;
    const key = presentationTargetKey(segment.turnId, segment.metadata.targetStateId);
    // A paged view may enrich its own source/response window, but never rehydrate
    // historical Core presentations outside that window.
    if (bounded && !placementByKey.has(key)) continue;
    const previous = snapshots.get(key);
    if (!previous || previous.createdAt <= segment.createdAt) snapshots.set(key, segment);
  }
  for (const snapshot of snapshots.values()) {
    const scope = snapshot.metadata;
    let presentation = readConversationPresentation(scope.presentation);
    if (!presentation || !presentation.blocks.length) continue;
    const related = messages.filter(message => message.metadata?.turnId === snapshot.turnId
      && presentationTargetKey(message.metadata.turnId, message.metadata.targetStateId) === presentationTargetKey(snapshot.turnId, scope.targetStateId)
      && message.metadata.event === 'assistant_turn_segment');
    if (bounded) {
      const proof = placementByKey.get(presentationTargetKey(snapshot.turnId, scope.targetStateId))!;
      if (proof.rejected) continue;
      if (proof.responseMessageId) {
        const placed = messages.find(message => message.id === proof.responseMessageId);
        const relatedIds = new Set(related.map(message => message.id));
        messages = messages.filter(message => !relatedIds.has(message.id));
        if (placed) {
          presentation = readConversationPresentation(placed.metadata.presentation) ?? presentation;
          const lane = core.lanes.find(candidate => candidate.id === snapshot.laneId);
          if (presentation.phase === 'streaming' && lane && ['failed', 'cancelled', 'completed'].includes(lane.status)) {
            presentation = { ...presentation, phase: 'sealed', blocks: presentation.blocks.map(block =>
              block.status === 'streaming' ? { ...block, status: 'error' } : block) };
          }
          messages.push({ ...placed, body: conversationPlainText(presentation.blocks), metadata: { ...placed.metadata, presentation } });
        }
        continue;
      }
      if (!proof.newestEmpty && (!proof.anchorMessageId || !visibleIds.has(proof.anchorMessageId))) continue;
    }
    const terminal = [...related].reverse().find(message => message.metadata.terminal !== false);
    if (messages.some(message => message.metadata?.event === 'assistant_finalization_rejected'
      && message.metadata.turnId === snapshot.turnId && message.metadata.targetId === scope.targetId)) continue;
    if (terminal) {
      presentation = readConversationPresentation(terminal.metadata.presentation) ?? presentation;
      const ids = new Set(related.map(message => message.id));
      messages = messages.filter(message => !ids.has(message.id));
      messages.push({ ...terminal, body: related.map(message => message.body).join(''),
        metadata: { ...terminal.metadata, presentation } });
      continue;
    }
    const lane = core.lanes.find(lane => lane.id === snapshot.laneId);
    if (presentation.phase === 'streaming' && lane && ['failed', 'cancelled', 'completed'].includes(lane.status)) {
      presentation = { ...presentation, phase: 'sealed', blocks: presentation.blocks.map(block =>
        block.status === 'streaming' ? { ...block, status: 'error' } : block) };
    }
    const message: ChatMessage = {
      id: presentation.id, channelId: view.id, senderKind: 'agent', senderName: String(scope.speakerLabel ?? ''),
      body: conversationPlainText(presentation.blocks), mentions: [], createdAt: snapshot.createdAt,
      usage: null, executionProvider: null, executionModel: null, executionInstance: null,
      metadata: { event: 'conversation_presentation', presentation, sourceMessageId: scope.sourceMessageId,
        turnId: snapshot.turnId, targetStateId: scope.targetStateId, targetId: scope.targetId,
        laneId: snapshot.laneId, sessionId: snapshot.sessionId },
    };
    messages.push(message);
  }
  return { ...view, messages: messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) };
}


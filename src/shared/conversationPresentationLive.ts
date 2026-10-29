import { readConversationPresentation, splitConversationPresentation } from '@cats-inc/platform-ui-web/contracts';
import { resolveLiveIndicatorSegments, projectLiveIndicatorStateFromSegments, type LiveIndicatorState } from './liveIndicator.js';
import { sanitizeConversationBlock } from './conversationPresentation.js';
/** A reopened view seeds missing ordered blocks, while current SSE wins within the same execution. */
export function reconcileConversationPresentationLive<Message extends { metadata: Record<string, unknown> }>(
  messages: Message[], live: LiveIndicatorState | undefined,
): { messages: Message[]; live: LiveIndicatorState | undefined } {
  if (!live?.active) return { messages, live };
  const hidden = new Set<Message>();
  const handled = new Set<string>();
  const originalSegments = resolveLiveIndicatorSegments(live);
  const matches = (m: Message['metadata'], segment: typeof originalSegments[number]) =>
    !!segment.sourceMessageId && m.sourceMessageId === segment.sourceMessageId
        && ((!!segment.targetStateId && m.targetStateId === segment.targetStateId)
          || (!!segment.laneId && m.laneId === segment.laneId));
  const segments = originalSegments.flatMap(segment => {
    const message = messages.find(message => matches(message.metadata, segment)
      && readConversationPresentation(message.metadata.presentation) !== null);
    if (!message) return [segment];
    const presentation = readConversationPresentation(message.metadata.presentation)!;
    if (handled.has(presentation.id)) return [];
    handled.add(presentation.id);
    // The durable result takes over even if a late SSE notification still says active.
    if (presentation.phase === 'sealed') return [];
    hidden.add(message);
    const sameExecution = originalSegments.filter(candidate => matches(message.metadata, candidate));
    const liveBlocks = sameExecution.flatMap(candidate => candidate.contentBlocks);
    // Raw-event fallback ids are local to the recorder. Only runtime snapshot ids
    // can be merged with SSE ids; otherwise the freshest complete projection wins.
    const fallback = presentation.blocks.some(block => block.id.startsWith(`${presentation.id}:`));
    const blocks = new Map((fallback && liveBlocks.length ? [] : presentation.blocks)
      .map(block => [block.id, { ...block, metadata: null }]));
    for (const block of liveBlocks) {
      const retained = blocks.get(block.id);
      const safe = sanitizeConversationBlock(block);
      // The Core read and browser SSE have independent delivery timing. Runtime
      // text snapshots are cumulative: a late prefix must not erase a saved tail,
      // nor may an old streaming tool undo a recorded terminal state.
      if (retained && retained.status !== 'streaming' && safe.status === 'streaming') continue;
      if (retained?.kind === 'text' && safe.kind === 'text'
        && retained.text.startsWith(safe.text) && retained.text.length > safe.text.length) continue;
      blocks.set(block.id, { ...retained, ...safe, metadata: null });
    }
    const groups = splitConversationPresentation({ ...presentation,
      phase: sameExecution.every(candidate => candidate.phase === 'sealed') ? 'sealed' : 'streaming',
      blocks: [...blocks.values()].sort((a, b) => a.index - b.index) });
    return groups.map((group, index) => ({ ...segment, id: group.id, phase: group.phase,
      segmentIndex: segment.segmentIndex + index, contentBlocks: group.blocks.map(block => ({ ...block, metadata: null })) }));
  });
  return { messages: messages.filter(message => !hidden.has(message)), live: projectLiveIndicatorStateFromSegments(segments) };
}

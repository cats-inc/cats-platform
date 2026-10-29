import { upsertCoreSegment } from '../../../../core/model/index.js';
import type { ChatStore } from '../store.js';
import { buildChatConversationId, buildChatLaneId } from '../../../../shared/chatCoreIds.js';
import { ConversationPresentationReducer } from '../../../../shared/conversationPresentation.js';
import type { DispatchRequest } from '../room-routing/runtime.js';

/** Presentation-only Core status segment: never evidence that an execution completed. */
export function createDispatchPresentationRecorder(store: Pick<ChatStore, 'updateCore'> | undefined,
  channelId: string, request: DispatchRequest, startedAt: Date) {
  const reducer = new ConversationPresentationReducer(`presentation:${request.dispatchId}`);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writes = Promise.resolve();
  let revision = 0;
  let writeError: unknown = null;
  const flush = () => {
    const presentation = reducer.snapshot();
    if (!store || !presentation.blocks.length) return writes;
    const currentRevision = ++revision;
    writes = writes.then(async () => {
      await store.updateCore(core => upsertCoreSegment(core, {
        id: presentation.id, kind: 'status', status: presentation.phase === 'sealed' ? 'complete' : 'streaming', content: null,
        conversationId: buildChatConversationId(channelId), turnId: request.turnId,
        laneId: request.target.laneId ?? buildChatLaneId(request.turnId, request.targetStateId, request.target.participantId),
        sessionId: request.target.sessionId, sequence: 0, createdAt: startedAt.toISOString(),
        metadata: { event: 'conversation_presentation', channelId, sourceMessageId: request.sourceMessage.id,
          targetStateId: request.targetStateId, targetId: request.target.participantId,
          speakerLabel: request.target.participantName, presentation, presentationRevision: currentRevision },
      }, startedAt).core);
      writeError = null;
    }).catch(error => { writeError = error; });
    return writes;
  };
  return {
    accept(event: Record<string, unknown>) {
      reducer.accept(event);
      if (!timer) timer = setTimeout(() => { timer = null; void flush().catch(() => {}); }, 100);
    },
    async seal(failed = false) {
      if (timer) { clearTimeout(timer); timer = null; }
      reducer.seal(failed);
      await flush();
      if (writeError) throw writeError;
      return reducer.snapshot();
    },
    snapshot: () => reducer.snapshot(),
    replaceText: (...args: Parameters<ConversationPresentationReducer['replaceText']>) => reducer.replaceText(...args),
  };
}

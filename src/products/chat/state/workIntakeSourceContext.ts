import type { ChatMessage, ChatState } from '../api/contracts.js';
import {
  buildWorkIntakeSourceContext,
  type WorkIntakeSourceContext,
} from '../../work/shared/workIntakeSourceContext.js';
import type { RuntimeTransportContext } from './runtimeTargeting.js';
import { resolveChannelCanonicalIdentity } from './model/index.js';

export interface BuildChatWorkIntakeSourceContextInput {
  state: ChatState;
  channelId: string;
  message: Pick<ChatMessage, 'id' | 'body'>;
  transport?: RuntimeTransportContext;
  transportBindingId?: string | null;
}

export function buildChatWorkIntakeSourceContext(
  input: BuildChatWorkIntakeSourceContextInput,
): WorkIntakeSourceContext {
  const { conversationId } = resolveChannelCanonicalIdentity(input.state, input.channelId);

  return buildWorkIntakeSourceContext({
    surface: input.transport === 'telegram' ? 'telegram' : 'chat',
    conversationId,
    channelId: input.channelId,
    transportBindingId: input.transport === 'telegram' ? input.transportBindingId ?? null : null,
    sourceMessageId: input.message.id,
    sourceText: input.message.body,
  });
}

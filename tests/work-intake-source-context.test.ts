import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  appendMessage,
  createChannel,
} from '../src/products/chat/state/model/index.ts';
import { buildChatWorkIntakeSourceContext } from '../src/products/chat/state/workIntakeSourceContext.ts';
import { buildWorkIntakeSourceContext } from '../src/products/work/shared/workIntakeSourceContext.ts';

test('Work intake source context normalizes refs without leaking source text to observation refs', () => {
  const sourceText = 'capture this private todo';
  const context = buildWorkIntakeSourceContext({
    surface: 'telegram',
    conversationId: ' conversation-1 ',
    channelId: ' channel-1 ',
    transportBindingId: ' binding-1 ',
    sourceMessageId: ' message-1 ',
    sourceText: ` ${sourceText} `,
  });

  assert.deepEqual(context.sourceRef, {
    surface: 'telegram',
    conversationId: 'conversation-1',
    channelId: 'channel-1',
    transportBindingId: 'binding-1',
    sourceMessageId: 'message-1',
    sourceText,
  });
  assert.deepEqual(context.contextRefs, [
    'work-intake-surface:telegram',
    'work-intake-conversation:conversation-1',
    'work-intake-channel:channel-1',
    'work-intake-transport-binding:binding-1',
    'work-intake-source-message:message-1',
  ]);
  assert.equal(JSON.stringify(context.contextRefs).includes(sourceText), false);
  assert.equal(JSON.stringify(context.metadata).includes(sourceText), false);
});

test('Chat work intake source context maps ordinary chat turns to chat surface refs', () => {
  const rawMessage = 'add a dashboard cleanup todo';
  let state = createChannel(
    createDefaultChatState(),
    {
      title: 'Work intake room',
      topic: 'Work',
      originSurface: 'chat',
      roomMode: 'chat_channel',
    },
    new Date('2026-05-13T00:00:00.000Z'),
  );
  const channel = state.channels[0]!;
  const appended = appendMessage(
    state,
    channel.id,
    {
      senderKind: 'user',
      senderName: 'User',
      body: rawMessage,
    },
    new Date('2026-05-13T00:01:00.000Z'),
  );
  state = appended.state;

  const context = buildChatWorkIntakeSourceContext({
    state,
    channelId: channel.id,
    message: appended.message,
  });

  assert.equal(context.sourceRef.surface, 'chat');
  assert.equal(context.sourceRef.channelId, channel.id);
  assert.equal(context.sourceRef.sourceMessageId, appended.message.id);
  assert.equal(context.sourceRef.sourceText, rawMessage);
  assert.equal(context.sourceRef.transportBindingId, undefined);
  assert.equal(context.contextRefs.includes('work-intake-surface:chat'), true);
  assert.equal(context.contextRefs.some((ref) => ref.startsWith('work-intake-transport-binding:')), false);
});

test('Chat work intake source context maps Telegram turns to telegram surface refs', () => {
  const rawMessage = 'telegram todo: draft the MCP adapter shape';
  let state = createChannel(
    createDefaultChatState(),
    {
      title: 'Telegram work intake room',
      topic: 'Work',
      originSurface: 'chat',
      roomMode: 'chat_channel',
    },
    new Date('2026-05-13T00:00:00.000Z'),
  );
  const channel = state.channels[0]!;
  const appended = appendMessage(
    state,
    channel.id,
    {
      senderKind: 'user',
      senderName: 'User',
      body: rawMessage,
    },
    new Date('2026-05-13T00:01:00.000Z'),
  );
  state = appended.state;

  const context = buildChatWorkIntakeSourceContext({
    state,
    channelId: channel.id,
    message: appended.message,
    transport: 'telegram',
    transportBindingId: 'telegram-binding-1',
  });

  assert.equal(context.sourceRef.surface, 'telegram');
  assert.equal(context.sourceRef.channelId, channel.id);
  assert.equal(context.sourceRef.transportBindingId, 'telegram-binding-1');
  assert.equal(context.sourceRef.sourceMessageId, appended.message.id);
  assert.equal(context.sourceRef.sourceText, rawMessage);
  assert.equal(context.contextRefs.includes('work-intake-surface:telegram'), true);
  assert.equal(
    context.contextRefs.includes('work-intake-transport-binding:telegram-binding-1'),
    true,
  );
});

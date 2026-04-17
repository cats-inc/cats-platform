import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { readProductChatViewSource } from './helpers/readProductChatViewSource.js';

test('persisted chat view wires the solo audience chip and suppresses visible boss chrome', async () => {
  const appSource = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/App.tsx'),
    'utf8',
  );
  const viewStateSource = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/appViewState.ts'),
    'utf8',
  );
  const chatViewSource = await readProductChatViewSource('chat');

  assert.match(
    viewStateSource,
    /isSoloThreadConversationMode|resolveConversationMode/u,
    'appViewState should derive solo-thread semantics from the shared conversation-mode helper',
  );
  assert.match(
    appSource,
    /selectedChannel\?\.composerMode === 'solo'/,
    'App should pass solo-model state into the persisted chat view',
  );
  assert.match(
    chatViewSource,
    /WorkspaceComposerTargetSlot/,
    'ChatView should render the shared audience-chip slot for solo persisted chats',
  );
  assert.match(
    chatViewSource,
    /const conversationMode = resolveConversationMode\(selectedChannel\)/u,
    'ChatView should branch on the shared conversation-mode helper when rendering chat modes',
  );
});


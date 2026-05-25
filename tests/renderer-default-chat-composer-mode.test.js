import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { readProductChatViewSource } from './helpers/readProductChatViewSource.js';

test('persisted chat view wires the default audience chip and suppresses visible boss chrome', async () => {
  const appSource = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/App.tsx'),
    'utf8',
  );
  const workspaceAppSource = await readFile(
    path.join(process.cwd(), 'src/products/shared/renderer/WorkspaceProductApp.tsx'),
    'utf8',
  );
  const viewStateSource = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/appViewState.ts'),
    'utf8',
  );
  const chatViewSource = await readProductChatViewSource('chat');
  const composerTargetSlotSource = await readFile(
    path.join(
      process.cwd(),
      'src/products/shared/renderer/components/chat-view/ChatComposerTargetSlot.tsx',
    ),
    'utf8',
  );

  assert.match(
    viewStateSource,
    /isDefaultChatConversationMode|resolveConversationMode/u,
    'appViewState should derive default-chat semantics from the shared conversation-mode helper',
  );
  assert.match(
    appSource,
    /createWorkspaceProductApp\(\{/u,
    'Chat App should stay a thin product wrapper over the shared workspace app',
  );
  assert.match(
    workspaceAppSource,
    /isDefaultChatChannel\(visibleChannel\)/,
    'WorkspaceProductApp should derive default execution-target state from default chat channels',
  );
  assert.match(
    chatViewSource,
    /ChatComposerTargetSlot/,
    'ChatView should render the shared audience-chip slot for persisted chats',
  );
  assert.match(
    chatViewSource,
    /const conversationMode = resolveConversationMode\(selectedChannel\)/u,
    'ChatView should branch on the shared conversation-mode helper when rendering chat modes',
  );
  assert.match(
    composerTargetSlotSource,
    /isDefaultChatComposer/u,
    'The target slot should preserve the default-chat branch as a separate composer mode',
  );
  assert.match(
    composerTargetSlotSource,
    /buildAudienceParticipantFromExecutionTarget/u,
    'Default persisted chats should render a model/provider audience chip, not visible boss chrome',
  );
});

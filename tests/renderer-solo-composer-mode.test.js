import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('persisted chat view wires the solo model selector and suppresses visible boss chrome', async () => {
  const appSource = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/App.tsx'),
    'utf8',
  );
  const viewStateSource = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/appViewState.ts'),
    'utf8',
  );
  const chatViewSource = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/components/ChatView.tsx'),
    'utf8',
  );

  assert.match(
    viewStateSource,
    /selectedChannel\?\.composerMode !== 'solo'/,
    'appViewState should suppress the visible Boss avatar for solo persisted chats',
  );
  assert.match(
    appSource,
    /selectedChannel\?\.composerMode === 'solo'/,
    'App should pass solo-model state into the persisted chat view',
  );
  assert.match(
    chatViewSource,
    /ModelSelector/,
    'ChatView should render the model selector for solo persisted chats',
  );
  assert.match(
    chatViewSource,
    /selectedChannel\.composerMode === 'solo'/,
    'ChatView should branch on composerMode when rendering solo chats',
  );
});

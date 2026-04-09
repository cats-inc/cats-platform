import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { readProductChatViewSource } from './helpers/readProductChatViewSource.js';

test('useComposerSubmit keeps pre-ACK abort separate from post-ACK stop', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/hooks/useComposerSubmit.ts'),
    'utf8',
  );
  const sharedDispatchSource = await readFile(
    path.join(process.cwd(), 'src/products/shared/renderer/composerDispatch.ts'),
    'utf8',
  );
  const sharedLifecycleSource = await readFile(
    path.join(process.cwd(), 'src/products/shared/renderer/hooks/useComposerRequestLifecycle.ts'),
    'utf8',
  );
  const sharedRequestControlsSource = await readFile(
    path.join(process.cwd(), 'src/products/shared/renderer/hooks/useComposerRequestControls.ts'),
    'utf8',
  );
  const parallelDispatchSource = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/composerParallelDispatch.ts'),
    'utf8',
  );

  assert.match(source, /useComposerRequestLifecycle/u);
  assert.match(sharedLifecycleSource, /export interface ActiveAckRequest/u);
  assert.match(sharedLifecycleSource, /activeAckRequestRef = useRef<ActiveAckRequest \| null>\(null\)/u);
  assert.match(sharedLifecycleSource, /controller: new AbortController\(\)/u);
  assert.match(source, /const \{ id: submitId, controller: ackController \} = beginAckRequest\(\);/u);
  assert.match(source, /prepareWorkspaceSendContext\(\{[\s\S]+signal: ackController\.signal/u);
  assert.match(sharedDispatchSource, /export async function prepareWorkspaceSendContext/u);
  assert.match(sharedDispatchSource, /createChatChannel\(buildNewChatChannelInput\([\s\S]+\), signal\)/u);
  assert.match(source, /sendChatMessage\([\s\S]+ackController\.signal\)/u);
  assert.match(source, /submitNewParallelChatDraft\(/u);
  assert.match(source, /submitParallelCompareMessage\(/u);
  assert.match(source, /useComposerRequestControls\(/u);
  assert.match(parallelDispatchSource, /export async function submitNewParallelChatDraft/u);
  assert.match(parallelDispatchSource, /createParallelChatGroup\(/u);
  assert.match(parallelDispatchSource, /sendParallelChatMessage\(/u);
  assert.match(sharedRequestControlsSource, /export function useComposerRequestControls/u);
  assert.match(sharedRequestControlsSource, /cancelPendingAckRequest\(\)/u);
  assert.match(sharedLifecycleSource, /request\.controller\.abort\(\);/u);
  assert.match(sharedRequestControlsSource, /cancelConcurrentGroup/u);
  assert.match(sharedRequestControlsSource, /cancelChannel/u);
});

test('chat composer surfaces cancel-send during ACK and stop during dispatch', async () => {
  const chatViewSource = await readProductChatViewSource('chat');

  assert.match(chatViewSource, /isComposerAckBusy/u);
  assert.match(chatViewSource, /onCancelPendingSend\?: \(\) => void;/u);
  assert.match(chatViewSource, /showCancelComposerAction = composerAckBusy && onCancelPendingSend != null/u);
  assert.match(chatViewSource, /aria-label="Cancel send"/u);
  assert.match(chatViewSource, /composerCancelButton/u);
  assert.match(chatViewSource, /aria-label="Stop"/u);
});

test('new-chat draft keeps cancel-send available before the first ACK', async () => {
  const draftSource = await readFile(
    path.join(process.cwd(), 'src/products/shared/renderer/components/ChatNewChatDraft.tsx'),
    'utf8',
  );

  assert.match(draftSource, /isComposerAckBusy/u);
  assert.match(draftSource, /onCancelPendingSend\?: \(\) => void;/u);
  assert.match(draftSource, /showCancelPendingSend = isAckPending && onCancelPendingSend != null/u);
  assert.match(draftSource, /aria-label="Cancel send"/u);
  assert.match(draftSource, /composerCancelButton/u);
});

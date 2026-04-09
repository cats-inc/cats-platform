import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('useComposerSubmit keeps pre-ACK abort separate from post-ACK stop', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/hooks/useComposerSubmit.ts'),
    'utf8',
  );
  const sharedDispatchSource = await readFile(
    path.join(process.cwd(), 'src/products/shared/renderer/composerDispatch.ts'),
    'utf8',
  );

  assert.match(source, /interface ActiveAckRequest/u);
  assert.match(source, /activeAckRequestRef = useRef<ActiveAckRequest \| null>\(null\)/u);
  assert.match(source, /const ackController = new AbortController\(\);/u);
  assert.match(source, /prepareWorkspaceSendContext\(\{[\s\S]+signal: ackController\.signal/u);
  assert.match(sharedDispatchSource, /export async function prepareWorkspaceSendContext/u);
  assert.match(sharedDispatchSource, /createChatChannel\(buildNewChatChannelInput\([\s\S]+\), signal\)/u);
  assert.match(source, /sendChatMessage\([\s\S]+ackController\.signal\)/u);
  assert.match(source, /sendParallelChatMessage\([\s\S]+ackController\.signal\)/u);
  assert.match(source, /const onCancelPendingSend = useCallback/u);
  assert.match(source, /activeRequest\.controller\.abort\(\);/u);
  assert.match(source, /const onStopMessage = useCallback\(async/u);
  assert.match(source, /cancelParallelChatGroup/u);
  assert.match(source, /cancelChatChannel/u);
});

test('chat composer surfaces cancel-send during ACK and stop during dispatch', async () => {
  const chatViewSource = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/components/ChatView.tsx'),
    'utf8',
  );

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

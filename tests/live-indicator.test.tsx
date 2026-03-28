import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  EMPTY_LIVE_INDICATOR,
  resolveLiveIndicatorSpeakerLabel,
  shouldConnectLiveIndicatorStream,
} from '../src/products/chat/renderer/hooks/useLiveIndicator.ts';

test('EMPTY_LIVE_INDICATOR starts with no active cat ids', () => {
  assert.deepEqual(EMPTY_LIVE_INDICATOR.activeCatIds, []);
  assert.equal(EMPTY_LIVE_INDICATOR.previewText, '');
});

test('shouldConnectLiveIndicatorStream skips optimistic draft channels', () => {
  assert.equal(shouldConnectLiveIndicatorStream('draft-123', 'message:send'), false);
});

test('shouldConnectLiveIndicatorStream requires an active send on a real channel', () => {
  assert.equal(
    shouldConnectLiveIndicatorStream('12345678-1234-4234-8234-123456789abc', 'message:prepare'),
    false,
  );
  assert.equal(shouldConnectLiveIndicatorStream('12345678-1234-4234-8234-123456789abc', ''), false);
  assert.equal(shouldConnectLiveIndicatorStream(null, 'message:send'), false);
  assert.equal(
    shouldConnectLiveIndicatorStream('12345678-1234-4234-8234-123456789abc', 'message:send'),
    true,
  );
});

test('resolveLiveIndicatorSpeakerLabel uses the solo execution target label', () => {
  const label = resolveLiveIndicatorSpeakerLabel({
    composerMode: 'solo',
    pendingProvider: 'gemini',
    pendingInstance: 'cli/native',
    pendingModel: 'gemini-3.1-pro',
    roomRouting: {
      leadParticipantId: null,
    },
  } as never);

  assert.equal(label, 'Gemini-CLI');
});

test('resolveLiveIndicatorSpeakerLabel stays silent for cat-led chats', () => {
  assert.equal(resolveLiveIndicatorSpeakerLabel({
    composerMode: 'cat_led',
    pendingProvider: 'gemini',
    pendingInstance: 'cli/native',
    pendingModel: 'gemini-3.1-pro',
    roomRouting: {
      leadParticipantId: null,
    },
  } as never), null);

  assert.equal(resolveLiveIndicatorSpeakerLabel({
    composerMode: 'solo',
    pendingProvider: 'gemini',
    pendingInstance: 'cli/native',
    pendingModel: 'gemini-3.1-pro',
    roomRouting: {
      leadParticipantId: 'cat-1',
    },
  } as never), null);
});

for (const product of ['chat', 'work', 'code']) {
  test(`${product} live indicator accumulates streamed preview text`, async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        'src',
        'products',
        product,
        'renderer',
        'hooks',
        'useLiveIndicator.ts',
      ),
      'utf8',
    );

    assert.match(source, /previewText: ''/u);
    assert.match(source, /previewText: previous\.previewText \+ text/u);
    assert.match(source, /progressText: '',\s*progressKind: null/u);
  });

  test(`${product} ChatView renders streamed preview text with the normal message body`, async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        'src',
        'products',
        product,
        'renderer',
        'components',
        'ChatView.tsx',
      ),
      'utf8',
    );

    assert.match(source, /liveIndicator\.previewText \?\? ''/u);
    assert.match(source, /<MessageBody\s+body=\{liveIndicator\.previewText\}/u);
    assert.match(source, /typingStatusText/u);
  });
}

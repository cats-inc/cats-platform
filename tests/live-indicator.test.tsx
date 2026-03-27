import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldConnectLiveIndicatorStream } from '../src/products/chat/renderer/hooks/useLiveIndicator.ts';

test('shouldConnectLiveIndicatorStream skips optimistic draft channels', () => {
  assert.equal(shouldConnectLiveIndicatorStream('draft-123', 'message:send'), false);
});

test('shouldConnectLiveIndicatorStream requires an active send on a real channel', () => {
  assert.equal(shouldConnectLiveIndicatorStream('12345678-1234-4234-8234-123456789abc', ''), false);
  assert.equal(shouldConnectLiveIndicatorStream(null, 'message:send'), false);
  assert.equal(
    shouldConnectLiveIndicatorStream('12345678-1234-4234-8234-123456789abc', 'message:send'),
    true,
  );
});

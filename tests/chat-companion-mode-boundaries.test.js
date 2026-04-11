import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('useDirectLaneCompanionMode stays direct-lane only and does not own chat event refresh', async () => {
  const source = await readFile(
    new URL('../src/products/chat/renderer/hooks/useDirectLaneCompanionMode.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /useChatEvents/u);
  assert.doesNotMatch(source, /fetchAppShell/u);
  assert.match(source, /useDirectLaneCompanionMode/u);
  assert.match(source, /channelKind === 'direct_lane'/u);
});

test('useChatAppShellRefresh owns event-driven chat app-shell refresh', async () => {
  const source = await readFile(
    new URL('../src/products/chat/renderer/hooks/useChatAppShellRefresh.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /useChatEvents/u);
  assert.match(source, /createEventDrivenAppShellRefresher/u);
  assert.match(source, /setPayloadImmediate/u);
});

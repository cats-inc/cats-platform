import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('workspace shell mounts ADR-041 chat invalidation consumer', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/shared/renderer/WorkspaceProductApp.tsx'),
    'utf8',
  );

  assert.match(source, /useWorkspaceChatEvents\(\{\s*state,\s*setState,/u);
  assert.match(source, /ADR-041 owns collection-tier chat invalidations/u);
  assert.match(source, /ADR-075 owns mounted channel state/u);
});

test('chat ADR-041 refetch path preserves active entity subscriptions', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/hooks/useChatAppShellRefresh.ts'),
    'utf8',
  );

  assert.match(source, /mergeAppShellPreservingActiveEntityState/u);
  assert.match(source, /entitySubscriptionHub\.getActiveSubscribedIds\('channel'\)/u);
  assert.doesNotMatch(source, /setPayloadImmediate\(payload\)/u);
});

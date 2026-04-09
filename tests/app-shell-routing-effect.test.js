import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('workspace app shell routing derives narrow route keys instead of depending on the whole state object', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/shared/renderer/hooks/useWorkspaceAppShellRouting.ts'),
    'utf8',
  );

  assert.match(source, /const readyPayload = state\.status === 'ready' \? state\.payload : null/u);
  assert.match(source, /const routeSelectionVisibleChatPath = readyPayload/u);
  assert.match(source, /const draftRecipientFallbackPath =/u);
  assert.match(source, /const routeDirectLaneSummaryId = routeDirectLaneSummary\?\.id \?\? null/u);
  assert.doesNotMatch(source, /setState,\s*state,\s*\]\);/u);
  assert.doesNotMatch(source, /showingMyCatDirectLane,\s*state\.status,\s*\]\);/u);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('App refreshes the operator loop in the background while the chat view stays open', async () => {
  const appSource = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/App.tsx'),
    'utf8',
  );
  const hookSource = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/useOperatorLoop.ts'),
    'utf8',
  );

  assert.match(appSource, /useOperatorLoop/u);
  assert.match(appSource, /operatorRefreshKey/u);
  assert.match(appSource, /useOperatorLoop\(readyPayload,\s*operatorRefreshKey\)/u);
  assert.match(hookSource, /setInterval\(refreshInBackground,\s*OPERATOR_BACKGROUND_REFRESH_MS\)/u);
  assert.match(hookSource, /addEventListener\('focus', handleFocus\)/u);
  assert.match(hookSource, /addEventListener\('visibilitychange', handleVisibilityChange\)/u);
  assert.match(hookSource, /refreshOperatorSnapshot\(\{\s*background:\s*true\s*\}\)/u);
});

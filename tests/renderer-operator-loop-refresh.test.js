import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('App refreshes the operator loop in the background while the chat view stays open', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/App.tsx'),
    'utf8',
  );

  assert.match(source, /refreshOperatorSnapshot/u);
  assert.match(source, /setInterval\(refreshInBackground,\s*OPERATOR_BACKGROUND_REFRESH_MS\)/u);
  assert.match(source, /addEventListener\('focus', handleFocus\)/u);
  assert.match(source, /addEventListener\('visibilitychange', handleVisibilityChange\)/u);
  assert.match(source, /refreshOperatorSnapshot\(\{\s*background:\s*true\s*\}\)/u);
});

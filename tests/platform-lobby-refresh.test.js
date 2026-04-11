import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('PlatformApp refetches the full platform envelope when navigation enters the lobby', async () => {
  const source = await readFile(
    new URL('../src/app/renderer/App.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /function isLobbyPath\(pathname: string\)/u);
  assert.match(source, /const previousPathnameRef = useRef\(location\.pathname\)/u);
  assert.match(source, /const enteredLobby = isLobbyRoute && !isLobbyPath\(previousPathname\)/u);
  assert.match(source, /void refreshEnvelope\(undefined, \{ suppressErrors: true \}\)/u);
});

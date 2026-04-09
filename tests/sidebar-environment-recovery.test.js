import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('lobby and conversation sidebar pass runtime setup status into environment recovery', async () => {
  const [lobbySource, sidebarSource] = await Promise.all([
    readFile(
      new URL('../src/app/renderer/PlatformLobby.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/app/renderer/productShell/ConversationSidebar.tsx', import.meta.url),
      'utf8',
    ),
  ]);

  assert.match(lobbySource, /runtimeSetupStatus:\s*envelope\.runtimeSetup\.status/u);
  assert.match(sidebarSource, /runtimeSetupStatus:\s*payload\.runtimeSetup\?\.status/u);
});

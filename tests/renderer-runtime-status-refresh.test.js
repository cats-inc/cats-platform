import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('platform lobby keeps refreshing runtime status while the lobby stays open', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/app/renderer/App.tsx'),
    'utf8',
  );

  assert.match(source, /PLATFORM_ENVELOPE_BACKGROUND_REFRESH_MS/u);
  assert.match(source, /const isLobbyRoute = isLobbyPath\(location\.pathname\)/u);
  assert.match(source, /!isLobbyRoute/u);
  assert.match(
    source,
    /setInterval\(\s*refreshEnvelopeInBackground,\s*PLATFORM_ENVELOPE_BACKGROUND_REFRESH_MS/u,
  );
  assert.match(source, /addEventListener\('focus', handleFocus\)/u);
  assert.match(source, /addEventListener\('visibilitychange', handleVisibilityChange\)/u);
  assert.match(source, /runtime:\s*envelope\.runtime/u);
});

test('workspace products refresh runtime status without replacing the whole app shell', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/shared/renderer/hooks/useWorkspaceAppShellRouting.ts'),
    'utf8',
  );

  assert.match(source, /APP_SHELL_BACKGROUND_REFRESH_MS/u);
  assert.match(
    source,
    /setInterval\(\s*refreshRuntimeStatusInBackground,\s*APP_SHELL_BACKGROUND_REFRESH_MS/u,
  );
  assert.match(source, /payload: mergeWorkspaceBackgroundRefreshPayload\(current\.payload, nextPayload\)/u);
  assert.match(source, /\.\.\.currentPayload/u);
  assert.match(source, /runtime:\s*nextPayload\.runtime/u);
  assert.match(source, /runtimeSetup:\s*nextPayload\.runtimeSetup/u);
  assert.match(source, /addEventListener\('focus', handleFocus\)/u);
  assert.match(source, /addEventListener\('visibilitychange', handleVisibilityChange\)/u);
});

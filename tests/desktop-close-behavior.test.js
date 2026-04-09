import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('desktop host routes window close through the tray only when the system tray preference is enabled', async () => {
  const source = await readFile(
    new URL('../desktop/host/main.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /systemTrayEnabled: true/u);
  assert.match(source, /function isSystemTrayEnabled\(\)/u);
  assert.match(source, /latestDesktopStartupPreferences\.systemTrayEnabled/u);
  assert.match(source, /mainWindow\.on\('close', \(event\) => \{[\s\S]*!shuttingDown && isSystemTrayEnabled\(\) && trayController[\s\S]*hideMainWindowToTray\(\);/u);
});

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

test('desktop host keeps tray locked while shutdown drains services', async () => {
  const source = await readFile(
    new URL('../desktop/host/main.ts', import.meta.url),
    'utf8',
  );
  const traySource = await readFile(
    new URL('../desktop/host/tray.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /let shutdownPromise: Promise<void> \| null = null;/u);
  assert.match(source, /let exitingAfterShutdown = false;/u);
  assert.match(source, /activeTrayController\?\.updateMenu\(buildDesktopTrayQuittingMenuState\(\)\);[\s\S]*await supervisor\?\.stopAll\(\);[\s\S]*activeTrayController\?\.dispose\(\);[\s\S]*exitingAfterShutdown = true;[\s\S]*app\.exit\(\);/u);
  assert.match(source, /app\.on\('before-quit', \(event\) => \{[\s\S]*if \(!exitingAfterShutdown\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*void shutdownHost\(\);/u);
  assert.match(source, /app\.on\('second-instance', \(\) => \{[\s\S]*if \(shuttingDown\) \{[\s\S]*return;[\s\S]*void showMainWindow\(\);/u);
  assert.match(source, /app\.on\('activate', \(\) => \{[\s\S]*if \(shuttingDown\) \{[\s\S]*return;[\s\S]*void showMainWindow\(\);/u);
  assert.match(source, /canInteract: \(\) => !shuttingDown/u);
  assert.match(traySource, /if \(state\.lockedLabel\) \{[\s\S]*label: state\.lockedLabel,[\s\S]*enabled: false,[\s\S]*\};/u);
});

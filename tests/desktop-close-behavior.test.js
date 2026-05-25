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
  // Snapshot the tray before any disposable subsystem can throw; the whole
  // shutdown sequence then lives inside try/catch/finally so app.exit always runs.
  assert.match(source, /const activeTrayController = trayController;[\s\S]*try \{[\s\S]*voiceCaptureController\?\.dispose\(\);[\s\S]*activeTrayController\?\.updateMenu\(buildDesktopTrayQuittingMenuState\(app\.getLocale\(\)\)\);[\s\S]*supervisor\?\.stopAll\(\)[\s\S]*\} catch \(error\) \{[\s\S]*\} finally \{[\s\S]*activeTrayController\?\.dispose\(\);[\s\S]*exitingAfterShutdown = true;[\s\S]*app\.exit\(shutdownExitCode\);/u);
  // Watchdog derives from gracefulShutdownMs and managed service count; a
  // timeout force-stops children before letting the Electron host exit.
  assert.match(source, /SHUTDOWN_GRACE_WINDOWS_PER_SERVICE = 2;/u);
  assert.match(source, /SHUTDOWN_WATCHDOG_BUFFER_MS = 3_000;/u);
  assert.match(source, /resolveShutdownWatchdogMs\(hostConfig, supervisor\?\.getManagedServiceCount\(\) \?\? 0\)/u);
  assert.match(source, /Promise\.race\(\[[\s\S]*drain[\s\S]*waitForShutdownDeadline\(shutdownWatchdogMs\)/u);
  assert.match(source, /shutdown watchdog tripped/u);
  assert.match(source, /await supervisor\?\.forceStopAll\(\);/u);
  // before-quit only releases preventDefault once shutdownHost is past the
  // app.exit() call; everything else funnels back into shutdownHost.
  assert.match(source, /app\.on\('before-quit', \(event\) => \{[\s\S]*if \(!exitingAfterShutdown\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*void shutdownHost\(\);/u);
  assert.match(source, /app\.on\('second-instance', \(\) => \{[\s\S]*if \(shuttingDown\) \{[\s\S]*return;[\s\S]*void showMainWindow\(\);/u);
  assert.match(source, /app\.on\('activate', \(\) => \{[\s\S]*if \(shuttingDown\) \{[\s\S]*return;[\s\S]*void showMainWindow\(\);/u);
  assert.match(source, /canInteract: \(\) => !shuttingDown/u);
  assert.match(traySource, /if \(state\.lockedLabel\) \{[\s\S]*label: state\.lockedLabel,[\s\S]*enabled: false,[\s\S]*\};/u);
  // Tray tooltip falls back through lockedTooltip → lockedLabel → 'Cats'
  // so a richer locked state can override the menu label without lying.
  assert.match(traySource, /tray\.setToolTip\(state\.lockedTooltip \?\? state\.lockedLabel \?\? 'Cats'\);/u);
});

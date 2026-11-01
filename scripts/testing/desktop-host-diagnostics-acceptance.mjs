/**
 * Real Electron host-diagnostic acceptance with an isolated temporary profile.
 * Usage after npm run build:host: electron scripts/testing/desktop-host-diagnostics-acceptance.mjs
 * Deliberately crashes one fixture renderer; starts no services or crash reporter.
 */
import assert from 'node:assert/strict';
import { app, BrowserWindow, screen } from 'electron';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { configureHostLogger, observeDisplays, observeHostApp, observeHostProcess } from '../../build/desktop/hostDiagnostics.js';

const root = mkdtempSync(join(tmpdir(), 'cats-desktop-host-diagnostics-'));
app.setPath('userData', root);
const logger = configureHostLogger(root);
observeHostProcess(logger);
observeHostApp(app, () => BrowserWindow.getAllWindows(), logger);
app.on('window-all-closed', () => {});
const timeout = setTimeout(() => { console.error(`Acceptance timed out: ${root}`); app.exit(1); }, 30_000);
app.whenReady().then(async () => {
  observeDisplays(screen, () => BrowserWindow.getAllWindows(), logger);
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  await window.loadURL('data:text/html,<title>PRIVATE_TITLE</title>PRIVATE_BODY');
  window.showInactive(); window.hide();
  const gone = once(app, 'render-process-gone');
  window.webContents.forcefullyCrashRenderer();
  const [, , details] = await gone;
  assert.notEqual(details.reason, 'clean-exit');
  const log = readFileSync(logger.file, 'utf8');
  for (const event of ['displays-ready', 'window-created', 'window-show', 'window-hide', 'renderer-gone']) assert.ok(log.includes(event), event);
  assert.ok(!log.includes('PRIVATE_'));
  writeFileSync(join(root, 'result.json'), JSON.stringify({ passed: true, platform: process.platform,
    electron: process.versions.electron, rendererReason: details.reason, rendererExitCode: details.exitCode,
    log: logger.file }, null, 2) + '\n');
  console.log(`Desktop host diagnostics acceptance passed: ${root}`);
  clearTimeout(timeout);
  window.destroy(); app.quit();
}).catch((error) => { console.error(error); clearTimeout(timeout); app.exit(1); });

// Supervised dev server: runs src/index.ts via tsx with file-watch restart AND
// crash-restart. Plain `tsx watch` only restarts on file change, so a process
// that dies on an unhandled rejection / uncaught exception stays dead and the
// port goes silent. This supervisor restarts on either trigger and surfaces the
// exit reason. Crash stack traces are written to ~/.cats/platform/state/dev-crash.log
// by the in-process handlers in src/app/server/crashLog.ts.

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const entry = 'src/index.ts';
const srcDir = path.resolve('src');
const restartDelayMs = 1_000;
const debounceMs = 150;
const forceKillGraceMs = 3_000;
const crashLogPath = path.join(homedir(), '.cats', 'platform', 'state', 'dev-crash.log');
const banner = '='.repeat(64);

let child = null;
let intentionalRestart = false;
let debounceTimer = null;
let shuttingDown = false;
let crashCount = 0;

function spawnServer() {
  intentionalRestart = false;
  child = spawn(process.execPath, ['--import', 'tsx', entry], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    child = null;
    if (shuttingDown) {
      return;
    }
    if (intentionalRestart) {
      spawnServer();
      return;
    }
    crashCount += 1;
    process.stderr.write(
      `\n${banner}\n`
      + `[dev-server] *** SERVER CRASHED (#${crashCount}) at ${new Date().toISOString()}\n`
      + `[dev-server] exit code=${code ?? 'null'}, signal=${signal ?? 'null'}\n`
      + `[dev-server] stack trace -> ${crashLogPath}\n`
      + `[dev-server] restarting in ${restartDelayMs}ms...\n`
      + `${banner}\n`,
    );
    setTimeout(spawnServer, restartDelayMs);
  });
}

function triggerRestart() {
  if (!child) {
    spawnServer();
    return;
  }
  intentionalRestart = true;
  const pending = child;
  child.kill('SIGTERM');
  setTimeout(() => {
    if (pending === child && child) {
      child.kill('SIGKILL');
    }
  }, forceKillGraceMs);
}

watch(srcDir, { recursive: true }, (_event, filename) => {
  if (!filename) {
    return;
  }
  if (!/\.(ts|tsx|js|mjs|cjs|json)$/.test(String(filename))) {
    return;
  }
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(triggerRestart, debounceMs);
});

function shutdown(signal) {
  shuttingDown = true;
  if (child) {
    child.kill(signal);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.stderr.write('[dev-server] supervised tsx starting (file-watch + crash-restart)\n');
spawnServer();

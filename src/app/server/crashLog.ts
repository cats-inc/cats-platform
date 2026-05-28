import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import {
  resolveDefaultPlatformDir,
  resolvePlatformStateDir,
} from '../../shared/platformPaths.js';

function resolveCrashLogPath(): string {
  try {
    return path.join(resolvePlatformStateDir(resolveDefaultPlatformDir()), 'dev-crash.log');
  } catch {
    return path.join(process.cwd(), 'dev-crash.log');
  }
}

function describe(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

let installed = false;

/**
 * Capture otherwise-silent process-fatal async failures (unhandled rejections,
 * uncaught exceptions) to a timestamped log before exiting, so the dev-server
 * supervisor can restart and the crash leaves a durable stack trace instead of
 * scrolling away in the terminal. Registering a listener overrides Node's
 * default rejection-exit, so the handler exits explicitly to preserve
 * crash-restart semantics.
 */
export function installGlobalCrashHandlers(logPath: string = resolveCrashLogPath()): void {
  if (installed) {
    return;
  }
  installed = true;

  const record = (kind: string, value: unknown): void => {
    const timestamp = new Date().toISOString();
    const detail = describe(value);
    try {
      mkdirSync(path.dirname(logPath), { recursive: true });
      appendFileSync(logPath, `\n[${timestamp}] ${kind}\n${detail}\n`);
    } catch {
      // Best-effort file logging; the stderr write below is the fallback.
    }
    process.stderr.write(
      `\n=== cats-platform ${kind} @ ${timestamp} ===\n${detail}\n=== crash log: ${logPath} ===\n`,
    );
  };

  process.on('uncaughtException', (error) => {
    record('uncaughtException', error);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    record('unhandledRejection', reason);
    process.exit(1);
  });
}

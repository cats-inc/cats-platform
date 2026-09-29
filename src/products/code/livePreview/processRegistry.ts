import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname } from 'node:path';

import type { LivePreviewProcessRegistry } from './supervisor.js';

/**
 * SPEC-123 CAP-13 orphan sweep. Leases are memory-only, so the supervisor
 * also records each running dev server's process id and port in a small file.
 * If Platform exits without stopping them (a crash or a killed process), the
 * next start stops every recorded process that still holds its port.
 */

export interface LivePreviewProcessRecord {
  previewId: string;
  processId: number;
  port: number;
  startedAt: string;
}

export function createFileLivePreviewProcessRegistry(filePath: string): LivePreviewProcessRegistry & {
  readAll(): LivePreviewProcessRecord[];
} {
  const write = (records: LivePreviewProcessRecord[]) => {
    mkdirSync(dirname(filePath), { recursive: true });
    const temporary = `${filePath}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
    renameSync(temporary, filePath);
  };
  const readAll = () => readLivePreviewProcessRecords(filePath);
  return {
    readAll,
    record(entry) {
      write([...readAll().filter((record) => record.previewId !== entry.previewId), entry]);
    },
    forget(previewId) {
      const records = readAll();
      const next = records.filter((record) => record.previewId !== previewId);
      if (next.length !== records.length) write(next);
    },
  };
}

export function readLivePreviewProcessRecords(filePath: string): LivePreviewProcessRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }
  return Array.isArray(parsed)
    ? parsed.filter((entry): entry is LivePreviewProcessRecord =>
      typeof entry?.previewId === 'string'
      && Number.isInteger(entry?.processId) && entry.processId > 0
      && Number.isInteger(entry?.port) && entry.port > 0
      && typeof entry?.startedAt === 'string')
    : [];
}

export interface LivePreviewOrphanSweepOptions {
  isAlive?: (processId: number) => boolean;
  portInUse?: (port: number) => Promise<boolean>;
  killTree?: (processId: number) => void;
}

/**
 * Stop recorded processes that are still alive and still hold their port;
 * both must hold so a reused process id is never killed. Removes the swept records.
 */
export async function sweepOrphanLivePreviewProcesses(
  filePath: string,
  options: LivePreviewOrphanSweepOptions = {},
): Promise<{ stopped: number[]; skipped: number[] }> {
  const isAlive = options.isAlive ?? isProcessAlive;
  const portInUse = options.portInUse ?? isLoopbackPortInUse;
  const killTree = options.killTree ?? killProcessTree;
  const stopped: number[] = [];
  const skipped: number[] = [];
  const swept = readLivePreviewProcessRecords(filePath);
  for (const record of swept) {
    if (isAlive(record.processId) && await portInUse(record.port)) {
      killTree(record.processId);
      stopped.push(record.processId);
    } else {
      skipped.push(record.processId);
    }
  }
  if (swept.length > 0) {
    // Keep anything recorded while the sweep ran; those leases are live.
    const sweptIds = new Set(swept.map((record) => record.previewId));
    const remaining = readLivePreviewProcessRecords(filePath).filter((record) => !sweptIds.has(record.previewId));
    writeFileSync(filePath, `${JSON.stringify(remaining, null, 2)}\n`, 'utf8');
  }
  return { stopped, skipped };
}

function isProcessAlive(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function isLoopbackPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(true));
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => probe.close(() => resolve(false)));
  });
}

function killProcessTree(processId: number): void {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(processId), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  try {
    // POSIX dev servers are spawned detached, as their own process group.
    process.kill(-processId, 'SIGKILL');
  } catch {
    try { process.kill(processId, 'SIGKILL'); } catch { /* already gone */ }
  }
}

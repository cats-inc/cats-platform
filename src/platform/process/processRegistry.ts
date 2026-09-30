import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { killProcessTreeRemnants, listProcesses, type KillRemnantsOptions } from './processTree.js';

/**
 * Host-supervised process roots recorded outside memory, so the next host
 * start can end what a crash left running (PLAN-115 P1).
 */

export interface ProcessRecord {
  id: string;
  processId: number;
  /** Epoch ms, taken just before the spawn; guards against reused ids. */
  startedAt: number;
}

export interface ProcessRecordRegistry {
  record(entry: ProcessRecord): void;
  forget(id: string): void;
  readAll(): ProcessRecord[];
}

export function createFileProcessRecordRegistry(filePath: string): ProcessRecordRegistry {
  const readAll = () => readProcessRecords(filePath);
  const write = (records: ProcessRecord[]) => {
    mkdirSync(dirname(filePath), { recursive: true });
    const temporary = `${filePath}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
    renameSync(temporary, filePath);
  };
  return {
    readAll,
    record(entry) {
      write([...readAll().filter((record) => record.id !== entry.id), entry]);
    },
    forget(id) {
      const records = readAll();
      const next = records.filter((record) => record.id !== id);
      if (next.length !== records.length) write(next);
    },
  };
}

export function readProcessRecords(filePath: string): ProcessRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }
  return Array.isArray(parsed)
    ? parsed.filter((entry): entry is ProcessRecord =>
      typeof entry?.id === 'string'
      && Number.isInteger(entry?.processId) && entry.processId > 0
      && Number.isFinite(entry?.startedAt))
    : [];
}

/**
 * End every recorded tree: the root if it is still the recorded process, and
 * what it started. Removes the swept records and keeps any recorded meanwhile.
 */
export async function sweepRecordedProcessTrees(
  registry: ProcessRecordRegistry,
  options: KillRemnantsOptions = {},
): Promise<{ killed: number[]; swept: number }> {
  const records = registry.readAll();
  const killed: number[] = [];
  if (records.length === 0) return { killed, swept: 0 };
  // One listing for every record; it takes seconds on Windows.
  const entries = await (options.listProcesses ?? (() => listProcesses(options.platform)))();
  for (const record of records) {
    killed.push(...await killProcessTreeRemnants(record.processId, record.startedAt, {
      ...options,
      listProcesses: async () => entries,
    }));
    registry.forget(record.id);
  }
  return { killed, swept: records.length };
}

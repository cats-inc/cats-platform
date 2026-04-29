import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  resolvePlatformStorageLayout,
} from '../shared/platformPaths.js';

const DIAGNOSTIC_FILE_LIMIT = 200;

export type RuntimeClientDiagnosticCode = 'slow_session_create';

export type RuntimeClientDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface RuntimeClientDiagnosticRecord {
  id: string;
  kind: 'runtime_client';
  severity: RuntimeClientDiagnosticSeverity;
  code: RuntimeClientDiagnosticCode;
  observedAt: string;
  provider?: string;
  sessionId?: string;
  elapsedMs?: number;
  thresholdMs?: number;
  message: string;
}

export interface RuntimeClientDiagnosticsFile {
  schemaVersion: 1;
  updatedAt: string;
  records: RuntimeClientDiagnosticRecord[];
}

export interface RuntimeClientDiagnosticSink {
  emit(record: RuntimeClientDiagnosticRecord): void;
  list(): RuntimeClientDiagnosticRecord[];
}

export interface RuntimeClientDiagnosticSinkOptions {
  persistPath?: string | null;
}

export function resolveRuntimeClientDiagnosticsPath(chatStatePath: string): string {
  try {
    const layout = resolvePlatformStorageLayout(chatStatePath);
    return path.join(layout.stateDir, 'runtime-client-diagnostics.local.json');
  } catch {
    return path.join(
      path.dirname(path.resolve(chatStatePath)),
      'runtime-client-diagnostics.local.json',
    );
  }
}

export function createRuntimeClientDiagnosticSink(
  options: RuntimeClientDiagnosticSinkOptions = {},
): RuntimeClientDiagnosticSink {
  const persistPath = options.persistPath ?? null;
  let records = trimDiagnosticRecords(readPersistedRecords(persistPath));

  return {
    emit(record) {
      records = trimDiagnosticRecords([...records, record]);
      persistRecords(persistPath, records);
    },
    list() {
      return [...records];
    },
  };
}

function readPersistedRecords(persistPath: string | null): RuntimeClientDiagnosticRecord[] {
  if (!persistPath) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(persistPath, 'utf8')) as unknown;
    if (
      !parsed
      || typeof parsed !== 'object'
      || !Array.isArray((parsed as { records?: unknown }).records)
    ) {
      return [];
    }
    return (parsed as { records: unknown[] }).records.filter(isRuntimeClientDiagnosticRecord);
  } catch {
    return [];
  }
}

function persistRecords(
  persistPath: string | null,
  records: readonly RuntimeClientDiagnosticRecord[],
): void {
  if (!persistPath) {
    return;
  }
  try {
    mkdirSync(path.dirname(persistPath), { recursive: true });
    const payload: RuntimeClientDiagnosticsFile = {
      schemaVersion: 1,
      updatedAt: records[records.length - 1]?.observedAt ?? new Date(0).toISOString(),
      records: [...records],
    };
    const tempPath = path.join(
      path.dirname(persistPath),
      `.${path.basename(persistPath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    writeFileSync(tempPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    renameSync(tempPath, persistPath);
  } catch {
    // Diagnostics must not block product startup or runtime calls.
  }
}

function trimDiagnosticRecords(
  records: readonly RuntimeClientDiagnosticRecord[],
): RuntimeClientDiagnosticRecord[] {
  return records.slice(Math.max(0, records.length - DIAGNOSTIC_FILE_LIMIT));
}

function isRuntimeClientDiagnosticRecord(value: unknown): value is RuntimeClientDiagnosticRecord {
  const record = value as Partial<RuntimeClientDiagnosticRecord> | null;
  return Boolean(record)
    && record?.kind === 'runtime_client'
    && typeof record.id === 'string'
    && typeof record.severity === 'string'
    && typeof record.code === 'string'
    && typeof record.observedAt === 'string'
    && typeof record.message === 'string';
}

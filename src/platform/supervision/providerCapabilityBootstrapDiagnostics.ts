import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  resolvePlatformStorageLayout,
} from '../../shared/platformPaths.js';
import type { SupervisionDiagnosticRecord } from './contracts.js';

const DIAGNOSTIC_FILE_LIMIT = 200;

export interface ProviderCapabilityBootstrapDiagnosticLogEvent {
  event: 'provider_capability_bootstrap_config';
  id: string;
  severity: SupervisionDiagnosticRecord['severity'];
  code: SupervisionDiagnosticRecord['code'];
  observedAt: string;
  configPath?: string;
  ruleIds?: string[];
  target?: SupervisionDiagnosticRecord['target'];
  message: string;
}

export interface ProviderCapabilityBootstrapDiagnosticsFile {
  schemaVersion: 1;
  updatedAt: string;
  records: SupervisionDiagnosticRecord[];
}

export interface ProviderCapabilityBootstrapDiagnosticSink {
  emit(record: SupervisionDiagnosticRecord): void;
  emitMany(records: readonly SupervisionDiagnosticRecord[]): void;
  list(): SupervisionDiagnosticRecord[];
}

export interface ProviderCapabilityBootstrapDiagnosticSinkOptions {
  initialRecords?: readonly SupervisionDiagnosticRecord[];
  persistPath?: string | null;
  logEvent?: (event: ProviderCapabilityBootstrapDiagnosticLogEvent) => void;
}

export function resolveProviderCapabilityBootstrapDiagnosticsPath(
  chatStatePath: string,
): string {
  try {
    const layout = resolvePlatformStorageLayout(chatStatePath);
    return path.join(layout.stateDir, 'provider-capability-bootstrap-diagnostics.local.json');
  } catch {
    return path.join(
      path.dirname(path.resolve(chatStatePath)),
      'provider-capability-bootstrap-diagnostics.local.json',
    );
  }
}

export function createProviderCapabilityBootstrapDiagnosticLogEvent(
  record: SupervisionDiagnosticRecord,
): ProviderCapabilityBootstrapDiagnosticLogEvent {
  return {
    event: 'provider_capability_bootstrap_config',
    id: record.id,
    severity: record.severity,
    code: record.code,
    observedAt: record.observedAt,
    configPath: record.configPath,
    ruleIds: record.ruleIds,
    target: record.target,
    message: record.message,
  };
}

export function createProviderCapabilityBootstrapDiagnosticSink(
  options: ProviderCapabilityBootstrapDiagnosticSinkOptions
    | readonly SupervisionDiagnosticRecord[] = {},
): ProviderCapabilityBootstrapDiagnosticSink {
  const normalizedOptions: ProviderCapabilityBootstrapDiagnosticSinkOptions = Array.isArray(options)
    ? { initialRecords: options as readonly SupervisionDiagnosticRecord[] }
    : options as ProviderCapabilityBootstrapDiagnosticSinkOptions;
  let records = trimDiagnosticRecords([
    ...readPersistedDiagnosticRecords(normalizedOptions.persistPath ?? null),
  ]);

  function emit(record: SupervisionDiagnosticRecord): void {
    records = trimDiagnosticRecords([...records, record]);
    normalizedOptions.logEvent?.(createProviderCapabilityBootstrapDiagnosticLogEvent(record));
    persistDiagnosticRecords(normalizedOptions.persistPath ?? null, records);
  }

  const sink = {
    emit,
    emitMany(nextRecords: readonly SupervisionDiagnosticRecord[]) {
      for (const record of nextRecords) {
        emit(record);
      }
    },
    list() {
      return [...records];
    },
  };

  sink.emitMany(normalizedOptions.initialRecords ?? []);
  return sink;
}

function readPersistedDiagnosticRecords(
  persistPath: string | null,
): SupervisionDiagnosticRecord[] {
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
    return (parsed as { records: unknown[] }).records
      .filter(isSupervisionDiagnosticRecord);
  } catch {
    return [];
  }
}

function persistDiagnosticRecords(
  persistPath: string | null,
  records: readonly SupervisionDiagnosticRecord[],
): void {
  if (!persistPath) {
    return;
  }

  try {
    mkdirSync(path.dirname(persistPath), { recursive: true });
    const payload: ProviderCapabilityBootstrapDiagnosticsFile = {
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
    // Diagnostics must not block product startup or dispatch.
  }
}

function trimDiagnosticRecords(
  records: readonly SupervisionDiagnosticRecord[],
): SupervisionDiagnosticRecord[] {
  return records.slice(Math.max(0, records.length - DIAGNOSTIC_FILE_LIMIT));
}

function isSupervisionDiagnosticRecord(value: unknown): value is SupervisionDiagnosticRecord {
  const record = value as Partial<SupervisionDiagnosticRecord> | null;
  return Boolean(record)
    && record?.kind === 'provider_capability_bootstrap_config'
    && typeof record.id === 'string'
    && typeof record.severity === 'string'
    && typeof record.code === 'string'
    && typeof record.observedAt === 'string'
    && typeof record.message === 'string';
}

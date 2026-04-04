import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  DEFAULT_PRODUCT_BOOTSTRAP_HISTORY_LIMIT,
  ensureBootstrapEventTimestamp,
  summarizeBootstrapEvents,
  trimBootstrapEvents,
  type BootstrapEvent,
  type BootstrapEventError,
  type BootstrapEventReference,
  type BootstrapEventStatus,
  type ProductBootstrapDiagnosticsReadModel,
} from './bootstrapDiagnostics.js';

interface PlatformOnboardingHistoryFile {
  schemaVersion: 1;
  updatedAt: string;
  activeAttemptId: string | null;
  events: BootstrapEvent[];
}

const EMPTY_HISTORY: PlatformOnboardingHistoryFile = {
  schemaVersion: 1,
  updatedAt: new Date(0).toISOString(),
  activeAttemptId: null,
  events: [],
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return isObjectRecord(value) ? value : undefined;
}

function normalizeEventReference(value: unknown): BootstrapEventReference | undefined {
  const record = readRecord(value);
  if (!record) {
    return undefined;
  }

  const artifactId = readString(record.artifactId) ?? undefined;
  const artifactPath = readString(record.artifactPath) ?? undefined;
  const recordId = readString(record.recordId) ?? undefined;
  const route = readString(record.route) ?? undefined;
  if (!artifactId && !artifactPath && !recordId && !route) {
    return undefined;
  }
  return {
    artifactId,
    artifactPath,
    recordId,
    route,
  };
}

function normalizeEventError(value: unknown): BootstrapEventError | undefined {
  const record = readRecord(value);
  if (!record) {
    return undefined;
  }
  const message = readString(record.message);
  if (!message) {
    return undefined;
  }
  return {
    message,
    code: readString(record.code) ?? undefined,
    cause: readString(record.cause) ?? undefined,
    stack: readString(record.stack) ?? undefined,
  };
}

function normalizeBootstrapEvent(value: unknown): BootstrapEvent | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }

  const layer = readString(record.layer);
  const kind = readString(record.kind);
  const timestamp = readString(record.timestamp);
  const summary = readString(record.summary);
  if (layer !== 'runtime' && layer !== 'product' && layer !== 'host') {
    return null;
  }
  if (!kind || !timestamp || !summary) {
    return null;
  }

  const status = record.status === 'ok'
    || record.status === 'degraded'
    || record.status === 'unavailable'
    || record.status === 'info'
    ? record.status
    : 'info';

  return {
    layer,
    kind,
    timestamp,
    attemptId: readString(record.attemptId),
    summary,
    status,
    context: readRecord(record.context),
    error: normalizeEventError(record.error),
    reference: normalizeEventReference(record.reference),
  };
}

function normalizeHistoryFile(value: unknown): PlatformOnboardingHistoryFile {
  if (!isObjectRecord(value)) {
    return { ...EMPTY_HISTORY };
  }

  const events = Array.isArray(value.events)
    ? value.events
      .map((entry) => normalizeBootstrapEvent(entry))
      .filter((entry): entry is BootstrapEvent => Boolean(entry))
      .filter((entry) => entry.layer === 'product')
    : [];

  return {
    schemaVersion: 1,
    updatedAt: readString(value.updatedAt) ?? EMPTY_HISTORY.updatedAt,
    activeAttemptId: readString(value.activeAttemptId),
    events: trimBootstrapEvents(events, DEFAULT_PRODUCT_BOOTSTRAP_HISTORY_LIMIT),
  };
}

async function writeAtomicJson(filePath: string, payload: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  await writeFile(tempPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await rename(tempPath, filePath);
}

export function resolvePlatformOnboardingHistoryPath(chatStatePath: string): string {
  return path.join(path.dirname(chatStatePath), 'platform-onboarding-history.json');
}

export async function readPlatformOnboardingHistoryFile(
  chatStatePath: string,
): Promise<PlatformOnboardingHistoryFile> {
  try {
    const raw = await readFile(resolvePlatformOnboardingHistoryPath(chatStatePath), 'utf8');
    return normalizeHistoryFile(JSON.parse(raw) as unknown);
  } catch {
    return { ...EMPTY_HISTORY };
  }
}

export async function appendPlatformOnboardingEvent(
  chatStatePath: string,
  input: {
    now?: Date;
    attemptId?: string | null;
    kind: string;
    status?: BootstrapEventStatus;
    summary: string;
    context?: Record<string, unknown>;
    error?: BootstrapEventError;
    reference?: BootstrapEventReference;
  },
): Promise<ProductBootstrapDiagnosticsReadModel> {
  const historyPath = resolvePlatformOnboardingHistoryPath(chatStatePath);
  const now = input.now ?? new Date();
  const current = await readPlatformOnboardingHistoryFile(chatStatePath);
  const recordId = input.reference?.recordId ?? `product-${randomUUID()}`;
  const timestamp = ensureBootstrapEventTimestamp(
    now.toISOString(),
    current.events[0]?.timestamp ?? current.updatedAt,
  );
  const nextEvent: BootstrapEvent = {
    layer: 'product',
    kind: input.kind,
    timestamp,
    attemptId: input.attemptId ?? current.activeAttemptId ?? null,
    summary: input.summary,
    status: input.status ?? 'info',
    context: input.context,
    error: input.error,
    reference: {
      artifactPath: historyPath,
      ...input.reference,
      recordId,
    },
  };

  const nextFile: PlatformOnboardingHistoryFile = {
    schemaVersion: 1,
    updatedAt: timestamp,
    activeAttemptId: nextEvent.attemptId ?? null,
    events: trimBootstrapEvents(
      [nextEvent, ...current.events],
      DEFAULT_PRODUCT_BOOTSTRAP_HISTORY_LIMIT,
    ),
  };
  await writeAtomicJson(historyPath, nextFile);
  return summarizePlatformOnboardingHistory(nextFile, historyPath);
}

export async function readPlatformOnboardingHistory(
  chatStatePath: string,
): Promise<ProductBootstrapDiagnosticsReadModel> {
  const historyPath = resolvePlatformOnboardingHistoryPath(chatStatePath);
  const file = await readPlatformOnboardingHistoryFile(chatStatePath);
  return summarizePlatformOnboardingHistory(file, historyPath);
}

export function summarizePlatformOnboardingHistory(
  file: PlatformOnboardingHistoryFile,
  historyPath: string,
): ProductBootstrapDiagnosticsReadModel {
  const layerSummary = summarizeBootstrapEvents(file.events, {
    status: 'info',
    summary: 'No product-owned onboarding events have been recorded yet.',
  });

  return {
    generatedAt: file.updatedAt,
    attemptId: file.activeAttemptId,
    status: layerSummary.status,
    summary: layerSummary.summary,
    historyPath,
    latestReference: layerSummary.latestReference,
    events: trimBootstrapEvents(file.events, DEFAULT_PRODUCT_BOOTSTRAP_HISTORY_LIMIT),
  };
}

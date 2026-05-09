// Idempotency helpers for mission and run records. Replay-safe pipelines
// (cron tickers, transport ingress adapters, workflow continuations,
// webhooks) need a stable way to check "have we already created the
// mission / run for this exact source event?" before issuing another
// upsert. The platform stores the dedupe key on the record's metadata
// under a fixed key so any replay path can look it up.

import type {
  CatsCoreState,
  CoreRecordMetadata,
  CoreRunRecord,
  MissionRecord,
} from './types.js';

export const MISSION_METADATA_IDEMPOTENCY_KEY = 'idempotencyKey' as const;
export const RUN_METADATA_IDEMPOTENCY_KEY = 'idempotencyKey' as const;

function readNormalizedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function readMissionIdempotencyKey(mission: MissionRecord): string | null {
  return readNormalizedString(mission.metadata[MISSION_METADATA_IDEMPOTENCY_KEY]);
}

export function readRunIdempotencyKey(run: CoreRunRecord): string | null {
  return readNormalizedString(run.metadata[RUN_METADATA_IDEMPOTENCY_KEY]);
}

export function withMissionIdempotencyKey(
  metadata: CoreRecordMetadata,
  idempotencyKey: string,
): CoreRecordMetadata {
  const normalized = readNormalizedString(idempotencyKey);
  if (normalized === null) {
    return metadata;
  }
  return { ...metadata, [MISSION_METADATA_IDEMPOTENCY_KEY]: normalized };
}

export function withRunIdempotencyKey(
  metadata: CoreRecordMetadata,
  idempotencyKey: string,
): CoreRecordMetadata {
  const normalized = readNormalizedString(idempotencyKey);
  if (normalized === null) {
    return metadata;
  }
  return { ...metadata, [RUN_METADATA_IDEMPOTENCY_KEY]: normalized };
}

export function findMissionByIdempotencyKey(
  core: CatsCoreState,
  idempotencyKey: string,
): MissionRecord | null {
  const normalized = readNormalizedString(idempotencyKey);
  if (normalized === null) {
    return null;
  }
  return core.missions.find((mission) =>
    readMissionIdempotencyKey(mission) === normalized) ?? null;
}

export function findRunByIdempotencyKey(
  core: CatsCoreState,
  idempotencyKey: string,
): CoreRunRecord | null {
  const normalized = readNormalizedString(idempotencyKey);
  if (normalized === null) {
    return null;
  }
  return core.runs.find((run) => readRunIdempotencyKey(run) === normalized) ?? null;
}

export type MissionIdempotencyStatus = 'duplicate' | 'unique';
export type RunIdempotencyStatus = 'duplicate' | 'unique';

export interface MissionIdempotencyResult {
  status: MissionIdempotencyStatus;
  existingMissionId: string | null;
}

export interface RunIdempotencyResult {
  status: RunIdempotencyStatus;
  existingRunId: string | null;
}

export function checkMissionIdempotency(
  core: CatsCoreState,
  idempotencyKey: string,
): MissionIdempotencyResult {
  const existing = findMissionByIdempotencyKey(core, idempotencyKey);
  return existing
    ? { status: 'duplicate', existingMissionId: existing.id }
    : { status: 'unique', existingMissionId: null };
}

export function checkRunIdempotency(
  core: CatsCoreState,
  idempotencyKey: string,
): RunIdempotencyResult {
  const existing = findRunByIdempotencyKey(core, idempotencyKey);
  return existing
    ? { status: 'duplicate', existingRunId: existing.id }
    : { status: 'unique', existingRunId: null };
}

/**
 * SPEC-096 / PLAN-085 — generic Run stop and Mission cancel service.
 *
 * `stopRun` is the canonical primitive: it classifies whether a single
 * `CoreRunRecord` can be stopped, requests runtime cancellation through
 * the supervision boundary when an active runtime session exists, and
 * persists `cancelled` state with append-only audit metadata.
 * `cancelMission` composes `stopRun` over every active run associated
 * with a mission.
 *
 * Runs without a supervised runtime bridge while in `running` state are
 * deliberately classified as `not_stoppable` rather than getting a
 * metadata-only cancellation — the public contract must not lie about
 * whether the runtime was actually aborted.
 */

import { randomUUID } from 'node:crypto';

import { appendCoreTrace, upsertCoreMission, upsertCoreRun } from '../../core/model/index.js';
import type { CoreStore } from '../../core/store.js';
import type {
  CatsCoreState,
  CoreRunRecord,
  MissionRecord,
} from '../../core/types.js';
import type { RuntimeClient } from '../runtime/client.js';
import type {
  CancellationSource,
  CoreCancellationMetadata,
  RuntimeAbortInfo,
  WorkCancellationRequest,
  WorkMissionCancelResponse,
  WorkRunStopResponse,
} from './runCancellationContracts.js';

const DEFAULT_REQUESTED_BY = 'actor-owner';

export interface RunCancellationDependencies {
  coreStore: CoreStore;
  runtimeClient?: RuntimeClient;
  now?: () => Date;
}

export interface StopRunOptions extends WorkCancellationRequest {
  /**
   * Provenance of the stop command. Defaults to `'run_stop'` for a direct
   * caller. The schedule replacement helper passes `'schedule_replace'`,
   * the legacy task supervised-run cancel route passes
   * `'task_supervised_run_cancel'`, and the mission aggregate passes
   * `'mission_cancel'`.
   */
  source?: CancellationSource;
}

export type CancelMissionOptions = WorkCancellationRequest;

export class RunCancellationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'RunCancellationError';
  }
}

/**
 * Stop a single run. Returns `null` when the run does not exist (callers
 * map this to HTTP 404).
 */
export async function stopRun(
  dependencies: RunCancellationDependencies,
  runId: string,
  options: StopRunOptions = {},
): Promise<WorkRunStopResponse | null> {
  const now = dependencies.now?.() ?? new Date();
  const requestedAt = now.toISOString();
  const command: ResolvedCommand = {
    commandId: options.idempotencyKey?.trim() || `cancel-${randomUUID()}`,
    requestedAt,
    requestedByActorId:
      options.requestedByActorId?.trim() || DEFAULT_REQUESTED_BY,
    reason: options.reason?.trim() || null,
    source: options.source ?? 'run_stop',
  };

  const initial = await readRunSnapshot(dependencies.coreStore, runId);
  if (!initial) {
    return null;
  }

  if (isTerminalRunStatus(initial.run.status)) {
    return {
      status: 'already_terminal',
      run: initial.run,
      mission: initial.mission,
      runtimeAbort: notApplicableRuntimeAbort(),
      message: `Run ${runId} is already ${initial.run.status}.`,
    };
  }

  if (initial.run.status === 'running') {
    if (!initial.sessionId) {
      return blockedRunResponse({
        run: initial.run,
        mission: initial.mission,
        message:
          'Running run is not stoppable: no supervised runtime session is bridged.',
        runtimeAbort: { attempted: false, sessionId: null, status: 'not_applicable' },
      });
    }
    if (!dependencies.runtimeClient) {
      return blockedRunResponse({
        run: initial.run,
        mission: initial.mission,
        message:
          'Runtime client is unavailable; cannot request runtime cancellation.',
        runtimeAbort: {
          attempted: false,
          sessionId: initial.sessionId,
          status: 'failed',
          error: 'runtime_client_unavailable',
        },
      });
    }
    try {
      await dependencies.runtimeClient.cancelSession(initial.sessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return blockedRunResponse({
        run: initial.run,
        mission: initial.mission,
        message: `Runtime cancellation failed: ${message}`,
        runtimeAbort: {
          attempted: true,
          sessionId: initial.sessionId,
          status: 'failed',
          error: message,
        },
      });
    }
  }

  const runtimeAbort: RuntimeAbortInfo =
    initial.run.status === 'running'
      ? {
          attempted: true,
          sessionId: initial.sessionId,
          status: 'requested',
        }
      : initial.sessionId
        ? {
            attempted: false,
            sessionId: initial.sessionId,
            status: 'not_applicable',
          }
        : notApplicableRuntimeAbort();

  return persistRunCancellation({
    coreStore: dependencies.coreStore,
    runId,
    command,
    runtimeAbort,
    now,
  });
}

/**
 * Cancel a mission and stop every active associated run. Returns `null`
 * when the mission does not exist.
 */
export async function cancelMission(
  dependencies: RunCancellationDependencies,
  missionId: string,
  options: CancelMissionOptions = {},
): Promise<WorkMissionCancelResponse | null> {
  const now = dependencies.now?.() ?? new Date();
  const requestedAt = now.toISOString();
  const command: ResolvedCommand = {
    commandId: options.idempotencyKey?.trim() || `cancel-${randomUUID()}`,
    requestedAt,
    requestedByActorId:
      options.requestedByActorId?.trim() || DEFAULT_REQUESTED_BY,
    reason: options.reason?.trim() || null,
    source: 'mission_cancel',
  };

  const core = await dependencies.coreStore.readCore();
  const mission =
    core.missions.find((candidate) => candidate.id === missionId) ?? null;
  if (!mission) {
    return null;
  }

  if (isTerminalMissionStatus(mission.status)) {
    return {
      status: 'already_terminal',
      mission,
      runResults: [],
      blockers: [],
      message: `Mission ${missionId} is already ${mission.status}.`,
    };
  }

  const activeRuns = core.runs.filter(
    (run) =>
      readRunMissionId(run) === missionId
      && !isTerminalRunStatus(run.status),
  );

  const runResults: WorkRunStopResponse[] = [];
  for (const candidate of activeRuns) {
    const result = await stopRun(dependencies, candidate.id, {
      ...options,
      // Cascade the same command id so per-run audit rows correlate with
      // the mission cancel command.
      idempotencyKey: command.commandId,
      source: 'mission_cancel',
    });
    if (result) {
      runResults.push(result);
    }
  }

  const blockers = runResults
    .filter((result) => result.status === 'not_stoppable')
    .map((result) => ({
      runId: result.run.id,
      reason: result.message ?? 'Run is not stoppable.',
    }));

  if (blockers.length > 0) {
    return {
      status: 'blocked',
      mission,
      runResults,
      blockers,
      message: `Mission cancel blocked by ${blockers.length} active run(s).`,
    };
  }

  return persistMissionCancellation({
    coreStore: dependencies.coreStore,
    missionId,
    command,
    runResults,
    now,
  });
}

interface ResolvedCommand {
  commandId: string;
  requestedAt: string;
  requestedByActorId: string;
  reason: string | null;
  source: CancellationSource;
}

interface RunSnapshot {
  run: CoreRunRecord;
  mission: MissionRecord | null;
  sessionId: string | null;
}

async function readRunSnapshot(
  coreStore: CoreStore,
  runId: string,
): Promise<RunSnapshot | null> {
  const core = await coreStore.readCore();
  const run = core.runs.find((candidate) => candidate.id === runId) ?? null;
  if (!run) {
    return null;
  }
  return {
    run,
    mission: resolveRunMission(core, run),
    sessionId: readRuntimeBridgeSessionId(run),
  };
}

interface BlockedRunInput {
  run: CoreRunRecord;
  mission: MissionRecord | null;
  message: string;
  runtimeAbort: RuntimeAbortInfo;
}

function blockedRunResponse(input: BlockedRunInput): WorkRunStopResponse {
  return {
    status: 'not_stoppable',
    run: input.run,
    mission: input.mission,
    runtimeAbort: input.runtimeAbort,
    message: input.message,
  };
}

interface PersistRunCancellationInput {
  coreStore: CoreStore;
  runId: string;
  command: ResolvedCommand;
  runtimeAbort: RuntimeAbortInfo;
  now: Date;
}

async function persistRunCancellation(
  input: PersistRunCancellationInput,
): Promise<WorkRunStopResponse> {
  let result: WorkRunStopResponse | null = null;
  await input.coreStore.updateCore((core) => {
    const latestRun =
      core.runs.find((candidate) => candidate.id === input.runId) ?? null;
    if (!latestRun) {
      throw new RunCancellationError(
        `Run ${input.runId} disappeared during cancellation.`,
        'run_not_found',
      );
    }
    if (isTerminalRunStatus(latestRun.status)) {
      result = {
        status: 'already_terminal',
        run: latestRun,
        mission: resolveRunMission(core, latestRun),
        runtimeAbort: notApplicableRuntimeAbort(),
        message: `Run ${input.runId} reached ${latestRun.status} before cancellation persisted.`,
      };
      return core;
    }

    const cancellationMetadata: CoreCancellationMetadata = {
      source: input.command.source,
      commandId: input.command.commandId,
      requestedAt: input.command.requestedAt,
      requestedByActorId: input.command.requestedByActorId,
      reason: input.command.reason,
      status: 'succeeded',
      runtimeAbort: input.runtimeAbort,
    };

    const nextMetadata = appendRunCancellationMetadata(
      latestRun.metadata,
      cancellationMetadata,
      { runtimeAbort: input.runtimeAbort, requestedAt: input.command.requestedAt },
    );

    const completedAt = input.command.requestedAt;
    const summary =
      input.command.source === 'schedule_replace'
        ? 'Cancelled scheduled run for replacement.'
        : input.command.source === 'mission_cancel'
          ? 'Cancelled by mission cancel command.'
          : 'Cancelled by run stop command.';

    const upsertResult = upsertCoreRun(
      core,
      {
        id: latestRun.id,
        title: latestRun.title,
        status: 'cancelled',
        startedAt: latestRun.startedAt,
        completedAt,
        summary,
        metadata: nextMetadata,
      },
      input.now,
    );

    const traced = appendCoreTrace(
      upsertResult.core,
      {
        id: `${latestRun.id}:${input.command.commandId}`,
        traceId: latestRun.traceId ?? `trace-${latestRun.id}`,
        kind: 'outcome',
        conversationId: latestRun.conversationId,
        runId: latestRun.id,
        taskId: latestRun.taskId,
        actorId:
          latestRun.orchestratorActorId ?? input.command.requestedByActorId,
        message: cancellationTraceMessage(input.command, input.runtimeAbort),
        metadata: {
          source: input.command.source,
          commandId: input.command.commandId,
          requestedByActorId: input.command.requestedByActorId,
          reason: input.command.reason,
          runtimeAbort: input.runtimeAbort,
        },
      },
      input.now,
    );

    const persistedRun =
      traced.core.runs.find((candidate) => candidate.id === latestRun.id)
      ?? upsertResult.run;
    result = {
      status: 'stopped',
      run: persistedRun,
      mission: resolveRunMission(traced.core, persistedRun),
      runtimeAbort: input.runtimeAbort,
      message: null,
    };
    return traced.core;
  });

  if (!result) {
    throw new RunCancellationError(
      `Run cancellation did not persist a result for ${input.runId}.`,
      'cancellation_no_result',
    );
  }
  return result;
}

interface PersistMissionCancellationInput {
  coreStore: CoreStore;
  missionId: string;
  command: ResolvedCommand;
  runResults: WorkRunStopResponse[];
  now: Date;
}

async function persistMissionCancellation(
  input: PersistMissionCancellationInput,
): Promise<WorkMissionCancelResponse> {
  let result: WorkMissionCancelResponse | null = null;
  await input.coreStore.updateCore((core) => {
    const latestMission =
      core.missions.find((candidate) => candidate.id === input.missionId)
      ?? null;
    if (!latestMission) {
      throw new RunCancellationError(
        `Mission ${input.missionId} disappeared during cancellation.`,
        'mission_not_found',
      );
    }
    if (isTerminalMissionStatus(latestMission.status)) {
      result = {
        status: 'already_terminal',
        mission: latestMission,
        runResults: input.runResults,
        blockers: [],
        message: `Mission ${input.missionId} reached ${latestMission.status} before cancellation persisted.`,
      };
      return core;
    }

    const cancellationMetadata: CoreCancellationMetadata = {
      source: input.command.source,
      commandId: input.command.commandId,
      requestedAt: input.command.requestedAt,
      requestedByActorId: input.command.requestedByActorId,
      reason: input.command.reason,
      status: 'succeeded',
      runtimeAbort: notApplicableRuntimeAbort(),
    };

    const nextMetadata: Record<string, unknown> = {
      ...latestMission.metadata,
      cancellation: appendCancellationEntry(
        latestMission.metadata.cancellation,
        cancellationMetadata,
      ),
    };

    const upsertResult = upsertCoreMission(
      core,
      {
        id: latestMission.id,
        title: latestMission.title,
        status: 'cancelled',
        conversationId: latestMission.conversationId,
        assignedAgentId: latestMission.assignedAgentId,
        summary: latestMission.summary,
        createdAt: latestMission.createdAt,
        metadata: nextMetadata,
      },
      input.now,
    );

    result = {
      status: 'cancelled',
      mission: upsertResult.mission,
      runResults: input.runResults,
      blockers: [],
      message: null,
    };
    return upsertResult.core;
  });

  if (!result) {
    throw new RunCancellationError(
      `Mission cancellation did not persist a result for ${input.missionId}.`,
      'cancellation_no_result',
    );
  }
  return result;
}

function appendRunCancellationMetadata(
  existing: Record<string, unknown> | null | undefined,
  entry: CoreCancellationMetadata,
  bridgeUpdate: { runtimeAbort: RuntimeAbortInfo; requestedAt: string },
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...(existing ?? {}) };
  metadata.cancellation = appendCancellationEntry(
    metadata.cancellation,
    entry,
  );

  // Only update runtimeBridge when the metadata block already exists; we
  // don't synthesize one for runs that never had supervision wiring.
  const supervision = asRecord(metadata.supervision);
  const existingBridge = supervision ? asRecord(supervision.runtimeBridge) : null;
  if (supervision && existingBridge) {
    metadata.supervision = {
      ...supervision,
      runtimeBridge: {
        ...existingBridge,
        status: 'cancel_requested',
        cancelRequestedAt: bridgeUpdate.requestedAt,
        cancelRuntimeAbort: bridgeUpdate.runtimeAbort,
      },
    };
  }

  return metadata;
}

function appendCancellationEntry(
  existing: unknown,
  entry: CoreCancellationMetadata,
): CoreCancellationMetadata[] {
  const list = Array.isArray(existing)
    ? (existing.filter(
        (candidate): candidate is CoreCancellationMetadata =>
          isCancellationEntry(candidate),
      ) as CoreCancellationMetadata[])
    : [];
  return [...list, entry];
}

function isCancellationEntry(value: unknown): value is CoreCancellationMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<CoreCancellationMetadata>;
  return typeof candidate.commandId === 'string' && typeof candidate.source === 'string';
}

function notApplicableRuntimeAbort(): RuntimeAbortInfo {
  return { attempted: false, sessionId: null, status: 'not_applicable' };
}

function isTerminalRunStatus(status: CoreRunRecord['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function isTerminalMissionStatus(status: MissionRecord['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function readRunMissionId(run: CoreRunRecord): string | null {
  const value = run.metadata.missionId;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function resolveRunMission(
  core: CatsCoreState,
  run: CoreRunRecord,
): MissionRecord | null {
  const missionId = readRunMissionId(run);
  return missionId
    ? core.missions.find((candidate) => candidate.id === missionId) ?? null
    : null;
}

function readRuntimeBridgeSessionId(run: CoreRunRecord): string | null {
  const supervision = asRecord(run.metadata.supervision);
  const bridge = supervision ? asRecord(supervision.runtimeBridge) : null;
  if (!bridge) {
    return null;
  }
  const sessionId = bridge.sessionId;
  return typeof sessionId === 'string' && sessionId.trim().length > 0
    ? sessionId
    : null;
}

function cancellationTraceMessage(
  command: ResolvedCommand,
  runtimeAbort: RuntimeAbortInfo,
): string {
  const parts: string[] = [`Run cancelled by ${command.source}`];
  if (runtimeAbort.attempted && runtimeAbort.sessionId) {
    parts.push(`runtime session ${runtimeAbort.sessionId} cancellation requested`);
  }
  if (command.reason) {
    parts.push(`reason: ${command.reason}`);
  }
  return parts.join('; ');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

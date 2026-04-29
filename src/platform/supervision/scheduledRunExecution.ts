import { appendCoreTrace, upsertCoreMission, upsertCoreRun } from '../../core/model/index.js';
import { CoreConflictError } from '../../core/errors.js';
import type { CoreStore } from '../../core/store.js';
import type {
  CatsCoreState,
  CoreActorRecord,
  CoreRunRecord,
  ExecutionTargetSummary,
  MissionRecord,
} from '../../core/types.js';
import type {
  RuntimeClient,
  RuntimeMessageResult,
  RuntimeSessionInfo,
} from '../runtime/client.js';
import { startProviderAgentRunLoop } from '../orchestration/index.js';
import {
  createDurableToolEvidenceSink,
} from './evidenceSink.js';
import {
  cancelMission,
  stopRun,
} from './runCancellation.js';
import {
  deriveRunState,
  writeRunStateMetadata,
} from './runState.js';
import type {
  ProviderAgentRunLoopRecord,
  RunLoopDecisionHandoff,
} from './runLoopHandoff.js';
import type { ScheduleTriggerMetadata } from '../scheduler/index.js';

export interface ScheduledRunExecutionDependencies {
  coreStore: CoreStore;
  runtimeClient?: RuntimeClient;
  evidenceDataDir?: string;
  now?: () => Date;
}

export interface ScheduledRunExecutionResult {
  status: 'launched' | 'skipped' | 'blocked';
  run: CoreRunRecord;
  mission: MissionRecord | null;
  message: string | null;
}

export interface ScheduledRunCancellationOptions {
  requestedBy?: string;
  requestedAt?: string;
  reasonNote?: string;
}

export interface ScheduledRunCancellationResult {
  status: 'cancelled' | 'skipped';
  run: CoreRunRecord;
  mission: MissionRecord | null;
  message: string | null;
}

interface ScheduledRunLaunchContext {
  core: CatsCoreState;
  run: CoreRunRecord;
  mission: MissionRecord;
  actor: CoreActorRecord;
  target: ExecutionTargetSummary;
  trigger: ScheduleTriggerMetadata;
  evaluatedAt: string;
}

export async function launchScheduledRunThroughSupervision(
  dependencies: ScheduledRunExecutionDependencies,
  runId: string,
): Promise<ScheduledRunExecutionResult | null> {
  if (!dependencies.runtimeClient) {
    return null;
  }

  const now = dependencies.now?.() ?? new Date();
  const evaluatedAt = now.toISOString();
  const prepared = await prepareScheduledRunLaunch(dependencies.coreStore, runId, now, evaluatedAt);
  if (prepared.status !== 'prepared') {
    return prepared.result;
  }

  try {
    const runtime = await startScheduledRuntime({
      ...prepared.context,
      runtimeClient: dependencies.runtimeClient,
      evidenceDataDir: dependencies.evidenceDataDir,
    });
    return finishScheduledRunLaunch({
      coreStore: dependencies.coreStore,
      context: prepared.context,
      runtime,
      now,
      evaluatedAt,
    });
  } catch (error) {
    return blockScheduledRunLaunch({
      coreStore: dependencies.coreStore,
      context: prepared.context,
      error,
      now,
      evaluatedAt,
    });
  }
}

async function prepareScheduledRunLaunch(
  coreStore: CoreStore,
  runId: string,
  now: Date,
  evaluatedAt: string,
): Promise<
  | { status: 'prepared'; context: ScheduledRunLaunchContext }
  | { status: 'skipped'; result: ScheduledRunExecutionResult | null }
> {
  let context: ScheduledRunLaunchContext | null = null;
  let skippedResult: ScheduledRunExecutionResult | null = null;

  await coreStore.updateCore((core) => {
    const run = core.runs.find((candidate) => candidate.id === runId) ?? null;
    if (!run) {
      return core;
    }
    const mission = resolveRunMission(core, run);
    const trigger = readScheduleTrigger(run);
    if (!mission || !trigger) {
      skippedResult = {
        status: 'skipped',
        run,
        mission,
        message: 'Run is not an admitted scheduled mission run.',
      };
      return core;
    }
    if (run.status !== 'queued' || hasStartedRuntimeBridge(run)) {
      skippedResult = {
        status: 'skipped',
        run,
        mission,
        message: 'Scheduled run is not launchable.',
      };
      return core;
    }

    const actor = mission.assignedAgentId
      ? core.actors.find((candidate) => candidate.id === mission.assignedAgentId) ?? null
      : null;
    const target = resolveScheduledRuntimeTarget(actor);
    const runState = deriveRunState({ lifecycle: 'active' });
    const nextRun = upsertCoreRun(
      core,
      {
        id: run.id,
        title: run.title,
        status: 'running',
        startedAt: run.startedAt ?? evaluatedAt,
        summary: 'Launching scheduled mission through supervised runtime boundary.',
        metadata: writeRunStateMetadata({
          metadata: writeRuntimeBridgeMetadata(run.metadata, {
            status: 'launching',
            target,
            launchedAt: evaluatedAt,
          }),
          evaluation: runState,
          evaluatedAt,
        }),
      },
      now,
    );
    const nextMission = upsertCoreMission(
      nextRun.core,
      {
        id: mission.id,
        title: mission.title,
        status: 'running',
        conversationId: mission.conversationId,
        assignedAgentId: mission.assignedAgentId,
        summary: mission.summary,
        createdAt: mission.createdAt,
        metadata: mission.metadata,
      },
      now,
    );
    const persistedRun = nextMission.core.runs.find((candidate) => candidate.id === run.id)
      ?? nextRun.run;
    const persistedMission = nextMission.core.missions.find((candidate) =>
      candidate.id === mission.id) ?? nextMission.mission;
    context = {
      core: nextMission.core,
      run: persistedRun,
      mission: persistedMission,
      actor: actor ?? createFallbackScheduledActor(mission),
      target,
      trigger,
      evaluatedAt,
    };
    return nextMission.core;
  });

  if (!context) {
    return { status: 'skipped', result: skippedResult };
  }

  return { status: 'prepared', context };
}

async function startScheduledRuntime(
  input: ScheduledRunLaunchContext & {
    runtimeClient: RuntimeClient;
    evidenceDataDir?: string;
  },
): Promise<{
  session: RuntimeSessionInfo;
  message: RuntimeMessageResult;
  handoff: RunLoopDecisionHandoff;
  runLoop: ProviderAgentRunLoopRecord;
}> {
  const evidenceSink = input.evidenceDataDir && input.run.conversationId
    ? createDurableToolEvidenceSink({
      dataDir: input.evidenceDataDir,
      conversationId: input.run.conversationId,
    })
    : undefined;
  const runtimeContext = buildScheduledRuntimeContext(input);
  const loop = await startProviderAgentRunLoop({
    runtimeClient: input.runtimeClient,
    product: 'cats-work',
    surface: 'schedule-rule-run-loop',
    runId: input.run.id,
    actorRef: input.actor.id,
    evidenceSink,
    sessionActionId: `${input.run.id}:scheduled-runtime-session`,
    sessionReason: 'scheduled_mission_start',
    sessionInput: {
      provider: input.target.provider,
      instance: input.target.instance ?? undefined,
      model: input.target.model ?? undefined,
      workspaceKind: 'sandbox',
      workspaceAccess: 'read_write',
      permissionMode: 'skip',
      sharingMode: 'isolated',
      instructions: SCHEDULED_RUNTIME_INSTRUCTIONS,
      context: runtimeContext,
    },
    messageActionId: `${input.run.id}:scheduled-runtime-message`,
    messageReason: 'scheduled_mission_prompt',
    messageContent: buildScheduledRunPrompt(input),
    recordedAt: input.evaluatedAt,
    messageInput: (session) => ({
      instructions: SCHEDULED_RUNTIME_INSTRUCTIONS,
      context: {
        ...runtimeContext,
        metadata: {
          ...runtimeContext.metadata,
          runtimeSessionId: session.id,
        },
      },
    }),
  });

  return {
    session: loop.session,
    message: loop.message,
    handoff: loop.handoff,
    runLoop: loop.record,
  };
}

async function finishScheduledRunLaunch(input: {
  coreStore: CoreStore;
  context: ScheduledRunLaunchContext;
  runtime: {
    session: RuntimeSessionInfo;
    message: RuntimeMessageResult;
    handoff: RunLoopDecisionHandoff;
    runLoop: ProviderAgentRunLoopRecord;
  };
  now: Date;
  evaluatedAt: string;
}): Promise<ScheduledRunExecutionResult> {
  let result: ScheduledRunExecutionResult | null = null;
  await input.coreStore.updateCore((core) => {
    const latestRun = core.runs.find((candidate) => candidate.id === input.context.run.id)
      ?? input.context.run;
    const runState = deriveRunState({ lifecycle: 'active' });
    const next = upsertCoreRun(
      core,
      {
        id: latestRun.id,
        title: latestRun.title,
        status: 'running',
        startedAt: latestRun.startedAt ?? input.evaluatedAt,
        summary: `Started scheduled runtime session ${input.runtime.session.id}.`,
        metadata: writeRunStateMetadata({
          metadata: writeRuntimeBridgeMetadata(latestRun.metadata, {
            status: 'started',
            session: input.runtime.session,
            message: input.runtime.message,
            target: input.context.target,
            startedAt: input.evaluatedAt,
            messageSentAt: input.evaluatedAt,
            handoff: input.runtime.handoff,
            runLoop: input.runtime.runLoop,
          }),
          evaluation: runState,
          evaluatedAt: input.evaluatedAt,
        }),
      },
      input.now,
    );
    const traced = appendCoreTrace(
      next.core,
      {
        id: `${latestRun.id}:scheduled-runtime-response`,
        traceId: latestRun.traceId ?? `trace-${latestRun.id}`,
        kind: 'outcome',
        conversationId: latestRun.conversationId,
        runId: latestRun.id,
        taskId: latestRun.taskId,
        actorId: input.context.actor.id,
        message: buildRuntimeResponseTraceMessage(input.runtime.session, input.runtime.message),
        metadata: {
          source: 'scheduled_supervised_runtime_bridge',
          sessionId: input.runtime.session.id,
          provider: input.runtime.session.provider,
          model: input.runtime.session.model,
          tokensUsed: input.runtime.message.tokensUsed,
        },
      },
      input.now,
    );
    const persistedRun = traced.core.runs.find((candidate) => candidate.id === latestRun.id)
      ?? next.run;
    const mission = resolveRunMission(traced.core, persistedRun);
    result = {
      status: 'launched',
      run: persistedRun,
      mission,
      message: null,
    };
    return traced.core;
  });

  if (!result) {
    throw new Error('Scheduled runtime launch did not persist a result.');
  }
  return result;
}

/**
 * Schedule replacement now delegates to the generic Run stop boundary
 * defined by SPEC-096 / PLAN-085. It still returns the legacy
 * `'cancelled' | 'skipped'` shape so existing scheduler wiring keeps
 * working while the canonical command lives in `runCancellation.ts`.
 *
 * Per-fire scheduled missions own exactly one run; after the run is
 * stopped we cascade `cancelMission` so the mission record reaches its
 * terminal state alongside the run, matching the prior behaviour.
 */
export async function cancelScheduledRunThroughSupervision(
  dependencies: ScheduledRunExecutionDependencies,
  runId: string,
  options: ScheduledRunCancellationOptions = {},
): Promise<ScheduledRunCancellationResult | null> {
  const now = options.requestedAt
    ? new Date(options.requestedAt)
    : dependencies.now?.() ?? new Date();
  const requestedByActorId = options.requestedBy ?? 'scheduler:replace';
  const reason = options.reasonNote;

  const stopResult = await stopRun(
    {
      coreStore: dependencies.coreStore,
      runtimeClient: dependencies.runtimeClient,
      now: () => now,
    },
    runId,
    {
      source: 'schedule_replace',
      requestedByActorId,
      reason,
    },
  );

  if (!stopResult) {
    return null;
  }

  if (stopResult.status === 'not_stoppable') {
    throw new CoreConflictError(
      stopResult.message
        ?? `Cannot cancel scheduled run ${runId}; runtime cancellation is unavailable.`,
      'scheduled_run_runtime_cancellation_unavailable',
    );
  }

  const missionId =
    typeof stopResult.run.metadata.missionId === 'string'
      ? stopResult.run.metadata.missionId
      : null;
  let finalMission = stopResult.mission;
  if (missionId) {
    const cancelMissionResult = await cancelMission(
      {
        coreStore: dependencies.coreStore,
        runtimeClient: dependencies.runtimeClient,
        now: () => now,
      },
      missionId,
      {
        requestedByActorId,
        reason,
      },
    );
    if (cancelMissionResult) {
      finalMission = cancelMissionResult.mission;
    }
  }

  return {
    status: stopResult.status === 'stopped' ? 'cancelled' : 'skipped',
    run: stopResult.run,
    mission: finalMission,
    message: stopResult.message,
  };
}

async function blockScheduledRunLaunch(input: {
  coreStore: CoreStore;
  context: ScheduledRunLaunchContext;
  error: unknown;
  now: Date;
  evaluatedAt: string;
}): Promise<ScheduledRunExecutionResult> {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  let result: ScheduledRunExecutionResult | null = null;
  await input.coreStore.updateCore((core) => {
    const latestRun = core.runs.find((candidate) => candidate.id === input.context.run.id)
      ?? input.context.run;
    const runState = deriveRunState({
      lifecycle: 'active',
      blockers: [{ code: 'runtime_launch_failed', message }],
    });
    const next = upsertCoreRun(
      core,
      {
        id: latestRun.id,
        title: latestRun.title,
        status: 'blocked',
        startedAt: latestRun.startedAt ?? input.evaluatedAt,
        summary: 'Blocked before scheduled runtime launch completed.',
        metadata: writeRunStateMetadata({
          metadata: writeRuntimeBridgeMetadata(latestRun.metadata, {
            status: 'failed',
            error: message,
            failedAt: input.evaluatedAt,
          }),
          evaluation: runState,
          evaluatedAt: input.evaluatedAt,
        }),
      },
      input.now,
    );
    const persistedRun = next.core.runs.find((candidate) => candidate.id === latestRun.id)
      ?? next.run;
    result = {
      status: 'blocked',
      run: persistedRun,
      mission: resolveRunMission(next.core, persistedRun),
      message,
    };
    return next.core;
  });

  if (!result) {
    throw new Error('Scheduled runtime launch failure did not persist a result.');
  }
  return result;
}

function buildScheduledRuntimeContext(input: ScheduledRunLaunchContext) {
  return {
    source: 'automation' as const,
    reason: 'scheduled_mission',
    labels: ['cats-work', 'schedule-rule', 'mission'],
    metadata: {
      product: 'work',
      runId: input.run.id,
      missionId: input.mission.id,
      actorId: input.actor.id,
      scheduleRuleId: input.trigger.ruleId,
      scheduleRuleRevision: input.trigger.ruleRevision,
      scheduledFireAt: input.trigger.scheduledFireAt,
      actualFireAt: input.trigger.actualFireAt,
      triggerReceiptId: input.trigger.triggerReceiptId ?? null,
      launchedAt: input.evaluatedAt,
      missionTemplate: input.run.metadata.missionTemplate ?? null,
    },
  };
}

function buildScheduledRunPrompt(input: ScheduledRunLaunchContext): string {
  const missionTemplate = asRecord(input.run.metadata.missionTemplate) ?? {};
  return [
    `Scheduled mission: ${input.mission.title}`,
    input.mission.summary ? `Mission intent: ${input.mission.summary}` : null,
    input.run.summary ? `Run summary: ${input.run.summary}` : null,
    `Run id: ${input.run.id}`,
    `Schedule rule id: ${input.trigger.ruleId}`,
    `Scheduled fire: ${input.trigger.scheduledFireAt}`,
    `Trigger reason: ${input.trigger.reason}`,
    `Transport targets: ${JSON.stringify(missionTemplate.transportTargets ?? [])}`,
    `Resource scopes: ${JSON.stringify(missionTemplate.resourceScopes ?? [])}`,
    `Tool scopes: ${JSON.stringify(missionTemplate.toolScopes ?? [])}`,
    'Use only the declared resources, tools, transports, and approval policy.',
    [
      'If required capability is missing, report the blocker instead of',
      'substituting app-selected behavior.',
    ].join(' '),
    'Return progress, blockers, and the concrete action you took.',
  ].filter((line): line is string => Boolean(line)).join('\n');
}

const SCHEDULED_RUNTIME_INSTRUCTIONS = [
  'You are the driving agent for a scheduled Cats mission.',
  'Execute the mission intent within the declared bounds.',
  'Do not bypass supervision, transport bindings, resource scopes, tool scopes, or approvals.',
  'If required context or capability is missing, report the blocker instead of inventing facts.',
].join(' ');

function resolveRunMission(core: CatsCoreState, run: CoreRunRecord): MissionRecord | null {
  const missionId = typeof run.metadata.missionId === 'string' ? run.metadata.missionId : null;
  return missionId
    ? core.missions.find((candidate) => candidate.id === missionId) ?? null
    : null;
}

function readScheduleTrigger(run: CoreRunRecord): ScheduleTriggerMetadata | null {
  const trigger = asRecord(run.metadata.scheduleTrigger);
  if (!trigger || typeof trigger.ruleId !== 'string') {
    return null;
  }
  return trigger as unknown as ScheduleTriggerMetadata;
}

function hasStartedRuntimeBridge(run: CoreRunRecord): boolean {
  const bridge = asRecord(asRecord(run.metadata.supervision)?.runtimeBridge);
  const status = typeof bridge?.status === 'string' ? bridge.status : null;
  return status === 'launching' || status === 'started';
}

function resolveScheduledRuntimeTarget(actor: CoreActorRecord | null): ExecutionTargetSummary {
  return {
    provider: readNonEmptyString(actor?.defaultExecutionTarget?.provider) ?? 'claude',
    instance: readNonEmptyString(actor?.defaultExecutionTarget?.instance),
    model: readNonEmptyString(actor?.defaultExecutionTarget?.model),
  };
}

function createFallbackScheduledActor(mission: MissionRecord): CoreActorRecord {
  return {
    id: mission.assignedAgentId ?? 'actor-orchestrator-global',
    name: 'Scheduled mission agent',
    kind: 'orchestrator',
    status: 'active',
    roles: [],
    skillProfile: null,
    mcpProfile: null,
    defaultExecutionTarget: resolveScheduledRuntimeTarget(null),
    memory: {
      summary: null,
      facts: [],
      openLoops: [],
      updatedAt: null,
    },
    source: 'core_record',
    sourceId: null,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    archivedAt: null,
  };
}

function writeRuntimeBridgeMetadata(
  metadata: Record<string, unknown>,
  update: {
    status: 'launching';
    target: ExecutionTargetSummary;
    launchedAt: string;
  } | {
    status: 'started';
    session: RuntimeSessionInfo;
    message: RuntimeMessageResult;
    target: ExecutionTargetSummary;
    startedAt: string;
    messageSentAt: string;
    handoff: RunLoopDecisionHandoff;
    runLoop: ProviderAgentRunLoopRecord;
  } | {
    status: 'failed';
    error: string;
    failedAt: string;
  },
): Record<string, unknown> {
  const supervision = asRecord(metadata.supervision) ?? {};
  const existingBridge = asRecord(supervision.runtimeBridge) ?? {};
  const providerAgentRunLoop = update.status === 'started'
    ? mergeProviderAgentRunLoopRecord(supervision.providerAgentRunLoop, update.runLoop)
    : supervision.providerAgentRunLoop;

  return {
    ...metadata,
    supervision: {
      ...supervision,
      source: 'schedule_rule_runtime_launcher',
      ...(providerAgentRunLoop === undefined ? {} : { providerAgentRunLoop }),
      runtimeBridge: buildRuntimeBridge(existingBridge, update),
    },
  };
}

function buildRuntimeBridge(
  existingBridge: Record<string, unknown>,
  update: Parameters<typeof writeRuntimeBridgeMetadata>[1],
): Record<string, unknown> {
  if (update.status === 'launching') {
    return {
      ...existingBridge,
      status: 'launching',
      requestedProvider: update.target.provider,
      requestedModel: update.target.model,
      requestedInstance: update.target.instance,
      launchedAt: update.launchedAt,
      lastError: null,
    };
  }
  if (update.status === 'failed') {
    return {
      ...existingBridge,
      status: 'failed',
      failedAt: update.failedAt,
      lastError: update.error,
    };
  }
  return {
    ...existingBridge,
    status: 'started',
    sessionId: update.session.id,
    provider: update.session.provider,
    instance: update.target.instance,
    model: update.session.model,
    requestedProvider: update.target.provider,
    requestedModel: update.target.model,
    startedAt: update.startedAt,
    messageSentAt: update.messageSentAt,
    tokensUsed: update.message.tokensUsed,
    runLoopHandoff: update.handoff,
    lastError: null,
  };
}

function mergeProviderAgentRunLoopRecord(
  existing: unknown,
  next: ProviderAgentRunLoopRecord,
): ProviderAgentRunLoopRecord {
  const record = asRecord(existing);
  return {
    observations: [
      ...readArray(record?.observations),
      ...next.observations,
    ],
    plans: [
      ...readArray(record?.plans),
      ...next.plans,
    ],
    toolRequests: [
      ...readArray(record?.toolRequests),
      ...next.toolRequests,
    ],
    approvals: [
      ...readArray(record?.approvals),
      ...next.approvals,
    ],
    outcomes: [
      ...readArray(record?.outcomes),
      ...next.outcomes,
    ],
    latestHandoff: next.latestHandoff,
  } as ProviderAgentRunLoopRecord;
}

function buildRuntimeResponseTraceMessage(
  session: RuntimeSessionInfo,
  message: RuntimeMessageResult,
): string {
  return [
    `Scheduled runtime session ${session.id} started`,
    `provider=${session.provider}`,
    session.model ? `model=${session.model}` : null,
    `tokens=${message.tokensUsed}`,
  ].filter((part): part is string => Boolean(part)).join(' ');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

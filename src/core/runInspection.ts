// One-stop "show me everything about this run" helper, symmetrical to
// inspectMission. Joins the scattered run helpers (linkage validation,
// status classification) plus the materialization tier (traces,
// checkpoints, outcomes, artifacts) and the mission/task it serves.

import {
  validateRunLinkage,
  type RunLinkageDiagnostic,
} from './missionLinkageValidation.js';
import { isActiveRun, isBlockedRun, isTerminalRun } from './missionStatus.js';
import { readRunIdempotencyKey } from './missionIdempotency.js';
import type {
  CatsCoreState,
  CoreActorRecord,
  CoreArtifactRecord,
  CoreCheckpointRecord,
  CoreConversationRecord,
  CoreOrchestrationOutcomeRecord,
  CoreRunRecord,
  CoreRunStatus,
  CoreTaskRecord,
  CoreTraceRecord,
  MissionRecord,
  RunId,
} from './types.js';

export type RunLifecycleClassification = 'active' | 'terminal' | 'blocked';

export interface RunInspectionResult {
  run: CoreRunRecord;
  status: CoreRunStatus;
  classification: RunLifecycleClassification;
  idempotencyKey: string | null;
  linkageDiagnostics: RunLinkageDiagnostic[];
  task: CoreTaskRecord | null;
  conversation: CoreConversationRecord | null;
  parentRun: CoreRunRecord | null;
  childRuns: CoreRunRecord[];
  orchestratorActor: CoreActorRecord | null;
  /** The mission that named this run via `mission.metadata.runId`,
   *  or null if no mission claims this run that way. */
  owningMission: MissionRecord | null;
  /** Missions that back-reference this run via `run.metadata.missionId`
   *  or `mission.metadata.runId`. May overlap with owningMission. */
  referencingMissions: MissionRecord[];
  traces: CoreTraceRecord[];
  checkpoints: CoreCheckpointRecord[];
  outcomes: CoreOrchestrationOutcomeRecord[];
  artifacts: CoreArtifactRecord[];
}

function classifyRun(run: CoreRunRecord): RunLifecycleClassification {
  if (isTerminalRun(run)) {
    return 'terminal';
  }
  if (isBlockedRun(run)) {
    return 'blocked';
  }
  if (isActiveRun(run)) {
    return 'active';
  }
  return 'active';
}

function findOwningMission(
  core: CatsCoreState,
  runId: RunId,
): MissionRecord | null {
  return core.missions.find((mission) => {
    const metadataRunId = mission.metadata.runId;
    return typeof metadataRunId === 'string'
      && metadataRunId.trim() === runId;
  }) ?? null;
}

function findReferencingMissions(
  core: CatsCoreState,
  run: CoreRunRecord,
): MissionRecord[] {
  const seen = new Set<string>();
  const result: MissionRecord[] = [];
  // Mission's metadata points back at this run.
  for (const mission of core.missions) {
    const metadataRunId = mission.metadata.runId;
    if (typeof metadataRunId === 'string' && metadataRunId.trim() === run.id) {
      if (!seen.has(mission.id)) {
        seen.add(mission.id);
        result.push(mission);
      }
    }
  }
  // Run's metadata points back at a mission.
  const runMissionRef = run.metadata.missionId;
  if (typeof runMissionRef === 'string' && runMissionRef.trim().length > 0) {
    const referenced = core.missions.find((mission) =>
      mission.id === runMissionRef.trim()) ?? null;
    if (referenced && !seen.has(referenced.id)) {
      seen.add(referenced.id);
      result.push(referenced);
    }
  }
  return result;
}

export function inspectRun(
  core: CatsCoreState,
  runId: RunId,
): RunInspectionResult | null {
  const run = core.runs.find((candidate) => candidate.id === runId) ?? null;
  if (run === null) {
    return null;
  }
  const task = run.taskId
    ? core.tasks.find((candidate) => candidate.id === run.taskId) ?? null
    : null;
  const conversation = run.conversationId
    ? core.conversations.find((candidate) => candidate.id === run.conversationId) ?? null
    : null;
  const parentRun = run.parentRunId
    ? core.runs.find((candidate) => candidate.id === run.parentRunId) ?? null
    : null;
  const childRuns = core.runs.filter((candidate) => candidate.parentRunId === run.id);
  const orchestratorActor = run.orchestratorActorId
    ? core.actors.find((actor) => actor.id === run.orchestratorActorId) ?? null
    : null;

  const traces = core.traces.filter((trace) => trace.runId === run.id);
  const checkpoints = core.checkpoints.filter((checkpoint) =>
    checkpoint.runId === run.id);
  const outcomes = core.outcomes.filter((outcome) => outcome.runId === run.id);
  const artifacts = core.artifacts.filter((artifact) => artifact.runId === run.id);

  const idempotencyKey = readRunIdempotencyKey(run);
  const owningMission = findOwningMission(core, run.id);
  const referencingMissions = findReferencingMissions(core, run);

  return {
    run,
    status: run.status,
    classification: classifyRun(run),
    idempotencyKey,
    linkageDiagnostics: validateRunLinkage(core, run),
    task,
    conversation,
    parentRun,
    childRuns,
    orchestratorActor,
    owningMission,
    referencingMissions,
    traces,
    checkpoints,
    outcomes,
    artifacts,
  };
}

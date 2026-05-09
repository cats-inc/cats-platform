import { readMissionTriggerEventFromMetadata } from './missionTriggers.js';
import type {
  CatsCoreState,
  CoreRunRecord,
  MissionRecord,
} from './types.js';

export type MissionLinkageDiagnosticAnchor =
  | 'managed_work'
  | 'conversation'
  | 'source_turn'
  | 'source_lane'
  | 'assigned_agent'
  | 'metadata_run'
  | 'parent_mission'
  | 'trigger_transport_binding'
  | 'trigger_conversation'
  | 'trigger_parent_mission'
  | 'trigger_parent_run';

export interface MissionLinkageDiagnostic {
  missionId: string;
  anchor: MissionLinkageDiagnosticAnchor;
  referencedId: string;
  reason: 'missing_record';
}

export type RunLinkageDiagnosticAnchor =
  | 'task'
  | 'conversation'
  | 'parent_run'
  | 'orchestrator_actor';

export interface RunLinkageDiagnostic {
  runId: string;
  anchor: RunLinkageDiagnosticAnchor;
  referencedId: string;
  reason: 'missing_record';
}

function readMissionMetadataRunId(mission: MissionRecord): string | null {
  const value = mission.metadata.runId;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readMissionMetadataParentMissionId(mission: MissionRecord): string | null {
  const value = mission.metadata.parentMissionId;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function recordExistsById<T extends { id: string }>(
  records: ReadonlyArray<T>,
  id: string,
): boolean {
  return records.some((record) => record.id === id);
}

export function validateMissionLinkage(
  core: CatsCoreState,
  mission: MissionRecord,
): MissionLinkageDiagnostic[] {
  const diagnostics: MissionLinkageDiagnostic[] = [];

  if (mission.managedWorkId !== null
    && !recordExistsById(core.workItems, mission.managedWorkId)) {
    diagnostics.push({
      missionId: mission.id,
      anchor: 'managed_work',
      referencedId: mission.managedWorkId,
      reason: 'missing_record',
    });
  }
  if (mission.conversationId !== null
    && !recordExistsById(core.conversations, mission.conversationId)) {
    diagnostics.push({
      missionId: mission.id,
      anchor: 'conversation',
      referencedId: mission.conversationId,
      reason: 'missing_record',
    });
  }
  if (mission.sourceTurnId !== null
    && !recordExistsById(core.turns, mission.sourceTurnId)) {
    diagnostics.push({
      missionId: mission.id,
      anchor: 'source_turn',
      referencedId: mission.sourceTurnId,
      reason: 'missing_record',
    });
  }
  if (mission.sourceLaneId !== null
    && !recordExistsById(core.lanes, mission.sourceLaneId)) {
    diagnostics.push({
      missionId: mission.id,
      anchor: 'source_lane',
      referencedId: mission.sourceLaneId,
      reason: 'missing_record',
    });
  }
  if (mission.assignedAgentId !== null
    && !recordExistsById(core.actors, mission.assignedAgentId)) {
    diagnostics.push({
      missionId: mission.id,
      anchor: 'assigned_agent',
      referencedId: mission.assignedAgentId,
      reason: 'missing_record',
    });
  }
  const metadataRunId = readMissionMetadataRunId(mission);
  if (metadataRunId !== null
    && !recordExistsById(core.runs, metadataRunId)) {
    diagnostics.push({
      missionId: mission.id,
      anchor: 'metadata_run',
      referencedId: metadataRunId,
      reason: 'missing_record',
    });
  }
  const parentMissionId = readMissionMetadataParentMissionId(mission);
  if (parentMissionId !== null
    && !recordExistsById(core.missions, parentMissionId)) {
    diagnostics.push({
      missionId: mission.id,
      anchor: 'parent_mission',
      referencedId: parentMissionId,
      reason: 'missing_record',
    });
  }

  // Trigger event anchors. The trigger union carries optional
  // references to other canonical records; broken refs there are also
  // canonical breakage even though they live under metadata.
  const trigger = readMissionTriggerEventFromMetadata(mission.metadata);
  if (trigger !== null) {
    if (trigger.kind === 'transport_ingress') {
      if (
        trigger.transportBindingId !== null
        && !recordExistsById(core.transportBindings, trigger.transportBindingId)
      ) {
        diagnostics.push({
          missionId: mission.id,
          anchor: 'trigger_transport_binding',
          referencedId: trigger.transportBindingId,
          reason: 'missing_record',
        });
      }
      if (
        trigger.conversationId !== null
        && !recordExistsById(core.conversations, trigger.conversationId)
      ) {
        diagnostics.push({
          missionId: mission.id,
          anchor: 'trigger_conversation',
          referencedId: trigger.conversationId,
          reason: 'missing_record',
        });
      }
    }
    if (trigger.kind === 'workflow_continuation') {
      if (
        trigger.parentMissionId !== null
        && !recordExistsById(core.missions, trigger.parentMissionId)
      ) {
        diagnostics.push({
          missionId: mission.id,
          anchor: 'trigger_parent_mission',
          referencedId: trigger.parentMissionId,
          reason: 'missing_record',
        });
      }
      if (
        trigger.parentRunId !== null
        && !recordExistsById(core.runs, trigger.parentRunId)
      ) {
        diagnostics.push({
          missionId: mission.id,
          anchor: 'trigger_parent_run',
          referencedId: trigger.parentRunId,
          reason: 'missing_record',
        });
      }
    }
  }

  return diagnostics;
}

export function validateRunLinkage(
  core: CatsCoreState,
  run: CoreRunRecord,
): RunLinkageDiagnostic[] {
  const diagnostics: RunLinkageDiagnostic[] = [];

  if (run.taskId !== null
    && !recordExistsById(core.tasks, run.taskId)) {
    diagnostics.push({
      runId: run.id,
      anchor: 'task',
      referencedId: run.taskId,
      reason: 'missing_record',
    });
  }
  if (run.conversationId !== null
    && !recordExistsById(core.conversations, run.conversationId)) {
    diagnostics.push({
      runId: run.id,
      anchor: 'conversation',
      referencedId: run.conversationId,
      reason: 'missing_record',
    });
  }
  if (run.parentRunId !== null
    && !recordExistsById(core.runs, run.parentRunId)) {
    diagnostics.push({
      runId: run.id,
      anchor: 'parent_run',
      referencedId: run.parentRunId,
      reason: 'missing_record',
    });
  }
  if (run.orchestratorActorId !== null
    && !recordExistsById(core.actors, run.orchestratorActorId)) {
    diagnostics.push({
      runId: run.id,
      anchor: 'orchestrator_actor',
      referencedId: run.orchestratorActorId,
      reason: 'missing_record',
    });
  }

  return diagnostics;
}

export function findOrphanedMissionLinkages(
  core: CatsCoreState,
): MissionLinkageDiagnostic[] {
  return core.missions.flatMap((mission) => validateMissionLinkage(core, mission));
}

export function findOrphanedRunLinkages(
  core: CatsCoreState,
): RunLinkageDiagnostic[] {
  return core.runs.flatMap((run) => validateRunLinkage(core, run));
}

export interface CoreLinkageValidationResult {
  missions: MissionLinkageDiagnostic[];
  runs: RunLinkageDiagnostic[];
}

export function validateCoreMissionRunLinkages(
  core: CatsCoreState,
): CoreLinkageValidationResult {
  return {
    missions: findOrphanedMissionLinkages(core),
    runs: findOrphanedRunLinkages(core),
  };
}

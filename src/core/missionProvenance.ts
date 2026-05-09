// Mission provenance helpers.
//
// SPEC-062 §FR19 / PLAN-054 Phase 2 §2.4 require the materialization layer
// to preserve provenance between conversation/turn/lane context, mission,
// run, and linked managed work. The mission record already carries its
// own intrinsic provenance fields (`conversationId`, `sourceTurnId`,
// `sourceLaneId`, `assignedAgentId`, `managedWorkId`); other provenance
// is held in well-known metadata keys that this module owns.
//
// `buildMissionProvenance` returns one read-only view assembling all the
// scattered fields so replay-debug, provenance audits, and projections
// can introspect mission origin without reimplementing the join.
//
// `findMissionLineage` walks the chain of `metadata.parentMissionId`
// links so callers can render the ancestry of a continuation mission.

import { readMissionIdempotencyKey } from './missionIdempotency.js';
import {
  readMissionScheduleRuleFromMetadata,
  readMissionTriggerEventFromMetadata,
  type MissionScheduleRule,
  type MissionTriggerEvent,
} from './missionTriggers.js';
import type {
  CatsCoreState,
  ConversationId,
  CoreRecordMetadata,
  LaneId,
  MissionId,
  MissionRecord,
  TurnId,
} from './types.js';

export const MISSION_METADATA_PARENT_MISSION_KEY = 'parentMissionId' as const;

export interface MissionProvenanceSummary {
  missionId: MissionId;
  trigger: MissionTriggerEvent | null;
  scheduleRule: MissionScheduleRule | null;
  parentMissionId: MissionId | null;
  idempotencyKey: string | null;
  conversationId: ConversationId | null;
  sourceTurnId: TurnId | null;
  sourceLaneId: LaneId | null;
  recordedAt: string;
}

function readNormalizedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function readMissionParentMissionId(mission: MissionRecord): MissionId | null {
  return readNormalizedString(mission.metadata[MISSION_METADATA_PARENT_MISSION_KEY]);
}

export function withMissionParentMissionId(
  metadata: CoreRecordMetadata,
  parentMissionId: MissionId,
): CoreRecordMetadata {
  const normalized = readNormalizedString(parentMissionId);
  if (normalized === null) {
    return metadata;
  }
  return { ...metadata, [MISSION_METADATA_PARENT_MISSION_KEY]: normalized };
}

export function buildMissionProvenance(mission: MissionRecord): MissionProvenanceSummary {
  return {
    missionId: mission.id,
    trigger: readMissionTriggerEventFromMetadata(mission.metadata),
    scheduleRule: readMissionScheduleRuleFromMetadata(mission.metadata),
    parentMissionId: readMissionParentMissionId(mission),
    idempotencyKey: readMissionIdempotencyKey(mission),
    conversationId: mission.conversationId,
    sourceTurnId: mission.sourceTurnId,
    sourceLaneId: mission.sourceLaneId,
    recordedAt: mission.createdAt,
  };
}

export interface MissionLineageEntry {
  mission: MissionRecord;
  parentMissionId: MissionId | null;
}

export interface MissionLineageResult {
  /** Lineage from the requested mission up through ancestors. The
   *  requested mission is at index 0; each subsequent entry is the
   *  parent of the previous one, walking until either the chain ends
   *  or `cycleDetected` is set to true. */
  entries: MissionLineageEntry[];
  /** True when the walk hit a cycle (the same mission id seen twice). */
  cycleDetected: boolean;
  /** True when a `parentMissionId` pointed at a mission no longer in
   *  the core state. */
  brokenLinkAt: MissionId | null;
}

export function findMissionLineage(
  core: CatsCoreState,
  missionId: MissionId,
): MissionLineageResult {
  const entries: MissionLineageEntry[] = [];
  const seen = new Set<MissionId>();
  let cursor = core.missions.find((mission) => mission.id === missionId) ?? null;
  let brokenLinkAt: MissionId | null = null;
  while (cursor !== null) {
    if (seen.has(cursor.id)) {
      return { entries, cycleDetected: true, brokenLinkAt };
    }
    seen.add(cursor.id);
    const parentId = readMissionParentMissionId(cursor);
    entries.push({ mission: cursor, parentMissionId: parentId });
    if (parentId === null) {
      break;
    }
    const parent = core.missions.find((mission) => mission.id === parentId) ?? null;
    if (parent === null) {
      brokenLinkAt = parentId;
      break;
    }
    cursor = parent;
  }
  return { entries, cycleDetected: false, brokenLinkAt };
}

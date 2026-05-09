// Per-conversation mission and run index.
//
// PLAN-057 Phase 5 calls for conversation -> mission -> run provenance
// coverage. The mission record and run record both carry an optional
// `conversationId`, but consumers (Work projections, Code summaries,
// chat-side mission badges) end up scanning the full mission and run
// arrays whenever they need "what work originated in this conversation?"
//
// `buildMissionsByConversation` returns one canonical index keyed by
// conversation id, with per-mission run lists folded in so callers do
// not have to re-cross-reference `mission.metadata.runId` and
// `run.metadata.missionId` themselves.

import type {
  CatsCoreState,
  ConversationId,
  CoreRunRecord,
  MissionRecord,
} from './types.js';

export interface MissionConversationLink {
  mission: MissionRecord;
  /** All runs anchored on this mission, deduplicated across:
   *  - `run.id === mission.metadata.runId`
   *  - `run.metadata.missionId === mission.id`
   *  - `run.conversationId === mission.conversationId` (only when the
   *    mission's conversation is set; this last bridge is the loosest
   *    rule and exists so Work surfaces still see "runs that ran in
   *    this conversation" even when the writer skipped the missionId
   *    metadata key). */
  runs: CoreRunRecord[];
}

export interface MissionConversationIndexEntry {
  conversationId: ConversationId;
  missions: MissionConversationLink[];
}

export interface MissionConversationIndex {
  /** Stable map for O(1) lookup. Keys are conversation ids. */
  byConversationId: Map<ConversationId, MissionConversationIndexEntry>;
  /** All entries flattened, sorted by conversationId for stable
   *  iteration. */
  entries: MissionConversationIndexEntry[];
  /** Missions whose `conversationId` is null (mission-only / fully
   *  unanchored) — surfaced separately so callers can surface or hide
   *  them deliberately. */
  unanchoredMissions: MissionConversationLink[];
}

function readMissionMetadataRunId(mission: MissionRecord): string | null {
  const value = mission.metadata.runId;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readRunMetadataMissionId(run: CoreRunRecord): string | null {
  const value = run.metadata.missionId;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function collectRunsForMission(
  core: CatsCoreState,
  mission: MissionRecord,
): CoreRunRecord[] {
  const seen = new Set<string>();
  const result: CoreRunRecord[] = [];
  const claimedRunId = readMissionMetadataRunId(mission);
  if (claimedRunId !== null) {
    const claimedRun = core.runs.find((run) => run.id === claimedRunId) ?? null;
    if (claimedRun !== null && !seen.has(claimedRun.id)) {
      seen.add(claimedRun.id);
      result.push(claimedRun);
    }
  }
  for (const run of core.runs) {
    if (seen.has(run.id)) {
      continue;
    }
    if (readRunMetadataMissionId(run) === mission.id) {
      seen.add(run.id);
      result.push(run);
      continue;
    }
    if (
      mission.conversationId !== null
      && run.conversationId === mission.conversationId
      && claimedRunId === null
      && readRunMetadataMissionId(run) === null
    ) {
      // Loose conversation bridge: only fire when neither side
      // explicitly references the other. Avoids overlapping with the
      // strong references above and keeps the index honest.
      seen.add(run.id);
      result.push(run);
    }
  }
  return result;
}

export function buildMissionsByConversation(
  core: CatsCoreState,
): MissionConversationIndex {
  const byConversationId = new Map<ConversationId, MissionConversationIndexEntry>();
  const unanchoredMissions: MissionConversationLink[] = [];

  for (const mission of core.missions) {
    const link: MissionConversationLink = {
      mission,
      runs: collectRunsForMission(core, mission),
    };
    if (mission.conversationId === null) {
      unanchoredMissions.push(link);
      continue;
    }
    const existing = byConversationId.get(mission.conversationId);
    if (existing) {
      existing.missions.push(link);
    } else {
      byConversationId.set(mission.conversationId, {
        conversationId: mission.conversationId,
        missions: [link],
      });
    }
  }

  const entries = Array.from(byConversationId.values()).sort((left, right) =>
    left.conversationId.localeCompare(right.conversationId));

  return { byConversationId, entries, unanchoredMissions };
}

export function findMissionsForConversation(
  index: MissionConversationIndex,
  conversationId: ConversationId,
): MissionConversationLink[] {
  return index.byConversationId.get(conversationId)?.missions ?? [];
}

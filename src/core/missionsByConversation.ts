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

import {
  readRunMetadataMissionId,
  resolveRunsForMission,
} from './missionRunResolution.js';
import type {
  CatsCoreState,
  ConversationId,
  CoreRunRecord,
  MissionRecord,
} from './types.js';

export interface MissionConversationLink {
  mission: MissionRecord;
  /** Runs anchored on this mission via the strong references:
   *  - `run.id === mission.metadata.runId` (mission-claimed run)
   *  - `run.metadata.missionId === mission.id` (run back-reference)
   *  Loose runs that share the conversation but reference no mission
   *  are surfaced at the entry level under `looseRuns` so they are
   *  not duplicated across every mission in the conversation. */
  runs: CoreRunRecord[];
}

export interface MissionConversationIndexEntry {
  conversationId: ConversationId;
  missions: MissionConversationLink[];
  /** Runs whose `conversationId` matches the entry but whose mission
   *  anchor is ambiguous (no mission claims them via metadata.runId,
   *  no run.metadata.missionId points back). They belong to the
   *  conversation but cannot be uniquely attributed to one mission, so
   *  they live at the conversation level — UI can render them as
   *  "other runs in this conversation" without inflating mission cards. */
  looseRuns: CoreRunRecord[];
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

function findLooseRunsForConversation(
  runs: ReadonlyArray<CoreRunRecord>,
  conversationId: ConversationId,
  claimedRunIds: Set<string>,
): CoreRunRecord[] {
  return runs.filter((run) =>
    run.conversationId === conversationId
    && !claimedRunIds.has(run.id)
    && readRunMetadataMissionId(run) === null);
}

export function buildMissionsByConversation(
  core: CatsCoreState,
): MissionConversationIndex {
  const byConversationId = new Map<ConversationId, MissionConversationIndexEntry>();
  const unanchoredMissions: MissionConversationLink[] = [];
  // Global set of every run id that any mission has already claimed
  // via the strong reference set. Tracked across conversations so a
  // run claimed by mission A in conversation A cannot also surface as
  // a loose run on conversation B even if `run.conversationId` is B
  // (mismatch between mission anchor and run anchor is rare but real
  // — typically a recovered run that re-anchored to a different
  // conversation while the mission still claims it).
  const claimedRunIds = new Set<string>();

  for (const mission of core.missions) {
    const runs = resolveRunsForMission(core.runs, mission);
    const link: MissionConversationLink = { mission, runs };
    for (const run of runs) {
      claimedRunIds.add(run.id);
    }
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
        looseRuns: [],
      });
    }
  }

  // Second pass: attach loose runs to each conversation entry. A run
  // is "loose" when it shares the conversation but neither side
  // references the other and no mission anywhere has claimed it.
  for (const entry of byConversationId.values()) {
    entry.looseRuns = findLooseRunsForConversation(core.runs, entry.conversationId, claimedRunIds);
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

export function findLooseRunsForConversationFromIndex(
  index: MissionConversationIndex,
  conversationId: ConversationId,
): CoreRunRecord[] {
  return index.byConversationId.get(conversationId)?.looseRuns ?? [];
}

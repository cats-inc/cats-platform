import { useMemo } from "react";

import type { WorkGraphObjectSummary } from "../components/topdown/types";
import { useWorkGraph } from "./workGraphStore";

export interface MissionItem extends WorkGraphObjectSummary {
  kind: "mission";
}

export interface MissionsSnapshot {
  allMissions: readonly MissionItem[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
}

function summaryToMissionItem(o: WorkGraphObjectSummary): MissionItem {
  return { ...o, kind: "mission" };
}

export function useMissions(): MissionsSnapshot {
  const { graph, status, error } = useWorkGraph();
  return useMemo(() => {
    const allMissions = graph.objects
      .filter((obj): obj is WorkGraphObjectSummary => obj.kind === "mission")
      .map(summaryToMissionItem);
    return { allMissions, status, error };
  }, [graph, status, error]);
}

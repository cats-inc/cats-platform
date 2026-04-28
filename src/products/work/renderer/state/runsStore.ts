import { useMemo } from "react";

import type { WorkGraphObjectSummary } from "../components/topdown/types";
import { useWorkGraph } from "./workGraphStore";

export type RunStatus = WorkGraphObjectSummary["status"];

/**
 * Renderer-side Run display shape. Run is product-agnostic at Core level
 * but surfaced in Cats Work as the canonical execution-record drill-down
 * for tasks (`linkedTaskId`) and as a sub-run tree (`linkedRunId` =
 * parentRunId in Core).
 */
export interface RunItem extends WorkGraphObjectSummary {
  kind: "run";
  /** Convenience alias for `linkedRunId` so callers reading sub-run trees
   *  do not have to remember the projection's view-side name. */
  parentRunId: string | null;
}

export interface RunsSnapshot {
  allRuns: readonly RunItem[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
}

function summaryToRunItem(o: WorkGraphObjectSummary): RunItem {
  return {
    ...o,
    kind: "run",
    parentRunId: o.linkedRunId ?? null,
  };
}

export function useRuns(): RunsSnapshot {
  const { graph, status, error } = useWorkGraph();
  return useMemo(() => {
    const allRuns = graph.objects
      .filter((obj): obj is WorkGraphObjectSummary => obj.kind === "run")
      .map(summaryToRunItem);
    return { allRuns, status, error };
  }, [graph, status, error]);
}

/** Sub-run tree node — `children` is recursively populated. */
export interface RunTreeNode {
  run: RunItem;
  children: RunTreeNode[];
}

/**
 * Build a sub-run tree rooted at `rootRunId`. Returns an empty array if
 * the root has no children. Cycles (a run pointing back to an ancestor)
 * break gracefully — a node already on the visited stack is skipped.
 */
export function buildSubRunTree(
  rootRunId: string,
  allRuns: readonly RunItem[],
): RunTreeNode[] {
  const byParent = new Map<string, RunItem[]>();
  for (const r of allRuns) {
    const key = r.parentRunId ?? "";
    const list = byParent.get(key) ?? [];
    list.push(r);
    byParent.set(key, list);
  }

  function walk(parentId: string, visited: ReadonlySet<string>): RunTreeNode[] {
    const children = byParent.get(parentId) ?? [];
    return children
      .filter((r) => !visited.has(r.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((run) => {
        const nextVisited = new Set(visited);
        nextVisited.add(run.id);
        return { run, children: walk(run.id, nextVisited) };
      });
  }

  return walk(rootRunId, new Set([rootRunId]));
}

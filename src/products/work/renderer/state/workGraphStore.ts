import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

import { sharedQueryClient } from "../../../shared/renderer/queryClient.js";
import { expectJson } from "../api/http.js";
import { WORK_API_GRAPH_PATH } from "../../shared/apiPaths.js";
import type { WorkGraphProjection } from "../components/topdown/types";

type FetchStatus = "idle" | "loading" | "ready" | "error";

const EMPTY_GRAPH: WorkGraphProjection = {
  objects: [],
  evidenceAttachments: [],
  gateDecorators: [],
  links: [],
  linksByEndpoint: {},
  diagnostics: [],
};

export const WORK_GRAPH_QUERY_KEY = ["workGraph"] as const;

async function fetchWorkGraph(): Promise<WorkGraphProjection> {
  const response = await fetch(WORK_API_GRAPH_PATH);
  return expectJson<WorkGraphProjection>(response, "Failed to load work graph");
}

export interface UseWorkGraphResult {
  graph: WorkGraphProjection;
  status: FetchStatus;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useWorkGraph(): UseWorkGraphResult {
  const query = useQuery({
    queryKey: WORK_GRAPH_QUERY_KEY,
    queryFn: fetchWorkGraph,
  });

  const refresh = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const status: FetchStatus = query.isError
    ? "error"
    : query.isSuccess
    ? "ready"
    : query.isFetching || query.isPending
    ? "loading"
    : "idle";

  return {
    graph: query.data ?? EMPTY_GRAPH,
    status,
    error: query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null,
    refresh,
  };
}

/** Test-only escape hatch — clears the cached graph from the shared QueryClient. */
export function __resetWorkGraphStoreForTest(): void {
  sharedQueryClient.removeQueries({ queryKey: WORK_GRAPH_QUERY_KEY });
}

/**
 * Test-only: prime the cached graph so server-side rendered tests
 * (renderToStaticMarkup, which never runs useEffect) see populated
 * data instead of the idle empty projection. Production callers
 * should never reach for this — they wait for the fetch effect.
 */
export function __seedWorkGraphForTest(graph: WorkGraphProjection): void {
  sharedQueryClient.setQueryData(WORK_GRAPH_QUERY_KEY, graph);
}

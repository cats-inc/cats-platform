import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { expectJson } from "../../api/http.js";
import { WORK_API_GRAPH_PATH } from "../../../shared/apiPaths.js";
import type { WorkGraphProjection } from "../../components/topdown/types";

export const WORK_GRAPH_QUERY_KEY = ["workGraph"] as const;

export const EMPTY_WORK_GRAPH: WorkGraphProjection = {
  objects: [],
  evidenceAttachments: [],
  gateDecorators: [],
  links: [],
  linksByEndpoint: {},
  diagnostics: [],
};

async function fetchWorkGraph(errorMessage: string): Promise<WorkGraphProjection> {
  const response = await fetch(WORK_API_GRAPH_PATH);
  return expectJson<WorkGraphProjection>(response, errorMessage);
}

export function useWorkGraphQuery(
  errorMessage: string,
): UseQueryResult<WorkGraphProjection> {
  return useQuery({
    queryKey: WORK_GRAPH_QUERY_KEY,
    queryFn: () => fetchWorkGraph(errorMessage),
  });
}

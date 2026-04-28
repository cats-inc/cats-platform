import { useCallback, useEffect, useSyncExternalStore } from "react";

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

interface WorkGraphState {
  graph: WorkGraphProjection;
  status: FetchStatus;
  error: string | null;
  revision: number;
}

const INITIAL_STATE: WorkGraphState = {
  graph: EMPTY_GRAPH,
  status: "idle",
  error: null,
  revision: 0,
};

let state: WorkGraphState = INITIAL_STATE;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

function setState(next: WorkGraphState): void {
  state = next;
  notify();
}

async function fetchOnce(): Promise<void> {
  if (inflight) return inflight;
  setState({ ...state, status: "loading", error: null });
  inflight = (async () => {
    try {
      const response = await fetch(WORK_API_GRAPH_PATH);
      const graph = await expectJson<WorkGraphProjection>(
        response,
        "Failed to load work graph",
      );
      setState({
        graph,
        status: "ready",
        error: null,
        revision: state.revision + 1,
      });
    } catch (err) {
      setState({
        ...state,
        status: "error",
        error: err instanceof Error ? err.message : "Failed to load work graph.",
      });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export interface UseWorkGraphResult {
  graph: WorkGraphProjection;
  status: FetchStatus;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useWorkGraph(): UseWorkGraphResult {
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );

  useEffect(() => {
    if (snapshot.status === "idle") {
      void fetchOnce();
    }
  }, [snapshot.status]);

  const refresh = useCallback(() => {
    setState({ ...state, status: "idle" });
    return fetchOnce();
  }, []);

  return {
    graph: snapshot.graph,
    status: snapshot.status,
    error: snapshot.error,
    refresh,
  };
}

/**
 * Force a refresh of the cached graph from the producer pipeline.
 * Callers that mutate Core (createWorkProject / removeWorkLink / ...)
 * await this so the next render reflects the post-mutation state.
 */
export function triggerWorkGraphRefresh(): Promise<void> {
  setState({ ...state, status: "idle" });
  return fetchOnce();
}

/** Test-only escape hatch — resets the singleton state. */
export function __resetWorkGraphStoreForTest(): void {
  state = INITIAL_STATE;
  inflight = null;
  notify();
}

/**
 * Test-only: prime the cached graph so server-side rendered tests
 * (renderToStaticMarkup, which never runs useEffect) see populated
 * data instead of the idle empty projection. Production callers
 * should never reach for this — they wait for the fetch effect.
 */
export function __seedWorkGraphForTest(graph: WorkGraphProjection): void {
  state = {
    graph,
    status: "ready",
    error: null,
    revision: state.revision + 1,
  };
  inflight = null;
  notify();
}

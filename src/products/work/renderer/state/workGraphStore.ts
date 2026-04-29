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
  lastFetchedAt: number | null;
}

const INITIAL_STATE: WorkGraphState = {
  graph: EMPTY_GRAPH,
  status: "idle",
  error: null,
  revision: 0,
  lastFetchedAt: null,
};

// Refresh policy:
//  - On hook mount, if cache is older than MOUNT_REFRESH_MAX_AGE_MS (or
//    never fetched), trigger a refresh. This is what catches "I created a
//    Task in Code and now navigated to /work/tasks" because the Tasks page
//    component remounts.
//  - On document visibility change (tab becomes visible / window focus),
//    trigger a refresh if cache is older than VISIBILITY_REFRESH_MAX_AGE_MS.
//    This catches "I was on Tasks page in another tab while Code created
//    a task; coming back should reflect it."
//  - While at least one subscriber is mounted AND the document is visible,
//    poll every POLL_INTERVAL_MS. This catches "I'm staring at the Tasks
//    page while Code creates a task in a side surface." Polling stops when
//    last subscriber unmounts or tab goes hidden.
const MOUNT_REFRESH_MAX_AGE_MS = 5_000;
const VISIBILITY_REFRESH_MAX_AGE_MS = 2_000;
const POLL_INTERVAL_MS = 5_000;

let state: WorkGraphState = INITIAL_STATE;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let pollHandle: ReturnType<typeof setInterval> | null = null;
let crossSurfaceListenersInstalled = false;

function notify(): void {
  for (const listener of listeners) listener();
}

function setState(next: WorkGraphState): void {
  state = next;
  notify();
}

function isDocumentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function startPolling(): void {
  if (pollHandle !== null) return;
  if (typeof setInterval === "undefined") return;
  pollHandle = setInterval(() => {
    if (listeners.size === 0 || !isDocumentVisible()) {
      stopPolling();
      return;
    }
    void fetchOnce();
  }, POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollHandle === null) return;
  clearInterval(pollHandle);
  pollHandle = null;
}

function handleVisibilityRefresh(): void {
  if (listeners.size === 0) return;
  if (!isDocumentVisible()) {
    stopPolling();
    return;
  }
  const age = state.lastFetchedAt === null
    ? Number.POSITIVE_INFINITY
    : Date.now() - state.lastFetchedAt;
  if (age > VISIBILITY_REFRESH_MAX_AGE_MS) {
    void fetchOnce();
  }
  startPolling();
}

function ensureCrossSurfaceListenersInstalled(): void {
  if (crossSurfaceListenersInstalled) return;
  if (typeof document === "undefined" || typeof window === "undefined") return;
  crossSurfaceListenersInstalled = true;
  document.addEventListener("visibilitychange", handleVisibilityRefresh);
  window.addEventListener("focus", handleVisibilityRefresh);
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
        lastFetchedAt: Date.now(),
      });
    } catch (err) {
      setState({
        ...state,
        status: "error",
        error: err instanceof Error ? err.message : "Failed to load work graph.",
        lastFetchedAt: Date.now(),
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
    ensureCrossSurfaceListenersInstalled();
    listeners.add(listener);
    if (isDocumentVisible()) {
      startPolling();
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        stopPolling();
      }
    };
  }, []);
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );

  // Mount-time refresh: idle (never fetched) → fetch; otherwise re-fetch
  // when the cached snapshot is older than MOUNT_REFRESH_MAX_AGE_MS.
  // Catches the "task created in Code, then navigate to /work/tasks"
  // flow where the page remounts but the singleton is already 'ready'
  // with stale data.
  useEffect(() => {
    if (snapshot.status === "idle") {
      void fetchOnce();
      return;
    }
    if (snapshot.lastFetchedAt === null) {
      void fetchOnce();
      return;
    }
    if (Date.now() - snapshot.lastFetchedAt > MOUNT_REFRESH_MAX_AGE_MS) {
      void fetchOnce();
    }
    // Intentionally not a dependency: we only want this to run on the
    // hook-consumer's mount, not every status transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  stopPolling();
  notify();
}

/**
 * Test-only: prime the cached graph so server-side rendered tests
 * (renderToStaticMarkup, which never runs useEffect) see populated
 * data instead of the idle empty projection. Production callers
 * should never reach for this — they wait for the fetch effect.
 *
 * The seeded `lastFetchedAt` is set so the mount-time staleness check in
 * `useWorkGraph` does not immediately re-fetch on test render.
 */
export function __seedWorkGraphForTest(graph: WorkGraphProjection): void {
  state = {
    graph,
    status: "ready",
    error: null,
    revision: state.revision + 1,
    lastFetchedAt: Date.now(),
  };
  inflight = null;
  notify();
}

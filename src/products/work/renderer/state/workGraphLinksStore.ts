import { useCallback, useEffect, useSyncExternalStore } from "react";

import { listWorkLinks } from "../api/links.js";
import type { WorkGraphLink } from "../components/topdown/types";

type FetchStatus = "idle" | "loading" | "ready" | "error";

interface LinksStoreState {
  fetchedLinks: readonly WorkGraphLink[];
  status: FetchStatus;
  error: string | null;
  /** Bumped on every successful fetch so memoized selectors invalidate. */
  revision: number;
}

const INITIAL_STATE: LinksStoreState = {
  fetchedLinks: [],
  status: "idle",
  error: null,
  revision: 0,
};

let state: LinksStoreState = INITIAL_STATE;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(next: LinksStoreState): void {
  state = next;
  notify();
}

async function fetchOnce(): Promise<void> {
  if (inflight) return inflight;
  setState({ ...state, status: "loading", error: null });
  inflight = (async () => {
    try {
      const links = await listWorkLinks();
      setState({
        fetchedLinks: links,
        status: "ready",
        error: null,
        revision: state.revision + 1,
      });
    } catch (err) {
      setState({
        ...state,
        status: "error",
        error: err instanceof Error ? err.message : "Failed to load links.",
      });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export interface UseWorkGraphLinksResult {
  fetchedLinks: readonly WorkGraphLink[];
  status: FetchStatus;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useWorkGraphLinks(): UseWorkGraphLinksResult {
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
    fetchedLinks: snapshot.fetchedLinks,
    status: snapshot.status,
    error: snapshot.error,
    refresh,
  };
}

/**
 * Test-only escape hatch — resets the singleton so tests don't leak
 * state across cases. Production code should never call this.
 */
export function __resetWorkGraphLinksStoreForTest(): void {
  state = INITIAL_STATE;
  inflight = null;
  for (const listener of listeners) listener();
}

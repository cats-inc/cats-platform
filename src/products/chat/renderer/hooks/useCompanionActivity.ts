import { useEffect, useRef, useState } from 'react';

import type { CompanionActivityProjection } from '../../companion/activityProjection.js';
import { getCompanionActivity } from '../api/companion.js';

export interface CompanionActivityState {
  projection: CompanionActivityProjection | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const EMPTY_PROJECTION: CompanionActivityProjection = {
  entries: [],
  olderHidden: false,
};

export function useCompanionActivity(input: {
  catId: string;
  enabled: boolean;
}): CompanionActivityState {
  const [projection, setProjection] = useState<CompanionActivityProjection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!input.enabled) {
      setProjection(null);
      setLoading(false);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    getCompanionActivity(input.catId, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setProjection(next);
        setLoading(false);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [input.catId, input.enabled, refreshCount]);

  return {
    projection: input.enabled ? projection ?? EMPTY_PROJECTION : null,
    loading,
    error,
    refresh: () => setRefreshCount((value) => value + 1),
  };
}

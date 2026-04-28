import { useEffect, useRef, useState } from 'react';

import type { CompanionProfileReadModel } from '../../companion/profileReadModel.js';
import { getCompanionProfile } from '../api/companion.js';

export interface CompanionProfileState {
  profile: CompanionProfileReadModel | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const EMPTY_PROFILE: CompanionProfileReadModel = {
  posts: [],
  photos: [],
  videos: [],
  music: [],
  files: [],
};

/**
 * Fetches the PLAN-077 companion profile read-model for `catId` whenever
 * the cat changes or `enabled` flips from false to true. Returns
 * `EMPTY_PROFILE` until the first response lands so the renderer can
 * keep its grid layout stable.
 */
export function useCompanionProfile(input: {
  catId: string;
  enabled: boolean;
}): CompanionProfileState {
  const [profile, setProfile] = useState<CompanionProfileReadModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!input.enabled) {
      setProfile(null);
      setLoading(false);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    getCompanionProfile(input.catId, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setProfile(next);
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
    profile: input.enabled ? profile ?? EMPTY_PROFILE : null,
    loading,
    error,
    refresh: () => setRefreshCount((value) => value + 1),
  };
}

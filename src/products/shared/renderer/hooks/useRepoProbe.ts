import { useEffect, useState } from 'react';

import { inspectPath } from '../api/shell.js';

export interface RepoProbeResult {
  isRepo: boolean;
  repoRoot: string | null;
  branch: string | null;
}

export function useRepoProbe(cwd: string | null): RepoProbeResult {
  const [result, setResult] = useState<RepoProbeResult>({
    isRepo: false,
    repoRoot: null,
    branch: null,
  });

  useEffect(() => {
    if (!cwd) {
      setResult({ isRepo: false, repoRoot: null, branch: null });
      return;
    }

    const controller = new AbortController();
    inspectPath(cwd, controller.signal)
      .then((info) => {
        if (controller.signal.aborted) {
          return;
        }
        setResult({
          isRepo: Boolean(info.isRepo),
          repoRoot: info.repoRoot ?? null,
          branch: info.branch ?? null,
        });
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }
        setResult({ isRepo: false, repoRoot: null, branch: null });
      });

    return () => {
      controller.abort();
    };
  }, [cwd]);

  return result;
}

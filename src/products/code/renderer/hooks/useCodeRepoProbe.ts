import { useEffect, useState } from 'react';

import { inspectPath } from '../api/index.js';

export interface CodeRepoProbeResult {
  isRepo: boolean;
  repoRoot: string | null;
  branch: string | null;
}

export function useCodeRepoProbe(cwd: string | null): CodeRepoProbeResult {
  const [result, setResult] = useState<CodeRepoProbeResult>({
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

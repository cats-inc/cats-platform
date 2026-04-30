import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { AppShellPayload } from '../../api/workspaceContracts.js';
import { fetchOperatorLoopSnapshot } from '../api/index.js';
import type { ChatOperatorSnapshot } from '../../operator-loop/index.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/index.js';

type OperatorLoadState =
  | { status: 'idle'; snapshot: ChatOperatorSnapshot | null; message: string }
  | { status: 'loading'; snapshot: ChatOperatorSnapshot | null; message: string }
  | { status: 'ready'; snapshot: ChatOperatorSnapshot; message: string }
  | { status: 'error'; snapshot: ChatOperatorSnapshot | null; message: string };

const OPERATOR_BACKGROUND_REFRESH_MS = 5_000;

export function useOperatorLoop(
  readyPayload: AppShellPayload | null,
  operatorRefreshKey: string,
) {
  const { t } = useI18n();
  const [operatorState, setOperatorState] = useState<OperatorLoadState>({
    status: 'idle',
    snapshot: null,
    message: '',
  });
  const operatorRequestIdRef = useRef(0);

  const refreshOperatorSnapshot = useCallback((
    options: { background?: boolean } = {},
  ) => {
    if (!readyPayload?.setupCompleteAt) {
      operatorRequestIdRef.current += 1;
      setOperatorState({
        status: 'idle',
        snapshot: null,
        message: '',
      });
      return () => {};
    }

    const controller = new AbortController();
    const requestId = operatorRequestIdRef.current + 1;
    operatorRequestIdRef.current = requestId;
    if (!options.background) {
      setOperatorState((current) => ({
        status: 'loading',
        snapshot: current.snapshot,
        message: '',
      }));
    }

    void fetchOperatorLoopSnapshot(controller.signal)
      .then((snapshot) => {
        if (controller.signal.aborted || requestId !== operatorRequestIdRef.current) {
          return;
        }
        startTransition(() => {
          setOperatorState({
            status: 'ready',
            snapshot,
            message: '',
          });
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestId !== operatorRequestIdRef.current) {
          return;
        }
        setOperatorState((current) => {
          if (options.background && current.snapshot) {
            return current;
          }
          return {
            status: 'error',
            snapshot: current.snapshot,
            message: error instanceof Error ? error.message : t(messageKeys.sharedOperatorLoopLoadError),
          };
        });
      });

    return () => controller.abort();
  }, [readyPayload?.setupCompleteAt, t]);

  useEffect(() => {
    return refreshOperatorSnapshot();
  }, [operatorRefreshKey, refreshOperatorSnapshot]);

  useEffect(() => {
    if (!readyPayload?.setupCompleteAt || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const refreshInBackground = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }
      void refreshOperatorSnapshot({ background: true });
    };

    const intervalId = window.setInterval(refreshInBackground, OPERATOR_BACKGROUND_REFRESH_MS);
    const handleFocus = () => {
      refreshInBackground();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshInBackground();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [readyPayload?.setupCompleteAt, refreshOperatorSnapshot]);

  return {
    operatorState,
    refreshOperatorSnapshot,
    setOperatorState,
  };
}

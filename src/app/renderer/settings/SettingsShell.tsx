import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { Outlet } from 'react-router-dom';

// Settings runs on the same appshell chrome chat / code / work / Cats
// Directory use — `screen claudeShell` outer grid (260px sidebar /
// fluid canvas) plus the `.sidebar` flex column with its own
// scrollable middle. Those rules live in the chat-side stylesheet
// bundle that historically only loaded once a product surface
// mounted; pulling them in here lets `/settings/*` paint with the
// same width / collapse / footer behaviour without re-implementing.
import '../../../products/shared/renderer/styles/chat-shell-base.css';
import '../../../products/shared/renderer/styles/chat-thread-base.css';
import '../../../products/shared/renderer/styles/extras.css';

import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';
import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { fetchAppShell } from '../../../products/shared/renderer/api/index.js';
import {
  readSidebarOpenPreference,
  writeSidebarOpenPreference,
} from '../../../shared/sidebarPreference.js';
import { SettingsAppShellSidebar } from './SettingsAppShellSidebar.js';

const SETTINGS_PAYLOAD_REFRESH_INTERVAL_MS = 5_000;

export type SettingsLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string | null }
  | { status: 'ready'; payload: AppShellPayload };

export interface SettingsCanvasOutletContext {
  loadState: SettingsLoadState;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  onRetryLoad: () => void;
}

export function shouldApplySettingsBackgroundRefresh(
  currentPayload: AppShellPayload,
  nextPayload: AppShellPayload,
): boolean {
  const currentGeneratedAt = Date.parse(currentPayload.metadata.generatedAt);
  const nextGeneratedAt = Date.parse(nextPayload.metadata.generatedAt);

  if (Number.isNaN(currentGeneratedAt) || Number.isNaN(nextGeneratedAt)) {
    return true;
  }

  return nextGeneratedAt >= currentGeneratedAt;
}

export function mergeSettingsBackgroundRefreshPayload(
  currentPayload: AppShellPayload,
  nextPayload: AppShellPayload,
): AppShellPayload {
  return {
    ...currentPayload,
    runtime: nextPayload.runtime,
    runtimeSetup: nextPayload.runtimeSetup,
    metadata: nextPayload.metadata,
    bootstrapAttemptId: nextPayload.bootstrapAttemptId,
  };
}

/**
 * Workspace shell for `/settings/*`. Mirrors `EntitiesShell` so
 * Settings and Cats Directory share one chrome contract — same
 * `screen claudeShell` outer grid, same `.sidebar` flex column, same
 * `cats.sidebar-open` localStorage key for collapse persistence, same
 * `claudeShellSidebarCollapsed` lockstep behaviour. Surface-specific
 * differences (sidebar nav, exit memory) live in
 * `SettingsAppShellSidebar` and `settingsExitMemory`.
 *
 * Earlier revisions nested Settings inside whichever product chrome
 * the user came from (`renderProductSurface(shellSurface)`). That
 * required a `platformShellSurface` nav-state hint to pick the right
 * wrapping product, which produced the well-known "open Settings,
 * end up in Chat chrome" bug whenever the hint was missing or stale.
 * Promoting Settings to its own surface kills that whole class of
 * bug — there is no product chrome to "borrow" anymore.
 */
export function SettingsShell({
  envelope,
}: {
  envelope: PlatformHostEnvelope;
}) {
  const [loadState, setLoadState] = useState<SettingsLoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const setLoadStateRef = useRef(setLoadState);
  setLoadStateRef.current = setLoadState;
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    readSidebarOpenPreference(
      typeof window === 'undefined' ? null : window.localStorage,
    ),
  );

  useEffect(() => {
    writeSidebarOpenPreference(
      typeof window === 'undefined' ? null : window.localStorage,
      sidebarOpen,
    );
  }, [sidebarOpen]);

  const onToggleSidebar = useCallback(() => {
    setSidebarOpen((current) => !current);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState((current) =>
      current.status === 'ready' ? current : { status: 'loading' },
    );
    void fetchAppShell(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setLoadState({ status: 'ready', payload: next });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : null;
        setLoadState({ status: 'error', message });
      });
    return () => {
      controller.abort();
    };
  }, [attempt]);

  const isReady = loadState.status === 'ready';
  useEffect(() => {
    if (!isReady) return undefined;
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    let refreshController: AbortController | null = null;

    const refreshInBackground = (): void => {
      if (document.visibilityState === 'hidden' || refreshController) {
        return;
      }

      const controller = new AbortController();
      refreshController = controller;

      void fetchAppShell(controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return;
          setLoadStateRef.current((current) => {
            if (
              current.status !== 'ready'
              || !shouldApplySettingsBackgroundRefresh(current.payload, next)
            ) {
              return current;
            }
            return {
              status: 'ready',
              payload: mergeSettingsBackgroundRefreshPayload(current.payload, next),
            };
          });
        })
        .catch(() => {
          // Keep the last-good settings payload visible on transient refresh failure.
        })
        .finally(() => {
          if (refreshController === controller) {
            refreshController = null;
          }
        });
    };

    const intervalId = window.setInterval(
      refreshInBackground,
      SETTINGS_PAYLOAD_REFRESH_INTERVAL_MS,
    );
    const handleFocus = () => refreshInBackground();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshInBackground();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      if (refreshController) {
        refreshController.abort();
      }
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isReady]);

  const onPayloadUpdate = useCallback((next: AppShellPayload) => {
    setLoadState({ status: 'ready', payload: next });
  }, []);

  const onRetryLoad = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const onCollapsedSidebarClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (sidebarOpen) {
        return;
      }
      const target = event.target as HTMLElement;
      if (
        target.closest('button, a, input, textarea, select, [role="button"]')
        || target.closest('.accountMenu')
      ) {
        return;
      }
      setSidebarOpen(true);
    },
    [sidebarOpen],
  );
  const settingsPayload = loadState.status === 'ready' ? loadState.payload : null;

  return (
    <div
      className={
        sidebarOpen
          ? 'screen claudeShell'
          : 'screen claudeShell claudeShellSidebarCollapsed'
      }
    >
      <SettingsAppShellSidebar
        envelope={envelope}
        settingsPayload={settingsPayload}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={onToggleSidebar}
        onCollapsedSidebarClick={onCollapsedSidebarClick}
      />
      <main className="canvas">
        <Outlet
          context={{
            loadState,
            onPayloadUpdate,
            onRetryLoad,
          } satisfies SettingsCanvasOutletContext}
        />
      </main>
    </div>
  );
}

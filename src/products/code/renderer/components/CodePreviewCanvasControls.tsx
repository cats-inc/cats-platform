import { useCallback, useEffect, useRef, useState } from 'react';

import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import type { ArtifactCanvasControlsProps } from '../../../shared/renderer/withSharedViewerRoutes.js';
import type { CodePreviewArtifactState } from '../../livePreview/conversationPreviews.js';
import {
  buildCodeApiLivePreviewLogsPath,
  buildCodeApiLivePreviewPath,
  buildCodeApiPreviewArtifactPath,
} from '../../shared/apiPaths.js';

/**
 * Code canvas controls for supervised previews (SPEC-123 CAP-13/CAP-14):
 * - a static preview whose lease is gone (Platform restarted, TTL expired)
 *   restarts transparently;
 * - a dev server shows its status with Stop, Restart, Logs and Open externally;
 * - the lease is renewed while the canvas shows it.
 */

export const CODE_PREVIEW_STATE_POLL_MS = 5_000;
// Dev servers color their output; the log panel shows plain text.
const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'gu');
export const CODE_PREVIEW_RENEW_MS = 5 * 60_000;

const STATUS_KEYS = {
  starting: messageKeys.codeCanvasPreviewStatusStarting,
  ready: messageKeys.codeCanvasPreviewStatusRunning,
  stopping: messageKeys.codeCanvasPreviewStatusStopping,
  stopped: messageKeys.codeCanvasPreviewStatusStopped,
  expired: messageKeys.codeCanvasPreviewStatusStopped,
  failed: messageKeys.codeCanvasPreviewStatusFailed,
  missing: messageKeys.codeCanvasPreviewStatusStopped,
} as const;

export function CodePreviewCanvasControls({ artifactId, onRefresh }: ArtifactCanvasControlsProps) {
  const { t } = useI18n();
  const [state, setState] = useState<CodePreviewArtifactState | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; logTail: string | null } | null>(null);
  const [logs, setLogs] = useState<string | null>(null);
  const autoRestarted = useRef<string | null>(null);

  const load = useCallback(async (): Promise<CodePreviewArtifactState | null> => {
    const response = await fetch(buildCodeApiPreviewArtifactPath(artifactId));
    const next = response.ok ? await response.json() as CodePreviewArtifactState : null;
    setState(next);
    return next;
  }, [artifactId]);

  const restart = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch(`${buildCodeApiPreviewArtifactPath(artifactId)}/restart`, { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: { message?: string }; logTail?: string };
        setProblem({ message: body.error?.message ?? String(response.status), logTail: body.logTail ?? null });
      }
      await load();
      onRefresh();
    } finally {
      setBusy(false);
    }
  }, [artifactId, load, onRefresh]);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setProblem(null);
    setLogs(null);
    const tick = () => {
      void load().catch(() => {
        if (!cancelled) setState(null);
      });
    };
    tick();
    const timer = setInterval(tick, CODE_PREVIEW_STATE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load]);

  // A static preview has nothing for the user to decide: bring it back once.
  useEffect(() => {
    if (!state || state.kind !== 'static' || !state.restartable) return;
    if (state.status === 'ready' || state.status === 'starting' || autoRestarted.current === artifactId) return;
    autoRestarted.current = artifactId;
    void restart();
  }, [artifactId, restart, state]);

  // Keep the lease alive while the canvas shows it.
  const renewableId = state?.status === 'ready' ? state.previewId : null;
  useEffect(() => {
    if (!renewableId) return undefined;
    const renew = () => { void fetch(`${buildCodeApiLivePreviewPath(renewableId)}/renew`, { method: 'POST' }); };
    renew();
    const timer = setInterval(renew, CODE_PREVIEW_RENEW_MS);
    return () => clearInterval(timer);
  }, [renewableId]);

  if (!state) return null;
  if (state.kind === 'static') {
    return problem ? (
      <div className="artifactCanvasControls" role="status">
        <span className="artifactCanvasControlsProblem">
          {t(messageKeys.codeCanvasPreviewRestartFailed, { message: problem.message })}
        </span>
      </div>
    ) : null;
  }

  const running = state.status === 'ready' || state.status === 'starting';
  async function stop(): Promise<void> {
    setBusy(true);
    try {
      await fetch(`${buildCodeApiLivePreviewPath(state!.previewId)}/stop`, { method: 'POST' });
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function toggleLogs(): Promise<void> {
    if (logs !== null) {
      setLogs(null);
      return;
    }
    const response = await fetch(buildCodeApiLivePreviewLogsPath(state!.previewId));
    const body = response.ok ? await response.json() as { logs?: string } : {};
    setLogs((body.logs ?? '').replace(ANSI_ESCAPE, '').split(/\r?\n/u).slice(-200).join('\n'));
  }

  return (
    <div className="artifactCanvasControls">
      <span className={`artifactCanvasControlsStatus artifactCanvasControlsStatus--${state.status}`} role="status">
        {t(messageKeys.codeCanvasPreviewDevServer)}
        {' · '}
        {t(STATUS_KEYS[state.status])}
      </span>
      {!running && state.restartable ? (
        <span className="artifactCanvasControlsHint">{t(messageKeys.codeCanvasPreviewNotRunning)}</span>
      ) : null}
      <div className="artifactCanvasActions">
        {running ? (
          <button type="button" className="operatorActionButton" disabled={busy} onClick={() => { void stop(); }}>
            {t(messageKeys.codeCanvasPreviewStop)}
          </button>
        ) : state.restartable ? (
          <button type="button" className="operatorActionButton" disabled={busy} onClick={() => { void restart(); }}>
            {t(messageKeys.codeCanvasPreviewRestart)}
          </button>
        ) : null}
        <button type="button" className="operatorActionButton" onClick={() => { void toggleLogs(); }}>
          {logs === null ? t(messageKeys.codeCanvasPreviewLogs) : t(messageKeys.codeCanvasPreviewHideLogs)}
        </button>
        {state.status === 'ready' && state.previewUrl ? (
          <a className="operatorActionButton" href={state.previewUrl} target="_blank" rel="noreferrer">
            {t(messageKeys.codeCanvasPreviewOpenExternal)}
          </a>
        ) : null}
      </div>
      {problem ? (
        <p className="artifactCanvasControlsProblem" role="alert">
          {t(messageKeys.codeCanvasPreviewRestartFailed, { message: problem.message })}
        </p>
      ) : null}
      {logs !== null || problem?.logTail ? (
        <pre className="artifactCanvasControlsLogs">
          {(logs ?? problem?.logTail) || t(messageKeys.codeCanvasPreviewLogsEmpty)}
        </pre>
      ) : null}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';

import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import {
  fetchCodeLivePreviewLogs,
  fetchCodeLivePreviews,
  stopCodeLivePreview,
  type CodeLivePreviewStatus,
  type CodeLivePreviewSurfaceKind,
  type CodeLivePreviewSummary,
} from '../api/codeTask.js';

interface LivePreviewPanelProps {
  surfaceKind: CodeLivePreviewSurfaceKind;
  surfaceId: string;
}

export function LivePreviewPanel({
  surfaceKind,
  surfaceId,
}: LivePreviewPanelProps): JSX.Element | null {
  const { locale, t } = useI18n();
  const [previews, setPreviews] = useState<CodeLivePreviewSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logsByPreviewId, setLogsByPreviewId] = useState<Record<string, string>>({});
  const [logsLoadingId, setLogsLoadingId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const requestVersionRef = useRef(0);
  const surfaceIdentityRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestVersionRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const requestVersion = requestVersionRef.current + 1;
    const surfaceIdentity = createLivePreviewSurfaceIdentity(surfaceKind, surfaceId);
    const surfaceChanged = surfaceIdentityRef.current !== surfaceIdentity;
    surfaceIdentityRef.current = surfaceIdentity;
    requestVersionRef.current = requestVersion;
    if (surfaceChanged) {
      setLogsByPreviewId({});
      setLogsLoadingId(null);
      setStoppingId(null);
      setActionFeedback(null);
    }
    if (!surfaceId.trim()) {
      setPreviews([]);
      setLoading(false);
      setError(null);
      return () => {
        expireLivePreviewRequest(requestVersionRef, requestVersion);
      };
    }

    setLoading(true);
    setError(null);
    void fetchCodeLivePreviews(
      surfaceKind,
      surfaceId,
      t(messageKeys.codeLivePreviewErrorLoad),
    )
      .then((response) => {
        if (isCurrentLivePreviewRequest(mountedRef, requestVersionRef, requestVersion)) {
          setPreviews(response.previews);
        }
      })
      .catch((fetchError: unknown) => {
        if (isCurrentLivePreviewRequest(mountedRef, requestVersionRef, requestVersion)) {
          setError(fetchError instanceof Error
            ? fetchError.message
            : t(messageKeys.codeLivePreviewErrorLoad));
        }
      })
      .finally(() => {
        if (isCurrentLivePreviewRequest(mountedRef, requestVersionRef, requestVersion)) {
          setLoading(false);
        }
      });

    return () => {
      expireLivePreviewRequest(requestVersionRef, requestVersion);
    };
  }, [surfaceId, surfaceKind, t]);

  if (!loading && !error && previews.length === 0 && !actionFeedback) {
    return null;
  }

  async function refreshPreviews(input: {
    requestVersion: number;
    surfaceKind: CodeLivePreviewSurfaceKind;
    surfaceId: string;
  }): Promise<void> {
    const response = await fetchCodeLivePreviews(
      input.surfaceKind,
      input.surfaceId,
      t(messageKeys.codeLivePreviewErrorLoad),
    );
    if (isCurrentLivePreviewRequest(mountedRef, requestVersionRef, input.requestVersion)) {
      setPreviews(response.previews);
    }
  }

  async function handleStop(previewId: string): Promise<void> {
    const requestVersion = requestVersionRef.current;
    const currentSurfaceKind = surfaceKind;
    const currentSurfaceId = surfaceId;
    setStoppingId(previewId);
    setActionFeedback(null);
    setError(null);
    try {
      await stopCodeLivePreview(previewId, t(messageKeys.codeLivePreviewErrorStop));
      if (!isCurrentLivePreviewRequest(mountedRef, requestVersionRef, requestVersion)) {
        return;
      }
      setActionFeedback(t(messageKeys.codeLivePreviewStopRequested));
      await refreshPreviews({
        requestVersion,
        surfaceKind: currentSurfaceKind,
        surfaceId: currentSurfaceId,
      });
    } catch (stopError) {
      if (isCurrentLivePreviewRequest(mountedRef, requestVersionRef, requestVersion)) {
        setError(stopError instanceof Error
          ? stopError.message
          : t(messageKeys.codeLivePreviewErrorStop));
      }
    } finally {
      // Clear the stopping spinner regardless of request-version
      // staleness: the in-flight stop is now resolved/rejected, so
      // the transient UI flag should not linger. The version guard
      // above already gates the surface-specific feedback / refresh,
      // but the spinner is a per-component flag that must reset on
      // every completed stop while the component is still mounted.
      // Without this, a locale (`t`) change between the start and
      // resolution of a stop would bump the request version and
      // leave the spinner stuck forever, since the surface-change
      // effect would not fire.
      if (mountedRef.current) {
        setStoppingId(null);
      }
    }
  }

  async function handleToggleLogs(previewId: string): Promise<void> {
    if (Object.prototype.hasOwnProperty.call(logsByPreviewId, previewId)) {
      setLogsByPreviewId((current) => {
        const nextLogs = { ...current };
        delete nextLogs[previewId];
        return nextLogs;
      });
      return;
    }

    const requestVersion = requestVersionRef.current;
    setLogsLoadingId(previewId);
    setError(null);
    try {
      const response = await fetchCodeLivePreviewLogs(
        previewId,
        t(messageKeys.codeLivePreviewErrorLogs),
      );
      if (isCurrentLivePreviewRequest(mountedRef, requestVersionRef, requestVersion)) {
        setLogsByPreviewId((current) => ({
          ...current,
          [previewId]: response.logs,
        }));
      }
    } catch (logsError) {
      if (isCurrentLivePreviewRequest(mountedRef, requestVersionRef, requestVersion)) {
        setError(logsError instanceof Error
          ? logsError.message
          : t(messageKeys.codeLivePreviewErrorLogs));
      }
    } finally {
      // Same reasoning as `handleStop`: clear the per-component
      // loading spinner whenever the in-flight logs fetch finishes,
      // even if the request version moved on. The version guards on
      // the response-application path already keep stale logs from
      // being committed to state.
      if (mountedRef.current) {
        setLogsLoadingId(null);
      }
    }
  }

  return (
    <section className="operatorPanel codeLivePreviewPanel" aria-label={t(messageKeys.codeLivePreviewTitle)}>
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">{t(messageKeys.platformProductCodeName)}</p>
          <h2>{t(messageKeys.codeLivePreviewTitle)}</h2>
          <p className="codeLivePreviewDescription">
            {t(messageKeys.codeLivePreviewDescription)}
          </p>
        </div>
        {loading ? (
          <span className="operatorStatusBadge isMuted">
            {t(messageKeys.codeLivePreviewLogsLoading)}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="codeBuilderFeedback">{error}</p>
      ) : null}
      {actionFeedback ? (
        <p className="codeBuilderFeedback">{actionFeedback}</p>
      ) : null}

      {previews.length === 0 ? null : (
        <div className="operatorStack">
          {previews.map((preview) => {
            const logs = logsByPreviewId[preview.previewId];
            const logsVisible = Object.prototype.hasOwnProperty.call(
              logsByPreviewId,
              preview.previewId,
            );
            const canStop = preview.status === 'ready' || preview.status === 'starting';
            return (
              <article key={preview.previewId} className="operatorCard codeLivePreviewCard">
                <div className="operatorCardHeader">
                  <strong>{preview.previewId}</strong>
                  <span className={`operatorStatusBadge codeLivePreviewStatus--${preview.status}`}>
                    {labelLivePreviewStatus(preview.status, t)}
                  </span>
                </div>
                <div className="codeLivePreviewMeta">
                  <span>
                    {t(messageKeys.codeLivePreviewCommandProfile, {
                      profile: preview.commandProfileId,
                    })}
                  </span>
                  <span>
                    {t(messageKeys.codeLivePreviewWorkspace, {
                      workspace: preview.workspace.id,
                    })}
                  </span>
                  <span>
                    {t(messageKeys.codeLivePreviewExpiresAt, {
                      time: formatTimestamp(preview.expiresAt, locale),
                    })}
                  </span>
                </div>
                {preview.diagnostic ? (
                  <p className={`codeLivePreviewDiagnostic is-${preview.diagnostic.severity}`}>
                    {t(messageKeys.codeLivePreviewDiagnostic, {
                      message: preview.diagnostic.message,
                    })}
                  </p>
                ) : null}
                <div className="codeLivePreviewActions">
                  <a
                    href={preview.origin}
                    target="_blank"
                    rel="noreferrer"
                    className="operatorActionButton"
                  >
                    {t(messageKeys.codeLivePreviewOpen)}
                  </a>
                  <button
                    type="button"
                    className="operatorActionButton"
                    onClick={() => { void handleStop(preview.previewId); }}
                    disabled={!canStop || stoppingId === preview.previewId}
                  >
                    {stoppingId === preview.previewId
                      ? t(messageKeys.codeLivePreviewStopping)
                      : t(messageKeys.codeLivePreviewStop)}
                  </button>
                  <button
                    type="button"
                    className="operatorActionButton"
                    disabled
                    title={t(messageKeys.codeLivePreviewRetryUnavailable)}
                  >
                    {t(messageKeys.codeLivePreviewRetry)}
                  </button>
                  <button
                    type="button"
                    className="operatorActionButton"
                    onClick={() => { void handleToggleLogs(preview.previewId); }}
                    disabled={logsLoadingId === preview.previewId}
                  >
                    {logsVisible
                      ? t(messageKeys.codeLivePreviewHideLogs)
                      : t(messageKeys.codeLivePreviewLogs)}
                  </button>
                </div>
                {logsLoadingId === preview.previewId ? (
                  <p className="operatorEmptyState">
                    {t(messageKeys.codeLivePreviewLogsLoading)}
                  </p>
                ) : null}
                {logsVisible ? (
                  <pre className="codeLivePreviewLogs">
                    {logs?.trim() ? logs : t(messageKeys.codeLivePreviewLogsEmpty)}
                  </pre>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface LivePreviewRequestRef<T> {
  current: T;
}

function isCurrentLivePreviewRequest(
  mountedRef: LivePreviewRequestRef<boolean>,
  requestVersionRef: LivePreviewRequestRef<number>,
  requestVersion: number,
): boolean {
  return mountedRef.current && requestVersionRef.current === requestVersion;
}

function expireLivePreviewRequest(
  requestVersionRef: LivePreviewRequestRef<number>,
  requestVersion: number,
): void {
  if (requestVersionRef.current === requestVersion) {
    requestVersionRef.current += 1;
  }
}

function createLivePreviewSurfaceIdentity(
  surfaceKind: CodeLivePreviewSurfaceKind,
  surfaceId: string,
): string {
  return `${surfaceKind}:${surfaceId}`;
}

function labelLivePreviewStatus(
  status: CodeLivePreviewStatus,
  t: ReturnType<typeof useI18n>['t'],
): string {
  switch (status) {
    case 'expired':
      return t(messageKeys.codeLivePreviewStatusExpired);
    case 'failed':
      return t(messageKeys.codeLivePreviewStatusFailed);
    case 'ready':
      return t(messageKeys.codeLivePreviewStatusReady);
    case 'starting':
      return t(messageKeys.codeLivePreviewStatusStarting);
    case 'stopped':
      return t(messageKeys.codeLivePreviewStatusStopped);
    case 'stopping':
      return t(messageKeys.codeLivePreviewStatusStopping);
    default:
      return status;
  }
}

function formatTimestamp(value: string, locale: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}

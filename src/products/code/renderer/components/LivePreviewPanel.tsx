import { useEffect, useState } from 'react';

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

  useEffect(() => {
    if (!surfaceId.trim()) {
      setPreviews([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchCodeLivePreviews(
      surfaceKind,
      surfaceId,
      t(messageKeys.codeLivePreviewErrorLoad),
    )
      .then((response) => {
        if (!cancelled) {
          setPreviews(response.previews);
        }
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setError(fetchError instanceof Error
            ? fetchError.message
            : t(messageKeys.codeLivePreviewErrorLoad));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [surfaceId, surfaceKind, t]);

  if (!loading && !error && previews.length === 0 && !actionFeedback) {
    return null;
  }

  async function refreshPreviews(): Promise<void> {
    const response = await fetchCodeLivePreviews(
      surfaceKind,
      surfaceId,
      t(messageKeys.codeLivePreviewErrorLoad),
    );
    setPreviews(response.previews);
  }

  async function handleStop(previewId: string): Promise<void> {
    setStoppingId(previewId);
    setActionFeedback(null);
    setError(null);
    try {
      await stopCodeLivePreview(previewId, t(messageKeys.codeLivePreviewErrorStop));
      setActionFeedback(t(messageKeys.codeLivePreviewStopRequested));
      await refreshPreviews();
    } catch (stopError) {
      setError(stopError instanceof Error
        ? stopError.message
        : t(messageKeys.codeLivePreviewErrorStop));
    } finally {
      setStoppingId(null);
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

    setLogsLoadingId(previewId);
    setError(null);
    try {
      const response = await fetchCodeLivePreviewLogs(
        previewId,
        t(messageKeys.codeLivePreviewErrorLogs),
      );
      setLogsByPreviewId((current) => ({
        ...current,
        [previewId]: response.logs,
      }));
    } catch (logsError) {
      setError(logsError instanceof Error
        ? logsError.message
        : t(messageKeys.codeLivePreviewErrorLogs));
    } finally {
      setLogsLoadingId(null);
    }
  }

  return (
    <section className="operatorPanel codeLivePreviewPanel" aria-label={t(messageKeys.codeLivePreviewTitle)}>
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">Cats Code</p>
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

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  fetchCodeArtifacts,
  type CodeArtifactListItemSummary,
} from '../../api/codeTask.js';
import { buildCodeArtifactPath } from '../../codePaths.js';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../../shared/i18n/messageKeys.js';
import {
  labelCodeArtifactKindForLocale,
  labelCodeArtifactStatusForLocale,
} from '../codeStatusLabels.js';
import './artifactsList.css';

type CodeArtifactKind =
  | 'build'
  | 'preview'
  | 'document'
  | 'report'
  | 'attachment'
  | 'transcript_export'
  | 'dataset';

type KindFilter = 'all' | CodeArtifactKind;

const FILTER_ORDER: readonly KindFilter[] = [
  'all',
  'build',
  'preview',
  'document',
  'report',
  'attachment',
  'transcript_export',
  'dataset',
];

function formatRelative(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const delta = now - then;
  if (Number.isNaN(delta)) {
    return '';
  }
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) {
    return formatter.format(0, 'second');
  }
  if (delta < hour) {
    return formatter.format(-Math.round(delta / minute), 'minute');
  }
  if (delta < day) {
    return formatter.format(-Math.round(delta / hour), 'hour');
  }
  if (delta < 7 * day) {
    return formatter.format(-Math.round(delta / day), 'day');
  }
  return new Intl.DateTimeFormat(locale).format(new Date(iso));
}

export function ArtifactsListPage(): JSX.Element {
  const { locale, t } = useI18n();
  const [artifacts, setArtifacts] = useState<CodeArtifactListItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<KindFilter>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchCodeArtifacts(
      t(messageKeys.codeArtifactListLoadFailed),
      { excludeUndeclaredSourceEdits: true },
    )
      .then((payload) => {
        if (cancelled) return;
        setArtifacts(payload.artifacts);
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        setError(fetchError instanceof Error ? fetchError.message : t(messageKeys.codeArtifactUnknown));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  const visible = useMemo(() => {
    const base = filter === 'all'
      ? artifacts
      : artifacts.filter((a) => a.kind === filter);
    return [...base].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [artifacts, filter]);

  return (
    <div className="codeArtifactsList">
      <header className="channelTopBar codeArtListTopBar">
        <div className="channelTopBarStart codeArtListTopBar__start">
          <h1 className="channelTopBarTitle codeArtListTopBar__title">
            {t(messageKeys.codeArtifactListHeader)}
          </h1>
          <span className="codeArtListTopBar__count">{visible.length}</span>
        </div>
        <div className="channelTopBarCenter codeArtListTopBar__center">
          {FILTER_ORDER.map((kind) => (
            <button
              key={kind}
              type="button"
              className={[
                'codeArtListTopBar__filterBtn',
                filter === kind ? 'codeArtListTopBar__filterBtn--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setFilter(kind)}
              aria-pressed={filter === kind}
            >
              {kind === 'all'
                ? t(messageKeys.codeArtifactListAllFilter)
                : labelCodeArtifactKindForLocale(kind, t)}
            </button>
          ))}
        </div>
        <div className="channelTopBarEnd" />
      </header>
      <main className="codeArtifactsList__main">
        {loading && visible.length === 0 ? (
          <p className="codeArtifactsList__empty">{t(messageKeys.codeArtifactListLoading)}</p>
        ) : error ? (
          <p className="codeArtifactsList__empty">
            {t(messageKeys.codeArtifactListError, { error })}
          </p>
        ) : visible.length === 0 ? (
          <p className="codeArtifactsList__empty">
            {t(messageKeys.codeArtifactListEmpty)}
          </p>
        ) : (
          <>
            <ul className="codeArtifactsList__list">
              {visible.map((art) => (
                <li key={art.id} className="codeArtifactsList__row">
                  <Link
                    to={buildCodeArtifactPath(art.id)}
                    className="codeArtifactsList__rowLink"
                    aria-label={t(messageKeys.codeArtifactListAriaOpen, { title: art.title })}
                  >
                    <div className="codeArtifactsList__rowMain">
                      <span
                        className={`codeArtifactsList__kindPill codeArtifactsList__kindPill--${art.kind}`}
                      >
                        {labelCodeArtifactKindForLocale(art.kind, t)}
                      </span>
                      {art.producerLabel ? (
                        <span className="codeArtifactsList__producerPill">
                          {art.producerLabel}
                        </span>
                      ) : null}
                      <div className="codeArtifactsList__rowText">
                        <span className="codeArtifactsList__rowTitle">
                          {art.title}
                        </span>
                        {art.summary ? (
                          <span className="codeArtifactsList__rowSummary">
                            {art.summary}
                          </span>
                        ) : null}
                        {art.path ? (
                          <span className="codeArtifactsList__rowPath">
                            {art.path}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="codeArtifactsList__rowMeta">
                      {art.taskTitle ? (
                        <span className="codeArtifactsList__provenance">
                          {t(messageKeys.codeArtifactListProvenanceTask)} ·{' '}
                          <strong>{art.taskTitle}</strong>
                        </span>
                      ) : null}
                      {art.runId ? (
                        <span className="codeArtifactsList__provenance">
                          {t(messageKeys.codeArtifactListProvenanceRun)} ·{' '}
                          <strong>{art.runId}</strong>
                        </span>
                      ) : null}
                      <span className="codeArtifactsList__updated">
                        {formatRelative(art.updatedAt, locale)}
                      </span>
                      <span
                        className={`codeArtifactsList__statusPill codeArtifactsList__statusPill--${art.status}`}
                      >
                        {labelCodeArtifactStatusForLocale(art.status, t)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

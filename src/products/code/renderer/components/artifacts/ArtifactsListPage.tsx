import { OwnerBatchActions, OwnerRecordActions, useOwnerListing } from '../../../../shared/renderer/OwnerRecordActions.js';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  CORE_ARTIFACT_KINDS,
  CORE_ARTIFACT_STATUSES,
} from '../../../../../core/api/constants.js';
import type {
  CoreArtifactKind,
  CoreArtifactStatus,
} from '../../../../../core/types.js';
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

type KindFilter = 'all' | CoreArtifactKind;

type StatusFilter = 'all' | CoreArtifactStatus;

const FILTER_ORDER: readonly KindFilter[] = [
  'all',
  ...CORE_ARTIFACT_KINDS,
] as const;

const STATUS_FILTER_ORDER: readonly StatusFilter[] = [
  'all',
  ...CORE_ARTIFACT_STATUSES,
] as const;

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
  const ownerListing = useOwnerListing('artifact');
  const [q, setQ] = useState('');
  const [context, setContext] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { const listener = () => setRefresh(n => n + 1); window.addEventListener('cats:owner-records-changed', listener); return () => window.removeEventListener('cats:owner-records-changed', listener); }, []);
  const [filter, setFilter] = useState<KindFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const serverFilters: Parameters<typeof fetchCodeArtifacts>[1] = {
      excludeUndeclaredSourceEdits: true,
    };
    if (filter !== 'all') {
      serverFilters.kind = filter;
    }
    if (statusFilter !== 'all') {
      serverFilters.status = statusFilter;
    }

    void fetchCodeArtifacts(
      t(messageKeys.codeArtifactListLoadFailed),
      serverFilters,
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
  }, [filter, statusFilter, t, refresh]);

  // Server already applies kind / status / declared-only filters through the
  // query string above. Just sort the returned page by recency for display.
  const visible = useMemo(() => {
    return [...artifacts].filter(item => ownerListing.accepts(item.id) && (!q || `${item.title} ${item.summary ?? ''} ${item.path ?? ''}`.toLowerCase().includes(q.toLowerCase())) && (!context || item.taskId === context)).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [artifacts, ownerListing, q, context]);
  const visibleIds = visible.map(item => item.id).join('\n');
  useEffect(() => { setSelected(current => { const next = current.filter(id => visible.some(item => item.id === id)); return next.length === current.length ? current : next; }); }, [visibleIds]);

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
        <div className="channelTopBarEnd"><Link className="operatorActionButton" to="/code/knowledge">{t(messageKeys.codeKnowledgeManage)}</Link></div>
      </header>
      <div className="codeArtifactsList__statusBar" role="toolbar">
        <span className="codeArtifactsList__statusBarLabel">
          {t(messageKeys.codeArtifactListStatusFilterLabel)}
        </span>
        {STATUS_FILTER_ORDER.map((status) => (
          <button
            key={status}
            type="button"
            className={[
              'codeArtListTopBar__filterBtn',
              statusFilter === status ? 'codeArtListTopBar__filterBtn--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setStatusFilter(status)}
            aria-pressed={statusFilter === status}
          >
            {status === 'all'
              ? t(messageKeys.codeArtifactListAllFilter)
              : labelCodeArtifactStatusForLocale(status, t)}
          </button>
        ))}
      </div>
      <main className="codeArtifactsList__main">{ownerListing.control}<label>{t('ownerSearch')} <input type="search" value={q} onChange={event => setQ(event.target.value)} /></label><label>{t('ownerTaskFilter')} <select value={context} onChange={event => setContext(event.target.value)}><option value="">{t('ownerAll')}</option>{Array.from(new Map(artifacts.filter(item => item.taskId).map(item => [item.taskId!, item.taskTitle ?? item.taskId!])).entries()).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>
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
            <OwnerBatchActions family="artifact" ids={selected} onChanged={() => setSelected([])} />
            <ul className="codeArtifactsList__list">
              {visible.map((art) => (
                <li key={art.id} className="codeArtifactsList__row">
                  <input type="checkbox" aria-label={t('ownerSelectItem', { title: art.title })} checked={selected.includes(art.id)} onChange={event => setSelected(current => event.target.checked ? [...current, art.id] : current.filter(id => id !== art.id))} />
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
                      {art.disposition === 'candidate' ? (
                        <span className="codeArtifactsList__candidatePill" title={t(messageKeys.codeArtifactListCandidateHint)}>
                          {t(messageKeys.codeArtifactListCandidateLabel)}
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
                  <OwnerRecordActions family="artifact" id={art.id} />
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

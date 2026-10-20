import { useMemo, useState } from 'react';
import { CodespaceActions } from './CodespaceActions.js';
import { registerCodespace } from '../../api/codeTask.js';
import { refreshCodeWorkspaces } from '../../state/codeWorkspacesStore.js';
import { Link } from 'react-router-dom';

import {
  useCodeWorkspaces,
} from '../../state/codeWorkspacesStore.js';
import type {
  CodeWorkspaceListItemSummary,
  CodeWorkspaceSource,
} from '../../api/codeTask.js';
import { buildCodeCodespacePath } from '../../codePaths.js';
import { messageKeys } from '../../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import { labelCodeWorkspaceStatusForLocale } from '../codeStatusLabels.js';
import './workspaces.css';

function labelWorkspaceSource(
  source: CodeWorkspaceSource,
  t: ReturnType<typeof useI18n>['t'],
): string {
  switch (source) {
    case 'owner_selected': return t('ownerSelectedFolder');
    case 'task_workspace':
      return t(messageKeys.codeWorkspacesListSourceCodes);
    case 'conversation_repo':
      return t(messageKeys.codeWorkspacesListSourceRepo);
    case 'runtime_cwd':
      return t(messageKeys.codeWorkspacesListSourceRuntime);
    case 'artifact_anchor':
      return t(messageKeys.codeWorkspacesListSourceArtifact);
    default:
      return t(messageKeys.codeWorkspaceDetailSourceUnknown);
  }
}

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

export function WorkspacesListPage(): JSX.Element {
  const { workspaces, loading, error, revision } = useCodeWorkspaces();
  const { locale, t } = useI18n();
  const [view, setView] = useState('visible');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('all');
  const [adding, setAdding] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(
    () =>
      [...workspaces].filter(item => (view === 'all' || (item.management?.listing ?? 'visible') === view)
        && (source === 'all' || item.source === source)
        && `${item.title} ${item.path}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort(
        (a, b) =>
          new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
      ),
    [workspaces, view, search, source],
  );

  return (
    <div className="codeWorkspacesList">
      <header className="channelTopBar codeWsListTopBar">
        <div className="channelTopBarStart codeWsListTopBar__start">
          <h1 className="channelTopBarTitle codeWsListTopBar__title">
            {t(messageKeys.codeWorkspacesListHeader)}
          </h1>
          <span className="codeWsListTopBar__count">{sorted.length}</span>
        </div>
        <div className="channelTopBarCenter codeWsListTopBar__center" />
        <div className="channelTopBarEnd codeWsListTopBar__end"><button onClick={() => setAdding(!adding)}>{t('ownerRegisterFolder')}</button></div>
      </header>
      <main className="codeWorkspacesList__main">
        {adding ? <form onSubmit={event => { event.preventDefault(); setSaving(true); setAddError(null);
          void registerCodespace(folderPath, revision ?? 0).then(async () => { await refreshCodeWorkspaces({ t }); setAdding(false); setFolderPath(''); setView('visible'); })
            .catch(err => setAddError(err instanceof Error ? err.message : t('ownerActionFailed'))).finally(() => setSaving(false));
        }}>
          <label>{t('ownerFolderPath')}<input autoFocus value={folderPath} onChange={event => setFolderPath(event.target.value)} required /></label>
          <button disabled={saving}>{t('ownerSave')}</button><button type="button" onClick={() => setAdding(false)}>{t('ownerCancel')}</button>
          {addError ? <p role="alert">{addError}</p> : null}
        </form> : null}
        <div className="ownerCodespaceFilters">
          <label>{t('ownerSearch')}<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label>{t('ownerView')}<select value={view} onChange={event => setView(event.target.value)}>
            <option value="visible">{t('ownerCurrent')}</option><option value="archived">{t('ownerArchived')}</option>
            <option value="removed">{t('ownerRemoved')}</option><option value="all">{t('ownerAll')}</option>
          </select></label>
          <label>{t('ownerSource')}<select value={source} onChange={event => setSource(event.target.value)}>
            <option value="all">{t('ownerAll')}</option>
            {[...new Set(workspaces.map(item => item.source))].map(value => <option key={value} value={value}>{labelWorkspaceSource(value, t)}</option>)}
          </select></label>
        </div>
        {loading && sorted.length === 0 ? (
          <p className="codeWorkspacesList__empty">
            {t(messageKeys.codeWorkspacesListLoading)}
          </p>
        ) : error ? (
          <p className="codeWorkspacesList__empty">
            {t(messageKeys.codeWorkspacesListError, { error })}
          </p>
        ) : sorted.length === 0 ? (
          <p className="codeWorkspacesList__empty">
            {t(messageKeys.codeWorkspacesListNoCodespaces)}
          </p>
        ) : (
          <>
            <ul className="codeWorkspacesList__list">
              {sorted.map((ws: CodeWorkspaceListItemSummary) => (
                <li key={ws.id} className="codeWorkspacesList__row">
                  <Link
                    to={buildCodeCodespacePath(ws.id)}
                    className="codeWorkspacesList__rowLink"
                    aria-label={t(messageKeys.codeWorkspacesListAriaOpen, {
                      title: ws.title,
                    })}
                  >
                    <div className="codeWorkspacesList__rowMain">
                      <span
                        className={`codeWorkspacesList__dot codeWorkspacesList__dot--${ws.status}`}
                        aria-hidden="true"
                      />
                      <div className="codeWorkspacesList__rowText">
                        <span className="codeWorkspacesList__rowTitle">
                          {ws.title}
                        </span>
                        <span className="codeWorkspacesList__rowPath">
                          {ws.path}
                        </span>
                        {ws.summary ? (
                          <span className="codeWorkspacesList__rowSummary">
                            {ws.summary}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="codeWorkspacesList__rowMeta">
                      <span className="codeWorkspacesList__sourcePill">
                        {labelWorkspaceSource(ws.source, t)}
                      </span>
                      <span className="codeWorkspacesList__metric">
                        <strong>{ws.conversationCount}</strong>{' '}
                        {t(messageKeys.codeWorkspaceDetailMetricConversations)}
                      </span>
                      <span className="codeWorkspacesList__metric">
                        <strong>{ws.taskCount}</strong>{' '}
                        {t(messageKeys.codeWorkspaceDetailMetricTasks)}
                      </span>
                      <span className="codeWorkspacesList__metric">
                        <strong>{ws.artifactCount}</strong>{' '}
                        {t(messageKeys.codeWorkspaceDetailMetricArtifacts)}
                      </span>
                      <span className="codeWorkspacesList__metric codeWorkspacesList__metric--muted">
                        {formatRelative(ws.lastActiveAt, locale)}
                      </span>
                      <span
                        className={`codeWorkspacesList__statusPill codeWorkspacesList__statusPill--${ws.status}`}
                      >
                        {labelCodeWorkspaceStatusForLocale(ws.status, t)}
                      </span>
                    </div>
                  </Link>
                  <CodespaceActions workspace={ws} />
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

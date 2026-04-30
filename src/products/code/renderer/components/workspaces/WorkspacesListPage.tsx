import { useMemo } from 'react';
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
import './workspaces.css';

function labelWorkspaceSource(
  source: CodeWorkspaceSource,
  t: ReturnType<typeof useI18n>['t'],
): string {
  switch (source) {
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
  const { workspaces, loading, error } = useCodeWorkspaces();
  const { locale, t } = useI18n();

  const sorted = useMemo(
    () =>
      [...workspaces].sort(
        (a, b) =>
          new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
      ),
    [workspaces],
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
        <div className="channelTopBarEnd codeWsListTopBar__end" />
      </header>
      <main className="codeWorkspacesList__main">
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
                        {ws.status}
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

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  CODE_CODESPACES_PATH,
  buildCodeArtifactPath,
  buildCodeTaskPath,
} from '../../codePaths.js';
import {
  fetchCodeWorkspaceDetail,
  type CodeArtifactListItemSummary,
  type CodeWorkspaceDetailResponse,
  type CodeWorkspaceSource,
} from '../../api/codeTask.js';
import { messageKeys } from '../../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import {
  labelCodeArtifactKindForLocale,
  labelCodeArtifactStatusForLocale,
  labelCodeConversationKindForLocale,
  labelCodeRecordStatusForLocale,
  labelCodeWorkspaceStatusForLocale,
} from '../codeStatusLabels.js';
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

function renderArtifactItem(
  art: CodeArtifactListItemSummary,
  t: ReturnType<typeof useI18n>['t'],
  locale: string,
): JSX.Element {
  return (
    <li key={art.id}>
      <Link
        to={buildCodeArtifactPath(art.id)}
        className="codeWorkspaceDetail__item"
      >
        <span className="codeWorkspaceDetail__itemKind">
          {labelCodeArtifactKindForLocale(art.kind, t)}
        </span>
        <span className="codeWorkspaceDetail__itemTitle">
          {art.title}
        </span>
        <span className="codeWorkspaceDetail__itemMeta">
          {labelCodeArtifactStatusForLocale(art.status, t)}
        </span>
        <span className="codeWorkspaceDetail__itemUpdated">
          {formatRelative(art.updatedAt, locale)}
        </span>
      </Link>
    </li>
  );
}

export function WorkspaceDetailPage(): JSX.Element {
  const { codespaceId } = useParams<{ codespaceId: string }>();
  const { locale, t } = useI18n();
  const [payload, setPayload] = useState<CodeWorkspaceDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!codespaceId) {
      setError(t(messageKeys.codeWorkspaceDetailMissingId));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPayload(null);

    void fetchCodeWorkspaceDetail(codespaceId, t(messageKeys.codeWorkspaceDetailError))
      .then((nextPayload) => {
        if (!cancelled) {
          setPayload(nextPayload);
        }
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setError(fetchError instanceof Error
            ? fetchError.message
            : t(messageKeys.codeWorkspaceDetailError));
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
  }, [codespaceId, t]);

  if (loading && !payload) {
    return (
      <div className="codeWorkspaceDetail">
        <header className="channelTopBar codeWsDetailTopBar">
          <div className="channelTopBarStart codeWsDetailTopBar__start">
            <Link to={CODE_CODESPACES_PATH} className="codeWsDetailTopBar__back">
              ← {t(messageKeys.codeWorkspacesListHeader)}
            </Link>
          </div>
          <div className="channelTopBarCenter codeWsDetailTopBar__center" />
          <div className="channelTopBarEnd codeWsDetailTopBar__end" />
        </header>
        <main className="codeWorkspaceDetail__main">
          <p className="codeWorkspaceDetail__missing">
            {t(messageKeys.codeWorkspaceDetailLoading)}
          </p>
        </main>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="codeWorkspaceDetail">
        <header className="channelTopBar codeWsDetailTopBar">
          <div className="channelTopBarStart codeWsDetailTopBar__start">
            <Link to={CODE_CODESPACES_PATH} className="codeWsDetailTopBar__back">
              ← {t(messageKeys.codeWorkspacesListHeader)}
            </Link>
          </div>
          <div className="channelTopBarCenter codeWsDetailTopBar__center" />
          <div className="channelTopBarEnd codeWsDetailTopBar__end" />
        </header>
        <main className="codeWorkspaceDetail__main">
          <p className="codeWorkspaceDetail__missing">
            {error ?? t(messageKeys.codeWorkspaceDetailNotFound)}
            <br />
            <Link to={CODE_CODESPACES_PATH}>
              {t(messageKeys.codeWorkspaceDetailBackToList)}
            </Link>
          </p>
        </main>
      </div>
    );
  }

  const { workspace, conversations, tasks, artifacts } = payload;

  return (
    <div className="codeWorkspaceDetail">
      <header className="channelTopBar codeWsDetailTopBar">
        <div className="channelTopBarStart codeWsDetailTopBar__start">
          <Link to={CODE_CODESPACES_PATH} className="codeWsDetailTopBar__back">
            ← {t(messageKeys.codeWorkspacesListHeader)}
          </Link>
          <span className="codeWsDetailTopBar__separator">/</span>
        </div>
        <div className="channelTopBarCenter codeWsDetailTopBar__center">
          <h1 className="channelTopBarTitle codeWsDetailTopBar__title">
            {workspace.title}
          </h1>
          <span
            className={`codeWorkspacesList__statusPill codeWorkspacesList__statusPill--${workspace.status}`}
          >
            {labelCodeWorkspaceStatusForLocale(workspace.status, t)}
          </span>
        </div>
        <div className="channelTopBarEnd codeWsDetailTopBar__end">
          <span className="codeWsDetailTopBar__updated">
            {formatRelative(workspace.lastActiveAt, locale)}
          </span>
        </div>
      </header>
      <main className="codeWorkspaceDetail__main">
        <section className="codeWorkspaceDetail__section">
          <header className="codeWorkspaceDetail__sectionHeader">
            <h2>{t(messageKeys.codeWorkspaceDetailOverviewTitle)}</h2>
          </header>
          <dl className="codeWorkspaceDetail__overviewList">
            <dt>{t(messageKeys.codeWorkspaceDetailOverviewPath)}</dt>
            <dd>
              <code>{workspace.path}</code>
            </dd>
            <dt>{t(messageKeys.codeWorkspaceDetailOverviewSource)}</dt>
            <dd>{labelWorkspaceSource(workspace.source, t)}</dd>
            <dt>{t(messageKeys.codeWorkspaceDetailOverviewStatus)}</dt>
            <dd>{labelCodeWorkspaceStatusForLocale(workspace.status, t)}</dd>
            <dt>{t(messageKeys.codeWorkspaceDetailOverviewLastActive)}</dt>
            <dd>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(workspace.lastActiveAt))}{' '}
              <em>({formatRelative(workspace.lastActiveAt, locale)})</em>
            </dd>
            <dt>{t(messageKeys.codeWorkspaceDetailOverviewSummary)}</dt>
            <dd>
              {workspace.summary ? (
                workspace.summary
              ) : (
                <em>{t(messageKeys.codeWorkspaceDetailNoSummary)}</em>
              )}
            </dd>
          </dl>
          <div className="codeWorkspaceDetail__metricStrip">
            <div className="codeWorkspaceDetail__metricCell">
              <span className="codeWorkspaceDetail__metricLabel">
                {t(messageKeys.codeWorkspaceDetailMetricConversations)}
              </span>
              <span className="codeWorkspaceDetail__metricValue">
                {workspace.conversationCount}
              </span>
            </div>
            <div className="codeWorkspaceDetail__metricCell">
              <span className="codeWorkspaceDetail__metricLabel">
                {t(messageKeys.codeWorkspaceDetailMetricTasks)}
              </span>
              <span className="codeWorkspaceDetail__metricValue">
                {workspace.taskCount}
              </span>
            </div>
            <div className="codeWorkspaceDetail__metricCell">
              <span className="codeWorkspaceDetail__metricLabel">
                {t(messageKeys.codeWorkspaceDetailMetricArtifacts)}
              </span>
              <span className="codeWorkspaceDetail__metricValue">
                {artifacts.length}
              </span>
            </div>
            <div className="codeWorkspaceDetail__metricCell">
              <span className="codeWorkspaceDetail__metricLabel">
                {t(messageKeys.codeWorkspaceDetailMetricId)}
              </span>
              <span className="codeWorkspaceDetail__metricValue" style={{ fontSize: '0.78rem' }}>
                <code>{workspace.id}</code>
              </span>
            </div>
          </div>
        </section>

        <section className="codeWorkspaceDetail__section">
          <header className="codeWorkspaceDetail__sectionHeader">
            <h2>{t(messageKeys.codeWorkspaceDetailArtifactsHeader)}</h2>
            <span className="codeWorkspaceDetail__sectionCount">
              {artifacts.length}
            </span>
          </header>
          {artifacts.length === 0 ? (
            <p className="codeWorkspaceDetail__empty">
              {t(messageKeys.codeWorkspaceDetailNoArtifactsDesc)}
            </p>
          ) : (
            <ul className="codeWorkspaceDetail__items">
              {artifacts.map((art) => renderArtifactItem(art, t, locale))}
            </ul>
          )}
        </section>

        <section className="codeWorkspaceDetail__section">
          <header className="codeWorkspaceDetail__sectionHeader">
            <h2>{t(messageKeys.codeWorkspaceDetailConversationsSection)}</h2>
            <span className="codeWorkspaceDetail__sectionCount">
              {conversations.length}
            </span>
          </header>
          {conversations.length === 0 ? (
            <p className="codeWorkspaceDetail__empty">
              {t(messageKeys.codeWorkspaceDetailNoConversations)}
            </p>
          ) : (
            <ul className="codeWorkspaceDetail__items">
              {conversations.map((conversation) => (
                <li key={conversation.id} className="codeWorkspaceDetail__item">
                  <span className="codeWorkspaceDetail__itemKind">
                    {labelCodeConversationKindForLocale(conversation.kind, t)}
                  </span>
                  <span className="codeWorkspaceDetail__itemTitle">
                    {conversation.title}
                  </span>
                  <span className="codeWorkspaceDetail__itemMeta">
                    {labelCodeRecordStatusForLocale(conversation.status, t)}
                  </span>
                  <span className="codeWorkspaceDetail__itemUpdated">
                    {formatRelative(conversation.lastMessageAt ?? conversation.updatedAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="codeWorkspaceDetail__section">
          <header className="codeWorkspaceDetail__sectionHeader">
            <h2>{t(messageKeys.codeWorkspaceDetailTasksSection)}</h2>
            <span className="codeWorkspaceDetail__sectionCount">
              {tasks.length}
            </span>
          </header>
          {tasks.length === 0 ? (
            <p className="codeWorkspaceDetail__empty">
              {t(messageKeys.codeWorkspaceDetailNoTasks)}
            </p>
          ) : (
            <ul className="codeWorkspaceDetail__items">
              {tasks.map((task) => (
                <li key={task.id}>
                  <Link
                    to={buildCodeTaskPath(task.id)}
                    className="codeWorkspaceDetail__item"
                  >
                  <span className="codeWorkspaceDetail__itemKind">
                    {t(messageKeys.codeWorkspaceDetailTaskLabel)}
                  </span>
                  <span className="codeWorkspaceDetail__itemTitle">
                    {task.title}
                  </span>
                  <span className="codeWorkspaceDetail__itemMeta">
                    {labelCodeRecordStatusForLocale(task.status, t)}
                  </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

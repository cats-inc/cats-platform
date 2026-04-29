import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  CODE_WORKSPACES_PATH,
  buildCodeArtifactPath,
} from '../../codePaths.js';
import {
  fetchCodeWorkspaceDetail,
  type CodeArtifactListItemSummary,
  type CodeWorkspaceDetailResponse,
  type CodeWorkspaceSource,
} from '../../api/codeTask.js';
import './workspaces.css';

type CodeArtifactKind =
  | 'build'
  | 'preview'
  | 'document'
  | 'report'
  | 'attachment'
  | 'transcript_export'
  | 'dataset';

const ARTIFACT_KIND_LABELS: Record<CodeArtifactKind, string> = {
  build: 'Build',
  preview: 'Preview',
  document: 'Document',
  report: 'Report',
  attachment: 'Attachment',
  transcript_export: 'Transcript',
  dataset: 'Dataset',
};

function isCodeArtifactKind(value: string): value is CodeArtifactKind {
  return value in ARTIFACT_KIND_LABELS;
}

function labelArtifactKind(kind: string): string {
  return isCodeArtifactKind(kind) ? ARTIFACT_KIND_LABELS[kind] : kind;
}

const SOURCE_LABEL: Record<CodeWorkspaceSource, string> = {
  task_workspace: 'Code task',
  conversation_repo: 'Repo bind from conversation',
  runtime_cwd: 'Runtime cwd',
  artifact_anchor: 'Artifact anchor',
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const delta = now - then;
  if (Number.isNaN(delta)) return '';
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return 'just now';
  if (delta < hour) return `${Math.round(delta / minute)}m ago`;
  if (delta < day) return `${Math.round(delta / hour)}h ago`;
  if (delta < 7 * day) return `${Math.round(delta / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function renderArtifactItem(art: CodeArtifactListItemSummary): JSX.Element {
  return (
    <li key={art.id}>
      <Link
        to={buildCodeArtifactPath(art.id)}
        className="codeWorkspaceDetail__item"
      >
        <span className="codeWorkspaceDetail__itemKind">
          {labelArtifactKind(art.kind)}
        </span>
        <span className="codeWorkspaceDetail__itemTitle">
          {art.title}
        </span>
        <span className="codeWorkspaceDetail__itemMeta">
          {art.status}
        </span>
        <span className="codeWorkspaceDetail__itemUpdated">
          {formatRelative(art.updatedAt)}
        </span>
      </Link>
    </li>
  );
}

export function WorkspaceDetailPage(): JSX.Element {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [payload, setPayload] = useState<CodeWorkspaceDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setError('Codespace id is required.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPayload(null);

    void fetchCodeWorkspaceDetail(workspaceId)
      .then((nextPayload) => {
        if (!cancelled) {
          setPayload(nextPayload);
        }
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load codespace.');
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
  }, [workspaceId]);

  if (loading && !payload) {
    return (
      <div className="codeWorkspaceDetail">
        <header className="channelTopBar codeWsDetailTopBar">
          <div className="channelTopBarStart codeWsDetailTopBar__start">
            <Link to={CODE_WORKSPACES_PATH} className="codeWsDetailTopBar__back">
              ← Codespaces
            </Link>
          </div>
          <div className="channelTopBarCenter codeWsDetailTopBar__center" />
          <div className="channelTopBarEnd codeWsDetailTopBar__end" />
        </header>
        <main className="codeWorkspaceDetail__main">
          <p className="codeWorkspaceDetail__missing">Loading codespace...</p>
        </main>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="codeWorkspaceDetail">
        <header className="channelTopBar codeWsDetailTopBar">
          <div className="channelTopBarStart codeWsDetailTopBar__start">
            <Link to={CODE_WORKSPACES_PATH} className="codeWsDetailTopBar__back">
              ← Codespaces
            </Link>
          </div>
          <div className="channelTopBarCenter codeWsDetailTopBar__center" />
          <div className="channelTopBarEnd codeWsDetailTopBar__end" />
        </header>
        <main className="codeWorkspaceDetail__main">
          <p className="codeWorkspaceDetail__missing">
            {error ?? 'Codespace not found. It may have been removed or the URL changed.'}
            <br />
            <Link to={CODE_WORKSPACES_PATH}>Back to all codespaces →</Link>
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
          <Link to={CODE_WORKSPACES_PATH} className="codeWsDetailTopBar__back">
            ← Codespaces
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
            {workspace.status}
          </span>
        </div>
        <div className="channelTopBarEnd codeWsDetailTopBar__end">
          <span className="codeWsDetailTopBar__updated">
            {formatRelative(workspace.lastActiveAt)}
          </span>
        </div>
      </header>
      <main className="codeWorkspaceDetail__main">
        <section className="codeWorkspaceDetail__section">
          <header className="codeWorkspaceDetail__sectionHeader">
            <h2>Overview</h2>
          </header>
          <dl className="codeWorkspaceDetail__overviewList">
            <dt>Path</dt>
            <dd>
              <code>{workspace.path}</code>
            </dd>
            <dt>Source</dt>
            <dd>{SOURCE_LABEL[workspace.source]}</dd>
            <dt>Status</dt>
            <dd>{workspace.status}</dd>
            <dt>Last active</dt>
            <dd>
              {new Date(workspace.lastActiveAt).toLocaleString()}{' '}
              <em>({formatRelative(workspace.lastActiveAt)})</em>
            </dd>
            <dt>Summary</dt>
            <dd>
              {workspace.summary ? (
                workspace.summary
              ) : (
                <em>No summary yet.</em>
              )}
            </dd>
          </dl>
          <div className="codeWorkspaceDetail__metricStrip">
            <div className="codeWorkspaceDetail__metricCell">
              <span className="codeWorkspaceDetail__metricLabel">Conversations</span>
              <span className="codeWorkspaceDetail__metricValue">
                {workspace.conversationCount}
              </span>
            </div>
            <div className="codeWorkspaceDetail__metricCell">
              <span className="codeWorkspaceDetail__metricLabel">Tasks</span>
              <span className="codeWorkspaceDetail__metricValue">
                {workspace.taskCount}
              </span>
            </div>
            <div className="codeWorkspaceDetail__metricCell">
              <span className="codeWorkspaceDetail__metricLabel">Artifacts</span>
              <span className="codeWorkspaceDetail__metricValue">
                {artifacts.length}
              </span>
            </div>
            <div className="codeWorkspaceDetail__metricCell">
              <span className="codeWorkspaceDetail__metricLabel">ID</span>
              <span className="codeWorkspaceDetail__metricValue" style={{ fontSize: '0.78rem' }}>
                <code>{workspace.id}</code>
              </span>
            </div>
          </div>
        </section>

        <section className="codeWorkspaceDetail__section">
          <header className="codeWorkspaceDetail__sectionHeader">
            <h2>Artifacts in this codespace</h2>
            <span className="codeWorkspaceDetail__sectionCount">
              {artifacts.length}
            </span>
          </header>
          {artifacts.length === 0 ? (
            <p className="codeWorkspaceDetail__empty">
              No artifacts linked yet. Builds, previews, or documents produced
              from this codespace will appear here.
            </p>
          ) : (
            <ul className="codeWorkspaceDetail__items">
              {artifacts.map((art) => renderArtifactItem(art))}
            </ul>
          )}
        </section>

        <section className="codeWorkspaceDetail__section">
          <header className="codeWorkspaceDetail__sectionHeader">
            <h2>Conversations</h2>
            <span className="codeWorkspaceDetail__sectionCount">
              {conversations.length}
            </span>
          </header>
          {conversations.length === 0 ? (
            <p className="codeWorkspaceDetail__empty">
              No conversations are currently linked to this codespace.
            </p>
          ) : (
            <ul className="codeWorkspaceDetail__items">
              {conversations.map((conversation) => (
                <li key={conversation.id} className="codeWorkspaceDetail__item">
                  <span className="codeWorkspaceDetail__itemKind">
                    {conversation.kind}
                  </span>
                  <span className="codeWorkspaceDetail__itemTitle">
                    {conversation.title}
                  </span>
                  <span className="codeWorkspaceDetail__itemMeta">
                    {conversation.status}
                  </span>
                  <span className="codeWorkspaceDetail__itemUpdated">
                    {formatRelative(conversation.lastMessageAt ?? conversation.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="codeWorkspaceDetail__section">
          <header className="codeWorkspaceDetail__sectionHeader">
            <h2>Tasks</h2>
            <span className="codeWorkspaceDetail__sectionCount">
              {tasks.length}
            </span>
          </header>
          {tasks.length === 0 ? (
            <p className="codeWorkspaceDetail__empty">
              No Code tasks are currently linked to this codespace.
            </p>
          ) : (
            <ul className="codeWorkspaceDetail__items">
              {tasks.map((task) => (
                <li key={task.id} className="codeWorkspaceDetail__item">
                  <span className="codeWorkspaceDetail__itemKind">Task</span>
                  <span className="codeWorkspaceDetail__itemTitle">
                    {task.title}
                  </span>
                  <span className="codeWorkspaceDetail__itemMeta">
                    {task.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

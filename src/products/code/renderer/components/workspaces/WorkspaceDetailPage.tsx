import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import {
  CODE_WORKSPACES_PATH,
  buildCodeArtifactPath,
} from "../../codePaths.js";
import {
  useArtifactsMock,
  ARTIFACT_KIND_LABELS,
} from "../../state/artifactsMockStore";
import {
  useWorkspacesMock,
  type CodeWorkspaceMock,
  type CodeWorkspaceSource,
} from "../../state/workspacesMockStore";
import "./workspaces.css";

const SOURCE_LABEL: Record<CodeWorkspaceSource, string> = {
  managed_room: "Managed room",
  owner_folder: "Owner folder",
  conversation_repo: "Repo bind from conversation",
  runtime_cwd: "Runtime cwd",
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const delta = now - then;
  if (Number.isNaN(delta)) return "";
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return "just now";
  if (delta < hour) return `${Math.round(delta / minute)}m ago`;
  if (delta < day) return `${Math.round(delta / hour)}h ago`;
  if (delta < 7 * day) return `${Math.round(delta / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function WorkspaceDetailPage(): JSX.Element {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { workspaces } = useWorkspacesMock();
  const { artifacts } = useArtifactsMock();

  const workspace = useMemo<CodeWorkspaceMock | null>(() => {
    if (!workspaceId) return null;
    return workspaces.find((ws) => ws.id === workspaceId) ?? null;
  }, [workspaceId, workspaces]);

  const linkedArtifacts = useMemo(
    () => artifacts.filter((art) => art.workspaceId === workspaceId),
    [artifacts, workspaceId],
  );

  if (!workspace) {
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
            Codespace not found. It may have been removed or the URL changed.
            <br />
            <Link to={CODE_WORKSPACES_PATH}>Back to all codespaces →</Link>
          </p>
        </main>
      </div>
    );
  }

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
              {new Date(workspace.lastActiveAt).toLocaleString()}{" "}
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
                {linkedArtifacts.length || workspace.artifactCount}
              </span>
            </div>
            <div className="codeWorkspaceDetail__metricCell">
              <span className="codeWorkspaceDetail__metricLabel">ID</span>
              <span className="codeWorkspaceDetail__metricValue" style={{ fontSize: "0.78rem" }}>
                <code>{workspace.id}</code>
              </span>
            </div>
          </div>
        </section>

        <section className="codeWorkspaceDetail__section">
          <header className="codeWorkspaceDetail__sectionHeader">
            <h2>Artifacts in this codespace</h2>
            <span className="codeWorkspaceDetail__sectionCount">
              {linkedArtifacts.length}
            </span>
          </header>
          {linkedArtifacts.length === 0 ? (
            <p className="codeWorkspaceDetail__empty">
              No artifacts linked yet. Builds, previews, or documents produced
              from this codespace will appear here.
            </p>
          ) : (
            <ul className="codeWorkspaceDetail__items">
              {linkedArtifacts.map((art) => (
                <li key={art.id}>
                  <Link
                    to={buildCodeArtifactPath(art.id)}
                    className="codeWorkspaceDetail__item"
                  >
                    <span className="codeWorkspaceDetail__itemKind">
                      {ARTIFACT_KIND_LABELS[art.kind]}
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
              ))}
            </ul>
          )}
        </section>

        <section className="codeWorkspaceDetail__section">
          <header className="codeWorkspaceDetail__sectionHeader">
            <h2>Conversations</h2>
            <span className="codeWorkspaceDetail__sectionCount">
              {workspace.conversationCount}
            </span>
          </header>
          <p className="codeWorkspaceDetail__empty">
            Mock preview — conversation cross-links arrive once SPEC-091 wires
            <code> Conversation.repoPath</code> /{" "}
            <code>chatCwd</code> into the projection.
          </p>
        </section>

        <section className="codeWorkspaceDetail__section">
          <header className="codeWorkspaceDetail__sectionHeader">
            <h2>Tasks</h2>
            <span className="codeWorkspaceDetail__sectionCount">
              {workspace.taskCount}
            </span>
          </header>
          <p className="codeWorkspaceDetail__empty">
            Mock preview — task cross-links arrive once SPEC-091 reads{" "}
            <code>codeWorkspace</code> on Code-bound tasks.
          </p>
        </section>
      </main>
    </div>
  );
}

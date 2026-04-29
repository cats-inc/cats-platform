import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  useWorkspacesMock,
  type CodeWorkspaceMock,
  type CodeWorkspaceSource,
} from "../../state/workspacesMockStore";
import { buildCodeWorkspacePath } from "../../codePaths.js";
import { NewWorkspaceDialog } from "./NewWorkspaceDialog";
import "./workspaces.css";

const SOURCE_LABEL: Record<CodeWorkspaceSource, string> = {
  managed_room: "Managed room",
  owner_folder: "Owner folder",
  conversation_repo: "Repo bind",
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

export function WorkspacesListPage(): JSX.Element {
  const { workspaces } = useWorkspacesMock();
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();

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
            Codespaces
          </h1>
          <span className="codeWsListTopBar__count">{sorted.length}</span>
        </div>
        <div className="channelTopBarCenter codeWsListTopBar__center" />
        <div className="channelTopBarEnd codeWsListTopBar__end">
          <button
            type="button"
            className="codeWsListTopBar__addBtn"
            onClick={() => setDialogOpen(true)}
            aria-label="Add codespace"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 2v10" />
              <path d="M2 7h10" />
            </svg>
            <span>Add codespace</span>
          </button>
        </div>
      </header>
      <main className="codeWorkspacesList__main">
        {sorted.length === 0 ? (
          <p className="codeWorkspacesList__empty">
            No codespaces yet. Start a code session that names a repo, folder,
            worktree, or managed room and it will land here.
          </p>
        ) : (
          <>
            <ul className="codeWorkspacesList__list">
              {sorted.map((ws: CodeWorkspaceMock) => (
                <li key={ws.id} className="codeWorkspacesList__row">
                  <Link
                    to={buildCodeWorkspacePath(ws.id)}
                    className="codeWorkspacesList__rowLink"
                    aria-label={`Open codespace ${ws.title}`}
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
                        {SOURCE_LABEL[ws.source]}
                      </span>
                      <span className="codeWorkspacesList__metric">
                        <strong>{ws.conversationCount}</strong> chat
                      </span>
                      <span className="codeWorkspacesList__metric">
                        <strong>{ws.taskCount}</strong> tasks
                      </span>
                      <span className="codeWorkspacesList__metric">
                        <strong>{ws.artifactCount}</strong> art
                      </span>
                      <span className="codeWorkspacesList__metric codeWorkspacesList__metric--muted">
                        {formatRelative(ws.lastActiveAt)}
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
            <p className="codeWorkspacesList__hint">
              Mock preview — once SPEC-091 lands, this list projects from
              Conversation <code>repoPath</code>, task{" "}
              <code>codeWorkspace</code>, and runtime <code>cwd</code> rather
              than the seed fixture in <code>workspacesMockStore</code>.
            </p>
          </>
        )}
      </main>
      {dialogOpen ? (
        <NewWorkspaceDialog
          onClose={() => setDialogOpen(false)}
          onCreated={(workspaceId) => {
            navigate(buildCodeWorkspacePath(workspaceId));
          }}
        />
      ) : null}
    </div>
  );
}

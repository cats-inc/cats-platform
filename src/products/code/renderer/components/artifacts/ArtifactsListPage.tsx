import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { buildCodeArtifactPath } from "../../codePaths.js";
import {
  ARTIFACT_KIND_LABELS,
  useArtifactsMock,
  type CodeArtifactKind,
  type CodeArtifactMock,
} from "../../state/artifactsMockStore";
import "./artifactsList.css";

type KindFilter = "all" | CodeArtifactKind;

const FILTER_ORDER: readonly KindFilter[] = [
  "all",
  "build",
  "preview",
  "document",
  "report",
  "attachment",
  "transcript_export",
  "dataset",
];

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

export function ArtifactsListPage(): JSX.Element {
  const { artifacts } = useArtifactsMock();
  const [filter, setFilter] = useState<KindFilter>("all");

  const visible = useMemo(() => {
    const base = filter === "all"
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
            Artifacts
          </h1>
          <span className="codeArtListTopBar__count">{visible.length}</span>
        </div>
        <div className="channelTopBarCenter codeArtListTopBar__center">
          {FILTER_ORDER.map((kind) => (
            <button
              key={kind}
              type="button"
              className={[
                "codeArtListTopBar__filterBtn",
                filter === kind ? "codeArtListTopBar__filterBtn--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setFilter(kind)}
              aria-pressed={filter === kind}
            >
              {kind === "all" ? "All" : ARTIFACT_KIND_LABELS[kind]}
            </button>
          ))}
        </div>
        <div className="channelTopBarEnd" />
      </header>
      <main className="codeArtifactsList__main">
        {visible.length === 0 ? (
          <p className="codeArtifactsList__empty">
            No artifacts match this filter yet. Builds, previews, reports,
            attachments, and transcript exports will land here.
          </p>
        ) : (
          <>
            <ul className="codeArtifactsList__list">
              {visible.map((art: CodeArtifactMock) => (
                <li key={art.id} className="codeArtifactsList__row">
                  <Link
                    to={buildCodeArtifactPath(art.id)}
                    className="codeArtifactsList__rowLink"
                    aria-label={`Open artifact ${art.title}`}
                  >
                    <div className="codeArtifactsList__rowMain">
                      <span
                        className={`codeArtifactsList__kindPill codeArtifactsList__kindPill--${art.kind}`}
                      >
                        {ARTIFACT_KIND_LABELS[art.kind]}
                      </span>
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
                      {art.workspaceTitle ? (
                        <span className="codeArtifactsList__provenance">
                          codespace · <strong>{art.workspaceTitle}</strong>
                        </span>
                      ) : null}
                      {art.taskTitle ? (
                        <span className="codeArtifactsList__provenance">
                          task · <strong>{art.taskTitle}</strong>
                        </span>
                      ) : null}
                      {art.runId ? (
                        <span className="codeArtifactsList__provenance">
                          run · <strong>{art.runId}</strong>
                        </span>
                      ) : null}
                      <span className="codeArtifactsList__updated">
                        {formatRelative(art.updatedAt)}
                      </span>
                      <span
                        className={`codeArtifactsList__statusPill codeArtifactsList__statusPill--${art.status}`}
                      >
                        {art.status}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="codeArtifactsList__hint">
              Mock preview — once SPEC-091 lands, this list projects from
              <code>CoreArtifactRecord</code> rows whose anchor task / run /
              conversation resolves into Code (<code>buildCodeArtifactListProjection</code>).
            </p>
          </>
        )}
      </main>
    </div>
  );
}

import { Link, useParams } from "react-router-dom";

import {
  CODE_ARTIFACTS_PATH,
  buildCodeWorkspacePath,
} from "../../codePaths.js";
import {
  useArtifactsMock,
  ARTIFACT_KIND_LABELS,
  type CodeArtifactMock,
} from "../../state/artifactsMockStore";
import "./artifactsList.css";

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

export function ArtifactDetailMockPage(): JSX.Element {
  const { artifactId } = useParams<{ artifactId: string }>();
  const { artifacts } = useArtifactsMock();
  const artifact: CodeArtifactMock | null =
    artifacts.find((art) => art.id === artifactId) ?? null;

  if (!artifact) {
    return (
      <div className="codeArtifactDetail">
        <header className="channelTopBar codeArtDetailTopBar">
          <div className="channelTopBarStart codeArtDetailTopBar__start">
            <Link to={CODE_ARTIFACTS_PATH} className="codeArtDetailTopBar__back">
              ← Artifacts
            </Link>
          </div>
          <div className="channelTopBarCenter codeArtDetailTopBar__center" />
          <div className="channelTopBarEnd codeArtDetailTopBar__end" />
        </header>
        <main className="codeArtifactDetail__main">
          <p className="codeArtifactDetail__missing">
            Artifact not found in the mock store.
            <br />
            <Link to={CODE_ARTIFACTS_PATH}>Back to all artifacts →</Link>
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="codeArtifactDetail">
      <header className="channelTopBar codeArtDetailTopBar">
        <div className="channelTopBarStart codeArtDetailTopBar__start">
          <Link to={CODE_ARTIFACTS_PATH} className="codeArtDetailTopBar__back">
            ← Artifacts
          </Link>
          <span className="codeArtDetailTopBar__separator">/</span>
        </div>
        <div className="channelTopBarCenter codeArtDetailTopBar__center">
          <span
            className={`codeArtifactsList__kindPill codeArtifactsList__kindPill--${artifact.kind}`}
          >
            {ARTIFACT_KIND_LABELS[artifact.kind]}
          </span>
          <h1 className="channelTopBarTitle codeArtDetailTopBar__title">
            {artifact.title}
          </h1>
          <span
            className={`codeArtifactsList__statusPill codeArtifactsList__statusPill--${artifact.status}`}
          >
            {artifact.status}
          </span>
        </div>
        <div className="channelTopBarEnd codeArtDetailTopBar__end">
          <span className="codeArtDetailTopBar__updated">
            {formatRelative(artifact.updatedAt)}
          </span>
        </div>
      </header>
      <main className="codeArtifactDetail__main">
        <section className="codeArtifactDetail__section">
          <header className="codeArtifactDetail__sectionHeader">
            <h2>Overview</h2>
          </header>
          <dl className="codeArtifactDetail__overviewList">
            <dt>Kind</dt>
            <dd>{ARTIFACT_KIND_LABELS[artifact.kind]}</dd>
            <dt>Status</dt>
            <dd>{artifact.status}</dd>
            <dt>Path</dt>
            <dd>
              {artifact.path ? <code>{artifact.path}</code> : <em>No path</em>}
            </dd>
            <dt>Summary</dt>
            <dd>
              {artifact.summary ? artifact.summary : <em>No summary</em>}
            </dd>
            <dt>Updated</dt>
            <dd>
              {new Date(artifact.updatedAt).toLocaleString()}{" "}
              <em>({formatRelative(artifact.updatedAt)})</em>
            </dd>
            <dt>ID</dt>
            <dd>
              <code>{artifact.id}</code>
            </dd>
          </dl>
          <div className="codeArtifactDetail__provenanceGrid">
            <div className="codeArtifactDetail__provenanceCell">
              <span className="codeArtifactDetail__provenanceLabel">Workspace</span>
              <span className="codeArtifactDetail__provenanceValue">
                {artifact.workspaceId && artifact.workspaceTitle ? (
                  <Link to={buildCodeWorkspacePath(artifact.workspaceId)}>
                    {artifact.workspaceTitle}
                  </Link>
                ) : (
                  <em>not linked</em>
                )}
              </span>
            </div>
            <div className="codeArtifactDetail__provenanceCell">
              <span className="codeArtifactDetail__provenanceLabel">Task</span>
              <span className="codeArtifactDetail__provenanceValue">
                {artifact.taskTitle ?? <em>not linked</em>}
              </span>
            </div>
            <div className="codeArtifactDetail__provenanceCell">
              <span className="codeArtifactDetail__provenanceLabel">Run</span>
              <span className="codeArtifactDetail__provenanceValue">
                {artifact.runId ? (
                  <code>{artifact.runId}</code>
                ) : (
                  <em>not run-bound</em>
                )}
              </span>
            </div>
            <div className="codeArtifactDetail__provenanceCell">
              <span className="codeArtifactDetail__provenanceLabel">Conversation</span>
              <span className="codeArtifactDetail__provenanceValue">
                {artifact.conversationTitle ?? <em>not linked</em>}
              </span>
            </div>
          </div>
        </section>

        <section className="codeArtifactDetail__section">
          <header className="codeArtifactDetail__sectionHeader">
            <h2>Mock-only artifact</h2>
          </header>
          <p
            className="codeArtifactDetail__missing"
            style={{ margin: "0", padding: "18px", textAlign: "left" }}
          >
            This artifact comes from the local{" "}
            <code>artifactsMockStore</code>. Once SPEC-091 wires
            <code> CoreArtifactRecord</code> projection into the Code surface
            this page will render the canonical artifact (build / preview
            payload, attachments, downloadable bundle, run trace, etc.) rather
            than the seed fixture.
          </p>
        </section>
      </main>
    </div>
  );
}

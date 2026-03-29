export interface ArtifactItem {
  id: string;
  title: string;
  kind: string;
  status: string;
  summary: string | null;
  path: string | null;
  updatedAt: string;
}

export interface BuildPreviewPanelProps {
  artifacts: ArtifactItem[];
  previewUrl?: string | null;
  onOpenArtifact?: (artifactId: string) => void;
}

function artifactStatusBadge(status: string): string {
  switch (status) {
    case 'ready':
      return 'operatorBadgePositive';
    case 'published':
      return 'operatorBadgeInfo';
    case 'draft':
      return 'operatorBadgeMuted';
    default:
      return 'operatorBadge';
  }
}

export function BuildPreviewPanel({
  artifacts,
  previewUrl,
  onOpenArtifact,
}: BuildPreviewPanelProps) {
  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">Output</p>
          <h2>Build &amp; Preview</h2>
        </div>
        <span className="operatorBadge">{artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}</span>
      </div>

      {previewUrl ? (
        <div className="codeBuildPreviewFrame">
          <iframe
            src={previewUrl}
            title="Live preview"
            sandbox="allow-scripts allow-same-origin"
            className="codeBuildPreviewIframe"
          />
        </div>
      ) : null}

      {artifacts.length === 0 ? (
        <p className="operatorEmptyState">
          No build or preview artifacts have been produced yet.
        </p>
      ) : (
        <div className="operatorStack">
          {artifacts.map((artifact) => (
            <article
              key={artifact.id}
              className="operatorCard codeBuildArtifactCard"
            >
              <div className="operatorCardHeader">
                <div>
                  <strong>{artifact.title}</strong>
                  {artifact.summary ? <p>{artifact.summary}</p> : null}
                </div>
                <span className={artifactStatusBadge(artifact.status)}>
                  {artifact.status}
                </span>
              </div>
              <div className="operatorCardMeta">
                <span>{artifact.kind}</span>
                {artifact.path ? <span>{artifact.path}</span> : null}
              </div>
              {onOpenArtifact ? (
                <button
                  type="button"
                  className="operatorAction"
                  onClick={() => onOpenArtifact(artifact.id)}
                >
                  Open
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

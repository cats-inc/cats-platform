import type { ProductPreviewSurfaceTarget } from '../../../../core/previewSurfaces.js';

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
  previewTarget?: ProductPreviewSurfaceTarget | null;
  onOpenArtifact?: (artifactId: string) => void;
}

function artifactStatusBadge(status: string): string {
  switch (status) {
    case 'ready':
      return 'operatorStatusBadge isSuccess';
    case 'published':
      return 'operatorStatusBadge codeBuilderStatusBadgePublished';
    case 'draft':
      return 'operatorStatusBadge isMuted';
    default:
      return 'operatorStatusBadge isAttention';
  }
}

export function BuildPreviewPanel({
  artifacts,
  previewTarget,
  onOpenArtifact,
}: BuildPreviewPanelProps) {
  const previewActionLabel = previewTarget?.renderHint === 'download'
    ? 'Open latest artifact'
    : 'Open latest preview';

  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">Output</p>
          <h2>Build &amp; Preview</h2>
        </div>
        <span className="operatorCountBadge">
          {artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}
        </span>
      </div>

      {previewTarget?.inlineUrl ? (
        <div className="codeBuildPreviewFrame">
          <iframe
            src={previewTarget.inlineUrl}
            title="Live preview"
            sandbox="allow-scripts allow-same-origin"
            className="codeBuildPreviewIframe"
          />
        </div>
      ) : previewTarget?.actionUrl ? (
        <div className="codeBuildPreviewFallback">
          <p className="operatorEmptyState">
            Latest preview is available, but this output is safer to open outside the inline frame.
          </p>
          <a
            className="operatorActionButton"
            href={previewTarget.actionUrl}
            rel="noreferrer"
            target="_blank"
          >
            {previewActionLabel}
          </a>
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
              <div className="operatorMetaRow">
                <span>{artifact.kind}</span>
                {artifact.path ? <span>{artifact.path}</span> : null}
              </div>
              {onOpenArtifact ? (
                <button
                  type="button"
                  className="operatorActionButton"
                  onClick={() => onOpenArtifact(artifact.id)}
                >
                  Details
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

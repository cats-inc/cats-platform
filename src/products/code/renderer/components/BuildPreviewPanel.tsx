import type { ProductPreviewSurfaceTarget } from '../../../../core/previewSurfaces.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';

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
  const { t } = useI18n();
  const previewActionLabel = previewTarget?.renderHint === 'download'
    ? t(messageKeys.codePreviewOpenLatestArtifact)
    : t(messageKeys.codePreviewOpenLatestPreview);
  const artifactCountLabel = artifacts.length === 1
    ? t(messageKeys.codePreviewArtifactCountOne, { count: artifacts.length })
    : t(messageKeys.codePreviewArtifactCountMany, { count: artifacts.length });

  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">{t(messageKeys.codePreviewHeader)}</p>
          <h2>{t(messageKeys.codePreviewTitle)}</h2>
        </div>
        <span className="operatorCountBadge">{artifactCountLabel}</span>
      </div>

      {previewTarget?.inlineUrl ? (
        <div className="codeBuildPreviewFrame">
          <iframe
            src={previewTarget.inlineUrl}
            title={t(messageKeys.codePreviewIframeTitle)}
            sandbox="allow-scripts allow-same-origin"
            className="codeBuildPreviewIframe"
          />
        </div>
      ) : previewTarget?.actionUrl ? (
        <div className="codeBuildPreviewFallback">
          <p className="operatorEmptyState">
            {t(messageKeys.codePreviewNotInlineSafe)}
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
          {t(messageKeys.codePreviewNoPreview)}
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
                  {t(messageKeys.codePreviewDetails)}
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

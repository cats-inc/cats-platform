import type { ArtifactCanvasProjection } from '../../artifactCanvas/contracts.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { resolveArtifactCanvasRendererSafeUrl } from './viewerUrl.js';
import { useArtifactCanvasViewerLoad, type ArtifactCanvasViewerLoadProps } from './useArtifactCanvasViewerLoad.js';

export interface PdfViewerProps extends ArtifactCanvasViewerLoadProps {
  projection: ArtifactCanvasProjection;
}

export function PdfViewer({ projection, onLoaded, onLoadFailed }: PdfViewerProps): JSX.Element {
  const { t } = useI18n();
  const safeUrl = resolveArtifactCanvasRendererSafeUrl(projection.safeUrl);
  useArtifactCanvasViewerLoad(safeUrl ? 'loading' : 'unsupported', { onLoadFailed });
  if (!safeUrl) {
    return (
      <div className="artifactCanvasUnsupported">
        {t(messageKeys.sharedArtifactCanvasUnsupportedBody)}
      </div>
    );
  }

  return (
    <object
      className="artifactCanvasPdf"
      data={safeUrl}
      type="application/pdf"
      aria-label={projection.artifact.title}
      onLoad={onLoaded}
      onError={onLoadFailed}
    >
      <a
        className="operatorActionButton"
        href={safeUrl}
        target="_blank"
        rel="noreferrer"
      >
        {t(messageKeys.sharedArtifactCanvasOpenExternal)}
      </a>
    </object>
  );
}

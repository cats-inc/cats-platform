import type { ArtifactCanvasProjection } from '../../artifactCanvas/contracts.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { resolveArtifactCanvasRendererSafeUrl } from './viewerUrl.js';

export interface PdfViewerProps {
  projection: ArtifactCanvasProjection;
}

export function PdfViewer({ projection }: PdfViewerProps): JSX.Element {
  const { t } = useI18n();
  const safeUrl = resolveArtifactCanvasRendererSafeUrl(projection.safeUrl);
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

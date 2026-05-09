import type { ArtifactCanvasProjection } from '../../artifactCanvas/contracts.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { resolveArtifactCanvasRendererSafeUrl } from './viewerUrl.js';

export interface ImageViewerProps {
  projection: ArtifactCanvasProjection;
}

export function ImageViewer({ projection }: ImageViewerProps): JSX.Element {
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
    <figure className="artifactCanvasImageFrame">
      <img
        className="artifactCanvasImage"
        src={safeUrl}
        alt={projection.artifact.title}
        loading="lazy"
        decoding="async"
      />
    </figure>
  );
}

import type { ArtifactCanvasProjection } from '../../artifactCanvas/contracts.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { resolveArtifactCanvasRendererSafeUrl } from './viewerUrl.js';
import { useArtifactCanvasViewerLoad, type ArtifactCanvasViewerLoadProps } from './useArtifactCanvasViewerLoad.js';

export interface ImageViewerProps extends ArtifactCanvasViewerLoadProps {
  projection: ArtifactCanvasProjection;
}

export function ImageViewer({ projection, onLoaded, onLoadFailed }: ImageViewerProps): JSX.Element {
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
    <figure className="artifactCanvasImageFrame">
      <img
        className="artifactCanvasImage"
        src={safeUrl}
        alt={projection.artifact.title}
        loading="lazy"
        decoding="async"
        onLoad={onLoaded}
        onError={onLoadFailed}
      />
    </figure>
  );
}

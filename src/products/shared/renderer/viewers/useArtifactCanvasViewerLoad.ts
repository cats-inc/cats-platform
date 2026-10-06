import { useEffect } from 'react';

export interface ArtifactCanvasViewerLoadProps {
  onLoaded?(): void;
  onLoadFailed?(): void;
}

/** Text/unsupported viewers report after their DOM has committed. */
export function useArtifactCanvasViewerLoad(
  status: 'ready' | 'loading' | 'unsupported',
  { onLoaded, onLoadFailed }: ArtifactCanvasViewerLoadProps,
): void {
  useEffect(() => {
    if (status === 'ready') onLoaded?.();
    if (status === 'unsupported') onLoadFailed?.();
  }, [status, onLoaded, onLoadFailed]);
}

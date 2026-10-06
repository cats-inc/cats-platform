import type { ArtifactCanvasProjection } from '../../artifactCanvas/contracts.js';
import { ArtifactCanvasTextStatus, useArtifactCanvasText } from './useArtifactCanvasText.js';
import { useArtifactCanvasViewerLoad, type ArtifactCanvasViewerLoadProps } from './useArtifactCanvasViewerLoad.js';

export interface CodeViewerProps extends ArtifactCanvasViewerLoadProps {
  projection: ArtifactCanvasProjection;
}

export function CodeViewer({ projection, ...loadProps }: CodeViewerProps): JSX.Element {
  const state = useArtifactCanvasText(projection);
  useArtifactCanvasViewerLoad(state.status, loadProps);
  if (state.status !== 'ready') {
    return <ArtifactCanvasTextStatus state={state} />;
  }

  return (
    <pre className="artifactCanvasCodeBlock">
      <code>{state.text}</code>
    </pre>
  );
}

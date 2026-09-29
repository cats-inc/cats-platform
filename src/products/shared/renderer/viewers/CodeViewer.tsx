import type { ArtifactCanvasProjection } from '../../artifactCanvas/contracts.js';
import { ArtifactCanvasTextStatus, useArtifactCanvasText } from './useArtifactCanvasText.js';

export interface CodeViewerProps {
  projection: ArtifactCanvasProjection;
}

export function CodeViewer({ projection }: CodeViewerProps): JSX.Element {
  const state = useArtifactCanvasText(projection);
  if (state.status !== 'ready') {
    return <ArtifactCanvasTextStatus state={state} />;
  }

  return (
    <pre className="artifactCanvasCodeBlock">
      <code>{state.text}</code>
    </pre>
  );
}

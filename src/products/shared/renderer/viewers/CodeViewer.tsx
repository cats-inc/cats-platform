import { useEffect, useState } from 'react';

import type { ArtifactCanvasProjection } from '../../artifactCanvas/contracts.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { resolveArtifactCanvasRendererSafeUrl } from './viewerUrl.js';

export interface CodeViewerProps {
  projection: ArtifactCanvasProjection;
}

type CodeViewerState =
  | { status: 'ready'; text: string }
  | { status: 'loading' }
  | { status: 'unsupported' };

export function CodeViewer({ projection }: CodeViewerProps): JSX.Element {
  const { t } = useI18n();
  const [state, setState] = useState<CodeViewerState>(() => {
    if (projection.textContent !== null) {
      return { status: 'ready', text: projection.textContent };
    }
    return projection.safeUrl ? { status: 'loading' } : { status: 'unsupported' };
  });

  useEffect(() => {
    if (projection.textContent !== null) {
      setState({ status: 'ready', text: projection.textContent });
      return;
    }

    const safeUrl = resolveArtifactCanvasRendererSafeUrl(projection.safeUrl);
    if (!safeUrl) {
      setState({ status: 'unsupported' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });
    void fetch(safeUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Unable to load text artifact.');
        }
        return response.text();
      })
      .then((text) => {
        if (!cancelled) {
          setState({ status: 'ready', text });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'unsupported' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projection.safeUrl, projection.textContent]);

  if (state.status === 'loading') {
    return (
      <div className="artifactCanvasState">
        {t(messageKeys.sharedArtifactCanvasLoading)}
      </div>
    );
  }

  if (state.status === 'unsupported') {
    return (
      <div className="artifactCanvasUnsupported">
        {t(messageKeys.sharedArtifactCanvasUnsupportedBody)}
      </div>
    );
  }

  return (
    <pre className="artifactCanvasCodeBlock">
      <code>{state.text}</code>
    </pre>
  );
}

import { useEffect, useState } from 'react';

import type { ArtifactCanvasProjection } from '../../artifactCanvas/contracts.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { resolveArtifactCanvasRendererSafeUrl } from './viewerUrl.js';

export type ArtifactCanvasTextState =
  | { status: 'ready'; text: string }
  | { status: 'loading' }
  | { status: 'unsupported' };

/**
 * Text for the `code` and `markdown` viewers: the projection's inline text
 * (which Platform fills for supervisor-leased files), otherwise a fetch of the
 * safe URL.
 */
export function useArtifactCanvasText(
  projection: ArtifactCanvasProjection,
): ArtifactCanvasTextState {
  const [state, setState] = useState<ArtifactCanvasTextState>(() => {
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

  return state;
}

/** The loading or unsupported pane shown while a text viewer has no text. */
export function ArtifactCanvasTextStatus({
  state,
}: {
  state: Exclude<ArtifactCanvasTextState, { status: 'ready' }>;
}): JSX.Element {
  const { t } = useI18n();
  if (state.status === 'loading') {
    return (
      <div className="artifactCanvasState">
        {t(messageKeys.sharedArtifactCanvasLoading)}
      </div>
    );
  }
  return (
    <div className="artifactCanvasUnsupported">
      {t(messageKeys.sharedArtifactCanvasUnsupportedBody)}
    </div>
  );
}

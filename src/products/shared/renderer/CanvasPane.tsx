import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  ARTIFACT_CANVAS_INPUT_PRESENTATIONS,
  canvasSurfaceRouteRegistry,
  type ArtifactCanvasPresentationInput,
  type ArtifactCanvasProjection,
} from '../artifactCanvas/contracts.js';
import { messageKeys } from '../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../app/renderer/i18n/index.js';
import { ImageViewer } from './viewers/ImageViewer.js';
import { IframeViewer } from './viewers/IframeViewer.js';
import { PdfViewer } from './viewers/PdfViewer.js';
import { useArtifactCanvasSurfaceOutletContext } from './withSharedViewerRoutes.js';

type CanvasPaneState =
  | { status: 'loading' }
  | { status: 'ready'; projection: ArtifactCanvasProjection }
  | { status: 'error'; message: string };

export function CanvasPane(): JSX.Element {
  const navigate = useNavigate();
  const { artifactId, presentation } = useParams<{
    artifactId?: string;
    presentation?: string;
  }>();
  const { t } = useI18n();
  const { surface, parentUrl } = useArtifactCanvasSurfaceOutletContext();
  const [collapsed, setCollapsed] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [state, setState] = useState<CanvasPaneState>({ status: 'loading' });

  const presentationRequested = normalizePresentation(presentation);
  const projectionUrl = useMemo(() => {
    if (!artifactId || !presentationRequested) {
      return null;
    }
    return canvasSurfaceRouteRegistry.projectionApiUrl(
      surface,
      artifactId,
      presentationRequested,
    );
  }, [artifactId, presentationRequested, surface]);

  useEffect(() => {
    if (!projectionUrl) {
      setState({
        status: 'error',
        message: t(messageKeys.sharedArtifactCanvasInvalidRoute),
      });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });
    void fetch(projectionUrl)
      .then(async (response) => {
        const payload = await response.json() as unknown;
        if (!response.ok) {
          throw new Error(readErrorMessage(payload) ?? t(messageKeys.sharedArtifactCanvasLoadFailed));
        }
        return payload as ArtifactCanvasProjection;
      })
      .then((projection) => {
        if (!cancelled) {
          setState({ status: 'ready', projection });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error
              ? error.message
              : t(messageKeys.sharedArtifactCanvasLoadFailed),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectionUrl, refreshToken, t]);

  const projection = state.status === 'ready' ? state.projection : null;

  return (
    <aside
      className={
        collapsed
          ? 'artifactCanvasPane artifactCanvasPane--collapsed'
          : 'artifactCanvasPane'
      }
      aria-label={t(messageKeys.sharedArtifactCanvasTitle)}
    >
      <header className="artifactCanvasTopBar">
        <div>
          <p className="artifactCanvasEyebrow">{t(messageKeys.sharedArtifactCanvasTitle)}</p>
          <h2 className="artifactCanvasTitle">
            {projection?.artifact.title ?? t(messageKeys.sharedArtifactCanvasLoading)}
          </h2>
        </div>
        <div className="artifactCanvasActions">
          {projection?.externalUrl ? (
            <a
              className="operatorActionButton"
              href={projection.externalUrl}
              target="_blank"
              rel="noreferrer"
            >
              {t(messageKeys.sharedArtifactCanvasOpenExternal)}
            </a>
          ) : null}
          <button
            type="button"
            className="operatorActionButton"
            onClick={() => setRefreshToken((value) => value + 1)}
          >
            {t(messageKeys.sharedArtifactCanvasRefresh)}
          </button>
          <button
            type="button"
            className="operatorActionButton"
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed
              ? t(messageKeys.sharedArtifactCanvasExpand)
              : t(messageKeys.sharedArtifactCanvasCollapse)}
          </button>
          <button
            type="button"
            className="operatorActionButton"
            onClick={() => navigate(parentUrl)}
          >
            {t(messageKeys.sharedArtifactCanvasClose)}
          </button>
        </div>
      </header>

      {collapsed ? null : (
        <div className="artifactCanvasBody">
          {renderCanvasPaneBody(state, t)}
        </div>
      )}
    </aside>
  );
}

function renderCanvasPaneBody(
  state: CanvasPaneState,
  t: ReturnType<typeof useI18n>['t'],
): JSX.Element {
  if (state.status === 'loading') {
    return (
      <div className="artifactCanvasState">
        {t(messageKeys.sharedArtifactCanvasLoading)}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="artifactCanvasState artifactCanvasState--error">
        {state.message}
      </div>
    );
  }

  const projection = state.projection;
  if (projection.presentationResolved === 'image') {
    return <ImageViewer projection={projection} />;
  }
  if (projection.presentationResolved === 'pdf') {
    return <PdfViewer projection={projection} />;
  }
  if (
    projection.safeUrl
    && projection.iframeSandboxProfile
    && projection.presentationResolved === 'iframe'
  ) {
    return <IframeViewer projection={projection} />;
  }

  return (
    <div className="artifactCanvasUnsupported">
      <h3>{t(messageKeys.sharedArtifactCanvasUnsupportedTitle)}</h3>
      <p>
        {projection.error?.message ?? t(messageKeys.sharedArtifactCanvasUnsupportedBody)}
      </p>
      <dl>
        <dt>{t(messageKeys.sharedArtifactCanvasPolicyVersion)}</dt>
        <dd>{projection.policyVersion}</dd>
      </dl>
    </div>
  );
}

function normalizePresentation(
  presentation: string | undefined,
): ArtifactCanvasPresentationInput | null {
  if (!presentation) {
    return 'auto';
  }
  return ARTIFACT_CANVAS_INPUT_PRESENTATIONS.includes(
    presentation as ArtifactCanvasPresentationInput,
  )
    ? presentation as ArtifactCanvasPresentationInput
    : null;
}

function readErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object' || Array.isArray(error)) {
    return null;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.trim().length > 0
    ? message.trim()
    : null;
}

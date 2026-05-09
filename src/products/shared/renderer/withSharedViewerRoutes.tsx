import { useMemo, type ReactElement, type ReactNode } from 'react';
import {
  Outlet,
  Route,
  useOutletContext,
  useParams,
} from 'react-router-dom';

import {
  canvasSurfaceRouteRegistry,
  type CanvasSurfaceKind,
  type CanvasSurfaceRef,
} from '../artifactCanvas/contracts.js';
import { CanvasPane } from './CanvasPane.js';
import { useCanvasNavigateIntent } from './useCanvasNavigateIntent.js';

export interface SharedViewerRoutesInput {
  key: string;
  path: string;
  surfaceKind: CanvasSurfaceKind;
  surfaceIdParam: string;
  element: ReactNode;
}

export interface ArtifactCanvasSurfaceOutletContext {
  surface: CanvasSurfaceRef;
  parentUrl: string;
}

export function withSharedViewerRoutes(input: SharedViewerRoutesInput): ReactElement {
  return (
    <Route
      key={input.key}
      path={input.path}
      element={
        <SharedViewerSurfaceFrame
          surfaceKind={input.surfaceKind}
          surfaceIdParam={input.surfaceIdParam}
        >
          {input.element}
        </SharedViewerSurfaceFrame>
      }
    >
      <Route path="canvas/:artifactId" element={<CanvasPane />} />
      <Route path="canvas/:artifactId/view/:presentation" element={<CanvasPane />} />
    </Route>
  );
}

export function useArtifactCanvasSurfaceOutletContext(): ArtifactCanvasSurfaceOutletContext {
  return useOutletContext<ArtifactCanvasSurfaceOutletContext>();
}

function SharedViewerSurfaceFrame({
  surfaceKind,
  surfaceIdParam,
  children,
}: {
  surfaceKind: CanvasSurfaceKind;
  surfaceIdParam: string;
  children: ReactNode;
}): JSX.Element {
  const params = useParams();
  const surfaceId = params[surfaceIdParam];
  const surface = useMemo<CanvasSurfaceRef | null>(
    () => surfaceId ? { kind: surfaceKind, surfaceId } : null,
    [surfaceId, surfaceKind],
  );
  useCanvasNavigateIntent(surface);

  if (!surface) {
    return <>{children}</>;
  }

  const parentUrl = canvasSurfaceRouteRegistry.parentUrl(surface);
  return (
    <div className="artifactCanvasSurfaceFrame">
      <div className="artifactCanvasSurfaceMain">
        {children}
      </div>
      <Outlet context={{ surface, parentUrl } satisfies ArtifactCanvasSurfaceOutletContext} />
    </div>
  );
}

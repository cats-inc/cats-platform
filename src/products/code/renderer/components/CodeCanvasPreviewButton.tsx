import { useLocation, useNavigate } from 'react-router-dom';

import { canvasSurfaceRouteRegistry, type CanvasSurfaceRef } from '../../../shared/artifactCanvas/contracts.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import { useI18n } from '../../../../app/renderer/i18n/useI18n.js';

/**
 * Reopens the conversation's most recently shown artifact beside it
 * (PLAN-116 B2b). Hidden while that conversation's canvas is open, because the
 * canvas pane has its own Close control.
 */
export function CodeCanvasPreviewButton({
  channelId,
  artifactId,
}: {
  channelId: string;
  artifactId: string | null;
}): JSX.Element | null {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!artifactId) {
    return null;
  }
  const surface: CanvasSurfaceRef = { kind: 'code_conversation', surfaceId: channelId };
  const route = canvasSurfaceRouteRegistry.parse(pathname);
  if (route?.kind === 'canvas' && route.surface.kind === surface.kind && route.surface.surfaceId === channelId) {
    return null;
  }
  const label = t(messageKeys.codeCanvasPreviewOpen);
  return (
    <button
      className="channelActionIconButton"
      type="button"
      aria-label={label}
      title={label}
      onClick={() => navigate(canvasSurfaceRouteRegistry.canvasUrl(surface, artifactId))}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8Z" />
        <circle cx="8" cy="8" r="2" />
      </svg>
    </button>
  );
}

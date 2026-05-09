import type {
  ArtifactCanvasIframeSandboxProfile,
  ArtifactCanvasProjection,
} from '../../artifactCanvas/contracts.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';

export const ARTIFACT_CANVAS_RENDERER_STATIC_IFRAME_PROFILE:
  ArtifactCanvasIframeSandboxProfile = {
  name: 'static',
  sandbox: '',
  referrerPolicy: 'no-referrer',
  allow: '',
};

export interface IframeViewerProps {
  projection?: ArtifactCanvasProjection;
  title?: string;
  safeUrl?: string | null;
  iframeSandboxProfile?: ArtifactCanvasIframeSandboxProfile | null;
  className?: string;
}

export function IframeViewer({
  projection,
  title,
  safeUrl,
  iframeSandboxProfile,
  className = 'artifactCanvasIframe',
}: IframeViewerProps): JSX.Element {
  const { t } = useI18n();
  const decision = resolveRendererIframeDecision({
    title: projection?.artifact.title ?? title ?? 'Artifact',
    safeUrl: projection?.safeUrl ?? safeUrl ?? null,
    iframeSandboxProfile:
      projection?.iframeSandboxProfile ?? iframeSandboxProfile ?? null,
  });
  if (decision.status === 'unsupported') {
    return (
      <div className="artifactCanvasUnsupported">
        {t(messageKeys.sharedArtifactCanvasUnsupportedBody)}
      </div>
    );
  }

  return (
    <iframe
      className={className}
      title={decision.title}
      src={decision.safeUrl}
      sandbox={decision.profile.sandbox}
      referrerPolicy={decision.profile.referrerPolicy}
      allow={decision.profile.allow}
    />
  );
}

function resolveRendererIframeDecision(
  input: {
    title: string;
    safeUrl: string | null;
    iframeSandboxProfile: ArtifactCanvasIframeSandboxProfile | null;
  },
):
  | {
      status: 'ok';
      title: string;
      safeUrl: string;
      profile: ArtifactCanvasIframeSandboxProfile;
    }
  | {
      status: 'unsupported';
    } {
  const safeUrl = input.safeUrl?.trim();
  const profile = input.iframeSandboxProfile;
  if (!safeUrl || !profile) {
    return {
      status: 'unsupported',
    };
  }
  if (profile.name !== 'static' && profile.name !== 'scripted-cross-origin') {
    return {
      status: 'unsupported',
    };
  }

  let url: URL;
  try {
    url = new URL(safeUrl);
  } catch {
    return {
      status: 'unsupported',
    };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      status: 'unsupported',
    };
  }

  const shellOrigin = typeof window === 'undefined'
    ? null
    : window.location.origin;
  const effectiveProfile =
    profile.name === 'scripted-cross-origin' && shellOrigin === url.origin
      ? ARTIFACT_CANVAS_RENDERER_STATIC_IFRAME_PROFILE
      : profile;

  return {
    status: 'ok',
    title: input.title,
    safeUrl,
    profile: effectiveProfile,
  };
}

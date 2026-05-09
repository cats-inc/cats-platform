import type {
  ArtifactCanvasIframeSandboxProfile,
  ArtifactCanvasProjection,
} from '../../artifactCanvas/contracts.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';

const STATIC_IFRAME_PROFILE: ArtifactCanvasIframeSandboxProfile = {
  name: 'static',
  sandbox: '',
  referrerPolicy: 'no-referrer',
  allow: '',
};

export interface IframeViewerProps {
  projection: ArtifactCanvasProjection;
}

export function IframeViewer({ projection }: IframeViewerProps): JSX.Element {
  const { t } = useI18n();
  const decision = resolveRendererIframeDecision(projection);
  if (decision.status === 'unsupported') {
    return (
      <div className="artifactCanvasUnsupported">
        {t(messageKeys.sharedArtifactCanvasUnsupportedBody)}
      </div>
    );
  }

  return (
    <iframe
      className="artifactCanvasIframe"
      title={projection.artifact.title}
      src={decision.safeUrl}
      sandbox={decision.profile.sandbox}
      referrerPolicy={decision.profile.referrerPolicy}
      allow={decision.profile.allow}
    />
  );
}

function resolveRendererIframeDecision(
  projection: ArtifactCanvasProjection,
):
  | {
      status: 'ok';
      safeUrl: string;
      profile: ArtifactCanvasIframeSandboxProfile;
    }
  | {
      status: 'unsupported';
    } {
  const safeUrl = projection.safeUrl?.trim();
  const profile = projection.iframeSandboxProfile;
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
      ? STATIC_IFRAME_PROFILE
      : profile;

  return {
    status: 'ok',
    safeUrl,
    profile: effectiveProfile,
  };
}

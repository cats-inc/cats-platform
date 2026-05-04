import { Link, Outlet, useNavigate } from 'react-router-dom';

import { GuideCatDockSlot } from '../../../design/components/GuideCatDockSlot.js';
import { messageKeys } from '../../../shared/i18n/index.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';
import {
  resolveRuntimeLobbyDotClassName,
  resolveRuntimePresentationStatus,
  resolveRuntimeTooltip,
} from '../../../shared/runtimeStatusPresentation.js';
import { useI18n } from '../i18n/index.js';
import { LobbySidebar } from './LobbySidebar.js';

/**
 * Workspace shell for the platform entity routes (/cats, /clowders,
 * /catteries and their /:id and /:id/:tab variants). Mirrors the
 * chat / code / work appshell layout — sidebar on the left, identity
 * pill in the top bar, content area on the right — so navigating
 * around entity homes feels continuous with the rest of the platform.
 *
 * Per PLAN-091 phase 7 (correction round), `/lobby` itself is bare —
 * the appshell sidebar only appears once the user drills in from a
 * Lobby canvas card. Clicking the breadcrumb returns to /lobby.
 */
export function EntitiesShell({
  envelope,
}: {
  envelope: PlatformHostEnvelope;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const runtimeStatus = resolveRuntimePresentationStatus(envelope.runtime);
  const dotClass = resolveRuntimeLobbyDotClassName(runtimeStatus);
  const runtimeTooltip = resolveRuntimeTooltip(runtimeStatus, t);
  const runtimeStatusLabel = t(messageKeys.lobbyRuntimeStatusLabel, {
    runtimeStatus: runtimeTooltip,
  });

  const avatarStyle = envelope.ownerAvatarUrl
    ? {
        backgroundImage: `url(${envelope.ownerAvatarUrl})`,
        backgroundSize: 'cover' as const,
        backgroundPosition: 'center' as const,
      }
    : undefined;

  const settingsNavState = {
    platformShellSurface: envelope.lastProductSurface ?? 'chat',
  };

  return (
    <div
      className="screen entitiesShellScreen"
      aria-label={t(messageKeys.entitiesShellAriaLabel)}
    >
      <div className="entitiesShellTopBar">
        <Link to="/lobby" className="entitiesShellBackLink">
          {t(messageKeys.entitiesShellBackToLobby)}
        </Link>
        <div className="entitiesShellTopBarEnd">
          <GuideCatDockSlot slotKind="lobby" />
          <div
            className="lobbyIdentity"
            role="group"
            aria-label={t(messageKeys.lobbyAccountSettingsAriaLabel)}
          >
            <button
              type="button"
              className="lobbyIdentityMainButton"
              onClick={() => navigate('/settings/general', { state: settingsNavState })}
              aria-label={t(messageKeys.lobbyOpenAccountSettings)}
            >
              <span className="lobbyAvatar" style={avatarStyle}>
                {envelope.ownerAvatarUrl
                  ? null
                  : nameInitials(envelope.ownerDisplayName)}
              </span>
              <span className="lobbyOwnerName">{envelope.ownerDisplayName}</span>
            </button>
            <button
              type="button"
              className="lobbyIdentityRuntime"
              onClick={() => navigate('/settings/runtime', { state: settingsNavState })}
              data-tooltip={runtimeTooltip}
              aria-label={runtimeStatusLabel}
            >
              <span className={dotClass} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <div className="entitiesShellMain">
        <LobbySidebar
          cats={envelope.lobby.cats}
          clowders={envelope.lobby.clowders ?? []}
          catteries={envelope.lobby.catteries ?? []}
        />
        <main className="entitiesShellContent">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

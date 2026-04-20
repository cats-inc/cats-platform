import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { GuideCatDockSlot } from '../../design/components/GuideCatDockSlot.js';
import { buildCatExecutionLabel, buildCatTooltip } from '../../shared/executionLabel.js';
import { nameInitials } from '../../shared/nameInitials.js';
import type { PlatformHostEnvelope, PlatformLobbyCatSummary } from '../../shared/platform-contract.js';
import {
  resolveRuntimeLobbyDotClassName,
  resolveRuntimePresentationStatus,
  resolveRuntimeTooltip,
} from '../../shared/runtimeStatusPresentation.js';
import { LobbyBouncingCats } from './LobbyBouncingCats.js';
import { buildPlatformLobbyEntries, pickLobbyGreeting } from './lobbyModel.js';

function buildDirectLanePath(catId: string): string {
  return `/chat/my-cats/${encodeURIComponent(catId)}`;
}

function buildLobbyCatTooltip(cat: PlatformLobbyCatSummary): string {
  if (!cat.defaultExecutionTarget) {
    return buildCatTooltip(cat.name, cat.executionLabel);
  }

  return buildCatTooltip(cat.name, buildCatExecutionLabel({
    defaultExecutionTarget: cat.defaultExecutionTarget,
    defaultModelSelection: cat.defaultModelSelection ?? null,
    executionLabel: cat.executionLabel,
  }));
}

function LobbyCatRoster({
  cats,
  onSelect,
}: {
  cats: readonly PlatformLobbyCatSummary[];
  onSelect: (catId: string) => void;
}) {
  if (cats.length === 0) return null;

  return (
    <div className="lobbyCatRoster">
      {cats.map((cat) => {
        const style = cat.avatarUrl
          ? { backgroundImage: `url(${cat.avatarUrl})`, backgroundSize: 'cover' as const, backgroundPosition: 'center' as const }
          : cat.avatarColor ? { background: cat.avatarColor } : undefined;

        return (
          <button
            key={cat.id}
            type="button"
            className={cat.isBoss ? 'lobbyCatAvatar lobbyCatAvatarBoss' : 'lobbyCatAvatar'}
            style={style}
            data-tooltip={buildLobbyCatTooltip(cat)}
            aria-label={cat.name}
            onClick={() => onSelect(cat.id)}
          >
            {cat.avatarUrl ? null : nameInitials(cat.name)}
          </button>
        );
      })}
    </div>
  );
}

export function PlatformLobby({
  envelope,
}: {
  envelope: PlatformHostEnvelope;
}) {
  const navigate = useNavigate();
  const [fallbackGreeting] = useState(pickLobbyGreeting);
  const entries = buildPlatformLobbyEntries({
    products: envelope.products,
    lastUsedSurface: envelope.lastProductSurface ?? null,
  });
  const greeting = envelope.lobby.guideCatAssist?.bundle.content.greeting?.trim() || fallbackGreeting;
  const runtimeStatus = resolveRuntimePresentationStatus(envelope.runtime);
  const dotClass = resolveRuntimeLobbyDotClassName(runtimeStatus);
  const runtimeTooltip = resolveRuntimeTooltip(runtimeStatus);

  const avatarStyle = envelope.ownerAvatarUrl
    ? { backgroundImage: `url(${envelope.ownerAvatarUrl})`, backgroundSize: 'cover' as const, backgroundPosition: 'center' as const }
    : undefined;

  const settingsNavState = {
    platformShellSurface: envelope.lastProductSurface ?? 'chat',
  };

  return (
    <div className="screen screenCentered lobbyScreen">
      <LobbyBouncingCats animationMode={envelope.lobby.animationMode} cats={envelope.lobby.cats} />
      <div className="platformLobby">
        <div className="lobbyTopBar">
          <span className="lobbyBrand">CATS INC</span>
          <div className="lobbyTopBarEnd">
            <LobbyCatRoster
              cats={envelope.lobby.cats}
              onSelect={(catId) => navigate(buildDirectLanePath(catId))}
            />
            <GuideCatDockSlot slotKind="lobby" />
            <button
              type="button"
              className="lobbyIdentity"
              onClick={() => navigate('/settings/general', { state: settingsNavState })}
              aria-label="Open account settings"
            >
              <span className="lobbyAvatar" style={avatarStyle}>
                {envelope.ownerAvatarUrl ? null : nameInitials(envelope.ownerDisplayName)}
              </span>
              <span className="lobbyOwnerName">{envelope.ownerDisplayName}</span>
              <span
                className="lobbyIdentityRuntime"
                role="button"
                tabIndex={0}
                data-tooltip={runtimeTooltip}
                aria-label={`Runtime status: ${runtimeTooltip}`}
                onClick={(event) => {
                  event.stopPropagation();
                  navigate('/settings/runtime', { state: settingsNavState });
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.stopPropagation();
                    event.preventDefault();
                    navigate('/settings/runtime', { state: settingsNavState });
                  }
                }}
              >
                <span className={dotClass} aria-hidden="true" />
              </span>
            </button>
            {/* ─── Preserved: popup-menu variant (re-enable in a later
             * release) — original click opened a Settings / Environment
             * menu via <AccountIdentityMenu>. Split-click routing above
             * replaces it until more account-level actions exist: the
             * left half (avatar + name) navigates to /settings/general,
             * the right half (runtime dot, divided by a border-left)
             * navigates to /settings/runtime — mirroring the
             * AudienceChip's `audienceChipWorkflow` divider treatment.
             *
             * To re-enable:
             *  1. Re-add the imports:
             *       import { AccountIdentityMenu } from '../../design/components/AccountIdentityMenu.js';
             *       import { executeEnvironmentRecovery } from '../../shared/environmentRecoveryAction.js';
             *  2. Restore `const [accountMenuOpen, setAccountMenuOpen] = useState(false);`.
             *  3. Replace the <button className="lobbyIdentity">…</button>
             *     (with its inner <span role="button" className="lobbyIdentityRuntime">)
             *     with:
             *
             *     <AccountIdentityMenu
             *       open={accountMenuOpen}
             *       onOpenChange={setAccountMenuOpen}
             *       onNavigateSettings={() => navigate('/settings/general', { state: settingsNavState })}
             *       onNavigateEnvironment={() => {
             *         void executeEnvironmentRecovery({
             *           runtimeStatus,
             *           runtimeSetupStatus: envelope.runtimeSetup.status,
             *         });
             *       }}
             *       triggerClassName="lobbyIdentity"
             *       menuPlacement="below"
             *       menuAlignment="end"
             *       avatar={<span className="lobbyAvatar" style={avatarStyle}>…</span>}
             *       meta={<span className="lobbyOwnerName">{envelope.ownerDisplayName}</span>}
             *       statusIndicator={<span className={dotClass} data-tooltip={runtimeTooltip} aria-label={runtimeTooltip} />}
             *     />
             */}
          </div>
        </div>

        <div className="lobbyHero">
          <h1 className="lobbyGreeting">{greeting}</h1>
        </div>

        <div className="lobbyProducts">
          <p className="lobbyProductsEyebrow">Products</p>
          <div className="platformLobbyGrid">
            {entries.map((entry) => (
              <button
                key={entry.surface}
                type="button"
                className={
                  'contentCard platformLobbyCard'
                  + ` platformLobbyCard--${entry.surface}`
                  + (entry.lastUsed ? ' platformLobbyCard--recent' : '')
                }
                onClick={() => navigate(entry.routePrefix)}
              >
                <div className="platformLobbyCardAccent" />
                <span className="platformLobbyCardName">{entry.productName}</span>
                <span className="platformLobbyCardSub">{entry.subtitle}</span>
                {entry.lastUsed ? (
                  <span className="platformLobbyCardHint">Continue</span>
                ) : null}
              </button>
            ))}
            {/* ── Mock product (layout preview) ── */}
            <div className="contentCard platformLobbyCard platformLobbyCard--mock">
              <div className="platformLobbyCardAccent" />
              <span className="platformLobbyCardName">Cats Learn</span>
              <span className="platformLobbyCardSub">Courses, flashcards, and study companions</span>
            </div>
          </div>
        </div>

        {/* ── Mock apps section (layout preview) ── */}
        <div className="lobbyProducts">
          <p className="lobbyProductsEyebrow">Apps</p>
          <div className="platformLobbyGrid">
            <div className="contentCard platformLobbyCard platformLobbyCard--mock">
              <div className="platformLobbyCardAccent" />
              <span className="platformLobbyCardName">Pomodoro</span>
              <span className="platformLobbyCardSub">Focus timer with break reminders</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

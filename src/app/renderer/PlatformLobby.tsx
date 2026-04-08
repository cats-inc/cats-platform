import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AccountIdentityMenu } from '../../design/components/AccountIdentityMenu.js';
import { nameInitials } from '../../shared/nameInitials.js';
import type { PlatformHostEnvelope, PlatformLobbyCatSummary } from '../../shared/platform-contract.js';
import { LobbyBouncingCats } from './LobbyBouncingCats.js';
import { buildPlatformLobbyEntries, pickLobbyGreeting } from './lobbyModel.js';

function resolveRuntimeDotClass(runtime: PlatformHostEnvelope['runtime']): string {
  if (!runtime.reachable) return 'lobbyIdentityDot lobbyIdentityDot--warn';
  const status = typeof runtime.status === 'string' ? runtime.status.toLowerCase() : '';
  if (status === 'degraded' || status === 'warming' || status === 'starting') {
    return 'lobbyIdentityDot lobbyIdentityDot--warn';
  }
  return 'lobbyIdentityDot lobbyIdentityDot--ok';
}

function buildDirectLanePath(catId: string): string {
  return `/chat/my-cats/${encodeURIComponent(catId)}`;
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
            data-tooltip={cat.name}
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
  const [greeting] = useState(pickLobbyGreeting);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const entries = buildPlatformLobbyEntries({
    products: envelope.products,
    lastUsedSurface: envelope.lastProductSurface ?? null,
  });
  const dotClass = resolveRuntimeDotClass(envelope.runtime);

  const avatarStyle = envelope.ownerAvatarUrl
    ? { backgroundImage: `url(${envelope.ownerAvatarUrl})`, backgroundSize: 'cover' as const, backgroundPosition: 'center' as const }
    : undefined;

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
            <AccountIdentityMenu
              open={accountMenuOpen}
              onOpenChange={setAccountMenuOpen}
              onNavigateSettings={() => navigate('/settings/general', {
                state: { platformShellSurface: envelope.lastProductSurface ?? 'chat' },
              })}
              runtimeBaseUrl={envelope.runtime.baseUrl}
              triggerClassName="lobbyIdentity"
              menuPlacement="below"
              menuAlignment="end"
              avatar={(
                <span className="lobbyAvatar" style={avatarStyle}>
                  {envelope.ownerAvatarUrl ? null : nameInitials(envelope.ownerDisplayName)}
                </span>
              )}
              meta={<span className="lobbyOwnerName">{envelope.ownerDisplayName}</span>}
              statusIndicator={<span className={dotClass} />}
            />
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

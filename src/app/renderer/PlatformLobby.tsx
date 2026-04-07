import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { nameInitials } from '../../shared/nameInitials.js';
import type { PlatformHostEnvelope } from '../../shared/platform-contract.js';
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

export function PlatformLobby({
  envelope,
}: {
  envelope: PlatformHostEnvelope;
}) {
  const navigate = useNavigate();
  const [greeting] = useState(pickLobbyGreeting);
  const entries = buildPlatformLobbyEntries({
    products: envelope.products,
    lastUsedSurface: envelope.lastProductSurface ?? null,
  });
  const dotClass = resolveRuntimeDotClass(envelope.runtime);

  const avatarStyle = envelope.ownerAvatarUrl
    ? { backgroundImage: `url(${envelope.ownerAvatarUrl})`, backgroundSize: 'cover' as const, backgroundPosition: 'center' as const }
    : envelope.ownerAvatarColor
      ? { background: envelope.ownerAvatarColor }
      : undefined;

  return (
    <div className="screen screenCentered lobbyScreen">
      <LobbyBouncingCats />
      <div className="platformLobby">
        <div className="lobbyTopBar">
          <span className="lobbyBrand">CATS INC</span>
          <button
            type="button"
            className="lobbyIdentity"
            onClick={() => navigate('/settings/general')}
            aria-label="Settings"
          >
            <span className="lobbyAvatar" style={avatarStyle}>
              {envelope.ownerAvatarUrl ? null : nameInitials(envelope.ownerDisplayName)}
            </span>
            <span className="lobbyOwnerName">{envelope.ownerDisplayName}</span>
            <span className={dotClass} />
          </button>
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

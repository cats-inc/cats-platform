import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { GuideCatDockSlot } from '../../design/components/GuideCatDockSlot.js';
import { messageKeys, type MessageKey } from '../../shared/i18n/index.js';
import { nameInitials } from '../../shared/nameInitials.js';
import type {
  PlatformHostEnvelope,
  PlatformLobbyCatSummary,
  PlatformLobbyCatterySummary,
  PlatformLobbyClowderSummary,
} from '../../shared/platform-contract.js';
import {
  resolveRuntimeLobbyDotClassName,
  resolveRuntimePresentationStatus,
  resolveRuntimeTooltip,
} from '../../shared/runtimeStatusPresentation.js';
import { useI18n } from './i18n/index.js';
import { LobbyBouncingCats } from './LobbyBouncingCats.js';
import {
  buildPlatformLobbyAppEntries,
  buildPlatformLobbyEntries,
  pickLobbyGreeting,
} from './lobbyModel.js';
import { resolveGuideCatAssistGreeting } from '../../shared/guideCatAssistPresentation.js';
import {
  PlaceholderGlyph,
  type ConversationSidebarMyCatsPlaceholderIconKind,
} from './productShell/ConversationSidebarMyCats.js';

const LOBBY_CARD_ROW_COUNT = 3;
const LOBBY_CARD_OVERFLOW_AVATAR_CAP = 5;

interface LobbyEntityRowSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  avatarColor: string | null;
}

interface LobbyEntityCard {
  key: 'cats' | 'clowders' | 'catteries';
  headerLabelKey: MessageKey;
  rows: readonly LobbyEntityRowSummary[];
  /**
   * Avatars belonging to entities that fall past the first three
   * inline rows. Capped at LOBBY_CARD_OVERFLOW_AVATAR_CAP so the
   * footer height stays predictable; renders as a non-interactive
   * decorative stack next to the "{N} TOTAL" label.
   */
  overflowAvatarRows: readonly LobbyEntityRowSummary[];
  totalCount: number;
  routePath: '/cats' | '/clowders' | '/catteries';
  detailPathPrefix: '/cats/' | '/clowders/' | '/catteries/';
  placeholderLabelKey: MessageKey;
  placeholderIconKind: ConversationSidebarMyCatsPlaceholderIconKind;
}

function summarizeCat(cat: PlatformLobbyCatSummary): LobbyEntityRowSummary {
  return {
    id: cat.id,
    name: cat.name,
    avatarUrl: cat.avatarUrl,
    avatarColor: cat.avatarColor,
  };
}

function summarizeClowder(
  clowder: PlatformLobbyClowderSummary,
): LobbyEntityRowSummary {
  return {
    id: clowder.id,
    name: clowder.name,
    avatarUrl: clowder.avatarUrl,
    avatarColor: null,
  };
}

function summarizeCattery(
  cattery: PlatformLobbyCatterySummary,
): LobbyEntityRowSummary {
  return {
    id: cattery.id,
    name: cattery.name,
    avatarUrl: cattery.avatarUrl,
    avatarColor: null,
  };
}

function LobbyEntityAvatar({ row }: { row: LobbyEntityRowSummary }) {
  const style = row.avatarUrl
    ? {
        backgroundImage: `url(${row.avatarUrl})`,
        backgroundSize: 'cover' as const,
        backgroundPosition: 'center' as const,
      }
    : row.avatarColor
      ? { background: row.avatarColor }
      : undefined;
  return (
    <span className="lobbyEntityAvatar" style={style}>
      {row.avatarUrl ? null : nameInitials(row.name)}
    </span>
  );
}

export function PlatformLobby({
  envelope,
}: {
  envelope: PlatformHostEnvelope;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [fallbackGreeting] = useState(() => pickLobbyGreeting(null, Math.random, t));
  const entries = buildPlatformLobbyEntries({
    products: envelope.products,
    lastUsedSurface: envelope.lastProductSurface ?? null,
  }, t);
  const appEntries = buildPlatformLobbyAppEntries({
    installedApps: envelope.installedApps ?? [],
  });
  const greeting = resolveGuideCatAssistGreeting(envelope.lobby.guideCatAssist, t)
    ?? fallbackGreeting;
  const runtimeStatus = resolveRuntimePresentationStatus(envelope.runtime);
  const dotClass = resolveRuntimeLobbyDotClassName(runtimeStatus);
  const runtimeTooltip = resolveRuntimeTooltip(runtimeStatus, t);
  const runtimeStatusLabel = t('lobbyRuntimeStatusLabel', { runtimeStatus: runtimeTooltip });

  const avatarStyle = envelope.ownerAvatarUrl
    ? { backgroundImage: `url(${envelope.ownerAvatarUrl})`, backgroundSize: 'cover' as const, backgroundPosition: 'center' as const }
    : undefined;

  const settingsNavState = {
    platformShellSurface: envelope.lastProductSurface ?? 'chat',
  };

  const cats = envelope.lobby.cats;
  const clowders = envelope.lobby.clowders ?? [];
  const catteries = envelope.lobby.catteries ?? [];

  const entityCards: LobbyEntityCard[] = [
    {
      key: 'cats',
      headerLabelKey: messageKeys.lobbyEntityColumnHeaderCats,
      rows: cats.slice(0, LOBBY_CARD_ROW_COUNT).map(summarizeCat),
      overflowAvatarRows: cats
        .slice(LOBBY_CARD_ROW_COUNT, LOBBY_CARD_ROW_COUNT + LOBBY_CARD_OVERFLOW_AVATAR_CAP)
        .map(summarizeCat),
      totalCount: cats.length,
      routePath: '/cats',
      detailPathPrefix: '/cats/',
      placeholderLabelKey: messageKeys.lobbySidebarNewCat,
      placeholderIconKind: 'singlePerson',
    },
    {
      key: 'clowders',
      headerLabelKey: messageKeys.lobbyEntityColumnHeaderClowders,
      rows: clowders.slice(0, LOBBY_CARD_ROW_COUNT).map(summarizeClowder),
      overflowAvatarRows: clowders
        .slice(LOBBY_CARD_ROW_COUNT, LOBBY_CARD_ROW_COUNT + LOBBY_CARD_OVERFLOW_AVATAR_CAP)
        .map(summarizeClowder),
      totalCount: clowders.length,
      routePath: '/clowders',
      detailPathPrefix: '/clowders/',
      placeholderLabelKey: messageKeys.lobbySidebarNewClowder,
      placeholderIconKind: 'groupPeople',
    },
    {
      key: 'catteries',
      headerLabelKey: messageKeys.lobbyEntityColumnHeaderCatteries,
      rows: catteries.slice(0, LOBBY_CARD_ROW_COUNT).map(summarizeCattery),
      overflowAvatarRows: catteries
        .slice(LOBBY_CARD_ROW_COUNT, LOBBY_CARD_ROW_COUNT + LOBBY_CARD_OVERFLOW_AVATAR_CAP)
        .map(summarizeCattery),
      totalCount: catteries.length,
      routePath: '/catteries',
      detailPathPrefix: '/catteries/',
      placeholderLabelKey: messageKeys.lobbySidebarNewCattery,
      placeholderIconKind: 'orgChart',
    },
  ];

  return (
    <div className="screen lobbyScreen">
      <LobbyBouncingCats animationMode={envelope.lobby.animationMode} cats={envelope.lobby.cats} />
      <div className="platformLobby">
        <div className="lobbyTopBar">
          <span className="lobbyBrand">{t('appBrandName')}</span>
          <div className="lobbyTopBarEnd">
            <GuideCatDockSlot slotKind="lobby" />
            <div className="lobbyIdentity" role="group" aria-label={t('lobbyAccountSettingsAriaLabel')}>
              <button
                type="button"
                className="lobbyIdentityMainButton"
                onClick={() => navigate('/settings/general', { state: settingsNavState })}
                aria-label={t('lobbyOpenAccountSettings')}
              >
                <span className="lobbyAvatar" style={avatarStyle}>
                  {envelope.ownerAvatarUrl ? null : nameInitials(envelope.ownerDisplayName)}
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

        <div className="lobbyEntities">
          {entityCards.map((card) => (
            <div
              key={card.key}
              className={`lobbyEntityColumn lobbyEntityColumn--${card.key}`}
            >
              <p className="lobbyEntityColumnHeader">{t(card.headerLabelKey)}</p>
              <div
                className={`contentCard platformLobbyCard platformLobbyCard--entity platformLobbyCard--entity-${card.key}`}
              >
                {/* Background button covers the whole card so any
                 * "non-row" pixel — accent stripe, gaps between rows,
                 * total footer — opens the entity list page. Items
                 * sit at higher z-index so their own onClick wins
                 * normally. The accent + total footer set
                 * pointer-events: none in CSS so clicks fall through
                 * to this background button. Card link does not nest
                 * inside another button (keeps HTML valid). */}
                <button
                  type="button"
                  className="lobbyEntityCardLink"
                  aria-label={t(messageKeys.lobbyEntityCardOpenListAriaLabel, {
                    label: t(card.headerLabelKey),
                  })}
                  onClick={() => navigate(card.routePath)}
                />
                <div className="platformLobbyCardAccent" />
                <ul className="lobbyEntityCardItems">
                  {Array.from({ length: LOBBY_CARD_ROW_COUNT }, (_, index) => {
                    const row = card.rows[index];
                    if (row) {
                      return (
                        <li key={row.id} className="lobbyEntityRow">
                          <button
                            type="button"
                            className="lobbyEntityItem"
                            onClick={() =>
                              navigate(`${card.detailPathPrefix}${encodeURIComponent(row.id)}`)
                            }
                          >
                            <LobbyEntityAvatar row={row} />
                            <span className="lobbyEntityName">{row.name}</span>
                          </button>
                        </li>
                      );
                    }
                    if (index === 0 && card.totalCount === 0) {
                      return (
                        <li
                          key={`${card.key}-placeholder`}
                          className="lobbyEntityRow lobbyEntityRowPlaceholder"
                        >
                          <button
                            type="button"
                            className="lobbyEntityItem lobbyEntityItemPlaceholder"
                            disabled
                          >
                            <span
                              className="lobbyEntityAvatar lobbyEntityAvatarPlaceholder"
                              aria-hidden="true"
                            >
                              <PlaceholderGlyph iconKind={card.placeholderIconKind} />
                            </span>
                            <span className="lobbyEntityName lobbyEntityNamePlaceholder">
                              {t(card.placeholderLabelKey)}
                            </span>
                          </button>
                        </li>
                      );
                    }
                    return (
                      <li
                        key={`${card.key}-empty-${index}`}
                        className="lobbyEntityRow lobbyEntityRowEmpty"
                        aria-hidden="true"
                      />
                    );
                  })}
                </ul>
                {card.totalCount > 0 ? (
                  <div className="lobbyEntityCardFooter">
                    {card.overflowAvatarRows.length > 0 ? (
                      <div
                        className="lobbyEntityAvatarStack"
                        aria-hidden="true"
                      >
                        {card.overflowAvatarRows.map((row) => (
                          <span
                            key={row.id}
                            className="lobbyEntityAvatar lobbyEntityAvatarStacked"
                            style={
                              row.avatarUrl
                                ? {
                                    backgroundImage: `url(${row.avatarUrl})`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                  }
                                : row.avatarColor
                                  ? { background: row.avatarColor }
                                  : undefined
                            }
                          >
                            {row.avatarUrl ? null : nameInitials(row.name)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <span className="lobbyEntityCardTotal">
                      {t(messageKeys.lobbyEntityCardTotal, { count: card.totalCount })}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="lobbyProducts">
          <p className="lobbyProductsEyebrow">{t('lobbyProductsSectionTitle')}</p>
          <div className="platformLobbyGrid">
            {entries.map((entry) => {
              const productClassName = 'contentCard platformLobbyCard'
                + ` platformLobbyCard--${entry.surface ?? 'module'}`
                + (entry.lastUsed ? ' platformLobbyCard--recent' : '')
                + (entry.available ? ' platformLobbyCard--mock' : '');
              const content = (
                <>
                  <div className="platformLobbyCardAccent" />
                  <span className="platformLobbyCardName">{entry.productName}</span>
                  <span className="platformLobbyCardSub">{entry.subtitle}</span>
                  {entry.lastUsed ? (
                    <span className="platformLobbyCardHint">{t('lobbyContinueText')}</span>
                  ) : null}
                </>
              );

              return entry.available ? (
                <div key={entry.productId} className={productClassName}>
                  {content}
                </div>
              ) : (
                <button
                  key={entry.productId}
                  type="button"
                  className={productClassName}
                  onClick={() => navigate(entry.routePrefix)}
                >
                  {content}
                </button>
              );
            })}
          </div>
        </div>

        {appEntries.length > 0 ? (
          <div className="lobbyProducts">
            <p className="lobbyProductsEyebrow">{t('lobbyAppsSectionTitle')}</p>
            <div className="platformLobbyGrid">
              {appEntries.map((entry) => (
                <button
                  key={`${entry.appId}:${entry.entryId}`}
                  type="button"
                  className="contentCard platformLobbyCard platformLobbyCard--app"
                  onClick={() => navigate(entry.routePath)}
                  aria-label={t('lobbyOpenEntry', { entryTitle: entry.title })}
                >
                  <div className="platformLobbyCardAccent" />
                  <span className="platformLobbyCardName">{entry.title}</span>
                  {entry.subtitle ? (
                    <span className="platformLobbyCardSub">{entry.subtitle}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

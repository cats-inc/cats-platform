import { useNavigate } from 'react-router-dom';

import { messageKeys, type MessageKey } from '../../../shared/i18n/index.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type {
  PlatformHostEnvelope,
  PlatformLobbyCatSummary,
  PlatformLobbyCatterySummary,
  PlatformLobbyClowderSummary,
} from '../../../shared/platform-contract.js';
import { useI18n } from '../i18n/index.js';
import {
  PlaceholderGlyph,
  type ConversationSidebarMyCatsPlaceholderIconKind,
} from '../productShell/ConversationSidebarMyCats.js';

const ENTITY_INDEX_CARD_ROW_COUNT = 3;
const ENTITY_INDEX_CARD_OVERFLOW_AVATAR_CAP = 5;

interface EntityIndexRowSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  avatarColor: string | null;
  isBoss: boolean;
}

interface EntityIndexCard {
  key: 'cats' | 'clowders' | 'catteries';
  headerLabelKey: MessageKey;
  rows: readonly EntityIndexRowSummary[];
  overflowAvatarRows: readonly EntityIndexRowSummary[];
  totalCount: number;
  routePath: '/entities/cats' | '/entities/clowders' | '/entities/catteries';
  detailPathPrefix: '/entities/cats/' | '/entities/clowders/' | '/entities/catteries/';
  placeholderLabelKey: MessageKey;
  placeholderIconKind: ConversationSidebarMyCatsPlaceholderIconKind;
  placeholderTarget: string | null;
}

function summarizeCat(cat: PlatformLobbyCatSummary): EntityIndexRowSummary {
  return {
    id: cat.id,
    name: cat.name,
    avatarUrl: cat.avatarUrl,
    avatarColor: cat.avatarColor,
    isBoss: cat.isBoss,
  };
}

export function sortEntityIndexCatsForDisplay(
  cats: readonly PlatformLobbyCatSummary[],
): PlatformLobbyCatSummary[] {
  return [...cats].sort((left, right) => {
    const leftRank = left.isBoss ? 0 : 1;
    const rightRank = right.isBoss ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

function sortEntityIndexEntriesForDisplay<
  T extends { createdAt: string; name: string; id: string },
>(entries: readonly T[]): T[] {
  return [...entries].sort((left, right) => {
    const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
    if (createdAtOrder !== 0) return createdAtOrder;
    const nameOrder = left.name.localeCompare(right.name);
    if (nameOrder !== 0) return nameOrder;
    return left.id.localeCompare(right.id);
  });
}

function summarizeClowder(
  clowder: PlatformLobbyClowderSummary,
): EntityIndexRowSummary {
  return {
    id: clowder.id,
    name: clowder.name,
    avatarUrl: clowder.avatarUrl,
    avatarColor: null,
    isBoss: false,
  };
}

function summarizeCattery(
  cattery: PlatformLobbyCatterySummary,
): EntityIndexRowSummary {
  return {
    id: cattery.id,
    name: cattery.name,
    avatarUrl: cattery.avatarUrl,
    avatarColor: null,
    isBoss: false,
  };
}

function EntityIndexAvatar({ row }: { row: EntityIndexRowSummary }) {
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
    <span
      className={
        row.isBoss
          ? 'entityIndexAvatar catAvatarBoss'
          : 'entityIndexAvatar'
      }
      style={style}
    >
      {row.avatarUrl ? null : nameInitials(row.name)}
    </span>
  );
}

function buildEntityIndexCards(envelope: PlatformHostEnvelope): EntityIndexCard[] {
  const cats = sortEntityIndexCatsForDisplay(envelope.lobby.cats);
  const clowders = sortEntityIndexEntriesForDisplay(envelope.lobby.clowders ?? []);
  const catteries = sortEntityIndexEntriesForDisplay(envelope.lobby.catteries ?? []);

  return [
    {
      key: 'cats',
      headerLabelKey: messageKeys.entityIndexColumnHeaderCats,
      rows: cats.slice(0, ENTITY_INDEX_CARD_ROW_COUNT).map(summarizeCat),
      overflowAvatarRows: cats
        .slice(
          ENTITY_INDEX_CARD_ROW_COUNT,
          ENTITY_INDEX_CARD_ROW_COUNT + ENTITY_INDEX_CARD_OVERFLOW_AVATAR_CAP,
        )
        .map(summarizeCat),
      totalCount: cats.length,
      routePath: '/entities/cats',
      detailPathPrefix: '/entities/cats/',
      placeholderLabelKey: messageKeys.entitiesSidebarNewCat,
      placeholderIconKind: 'singlePerson',
      placeholderTarget: '/settings/cats/new',
    },
    {
      key: 'clowders',
      headerLabelKey: messageKeys.entityIndexColumnHeaderClowders,
      rows: clowders.slice(0, ENTITY_INDEX_CARD_ROW_COUNT).map(summarizeClowder),
      overflowAvatarRows: clowders
        .slice(
          ENTITY_INDEX_CARD_ROW_COUNT,
          ENTITY_INDEX_CARD_ROW_COUNT + ENTITY_INDEX_CARD_OVERFLOW_AVATAR_CAP,
        )
        .map(summarizeClowder),
      totalCount: clowders.length,
      routePath: '/entities/clowders',
      detailPathPrefix: '/entities/clowders/',
      placeholderLabelKey: messageKeys.entitiesSidebarNewClowder,
      placeholderIconKind: 'groupPeople',
      placeholderTarget: null,
    },
    {
      key: 'catteries',
      headerLabelKey: messageKeys.entityIndexColumnHeaderCatteries,
      rows: catteries.slice(0, ENTITY_INDEX_CARD_ROW_COUNT).map(summarizeCattery),
      overflowAvatarRows: catteries
        .slice(
          ENTITY_INDEX_CARD_ROW_COUNT,
          ENTITY_INDEX_CARD_ROW_COUNT + ENTITY_INDEX_CARD_OVERFLOW_AVATAR_CAP,
        )
        .map(summarizeCattery),
      totalCount: catteries.length,
      routePath: '/entities/catteries',
      detailPathPrefix: '/entities/catteries/',
      placeholderLabelKey: messageKeys.entitiesSidebarNewCattery,
      placeholderIconKind: 'orgChart',
      placeholderTarget: null,
    },
  ];
}

export function EntityIndexCards({ envelope }: { envelope: PlatformHostEnvelope }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const entityCards = buildEntityIndexCards(envelope);

  return (
    <div className="entityIndexCards">
      {entityCards.map((card) => (
        <div
          key={card.key}
          className={`entityIndexColumn entityIndexColumn--${card.key}`}
        >
          <p className="entityIndexColumnHeader">{t(card.headerLabelKey)}</p>
          <div
            className={[
              'contentCard',
              'platformLobbyCard',
              'platformLobbyCard--entity',
              `platformLobbyCard--entity-${card.key}`,
            ].join(' ')}
          >
            <button
              type="button"
              className="entityIndexCardLink"
              aria-label={t(messageKeys.entityIndexCardOpenCanvasAriaLabel, {
                label: t(card.headerLabelKey),
              })}
              onClick={() => navigate(card.routePath)}
            />
            <div className="platformLobbyCardAccent" />
            <ul className="entityIndexCardItems">
              {Array.from({ length: ENTITY_INDEX_CARD_ROW_COUNT }, (_, index) => {
                const row = card.rows[index];
                if (row) {
                  return (
                    <li key={row.id} className="entityIndexRow">
                      <button
                        type="button"
                        className="entityIndexItem"
                        onClick={() =>
                          navigate(`${card.detailPathPrefix}${encodeURIComponent(row.id)}`)
                        }
                      >
                        <EntityIndexAvatar row={row} />
                        <span className="entityIndexName">{row.name}</span>
                      </button>
                    </li>
                  );
                }
                if (index === 0 && card.totalCount === 0) {
                  const placeholderTarget = card.placeholderTarget;
                  return (
                    <li
                      key={`${card.key}-placeholder`}
                      className="entityIndexRow entityIndexRowPlaceholder"
                    >
                      <button
                        type="button"
                        className="entityIndexItem entityIndexItemPlaceholder"
                        disabled={placeholderTarget === null}
                        onClick={
                          placeholderTarget === null
                            ? undefined
                            : (event) => {
                                event.stopPropagation();
                                navigate(placeholderTarget);
                              }
                        }
                      >
                        <span
                          className="entityIndexAvatar entityIndexAvatarPlaceholder"
                          aria-hidden="true"
                        >
                          <PlaceholderGlyph iconKind={card.placeholderIconKind} />
                        </span>
                        <span className="entityIndexName entityIndexNamePlaceholder">
                          {t(card.placeholderLabelKey)}
                        </span>
                      </button>
                    </li>
                  );
                }
                return (
                  <li
                    key={`${card.key}-empty-${index}`}
                    className="entityIndexRow entityIndexRowEmpty"
                    aria-hidden="true"
                  />
                );
              })}
            </ul>
            {card.totalCount > 0 ? (
              <div className="entityIndexCardFooter">
                {card.overflowAvatarRows.length > 0 ? (
                  <div
                    className="entityIndexAvatarStack"
                    aria-hidden="true"
                  >
                    {card.overflowAvatarRows.map((row) => (
                      <span
                        key={row.id}
                        className="entityIndexAvatar entityIndexAvatarStacked"
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
                <span className="entityIndexCardTotal">
                  {t(messageKeys.entityIndexCardTotal, { count: card.totalCount })}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

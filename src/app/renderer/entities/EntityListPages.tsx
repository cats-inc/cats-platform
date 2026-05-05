import { Link } from 'react-router-dom';

import { messageKeys, type MessageKey } from '../../../shared/i18n/index.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type {
  PlatformHostEnvelope,
  PlatformLobbyCatterySummary,
  PlatformLobbyClowderSummary,
} from '../../../shared/platform-contract.js';
import { useI18n } from '../i18n/index.js';

interface EntityListEntry {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

// Clowders / Catteries are still phase-6 list-page stubs. They
// intentionally borrow the Cats list style primitives until the
// canvas/side-panel parity decision lands.
function EntityListAvatar({ entry }: { entry: EntityListEntry }) {
  const style = entry.avatarUrl
    ? {
        backgroundImage: `url(${entry.avatarUrl})`,
        backgroundSize: 'cover' as const,
        backgroundPosition: 'center' as const,
      }
    : undefined;

  return (
    <span className="catsListAvatar" style={style}>
      {entry.avatarUrl ? null : nameInitials(entry.name)}
    </span>
  );
}

function EntityListPage({
  entries,
  routePrefix,
  titleKey,
  eyebrowKey,
  emptyStateKey,
}: {
  entries: readonly EntityListEntry[];
  routePrefix: '/clowders' | '/catteries';
  titleKey: MessageKey;
  eyebrowKey: MessageKey;
  emptyStateKey: MessageKey;
}) {
  const { t } = useI18n();

  return (
    <div className="catsListScreen">
      <header className="catsListHeader">
        <p className="eyebrow">{t(eyebrowKey)}</p>
        <h1 className="catsListTitle">{t(titleKey)}</h1>
      </header>
      {entries.length === 0 ? (
        <p className="catsListEmpty">{t(emptyStateKey)}</p>
      ) : (
        <ul className="catsListItems">
          {entries.map((entry) => (
            <li key={entry.id} className="catsListItem">
              <Link
                to={`${routePrefix}/${encodeURIComponent(entry.id)}`}
                className="catsListLink"
              >
                <EntityListAvatar entry={entry} />
                <span className="catsListName">{entry.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function compareEntityListEntries(
  left: EntityListEntry,
  right: EntityListEntry,
): number {
  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
  if (createdAtOrder !== 0) return createdAtOrder;
  const nameOrder = left.name.localeCompare(right.name);
  if (nameOrder !== 0) return nameOrder;
  return left.id.localeCompare(right.id);
}

function toClowderEntry(clowder: PlatformLobbyClowderSummary): EntityListEntry {
  return {
    id: clowder.id,
    name: clowder.name,
    avatarUrl: clowder.avatarUrl,
    createdAt: clowder.createdAt,
  };
}

function toCatteryEntry(cattery: PlatformLobbyCatterySummary): EntityListEntry {
  return {
    id: cattery.id,
    name: cattery.name,
    avatarUrl: cattery.avatarUrl,
    createdAt: cattery.createdAt,
  };
}

export function ClowdersListPage({ envelope }: { envelope: PlatformHostEnvelope }) {
  return (
    <EntityListPage
      entries={(envelope.lobby.clowders ?? [])
        .map(toClowderEntry)
        .sort(compareEntityListEntries)}
      routePrefix="/clowders"
      titleKey={messageKeys.clowdersListTitle}
      eyebrowKey={messageKeys.clowdersListEyebrow}
      emptyStateKey={messageKeys.clowdersListEmptyState}
    />
  );
}

export function CatteriesListPage({ envelope }: { envelope: PlatformHostEnvelope }) {
  return (
    <EntityListPage
      entries={(envelope.lobby.catteries ?? [])
        .map(toCatteryEntry)
        .sort(compareEntityListEntries)}
      routePrefix="/catteries"
      titleKey={messageKeys.catteriesListTitle}
      eyebrowKey={messageKeys.catteriesListEyebrow}
      emptyStateKey={messageKeys.catteriesListEmptyState}
    />
  );
}

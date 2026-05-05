import { Link } from 'react-router-dom';

import { messageKeys } from '../../../shared/i18n/index.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type { PlatformHostEnvelope, PlatformLobbyCatSummary } from '../../../shared/platform-contract.js';
import { useI18n } from '../i18n/index.js';

function CatRowAvatar({ cat }: { cat: PlatformLobbyCatSummary }) {
  const style = cat.avatarUrl
    ? { backgroundImage: `url(${cat.avatarUrl})`, backgroundSize: 'cover' as const, backgroundPosition: 'center' as const }
    : cat.avatarColor
      ? { background: cat.avatarColor }
      : undefined;
  return (
    <span
      className={cat.isBoss ? 'catsListAvatar catAvatarBoss' : 'catsListAvatar'}
      style={style}
    >
      {cat.avatarUrl ? null : nameInitials(cat.name)}
    </span>
  );
}

/**
 * Mounted inside EntitiesShell on `/entities/cats`. The shell already provides
 * the back-to-Lobby affordance via the surface switcher in its
 * sidebar, so this page only renders the list itself.
 */
export function CatsListPage({ envelope }: { envelope: PlatformHostEnvelope }) {
  const { t } = useI18n();
  const cats = envelope.lobby.cats;

  return (
    <div className="catsListScreen">
      <header className="catsListHeader">
        <p className="eyebrow">{t(messageKeys.catsListEyebrow)}</p>
        <h1 className="catsListTitle">{t(messageKeys.catsListTitle)}</h1>
      </header>
      {cats.length === 0 ? (
        <p className="catsListEmpty">{t(messageKeys.catsListEmptyState)}</p>
      ) : (
        <ul className="catsListItems">
          {cats.map((cat) => (
            <li key={cat.id} className="catsListItem">
              <Link to={`/entities/cats/${encodeURIComponent(cat.id)}`} className="catsListLink">
                <CatRowAvatar cat={cat} />
                <span className="catsListName">{cat.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

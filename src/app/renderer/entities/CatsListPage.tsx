import { Link, useNavigate } from 'react-router-dom';

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

export function CatsListPage({ envelope }: { envelope: PlatformHostEnvelope }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const cats = envelope.lobby.cats;

  return (
    <div className="screen catsListScreen">
      <header className="catsListHeader">
        <div>
          <p className="eyebrow">{t(messageKeys.catsListEyebrow)}</p>
          <h1 className="catsListTitle">{t(messageKeys.catsListTitle)}</h1>
        </div>
        <button
          type="button"
          className="secondaryButton"
          onClick={() => navigate('/lobby')}
        >
          {t(messageKeys.catsListBackToLobby)}
        </button>
      </header>
      {cats.length === 0 ? (
        <p className="catsListEmpty">{t(messageKeys.catsListEmptyState)}</p>
      ) : (
        <ul className="catsListItems">
          {cats.map((cat) => (
            <li key={cat.id} className="catsListItem">
              <Link to={`/cats/${encodeURIComponent(cat.id)}`} className="catsListLink">
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

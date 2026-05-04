import { useNavigate, useParams } from 'react-router-dom';

import { messageKeys, type MessageKey } from '../../../shared/i18n/index.js';
import { useI18n } from '../i18n/index.js';

export type EntityKind = 'cat' | 'clowder' | 'cattery';

const TITLE_KEY_BY_KIND: Record<EntityKind, MessageKey> = {
  cat: messageKeys.entityComingSoonTitleCat,
  clowder: messageKeys.entityComingSoonTitleClowder,
  cattery: messageKeys.entityComingSoonTitleCattery,
};

const ID_PARAM_BY_KIND: Record<EntityKind, string> = {
  cat: 'catId',
  clowder: 'clowderId',
  cattery: 'catteryId',
};

export function EntityComingSoon({ kind }: { kind: EntityKind }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const id = params[ID_PARAM_BY_KIND[kind]] ?? '';

  return (
    <div className="screen screenCentered entityComingSoonScreen">
      <section className="entityComingSoonPanel">
        <div className="entityComingSoonHeader">
          <div>
            <p className="eyebrow">{t(messageKeys.entityComingSoonEyebrow)}</p>
            <h1>{t(TITLE_KEY_BY_KIND[kind])}</h1>
          </div>
          <button
            type="button"
            className="secondaryButton"
            onClick={() => navigate('/lobby')}
          >
            {t(messageKeys.entityComingSoonBackToLobby)}
          </button>
        </div>
        <p className="entityComingSoonBody">{t(messageKeys.entityComingSoonBody)}</p>
        <dl className="entityComingSoonMeta">
          <div>
            <dt>{t(messageKeys.entityComingSoonIdLabel)}</dt>
            <dd>{id}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

import { useNavigate, useParams } from 'react-router-dom';

import { EntityDetailPane } from '../../../design/components/EntityDetailPane.js';
import { buildCatExecutionLabel } from '../../../shared/executionLabel.js';
import { messageKeys, type MessageKey } from '../../../shared/i18n/index.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type { PlatformHostEnvelope, PlatformLobbyCatSummary } from '../../../shared/platform-contract.js';
import { useI18n } from '../i18n/index.js';

export type CatLens = 'overview' | 'chat' | 'work' | 'code';

const VALID_LENSES: readonly CatLens[] = ['overview', 'chat', 'work', 'code'];

const LENS_LABEL_KEY: Record<CatLens, MessageKey> = {
  overview: messageKeys.catHomeLensTabOverview,
  chat: messageKeys.catHomeLensTabChat,
  work: messageKeys.catHomeLensTabWork,
  code: messageKeys.catHomeLensTabCode,
};

function isCatLens(value: string | undefined): value is CatLens {
  return typeof value === 'string' && (VALID_LENSES as readonly string[]).includes(value);
}

function findCat(envelope: PlatformHostEnvelope, catId: string): PlatformLobbyCatSummary | null {
  return envelope.lobby.cats.find((candidate) => candidate.id === catId) ?? null;
}

function CatAvatar({ cat }: { cat: PlatformLobbyCatSummary }) {
  const style = cat.avatarUrl
    ? { backgroundImage: `url(${cat.avatarUrl})`, backgroundSize: 'cover' as const, backgroundPosition: 'center' as const }
    : cat.avatarColor
      ? { background: cat.avatarColor }
      : undefined;
  return (
    <span
      className={cat.isBoss ? 'catHomeAvatarBubble catAvatarBoss' : 'catHomeAvatarBubble'}
      style={style}
    >
      {cat.avatarUrl ? null : nameInitials(cat.name)}
    </span>
  );
}

function CatOverview({ cat }: { cat: PlatformLobbyCatSummary }) {
  const { t } = useI18n();
  const executor = cat.defaultExecutionTarget
    ? buildCatExecutionLabel({
        defaultExecutionTarget: cat.defaultExecutionTarget,
        defaultModelSelection: cat.defaultModelSelection ?? null,
        executionLabel: cat.executionLabel,
      })
    : cat.executionLabel ?? null;

  return (
    <div className="catHomeOverview">
      <h2 className="catHomeOverviewHeading">{t(messageKeys.catHomeOverviewSummaryHeading)}</h2>
      <dl className="catHomeOverviewMeta">
        <div>
          <dt>{t(messageKeys.catHomeOverviewIdLabel)}</dt>
          <dd>{cat.id}</dd>
        </div>
        <div>
          <dt>{t(messageKeys.catHomeOverviewExecutorLabel)}</dt>
          <dd>{executor ?? t(messageKeys.catHomeOverviewExecutorMissing)}</dd>
        </div>
      </dl>
    </div>
  );
}

function CatLensStub({ lens }: { lens: Exclude<CatLens, 'overview'> }) {
  const { t } = useI18n();
  const lensLabel = t(LENS_LABEL_KEY[lens]);
  return (
    <div className="catHomeLensStub">
      <p>{t(messageKeys.catHomeLensStubBody, { lens: lensLabel })}</p>
    </div>
  );
}

function CatNotFound({ catId }: { catId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="screen screenCentered entityComingSoonScreen">
      <section className="entityComingSoonPanel">
        <div className="entityComingSoonHeader">
          <div>
            <p className="eyebrow">{t(messageKeys.entityDetailBreadcrumbLobby)}</p>
            <h1>{t(messageKeys.catHomeNotFoundTitle)}</h1>
          </div>
          <button
            type="button"
            className="secondaryButton"
            onClick={() => navigate('/lobby')}
          >
            {t(messageKeys.entityComingSoonBackToLobby)}
          </button>
        </div>
        <p className="entityComingSoonBody">
          {t(messageKeys.catHomeNotFoundBody, { catId })}
        </p>
      </section>
    </div>
  );
}

export function CatHome({ envelope }: { envelope: PlatformHostEnvelope }) {
  const { t } = useI18n();
  const params = useParams();
  const catId = params.catId ?? '';
  const cat = findCat(envelope, catId);
  const activeLens: CatLens = isCatLens(params.lens) ? params.lens : 'overview';

  if (!cat) {
    return <CatNotFound catId={catId} />;
  }

  const tabs = VALID_LENSES.map((lens) => ({
    key: lens,
    label: t(LENS_LABEL_KEY[lens]),
    href: `/cats/${encodeURIComponent(cat.id)}/${lens}`,
    active: lens === activeLens,
  }));

  return (
    <EntityDetailPane
      ariaLabel={t(messageKeys.catHomeAriaLabel)}
      breadcrumbLabel={t(messageKeys.entityDetailBreadcrumbLobby)}
      breadcrumbHref="/lobby"
      avatar={<CatAvatar cat={cat} />}
      title={cat.name}
      subtitle={cat.isBoss ? t(messageKeys.catHomeBossBadge) : undefined}
      tabs={tabs}
    >
      {activeLens === 'overview' ? <CatOverview cat={cat} /> : <CatLensStub lens={activeLens} />}
    </EntityDetailPane>
  );
}

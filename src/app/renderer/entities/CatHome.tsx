import { Link, useNavigate, useParams } from 'react-router-dom';

import { EntityDetailPane } from '../../../design/components/EntityDetailPane.js';
import { buildCatExecutionLabel } from '../../../shared/executionLabel.js';
import { messageKeys, type MessageKey } from '../../../shared/i18n/index.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type {
  PlatformHostEnvelope,
  PlatformLobbyCatSummary,
  PlatformLobbyCatterySummary,
  PlatformLobbyClowderSummary,
} from '../../../shared/platform-contract.js';
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

function CatOverviewMemberships({
  clowders,
  catteries,
}: {
  clowders: readonly PlatformLobbyClowderSummary[];
  catteries: readonly PlatformLobbyCatterySummary[];
}) {
  const { t } = useI18n();
  const hasAny = clowders.length > 0 || catteries.length > 0;

  return (
    <section className="catHomeOverviewMemberships">
      <h3 className="catHomeOverviewMembershipsHeading">
        {t(messageKeys.catHomeOverviewMembershipsHeading)}
      </h3>
      {!hasAny ? (
        <p className="catHomeOverviewMembershipsEmpty">
          {t(messageKeys.catHomeOverviewMembershipsEmpty)}
        </p>
      ) : (
        <div className="catHomeOverviewMembershipsBody">
          {clowders.length > 0 ? (
            <div className="catHomeOverviewMembershipsGroup">
              <p className="eyebrow">
                {t(messageKeys.catHomeOverviewMembershipClowdersGroup)}
              </p>
              <ul>
                {clowders.map((clowder) => (
                  <li key={clowder.id}>
                    <Link to={`/entities/clowders/${encodeURIComponent(clowder.id)}`}>
                      {clowder.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {catteries.length > 0 ? (
            <div className="catHomeOverviewMembershipsGroup">
              <p className="eyebrow">
                {t(messageKeys.catHomeOverviewMembershipCatteriesGroup)}
              </p>
              <ul>
                {catteries.map((cattery) => (
                  <li key={cattery.id}>
                    <Link to={`/entities/catteries/${encodeURIComponent(cattery.id)}`}>
                      {cattery.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function CatOverview({
  cat,
  clowders,
  catteries,
}: {
  cat: PlatformLobbyCatSummary;
  clowders: readonly PlatformLobbyClowderSummary[];
  catteries: readonly PlatformLobbyCatterySummary[];
}) {
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
      <CatOverviewMemberships clowders={clowders} catteries={catteries} />
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
    href: `/entities/cats/${encodeURIComponent(cat.id)}/${lens}`,
    active: lens === activeLens,
  }));

  return (
    <EntityDetailPane
      ariaLabel={t(messageKeys.catHomeAriaLabel)}
      avatar={<CatAvatar cat={cat} />}
      title={cat.name}
      subtitle={cat.isBoss ? t(messageKeys.catHomeBossBadge) : undefined}
      tabs={tabs}
    >
      {activeLens === 'overview' ? (
        // The Lobby payload does not yet carry per-cat membership
        // records (PLAN-091 phase 6 covers the schema; the storage
        // layer is a later slice). Until then, the Memberships
        // section renders its empty state regardless of how many
        // clowders or catteries the workspace has — the structural
        // hook is in place for a future slice that filters by
        // actual membership rather than by registry presence.
        <CatOverview cat={cat} clowders={[]} catteries={[]} />
      ) : (
        <CatLensStub lens={activeLens} />
      )}
    </EntityDetailPane>
  );
}

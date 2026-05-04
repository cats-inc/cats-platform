import { useNavigate, useParams } from 'react-router-dom';

import { EntityDetailPane } from '../../../design/components/EntityDetailPane.js';
import { messageKeys, type MessageKey } from '../../../shared/i18n/index.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type { PlatformHostEnvelope, PlatformLobbyClowderSummary } from '../../../shared/platform-contract.js';
import { useI18n } from '../i18n/index.js';

type ClowderTab = 'cats' | 'settings';

const VALID_TABS: readonly ClowderTab[] = ['cats', 'settings'];

const TAB_LABEL_KEY: Record<ClowderTab, MessageKey> = {
  cats: messageKeys.clowderHomeTabCats,
  settings: messageKeys.clowderHomeTabSettings,
};

function isClowderTab(value: string | undefined): value is ClowderTab {
  return typeof value === 'string' && (VALID_TABS as readonly string[]).includes(value);
}

function findClowder(
  envelope: PlatformHostEnvelope,
  clowderId: string,
): PlatformLobbyClowderSummary | null {
  return (envelope.lobby.clowders ?? []).find((candidate) => candidate.id === clowderId) ?? null;
}

function findCatteryName(envelope: PlatformHostEnvelope, catteryId: string): string | null {
  const cattery = (envelope.lobby.catteries ?? []).find((candidate) => candidate.id === catteryId);
  return cattery?.name ?? null;
}

function ClowderAvatar({ clowder }: { clowder: PlatformLobbyClowderSummary }) {
  const style = clowder.avatarUrl
    ? { backgroundImage: `url(${clowder.avatarUrl})`, backgroundSize: 'cover' as const, backgroundPosition: 'center' as const }
    : undefined;
  return (
    <span className="catHomeAvatarBubble" style={style}>
      {clowder.avatarUrl ? null : nameInitials(clowder.name)}
    </span>
  );
}

function ClowderCatsTab() {
  const { t } = useI18n();
  return (
    <div className="catHomeLensStub">
      <p>{t(messageKeys.clowderHomeEmptyCats)}</p>
    </div>
  );
}

function ClowderSettingsTab() {
  const { t } = useI18n();
  return (
    <div className="catHomeLensStub">
      <p>{t(messageKeys.clowderHomeSettingsBody)}</p>
    </div>
  );
}

function ClowderNotFound({ clowderId }: { clowderId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="screen screenCentered entityComingSoonScreen">
      <section className="entityComingSoonPanel">
        <div className="entityComingSoonHeader">
          <div>
            <p className="eyebrow">{t(messageKeys.entityDetailBreadcrumbLobby)}</p>
            <h1>{t(messageKeys.clowderHomeNotFoundTitle)}</h1>
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
          {t(messageKeys.clowderHomeNotFoundBody, { clowderId })}
        </p>
      </section>
    </div>
  );
}

export function ClowderHome({ envelope }: { envelope: PlatformHostEnvelope }) {
  const { t } = useI18n();
  const params = useParams();
  const clowderId = params.clowderId ?? '';
  const clowder = findClowder(envelope, clowderId);
  const activeTab: ClowderTab = isClowderTab(params.tab) ? params.tab : 'cats';

  if (!clowder) {
    return <ClowderNotFound clowderId={clowderId} />;
  }

  const tabs = VALID_TABS.map((tab) => ({
    key: tab,
    label: t(TAB_LABEL_KEY[tab]),
    href: `/clowders/${encodeURIComponent(clowder.id)}/${tab}`,
    active: tab === activeTab,
  }));

  const catteryName =
    clowder.parentCatteryId !== null ? findCatteryName(envelope, clowder.parentCatteryId) : null;
  const subtitle =
    clowder.parentCatteryId !== null
      ? t(messageKeys.clowderHomeChipPartOf, {
          catteryName: catteryName ?? clowder.parentCatteryId,
        })
      : t(messageKeys.clowderHomeChipCrossUnit);

  return (
    <EntityDetailPane
      ariaLabel={t(messageKeys.clowderHomeAriaLabel)}
      avatar={<ClowderAvatar clowder={clowder} />}
      title={clowder.name}
      subtitle={subtitle}
      tabs={tabs}
    >
      {activeTab === 'cats' ? <ClowderCatsTab /> : <ClowderSettingsTab />}
    </EntityDetailPane>
  );
}

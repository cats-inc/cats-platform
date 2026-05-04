import { useNavigate, useParams } from 'react-router-dom';

import { EntityDetailPane } from '../../../design/components/EntityDetailPane.js';
import { messageKeys, type MessageKey } from '../../../shared/i18n/index.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type { PlatformHostEnvelope, PlatformLobbyCatterySummary } from '../../../shared/platform-contract.js';
import { useI18n } from '../i18n/index.js';

type CatteryTab = 'members' | 'clowders' | 'cats' | 'settings';

const VALID_TABS: readonly CatteryTab[] = ['members', 'clowders', 'cats', 'settings'];

const TAB_LABEL_KEY: Record<CatteryTab, MessageKey> = {
  members: messageKeys.catteryHomeTabMembers,
  clowders: messageKeys.catteryHomeTabClowders,
  cats: messageKeys.catteryHomeTabCats,
  settings: messageKeys.catteryHomeTabSettings,
};

const TAB_EMPTY_KEY: Record<Exclude<CatteryTab, 'settings'>, MessageKey> = {
  members: messageKeys.catteryHomeEmptyMembers,
  clowders: messageKeys.catteryHomeEmptyClowders,
  cats: messageKeys.catteryHomeEmptyCats,
};

function isCatteryTab(value: string | undefined): value is CatteryTab {
  return typeof value === 'string' && (VALID_TABS as readonly string[]).includes(value);
}

function findCattery(
  envelope: PlatformHostEnvelope,
  catteryId: string,
): PlatformLobbyCatterySummary | null {
  return (envelope.lobby.catteries ?? []).find((candidate) => candidate.id === catteryId) ?? null;
}

function CatteryAvatar({ cattery }: { cattery: PlatformLobbyCatterySummary }) {
  const style = cattery.avatarUrl
    ? { backgroundImage: `url(${cattery.avatarUrl})`, backgroundSize: 'cover' as const, backgroundPosition: 'center' as const }
    : undefined;
  return (
    <span className="catHomeAvatarBubble" style={style}>
      {cattery.avatarUrl ? null : nameInitials(cattery.name)}
    </span>
  );
}

function CatteryEmptyTab({ tab }: { tab: Exclude<CatteryTab, 'settings'> }) {
  const { t } = useI18n();
  return (
    <div className="catHomeLensStub">
      <p>{t(TAB_EMPTY_KEY[tab])}</p>
    </div>
  );
}

function CatterySettingsTab() {
  const { t } = useI18n();
  return (
    <div className="catHomeLensStub">
      <p>{t(messageKeys.catteryHomeSettingsBody)}</p>
    </div>
  );
}

function CatteryNotFound({ catteryId }: { catteryId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="screen screenCentered entityComingSoonScreen">
      <section className="entityComingSoonPanel">
        <div className="entityComingSoonHeader">
          <div>
            <p className="eyebrow">{t(messageKeys.entityDetailBreadcrumbLobby)}</p>
            <h1>{t(messageKeys.catteryHomeNotFoundTitle)}</h1>
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
          {t(messageKeys.catteryHomeNotFoundBody, { catteryId })}
        </p>
      </section>
    </div>
  );
}

export function CatteryHome({ envelope }: { envelope: PlatformHostEnvelope }) {
  const { t } = useI18n();
  const params = useParams();
  const catteryId = params.catteryId ?? '';
  const cattery = findCattery(envelope, catteryId);
  const activeTab: CatteryTab = isCatteryTab(params.tab) ? params.tab : 'members';

  if (!cattery) {
    return <CatteryNotFound catteryId={catteryId} />;
  }

  const tabs = VALID_TABS.map((tab) => ({
    key: tab,
    label: t(TAB_LABEL_KEY[tab]),
    href: `/catteries/${encodeURIComponent(cattery.id)}/${tab}`,
    active: tab === activeTab,
  }));

  return (
    <EntityDetailPane
      ariaLabel={t(messageKeys.catteryHomeAriaLabel)}
      avatar={<CatteryAvatar cattery={cattery} />}
      title={cattery.name}
      tabs={tabs}
    >
      {activeTab === 'settings' ? <CatterySettingsTab /> : <CatteryEmptyTab tab={activeTab} />}
    </EntityDetailPane>
  );
}

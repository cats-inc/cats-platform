import { useParams } from 'react-router-dom';

import { EntityDetailPane } from '../../../design/components/EntityDetailPane.js';
import { messageKeys, type MessageKey } from '../../../shared/i18n/index.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type { PlatformHostEnvelope, PlatformLobbyCatterySummary } from '../../../shared/platform-contract.js';
import { useI18n } from '../i18n/index.js';
import { useDirectory } from './directoryApi.js';
import {
  DirectoryHomeCatList,
  DirectoryHomeClowderList,
  DirectoryHomeState,
  catteryCatRows,
  catteryMemberRows,
} from './DirectoryHomeLists.js';
import { useCatLookup } from './directoryParts.js';

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
    <span className="entityDetailAvatarBubble" style={style}>
      {cattery.avatarUrl ? null : nameInitials(cattery.name)}
    </span>
  );
}

/**
 * Members (direct only), Clowders (its org chart's units) and Cats (everyone
 * reachable, once, SPEC-103 FR-10), read only; the Settings tab changes them.
 */
function CatteryTabContent({
  tab,
  catteryId,
  envelope,
}: {
  tab: Exclude<CatteryTab, 'settings'>;
  catteryId: string;
  envelope: PlatformHostEnvelope;
}) {
  const { t } = useI18n();
  const { state, reload } = useDirectory();
  const catLookup = useCatLookup(envelope.lobby.cats);
  return (
    <DirectoryHomeState state={state} onRetry={() => { void reload(); }}>
      {(directory) => {
        const cattery = directory.catteries.find((candidate) => candidate.id === catteryId);
        const empty = t(TAB_EMPTY_KEY[tab]);
        if (!cattery) return <DirectoryHomeCatList rows={[]} empty={empty} />;
        if (tab === 'clowders') {
          return (
            <DirectoryHomeClowderList
              clowders={directory.clowders.filter((clowder) => clowder.parentCatteryId === cattery.id)}
              empty={empty}
            />
          );
        }
        return (
          <DirectoryHomeCatList
            rows={tab === 'members'
              ? catteryMemberRows(cattery, catLookup, t)
              : catteryCatRows(cattery, directory, catLookup, t)}
            empty={empty}
          />
        );
      }}
    </DirectoryHomeState>
  );
}

function CatteryNotFound({ catteryId }: { catteryId: string }) {
  const { t } = useI18n();
  // No back button here — EntitiesShell's sidebar already carries a
  // `Back to Lobby` primary action.
  return (
    <div className="screen screenCentered entityComingSoonScreen">
      <section className="entityComingSoonPanel">
        <h1>{t(messageKeys.catteryHomeNotFoundTitle)}</h1>
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
    href: `/entities/catteries/${encodeURIComponent(cattery.id)}/${tab}`,
    active: tab === activeTab,
  }));

  return (
    <EntityDetailPane
      ariaLabel={t(messageKeys.catteryHomeAriaLabel)}
      avatar={<CatteryAvatar cattery={cattery} />}
      title={cattery.name}
      tabs={tabs}
    >
      {/* The Settings tab is the Cattery canvas, which App routes ahead of this page. */}
      <CatteryTabContent
        key={activeTab}
        tab={activeTab === 'settings' ? 'members' : activeTab}
        catteryId={cattery.id}
        envelope={envelope}
      />
    </EntityDetailPane>
  );
}

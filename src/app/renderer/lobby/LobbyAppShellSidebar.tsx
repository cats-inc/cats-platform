import { useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';

import { GuideCatDockSlot } from '../../../design/components/GuideCatDockSlot.js';
import { platformSurfaceRoutePrefix } from '../../../core/platformSurface.js';
import { messageKeys } from '../../../shared/i18n/messageKeys.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type {
  PlatformHostEnvelope,
  PlatformSurfaceId,
} from '../../../shared/platform-contract.js';
import {
  resolveRuntimePresentationStatus,
  resolveRuntimeTooltip,
} from '../../../shared/runtimeStatusPresentation.js';
import { useI18n } from '../i18n/index.js';
import {
  ConversationSidebarMyCatsSection,
  type ConversationSidebarMyCatsPlaceholder,
} from '../productShell/ConversationSidebarMyCats.js';
import { ConversationSidebarFooter } from '../productShell/ConversationSidebarFooter.js';
import { ConversationSidebarNavigation } from '../productShell/ConversationSidebarNavigation.js';
import type {
  ConversationSidebarAction,
  ConversationSidebarCat,
  ConversationSidebarChannel,
  ConversationSidebarHelpers,
  ConversationSidebarPayload,
} from '../productShell/ConversationSidebar.js';

/**
 * Sidebar for the Lobby-drill-down workspace shell (entity routes
 * `/cats`, `/clowders`, `/catteries` and their `/:id` / `/:id/:tab`
 * variants).
 *
 * Per the user's IA correction: this sidebar reuses the appshell
 * primitives chat / code / work already use — surface switcher at
 * the top (carries an "Open Lobby" affordance back to /lobby), the
 * shared `ConversationSidebarMyCatsSection` for each lens row, the
 * GuideCatDock slot, and the `ConversationSidebarFooter` identity
 * pill at the bottom — so navigating around entity homes feels
 * continuous with the product surfaces.
 *
 * The middle hosts three lens-style sections instead of the single
 * Direct Messages section the chat product uses:
 *   • MY CATS     — real cats from `envelope.lobby.cats`
 *   • MY CLOWDERS — empty placeholder + "+ New clowder" row until
 *                   PLAN-091 phase 6 storage lands real Clowders
 *   • MY CATTERIES — same shape as Clowders, +New cattery row
 */

const LOBBY_PASSIVE_DOT = 'no_dot';

type LobbyDot = typeof LOBBY_PASSIVE_DOT;

const LOBBY_HELPERS: ConversationSidebarHelpers<
  ConversationSidebarCat,
  ConversationSidebarChannel,
  LobbyDot
> = {
  catInitials: (name: string) => nameInitials(name),
  presentChannelTitle: (title: string) => title,
  isVisibleCat: () => true,
  sortCatsForDisplay: (cats) => cats,
  isDirectLaneSummary: () => false,
  findDirectLaneForCat: () => null,
  resolveMyCatStatusDot: () => LOBBY_PASSIVE_DOT,
  statusDotClassName: () => '',
  statusDotLabel: () => null,
};

function buildSidebarPayload(envelope: PlatformHostEnvelope): {
  payload: ConversationSidebarPayload<ConversationSidebarCat, ConversationSidebarChannel>;
  cats: ConversationSidebarCat[];
  bossCatId: string | null;
} {
  const cats: ConversationSidebarCat[] = envelope.lobby.cats.map((summary) => ({
    id: summary.id,
    name: summary.name,
    status: 'active',
    avatarColor: summary.avatarColor,
    avatarUrl: summary.avatarUrl,
  }));
  const bossCat = envelope.lobby.cats.find((summary) => summary.isBoss);
  const bossCatId = bossCat ? bossCat.id : null;
  const payload: ConversationSidebarPayload<ConversationSidebarCat, ConversationSidebarChannel> = {
    ownerDisplayName: envelope.ownerDisplayName,
    ownerAvatarUrl: envelope.ownerAvatarUrl,
    runtime: envelope.runtime,
    runtimeSetup: envelope.runtimeSetup
      ? { status: envelope.runtimeSetup.status }
      : null,
    chat: {
      bossCatId,
      cats,
      channels: [],
    },
  };
  return { payload, cats, bossCatId };
}

export function LobbyAppShellSidebar({
  envelope,
  sidebarOpen,
  onToggleSidebar,
  onCollapsedSidebarClick,
}: {
  envelope: PlatformHostEnvelope;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onCollapsedSidebarClick: (event: ReactMouseEvent<HTMLElement>) => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const activeCatMatch = useMatch('/cats/:catId/*');
  const activeCatId = activeCatMatch?.params.catId ?? null;

  const { payload, cats, bossCatId } = buildSidebarPayload(envelope);
  const runtimeFooterStatus = resolveRuntimePresentationStatus(payload.runtime);
  const runtimeFooterLabel = resolveRuntimeTooltip(runtimeFooterStatus, t);

  // Surface switcher needs a "current" surface highlight. We are not
  // on a product surface here, so fall back to the user's last
  // product. The switcher's "Open Lobby" affordance is what brings
  // the user back to /lobby (see PlatformSurfaceSwitcher).
  const fallbackSurface: PlatformSurfaceId = envelope.lastProductSurface ?? 'chat';

  const settingsNavState = {
    platformShellSurface: fallbackSurface,
  };

  const onSwitchProduct = (surface: PlatformSurfaceId): void => {
    navigate(platformSurfaceRoutePrefix(surface));
  };

  // Mirrors chat's "+ New chat" slot: primary action with hover but
  // no `active` highlight (the bare /lobby route never lives inside
  // EntitiesShell, so this button could not be the "current" surface
  // anyway). Click navigates to `/lobby`, which renders the unframed
  // landing page — no sidebar at all — by virtue of falling outside
  // the EntitiesShell <Route element=> wrapper.
  const primaryActions: readonly ConversationSidebarAction[] = [
    {
      key: 'lobby-main-page',
      label: t(messageKeys.lobbySidebarMainPage),
      onClick: () => navigate('/lobby'),
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 7l6-5 6 5" />
          <path d="M3.5 7v6h9V7" />
          <path d="M6.5 13v-3h3v3" />
        </svg>
      ),
    },
  ];

  const catsPlaceholder: ConversationSidebarMyCatsPlaceholder = {
    label: t(messageKeys.lobbySidebarNewCat),
    /* Mirrors the chat sidebar's "+ New cat" affordance — the
     * canonical add-cat flow lives at `/settings/cats/new` (see
     * `useWorkspaceAppNavigationActions.onCreateNewCat`). We carry
     * the same `platformShellSurface` nav state so the settings
     * pane knows which surface chrome to wrap itself in on return. */
    onClick: () =>
      navigate('/settings/cats/new', { state: settingsNavState }),
    iconKind: 'singlePerson',
  };
  /* Clowders / Catteries don't have an add route yet (PLAN-091 phase
   * 6 only landed read-only entity homes). Pass `undefined` so the
   * placeholder renders as a static, non-interactive row instead of
   * a noop button — clearer UX than a click affordance that does
   * nothing. Add routes will land in a later phase. */
  const clowdersPlaceholder: ConversationSidebarMyCatsPlaceholder = {
    label: t(messageKeys.lobbySidebarNewClowder),
    iconKind: 'groupPeople',
  };
  const catteriesPlaceholder: ConversationSidebarMyCatsPlaceholder = {
    label: t(messageKeys.lobbySidebarNewCattery),
    iconKind: 'orgChart',
  };

  return (
    <aside
      className={sidebarOpen ? 'sidebar' : 'sidebar sidebarCollapsed'}
      data-shell-surface="lobby"
      onClick={onCollapsedSidebarClick}
    >
      <div className="sidebarInner">
        <ConversationSidebarNavigation
          activeSurface={fallbackSurface}
          sidebarOpen={sidebarOpen}
          primaryActions={primaryActions}
          onToggleSidebar={onToggleSidebar}
          onSwitchProduct={onSwitchProduct}
          surfaceLabelOverride={t(messageKeys.entitiesShellSurfaceLabel)}
        />

        <div className="sidebarScrollable">
          {/* The three sections inherit the same MyCatsSection
           * primitive chat / code / work use, but each carries a
           * `data-lens-kind` so the original per-product placeholder
           * tints (chat orange / code green / work blue) survive into
           * the Lobby drill-down sidebar — see extras.css. */}
          <div data-lens-kind="cats">
            <ConversationSidebarMyCatsSection
              label={t(messageKeys.lobbySidebarSectionCats)}
              cats={cats}
              bossCatId={bossCatId}
              payloadChannels={[]}
              activeMyCatId={activeCatId}
              telegramBoundCatIds={new Set()}
              helpers={LOBBY_HELPERS}
              overflowMenuOpenId={null}
              onOverflowMenuToggle={() => undefined}
              onDirectChatCat={(catId) =>
                navigate(`/cats/${encodeURIComponent(catId)}`)
              }
              onArchiveCat={() => undefined}
              emptyStatePlaceholder={catsPlaceholder}
            />
          </div>

          <div data-lens-kind="clowders">
            <ConversationSidebarMyCatsSection
              label={t(messageKeys.lobbySidebarSectionClowders)}
              cats={[]}
              bossCatId={null}
              payloadChannels={[]}
              activeMyCatId={null}
              telegramBoundCatIds={new Set()}
              helpers={LOBBY_HELPERS}
              overflowMenuOpenId={null}
              onOverflowMenuToggle={() => undefined}
              onDirectChatCat={() => undefined}
              onArchiveCat={() => undefined}
              emptyStatePlaceholder={clowdersPlaceholder}
            />
          </div>

          <div data-lens-kind="catteries">
            <ConversationSidebarMyCatsSection
              label={t(messageKeys.lobbySidebarSectionCatteries)}
              cats={[]}
              bossCatId={null}
              payloadChannels={[]}
              activeMyCatId={null}
              telegramBoundCatIds={new Set()}
              helpers={LOBBY_HELPERS}
              overflowMenuOpenId={null}
              onOverflowMenuToggle={() => undefined}
              onDirectChatCat={() => undefined}
              onArchiveCat={() => undefined}
              emptyStatePlaceholder={catteriesPlaceholder}
            />
          </div>
        </div>
      </div>

      <GuideCatDockSlot slotKind="workspace" />

      <ConversationSidebarFooter
        payload={payload}
        accountMenuOpen={false}
        accountMenuRef={accountMenuRef}
        runtimeFooterStatus={runtimeFooterStatus}
        runtimeFooterLabel={runtimeFooterLabel}
        onAccountMenuToggle={() => undefined}
        onNavigateSettings={() =>
          navigate('/settings/general', { state: settingsNavState })
        }
        onNavigateRuntime={() =>
          navigate('/settings/runtime', { state: settingsNavState })
        }
        catInitials={nameInitials}
      />
    </aside>
  );
}

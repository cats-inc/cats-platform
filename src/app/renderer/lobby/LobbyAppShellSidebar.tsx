import { useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';

import { GuideCatDockSlot } from '../../../design/components/GuideCatDockSlot.js';
import { platformSurfaceRoutePrefix } from '../../../core/platformSurface.js';
import { messageKeys } from '../../../shared/i18n/messageKeys.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import { buildMyCatPathForPrefix } from '../productShell/myCatNavigation.js';
import { updateCatProfile } from '../../../products/shared/renderer/api/chat.js';
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
import { useSidebarOverflowMenuDismiss } from '../productShell/useSidebarOverflowMenuDismiss.js';
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

interface LobbyCat extends ConversationSidebarCat {
  createdAt: string;
}

const LOBBY_HELPERS: ConversationSidebarHelpers<
  LobbyCat,
  ConversationSidebarChannel,
  LobbyDot
> = {
  catInitials: (name: string) => nameInitials(name),
  presentChannelTitle: (title: string) => title,
  isVisibleCat: () => true,
  /* Boss-first ordering, then `createdAt` ascending so older cats
   * appear higher. Matches `sortLobbyCatsForDisplay` on the lobby
   * main-page card. */
  sortCatsForDisplay: (cats, options) => {
    const bossId = Array.isArray(options.bossCatIds)
      ? options.bossCatIds[0] ?? null
      : options.bossCatIds ?? null;
    return [...cats].sort((left, right) => {
      const leftRank = left.id === bossId ? 0 : 1;
      const rightRank = right.id === bossId ? 0 : 1;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.createdAt.localeCompare(right.createdAt);
    });
  },
  isDirectLaneSummary: () => false,
  findDirectLaneForCat: () => null,
  resolveMyCatStatusDot: () => LOBBY_PASSIVE_DOT,
  statusDotClassName: () => '',
  statusDotLabel: () => null,
};

function buildSidebarPayload(envelope: PlatformHostEnvelope): {
  payload: ConversationSidebarPayload<LobbyCat, ConversationSidebarChannel>;
  cats: LobbyCat[];
  bossCatId: string | null;
} {
  const cats: LobbyCat[] = envelope.lobby.cats.map((summary) => ({
    id: summary.id,
    name: summary.name,
    status: 'active',
    avatarColor: summary.avatarColor,
    avatarUrl: summary.avatarUrl,
    createdAt: summary.createdAt,
  }));
  const bossCat = envelope.lobby.cats.find((summary) => summary.isBoss);
  const bossCatId = bossCat ? bossCat.id : null;
  const payload: ConversationSidebarPayload<LobbyCat, ConversationSidebarChannel> = {
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
  const [overflowMenuOpenId, setOverflowMenuOpenId] = useState<string | null>(
    null,
  );
  // Outside-click dismissal for the row "..." popover. Same behaviour
  // chat / code / work get from `useAppChrome` — extracted into a
  // shared hook so this lobby sidebar doesn't reinvent it.
  useSidebarOverflowMenuDismiss(overflowMenuOpenId, setOverflowMenuOpenId);

  const activeCatMatch = useMatch('/cats/:catId/*');
  const activeCatId = activeCatMatch?.params.catId ?? null;
  // Cats / Clowders / Catteries nav items light up while the user is
  // anywhere under that entity's path tree — same pattern Cats Work
  // uses for its `/work/projects` nav item (`isWorkProjectsPath` =
  // `pathname.startsWith(WORK_PROJECTS_PATH)`).
  const currentPath = useLocation().pathname;
  const isCatsRoute = currentPath === '/cats' || currentPath.startsWith('/cats/');
  const isClowdersRoute = currentPath === '/clowders' || currentPath.startsWith('/clowders/');
  const isCatteriesRoute = currentPath === '/catteries' || currentPath.startsWith('/catteries/');

  const { payload, cats, bossCatId } = buildSidebarPayload(envelope);

  /* Archive flow for the row's three-dots → Archive popover. Mirrors
   * the chat sidebar's `onArchiveCat`, but without the workspace
   * payload state container the chat product wraps around it: we
   * confirm with a native dialog, hit `PATCH /api/cats/:id` with
   * `{ archive: true }`, and then `location.reload()` so the
   * platform host's envelope refreshes and the cat drops out of the
   * MY CATS list. Imperfect, but matches the user's "popover should
   * still archive" expectation without rebuilding the chat product's
   * busy/feedback machinery here. */
  const onArchiveCat = async (catId: string): Promise<void> => {
    const cat = envelope.lobby.cats.find((entry) => entry.id === catId);
    const catName = cat?.name ?? catId;
    const confirmed = window.confirm(
      t(messageKeys.sharedSettingsCatsArchiveWithTelegramConfirmMessage, {
        catName,
      }),
    );
    if (!confirmed) return;
    try {
      await updateCatProfile(catId, { archive: true });
    } catch {
      // Surface a minimal error — the platform-level state container
      // for richer toasts isn't available from this sidebar.
      window.alert(t(messageKeys.sharedSettingsCatsArchiveError));
      return;
    }
    window.location.reload();
  };
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
  // Top primary actions stay in the fixed header — only Main page
   // belongs there. The Cats / Clowders / Catteries nav items live
   // inside the scrollable area below, paired with their own cat
   // list (mirrors Cats Work's "Projects" nav item + pinned project
   // rows pattern).
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

  const catsNavIcon = (
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
      <circle cx="8" cy="6" r="2.5" />
      <path d="M3 13.5a5 5 0 0 1 10 0" />
    </svg>
  );

  const clowdersNavIcon = (
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
      <circle cx="5" cy="6" r="2" />
      <circle cx="11" cy="6" r="2" />
      <path d="M2 13a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3" />
    </svg>
  );

  const catteriesNavIcon = (
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
      <rect x="6" y="2" width="4" height="3" rx="0.5" />
      <rect x="1" y="11" width="4" height="3" rx="0.5" />
      <rect x="11" y="11" width="4" height="3" rx="0.5" />
      <path d="M8 5v3" />
      <path d="M3 8h10" />
      <path d="M3 8v3" />
      <path d="M13 8v3" />
    </svg>
  );

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
          {/* Each lens kind groups a `.navItem` button (Cats /
           * Clowders / Catteries — same nav-item visual Cats Work uses
           * for "Projects") with the per-kind `ConversationSidebarMyCatsSection`
           * underneath, so the entity rows hang under their nav
           * header like pinned project rows hang under "Projects". */}
          <nav className="navGroup" data-lens-kind="cats">
            <button
              type="button"
              className={isCatsRoute ? 'navItem navItemActive' : 'navItem'}
              onClick={() => navigate('/cats')}
            >
              <span className="navGlyph" aria-hidden="true">{catsNavIcon}</span>
              <span className="navLabel">
                {t(messageKeys.lobbySidebarSectionCats)}
              </span>
            </button>
            <ConversationSidebarMyCatsSection
              hideLabel
              cats={cats}
              bossCatId={bossCatId}
              payloadChannels={[]}
              activeMyCatId={activeCatId}
              telegramBoundCatIds={new Set()}
              helpers={LOBBY_HELPERS}
              overflowMenuOpenId={overflowMenuOpenId}
              onOverflowMenuToggle={setOverflowMenuOpenId}
              onDirectChatCat={(catId) =>
                navigate(`/cats/${encodeURIComponent(catId)}`)
              }
              onArchiveCat={(catId) => {
                void onArchiveCat(catId);
              }}
              emptyStatePlaceholder={catsPlaceholder}
              onDirectMessageCat={(catId) =>
                navigate(
                  buildMyCatPathForPrefix(
                    platformSurfaceRoutePrefix('chat'),
                    catId,
                  ),
                )
              }
            />
          </nav>

          <nav className="navGroup" data-lens-kind="clowders">
            <button
              type="button"
              className={isClowdersRoute ? 'navItem navItemActive' : 'navItem'}
              onClick={() => navigate('/clowders')}
            >
              <span className="navGlyph" aria-hidden="true">{clowdersNavIcon}</span>
              <span className="navLabel">
                {t(messageKeys.lobbySidebarSectionClowders)}
              </span>
            </button>
            <ConversationSidebarMyCatsSection
              hideLabel
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
          </nav>

          <nav className="navGroup" data-lens-kind="catteries">
            <button
              type="button"
              className={isCatteriesRoute ? 'navItem navItemActive' : 'navItem'}
              onClick={() => navigate('/catteries')}
            >
              <span className="navGlyph" aria-hidden="true">{catteriesNavIcon}</span>
              <span className="navLabel">
                {t(messageKeys.lobbySidebarSectionCatteries)}
              </span>
            </button>
            <ConversationSidebarMyCatsSection
              hideLabel
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
          </nav>
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

import { useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { GuideCatDockSlot } from '../../../design/components/GuideCatDockSlot.js';
import { messageKeys } from '../../../shared/i18n/messageKeys.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';
import {
  resolveRuntimePresentationStatus,
  resolveRuntimeTooltip,
} from '../../../shared/runtimeStatusPresentation.js';
import { useI18n } from '../i18n/index.js';
import { ConversationSidebarFooter } from '../productShell/ConversationSidebarFooter.js';
import type {
  ConversationSidebarPayload,
  ConversationSidebarChannel,
  ConversationSidebarCat,
} from '../productShell/ConversationSidebar.js';
import { isDesktopEnvironment } from '../../../shared/desktopRecoveryBridge.js';
import { buildPlatformSettingsProductEntries } from './PlatformSettingsShell.js';
import { getSettingsExitDelta } from './settingsExitMemory.js';

/**
 * Sidebar for `/settings/*`. Mirrors `EntitiesAppShellSidebar`'s
 * shape exactly — same `.brandRow` chrome (circular `surfaceExitButton`
 * + plain "Settings" label + `chromeButton` collapse toggle), same
 * scrollable middle, same `GuideCatDockSlot` + `ConversationSidebarFooter`
 * — so width / collapse / footer behaviour stays identical to Cats
 * Directory and the product surfaces.
 *
 * The middle hosts settings section nav items (General, Cats group
 * containing My Cats / Assistants, per-product settings, Apps, Desktop,
 * Runtime, Data). The active section highlight is derived from the
 * current pathname so deep links (e.g. `/settings/runtime`) light up
 * the right row on first render.
 *
 * Earlier revisions rendered these sections as `.settingsTab` buttons
 * inside an in-canvas `.settingsSidebar`, nested inside the active
 * product's chrome. That nesting is gone; the section nav is now part
 * of the app-shell sidebar, and the canvas hosts only the section's
 * body content.
 */

function buildSidebarPayload(envelope: PlatformHostEnvelope): {
  payload: ConversationSidebarPayload<ConversationSidebarCat, ConversationSidebarChannel>;
} {
  const payload: ConversationSidebarPayload<ConversationSidebarCat, ConversationSidebarChannel> = {
    ownerDisplayName: envelope.ownerDisplayName,
    ownerAvatarUrl: envelope.ownerAvatarUrl,
    runtime: envelope.runtime,
    runtimeSetup: envelope.runtimeSetup
      ? { status: envelope.runtimeSetup.status }
      : null,
    chat: {
      bossCatId: null,
      cats: [],
      channels: [],
    },
  };
  return { payload };
}

export function SettingsAppShellSidebar({
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
  const showDesktop = isDesktopEnvironment();
  const productEntries = buildPlatformSettingsProductEntries(envelope.products, t);
  const currentPath = useLocation().pathname;

  // Mirror Settings's existing exit-memory semantics: jump straight
  // back to the surface the user came from via history-delta, falling
  // back to /lobby (replace) on cold mount where no entry memory
  // exists. The same logic used to live on the canvas-top-right ×
  // close button; promoting Settings to its own surface let us move
  // it to the sidebar's `.surfaceExitButton`, consistent with Cats
  // Directory.
  const onLeaveSettings = useCallback(() => {
    const historyState = window.history.state as { idx?: number } | null;
    const delta = getSettingsExitDelta(historyState?.idx);
    if (delta !== null) {
      navigate(delta);
    } else {
      navigate('/lobby', { replace: true });
    }
  }, [navigate]);

  const isSection = (sectionPath: string): boolean =>
    currentPath === sectionPath || currentPath.startsWith(`${sectionPath}/`);
  // `/settings/cats` is the temporary holdout while cat creation lives
  // here; the allow-list mirrors `isCatsSettingsSectionPath` in
  // PlatformSettingsRoutes so the highlight stays accurate.
  const isCatsRoute = currentPath === '/settings/cats' || currentPath === '/settings/cats/new';
  const isAssistantsRoute = isSection('/settings/assistants');

  const { payload } = buildSidebarPayload(envelope);
  const runtimeFooterStatus = resolveRuntimePresentationStatus(payload.runtime);
  const runtimeFooterLabel = resolveRuntimeTooltip(runtimeFooterStatus, t);

  const navItemClass = (active: boolean): string =>
    active ? 'navItem navItemActive' : 'navItem';

  return (
    <aside
      className={sidebarOpen ? 'sidebar' : 'sidebar sidebarCollapsed'}
      data-shell-surface="settings"
      onClick={onCollapsedSidebarClick}
    >
      <div className="sidebarInner">
        <div className="brandRow">
          <div className="brandCopy settingsBrandCopy">
            <button
              type="button"
              className="surfaceExitButton"
              aria-label={t(messageKeys.settingsShellCloseButtonLabel)}
              onClick={onLeaveSettings}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 3L5 8l5 5" />
              </svg>
            </button>
            <span className="brandLabel settingsBrandLabel">
              {t(messageKeys.settingsShellHeading)}
            </span>
          </div>
          <button
            className="chromeButton"
            type="button"
            aria-label={
              sidebarOpen
                ? t(messageKeys.conversationSidebarCloseSidebarLabel)
                : t(messageKeys.conversationSidebarOpenSidebarLabel)
            }
            onClick={onToggleSidebar}
          >
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
              <rect x="1" y="2" width="14" height="12" rx="2" />
              <path d="M6 2v12" />
            </svg>
          </button>
        </div>

        <div className="sidebarScrollable">
          <nav className="navGroup">
            <button
              type="button"
              className={navItemClass(isSection('/settings/general'))}
              onClick={() => navigate('/settings/general')}
            >
              <span className="navLabel">
                {t(messageKeys.settingsShellSectionGeneral)}
              </span>
            </button>
          </nav>

          <p className="settingsSidebarGroupHeading">
            {t(messageKeys.settingsShellSectionCats)}
          </p>
          <nav className="navGroup settingsSidebarGroupNav">
            <button
              type="button"
              className={navItemClass(isCatsRoute)}
              onClick={() => navigate('/settings/cats')}
            >
              <span className="navLabel">
                {t(messageKeys.settingsShellSubsectionMyCats)}
              </span>
            </button>
            <button
              type="button"
              className={navItemClass(isAssistantsRoute)}
              onClick={() => navigate('/settings/assistants')}
            >
              <span className="navLabel">
                {t(messageKeys.settingsShellSubsectionAssistants)}
              </span>
            </button>
          </nav>

          {productEntries.length > 0 ? (
            <nav className="navGroup">
              {productEntries.map((entry) => (
                <button
                  key={`${entry.productId}:${entry.id}`}
                  type="button"
                  className={navItemClass(isSection(entry.path))}
                  onClick={() => navigate(entry.path)}
                >
                  <span className="navLabel">{entry.label}</span>
                </button>
              ))}
            </nav>
          ) : null}

          <nav className="navGroup">
            <button
              type="button"
              className={navItemClass(isSection('/settings/apps'))}
              onClick={() => navigate('/settings/apps')}
            >
              <span className="navLabel">
                {t(messageKeys.settingsShellSectionApps)}
              </span>
            </button>
            {showDesktop ? (
              <button
                type="button"
                className={navItemClass(isSection('/settings/desktop'))}
                onClick={() => navigate('/settings/desktop')}
              >
                <span className="navLabel">
                  {t(messageKeys.settingsShellSectionDesktop)}
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className={navItemClass(isSection('/settings/runtime'))}
              onClick={() => navigate('/settings/runtime')}
            >
              <span className="navLabel">
                {t(messageKeys.settingsShellSectionRuntime)}
              </span>
            </button>
            <button
              type="button"
              className={navItemClass(isSection('/settings/data'))}
              onClick={() => navigate('/settings/data')}
            >
              <span className="navLabel">
                {t(messageKeys.settingsShellSectionData)}
              </span>
            </button>
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
        // Settings is its own surface — clicking the footer's identity
        // pill is a no-op (we're already here). Same for the runtime
        // status chip; deep-linking to a sub-section while already
        // inside Settings doesn't add value.
        onNavigateSettings={() => undefined}
        onNavigateRuntime={() => navigate('/settings/runtime')}
        catInitials={nameInitials}
      />
    </aside>
  );
}

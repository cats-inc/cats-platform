import type { RefObject } from 'react';

import {
  resolveRuntimeDotClassName,
  type RuntimePresentationStatus,
} from '../../../shared/runtimeStatusPresentation.js';
import type {
  ConversationSidebarCat,
  ConversationSidebarChannel,
  ConversationSidebarPayload,
} from './ConversationSidebar.js';

export function ConversationSidebarFooter<
  TCat extends ConversationSidebarCat,
  TChannel extends ConversationSidebarChannel,
>({
  payload,
  accountMenuRef,
  runtimeFooterStatus,
  runtimeFooterLabel,
  onNavigateSettings,
  onNavigateRuntime,
  catInitials,
  // Popup-menu state props. Unused while the popup is disabled (see the
  // preservation comment at the bottom of the file); kept in the prop
  // shape so parents don't need to rewire when the menu comes back.
  accountMenuOpen: _accountMenuOpen,
  onAccountMenuToggle: _onAccountMenuToggle,
}: {
  payload: ConversationSidebarPayload<TCat, TChannel>;
  accountMenuOpen: boolean;
  accountMenuRef: RefObject<HTMLDivElement>;
  runtimeFooterStatus: RuntimePresentationStatus;
  runtimeFooterLabel: string;
  onAccountMenuToggle: () => void;
  onNavigateSettings: () => void;
  onNavigateRuntime: () => void;
  catInitials: (name: string) => string;
}) {
  return (
    <div className="sidebarFooter" ref={accountMenuRef}>
      <button
        type="button"
        className="sidebarFooterMainButton"
        onClick={onNavigateSettings}
        aria-label="Open account settings"
      >
        <div
          className="profileBadge"
          style={payload.ownerAvatarUrl
            ? {
                backgroundImage: `url(${payload.ownerAvatarUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined}
        >
          {payload.ownerAvatarUrl ? null : catInitials(payload.ownerDisplayName)}
        </div>
        <div className="sidebarFooterMeta">
          <strong>{payload.ownerDisplayName}</strong>
        </div>
      </button>
      <button
        type="button"
        className="sidebarFooterTrailing"
        onClick={onNavigateRuntime}
        aria-label={`Runtime status: ${runtimeFooterLabel}`}
        data-tooltip={runtimeFooterLabel}
      >
        <span
          className={resolveRuntimeDotClassName(runtimeFooterStatus)}
          aria-hidden="true"
        />
        <span className="sidebarFooterRuntimeLink" aria-hidden="true">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 3h8v8" />
            <path d="M13 3 4 12" />
          </svg>
        </span>
      </button>
    </div>
  );
}

/* ─── Preserved: popup-menu variant (re-enable in a later release) ─────
 *
 * Earlier versions opened a two-item popup menu (Settings / Environment)
 * when the footer was clicked. We are temporarily replacing it with
 * split-click routing: a dedicated trailing <button> navigates to
 * /settings/runtime; the main row <button> navigates to /settings/general.
 * Two sibling buttons (instead of one outer button with click-target
 * detection) give keyboard users an independent Tab stop and Enter /
 * Space activation for the runtime entry. Keep this block here so
 * restoring the menu is a mechanical swap.
 *
 * To re-enable:
 *  1. Re-add the imports used below:
 *       import { AccountIdentityMenu } from '../../../design/components/AccountIdentityMenu.js';
 *       import { executeEnvironmentRecovery } from '../../../shared/environmentRecoveryAction.js';
 *  2. Drop the two-button <div> + both click handlers above.
 *  3. Un-prefix the `_accountMenuOpen` / `_onAccountMenuToggle`
 *     destructured props and restore the toggle helper:
 *
 *       function handleAccountMenuOpenChange(nextOpen: boolean): void {
 *         if (nextOpen !== accountMenuOpen) {
 *           onAccountMenuToggle();
 *         }
 *       }
 *  4. Replace the returned <div> with:
 *
 *       <AccountIdentityMenu
 *         open={accountMenuOpen}
 *         onOpenChange={handleAccountMenuOpenChange}
 *         onNavigateSettings={onNavigateSettings}
 *         onNavigateEnvironment={() => {
 *           void executeEnvironmentRecovery({
 *             runtimeStatus: runtimeFooterStatus,
 *             runtimeSetupStatus: payload.runtimeSetup?.status,
 *           });
 *         }}
 *         containerClassName="sidebarFooter"
 *         triggerClassName="sidebarFooterButton"
 *         menuWidth="trigger"
 *         rootRef={accountMenuRef}
 *         avatar={<div className="profileBadge" style={…}>…</div>}
 *         meta={<div className="sidebarFooterMeta"><strong>…</strong></div>}
 *         statusIndicator={
 *           <span
 *             className={resolveRuntimeDotClassName(runtimeFooterStatus)}
 *             data-tooltip={runtimeFooterLabel}
 *             aria-label={runtimeFooterLabel}
 *           />
 *         }
 *       />
 */

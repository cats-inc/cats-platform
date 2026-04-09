import type { RefObject } from 'react';

import { AccountIdentityMenu } from '../../../design/components/AccountIdentityMenu.js';
import { executeEnvironmentRecovery } from '../../../shared/environmentRecoveryAction.js';
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
  accountMenuOpen,
  accountMenuRef,
  runtimeFooterStatus,
  runtimeFooterLabel,
  onAccountMenuToggle,
  onNavigateSettings,
  catInitials,
}: {
  payload: ConversationSidebarPayload<TCat, TChannel>;
  accountMenuOpen: boolean;
  accountMenuRef: RefObject<HTMLDivElement>;
  runtimeFooterStatus: RuntimePresentationStatus;
  runtimeFooterLabel: string;
  onAccountMenuToggle: () => void;
  onNavigateSettings: () => void;
  catInitials: (name: string) => string;
}) {
  function handleAccountMenuOpenChange(nextOpen: boolean): void {
    if (nextOpen !== accountMenuOpen) {
      onAccountMenuToggle();
    }
  }

  return (
    <AccountIdentityMenu
      open={accountMenuOpen}
      onOpenChange={handleAccountMenuOpenChange}
      onNavigateSettings={onNavigateSettings}
      onNavigateEnvironment={() => {
        void executeEnvironmentRecovery({
          runtimeStatus: runtimeFooterStatus,
          runtimeBaseUrl: payload.runtime.baseUrl,
          runtimeSetupStatus: payload.runtimeSetup?.status,
        });
      }}
      containerClassName="sidebarFooter"
      triggerClassName="sidebarFooterButton"
      menuWidth="trigger"
      rootRef={accountMenuRef}
      avatar={(
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
      )}
      meta={(
        <div className="sidebarFooterMeta">
          <strong>{payload.ownerDisplayName}</strong>
        </div>
      )}
      statusIndicator={(
        <span
          className={resolveRuntimeDotClassName(runtimeFooterStatus)}
          data-tooltip={runtimeFooterLabel}
          aria-label={runtimeFooterLabel}
        />
      )}
    />
  );
}

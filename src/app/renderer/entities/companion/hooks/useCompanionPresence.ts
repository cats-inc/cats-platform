import { useMemo } from 'react';

import type { AppShellPayload } from '../../../../../products/chat/api/contracts.js';
import type { CompanionPresenceState } from '../../../../../products/chat/renderer/companionViewTypes.js';
import {
  chatLifecycleClassName,
  chatLifecycleLabel,
  resolveChatLifecycleState,
} from '../../../../../products/chat/shared/lifecycle.js';
import { useI18n } from '../../../i18n/useI18n.js';

export interface CompanionPresenceInfo {
  presence: CompanionPresenceState;
  label: string;
  className: string;
  canWake: boolean;
  canSleep: boolean;
}

export function useCompanionPresence(
  catId: string,
  payload: AppShellPayload,
): CompanionPresenceInfo {
  const { t } = useI18n();

  return useMemo(() => {
    const directLane = payload.chat.channels.find(
      (channel) =>
        channel.channelKind === 'direct_lane'
        && channel.defaultRecipientCatId === catId,
    );

    if (!directLane) {
      return {
        presence: 'sleeping' as CompanionPresenceState,
        label: chatLifecycleLabel('sleeping', t),
        className: 'isSleeping',
        canWake: true,
        canSleep: false,
      };
    }

    const sessionStatus = directLane.defaultRecipientLeaseStatus ?? null;
    const lifecycle = resolveChatLifecycleState(sessionStatus);

    return {
      presence: lifecycle as CompanionPresenceState,
      label: chatLifecycleLabel(lifecycle, t),
      className: chatLifecycleClassName(lifecycle),
      canWake: lifecycle === 'sleeping' || lifecycle === 'error',
      canSleep: lifecycle === 'awake',
    };
  }, [catId, payload.chat.channels, t]);
}

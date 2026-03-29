import { useMemo } from 'react';

import type { AppShellPayload } from '../../api/contracts.js';
import type { CompanionPresenceState } from '../companionViewTypes.js';
import {
  chatLifecycleClassName,
  chatLifecycleLabel,
  resolveChatLifecycleState,
} from '../../shared/lifecycle.js';

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
  return useMemo(() => {
    const directLane = payload.chat.channels.find(
      (channel) =>
        channel.channelKind === 'direct_lane'
        && channel.leadCatId === catId,
    );

    if (!directLane) {
      return {
        presence: 'sleeping' as CompanionPresenceState,
        label: 'Sleeping',
        className: 'isSleeping',
        canWake: true,
        canSleep: false,
      };
    }

    const sessionStatus = directLane.leadParticipantLeaseStatus ?? null;
    const lifecycle = resolveChatLifecycleState(sessionStatus);

    return {
      presence: lifecycle as CompanionPresenceState,
      label: chatLifecycleLabel(lifecycle),
      className: chatLifecycleClassName(lifecycle),
      canWake: lifecycle === 'sleeping' || lifecycle === 'error',
      canSleep: lifecycle === 'awake',
    };
  }, [catId, payload.chat.channels]);
}

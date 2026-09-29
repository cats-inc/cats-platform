import { useMemo } from 'react';

import type { AppShellPayload } from '../../../../../products/chat/api/contracts.js';
import type { CompanionPresenceState } from '../../../../../products/chat/renderer/companionViewTypes.js';
import type { MessageKey } from '../../../../../shared/i18n/index.js';
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
  /** Presence lives on the direct lane's session; without a lane there is nothing to wake. */
  needsDirectLane: boolean;
}

/** A wake or sleep request that is still in flight on this page. */
export type CompanionPresencePending = 'wake' | 'sleep' | null;

export function resolveCompanionPresence(input: {
  catId: string;
  channels: AppShellPayload['chat']['channels'];
  pending: CompanionPresencePending;
  t: (key: MessageKey) => string;
}): CompanionPresenceInfo {
  const directLane = input.channels.find(
    (channel) =>
      channel.channelKind === 'direct_message'
      && channel.defaultRecipientCatId === input.catId,
  );
  const lifecycle = directLane
    ? resolveChatLifecycleState(directLane.defaultRecipientLeaseStatus ?? null)
    : 'sleeping';
  // A wake in flight reads as waking up; a sleep in flight keeps the current label.
  const presence = input.pending === 'wake' ? 'waking_up' : lifecycle;

  return {
    presence: presence as CompanionPresenceState,
    label: chatLifecycleLabel(presence, input.t),
    className: chatLifecycleClassName(presence),
    canWake: Boolean(directLane) && input.pending === null
      && (lifecycle === 'sleeping' || lifecycle === 'error'),
    canSleep: Boolean(directLane) && input.pending === null && lifecycle === 'awake',
    needsDirectLane: !directLane,
  };
}

export function useCompanionPresence(
  catId: string,
  payload: AppShellPayload,
  pending: CompanionPresencePending = null,
): CompanionPresenceInfo {
  const { t } = useI18n();

  return useMemo(
    () => resolveCompanionPresence({ catId, channels: payload.chat.channels, pending, t }),
    [catId, payload.chat.channels, pending, t],
  );
}

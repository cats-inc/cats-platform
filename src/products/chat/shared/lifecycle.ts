import { createTranslator, messageKeys, type MessageKey } from '../../../shared/i18n/index.js';

export type ChatLifecycleState = 'sleeping' | 'waking_up' | 'awake' | 'error';

type TranslateMessage = (key: MessageKey) => string;

const defaultTranslator = createTranslator('en');

export function resolveChatLifecycleState(
  status: string | null | undefined,
): ChatLifecycleState {
  switch (status) {
    case 'ready':
      return 'awake';
    case 'initializing':
      return 'waking_up';
    case 'error':
      return 'error';
    default:
      return 'sleeping';
  }
}

export function chatLifecycleLabelKey(state: ChatLifecycleState): MessageKey {
  switch (state) {
    case 'awake':
      return messageKeys.chatLifecycleAwakeLabel;
    case 'waking_up':
      return messageKeys.chatLifecycleWakingUpLabel;
    case 'error':
      return messageKeys.chatLifecycleNeedsAttentionLabel;
    default:
      return messageKeys.chatLifecycleSleepingLabel;
  }
}

export function chatLifecycleLabel(
  state: ChatLifecycleState,
  t: TranslateMessage = defaultTranslator,
): string {
  return t(chatLifecycleLabelKey(state));
}

export function chatLifecycleClassName(state: ChatLifecycleState): string {
  switch (state) {
    case 'awake':
      return 'isAwake';
    case 'waking_up':
      return 'isWaking';
    case 'error':
      return 'isErrored';
    default:
      return 'isSleeping';
  }
}

export type ChatLifecycleState = 'sleeping' | 'waking_up' | 'awake';

export function resolveChatLifecycleState(
  status: string | null | undefined,
): ChatLifecycleState {
  switch (status) {
    case 'ready':
      return 'awake';
    case 'initializing':
      return 'waking_up';
    default:
      return 'sleeping';
  }
}

export function chatLifecycleLabel(state: ChatLifecycleState): string {
  switch (state) {
    case 'awake':
      return 'Awake';
    case 'waking_up':
      return 'Waking up';
    default:
      return 'Sleeping';
  }
}

export function chatLifecycleClassName(state: ChatLifecycleState): string {
  switch (state) {
    case 'awake':
      return 'isAwake';
    case 'waking_up':
      return 'isWaking';
    default:
      return 'isSleeping';
  }
}

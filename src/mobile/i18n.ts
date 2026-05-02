export type MobileLocale = 'en' | 'zh-TW';
export type MobileProductMode = 'chat' | 'code' | 'work';

export interface MobileLobbyCopy {
  connectDesktopTitle: string;
  connectDesktopBody: string;
  couldNotLoadLobbyTitle: string;
  emptyRecentActivity: string;
  lobbyTitle: string;
  openSettingsAction: string;
  quickEntryTitle: string;
  recentActivityTitle: string;
  quickEntryChat: string;
  quickEntryCode: string;
  quickEntryWork: string;
  statActiveConversations: string;
  statCats: string;
  statUnread: string;
  todayLabel: (input: { weekday: string; isoDate: string }) => string;
  unreadTotal: (count: number) => string;
  justNow: string;
}

export interface MobileChatCopy {
  channelNotFoundBody: string;
  channelNotFoundTitle: string;
  connectDesktopBody: string;
  connectDesktopTitle: string;
  couldNotLoadMessagesTitle: string;
  emptyMessages: string;
  retryAction: string;
  sendAction: string;
  composerPlaceholder: Record<MobileProductMode, string>;
  productLabel: Record<MobileProductMode, string>;
}

const MOBILE_LOBBY_COPY: Record<MobileLocale, MobileLobbyCopy> = {
  en: {
    connectDesktopTitle: 'Connect to your desktop',
    connectDesktopBody: 'Set the desktop base URL in Settings to load your lobby.',
    couldNotLoadLobbyTitle: 'Could not load lobby',
    emptyRecentActivity: 'No active conversations yet. Start one from the Chat tab.',
    lobbyTitle: 'Lobby',
    openSettingsAction: 'Open Settings',
    quickEntryTitle: 'Quick entry',
    recentActivityTitle: 'Recent activity',
    quickEntryChat: 'Chat',
    quickEntryCode: 'Code',
    quickEntryWork: 'Work',
    statActiveConversations: 'Active conversations',
    statCats: 'Cats',
    statUnread: 'Unread',
    todayLabel: ({ weekday, isoDate }) => `Today · ${weekday} · ${isoDate}`,
    unreadTotal: (count) => `${count} message${count === 1 ? '' : 's'} total`,
    justNow: 'just now',
  },
  'zh-TW': {
    connectDesktopTitle: '連接桌面版',
    connectDesktopBody: '請在設定中填入桌面版基底網址，以載入你的大廳。',
    couldNotLoadLobbyTitle: '無法載入大廳',
    emptyRecentActivity: '目前沒有進行中的對話。可從聊天分頁開始一則對話。',
    lobbyTitle: '大廳',
    openSettingsAction: '開啟設定',
    quickEntryTitle: '快速入口',
    recentActivityTitle: '近期活動',
    quickEntryChat: '聊天',
    quickEntryCode: '程式碼',
    quickEntryWork: '工作',
    statActiveConversations: '進行中對話',
    statCats: '貓咪',
    statUnread: '未讀',
    todayLabel: ({ weekday, isoDate }) => `今天 · ${weekday} · ${isoDate}`,
    unreadTotal: (count) => `共 ${count} 則訊息`,
    justNow: '剛剛',
  },
};

const MOBILE_CHAT_COPY: Record<MobileLocale, MobileChatCopy> = {
  en: {
    channelNotFoundBody:
      'This channel does not exist on your desktop. It may have been deleted from the desktop, or the link is stale.',
    channelNotFoundTitle: 'Conversation not found',
    connectDesktopBody: 'Set the desktop base URL in Settings so this device can fetch messages.',
    connectDesktopTitle: 'Connect to your desktop',
    couldNotLoadMessagesTitle: 'Could not load messages',
    emptyMessages: 'No messages yet. Send the first one below.',
    retryAction: 'Retry',
    sendAction: 'Send',
    composerPlaceholder: {
      chat: 'Message your cats…',
      code: 'Describe the code task…',
      work: 'Describe the work item…',
    },
    productLabel: {
      chat: 'CHAT',
      code: 'CODE',
      work: 'WORK',
    },
  },
  'zh-TW': {
    channelNotFoundBody: '這個頻道不存在於你的桌面版。它可能已在桌面版被刪除，或連結已失效。',
    channelNotFoundTitle: '找不到對話',
    connectDesktopBody: '請在設定中填入桌面版基底網址，讓這台裝置能取得訊息。',
    connectDesktopTitle: '連接桌面版',
    couldNotLoadMessagesTitle: '無法載入訊息',
    emptyMessages: '還沒有訊息。可在下方送出第一則訊息。',
    retryAction: '重試',
    sendAction: '送出',
    composerPlaceholder: {
      chat: '傳訊息給你的貓咪…',
      code: '描述程式碼任務…',
      work: '描述工作項目…',
    },
    productLabel: {
      chat: '聊天',
      code: '程式碼',
      work: '工作',
    },
  },
};

export function resolveMobileLocale(locale?: string | null): MobileLocale {
  const normalized = locale?.replace(/_/gu, '-').toLowerCase() ?? '';
  if (
    normalized === 'zh-tw'
    || normalized === 'zh-hant'
    || normalized.startsWith('zh-tw-')
    || normalized.startsWith('zh-hant-')
  ) {
    return 'zh-TW';
  }
  return 'en';
}

export function resolveDefaultMobileLocale(): MobileLocale {
  try {
    return resolveMobileLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return 'en';
  }
}

export function getMobileLobbyCopy(locale?: string | null): MobileLobbyCopy {
  return MOBILE_LOBBY_COPY[resolveMobileLocale(locale)];
}

export function getMobileChatCopy(locale?: string | null): MobileChatCopy {
  return MOBILE_CHAT_COPY[resolveMobileLocale(locale)];
}

export function formatMobileTodayLabel(now: Date, locale?: string | null): string {
  const resolvedLocale = resolveMobileLocale(locale);
  const weekday = new Intl.DateTimeFormat(resolvedLocale, { weekday: 'long' }).format(now);
  return getMobileLobbyCopy(resolvedLocale).todayLabel({
    weekday,
    isoDate: now.toISOString().slice(0, 10),
  });
}

export function formatMobileTimeAgo(
  timestamp: number,
  now: Date,
  locale?: string | null,
): string {
  const resolvedLocale = resolveMobileLocale(locale);
  const copy = getMobileLobbyCopy(resolvedLocale);
  const elapsedMs = now.getTime() - timestamp;
  if (elapsedMs < 60_000) {
    return copy.justNow;
  }

  const minutes = Math.floor(elapsedMs / 60_000);
  try {
    const formatter = new Intl.RelativeTimeFormat(resolvedLocale, { numeric: 'auto' });
    if (minutes < 60) {
      return formatter.format(-minutes, 'minute');
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return formatter.format(-hours, 'hour');
    }
    const days = Math.floor(hours / 24);
    if (days < 7) {
      return formatter.format(-days, 'day');
    }
  } catch {
    if (minutes < 60) {
      return `${minutes} min ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} hr ago`;
    }
    const days = Math.floor(hours / 24);
    if (days < 7) {
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }
  }

  return new Date(timestamp).toISOString().slice(0, 10);
}

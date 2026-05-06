export type MobileLocale = 'en' | 'zh-TW';
export type MobileProductMode = 'chat' | 'code' | 'work';
export type MobileTabId = 'cats' | MobileProductMode | 'settings';

export interface MobileChannelTitleMap {
  fallback: string;
  [actionId: string]: string | undefined;
}

/**
 * The mobile Cats tab is the directory landing — three collapsible
 * sections (My Cats / My Clowders / My Catteries) on top of the
 * existing connect-to-desktop / unconfigured affordances. It mirrors
 * the desktop "Cats Directory" surface (`/entities/*`); web Lobby
 * content (greeting, entity index cards) is intentionally NOT mirrored
 * here. Phase 6 lands the actual Clowder/Cattery registries
 * (ADR-100 + SPEC-103).
 */
export interface MobileCatsTabCopy {
  connectDesktopTitle: string;
  connectDesktopBody: string;
  couldNotLoadDirectoryTitle: string;
  catsTabTitle: string;
  openSettingsAction: string;
  sectionMyCats: string;
  sectionMyClowders: string;
  sectionMyCatteries: string;
  emptyCats: string;
  emptyClowders: string;
  emptyCatteries: string;
  newCat: string;
  newClowder: string;
  newCattery: string;
  newCatDesktopOnlyTitle: string;
  newCatDesktopOnlyBody: string;
  newClowderDesktopOnlyTitle: string;
  newClowderDesktopOnlyBody: string;
  newCatteryDesktopOnlyTitle: string;
  newCatteryDesktopOnlyBody: string;
  entityDetailEyebrow: string;
  entityDetailTitleCat: string;
  entityDetailTitleClowder: string;
  entityDetailTitleCattery: string;
  entityDetailIdLabel: string;
  entityDetailBody: string;
  entityDetailBackToDirectoryLabel: string;
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

export interface MobileApiCopy {
  configureBaseUrlBeforeCreatingChannel: string;
  configureBaseUrlBeforeSending: string;
  configureBaseUrlForClient: string;
  createChannelFailed: string;
  sendFailed: string;
  unknownError: string;
}

export interface MobileSettingsCopy {
  advancedSection: string;
  approvalsOnlyDescription: string;
  approvalsOnlyLabel: string;
  baseUrlHint: string;
  desktopSection: string;
  desktopSectionDescription: string;
  desktopUrlLabel: string;
  nameLabel: string;
  notConnectedName: string;
  notificationsFooter: string;
  notificationsSection: string;
  openWebDashboardDescription: (url: string) => string;
  openWebDashboardDisabledDescription: string;
  openWebDashboardLabel: string;
  ownerAvatarLabel: string;
  ownerFallbackName: string;
  profileFooter: string;
  profileSection: string;
  profileSectionDescription: string;
  pushNotificationsDescription: string;
  pushNotificationsLabel: string;
  settingsTitle: string;
  // Language section. Strings mirror the web Settings → General
  // language card so the Cats UI says the same thing on both
  // surfaces. Source of truth on web is
  // `src/shared/i18n/catalogs/{en,zh-TW}.ts` keys
  // `settings.general.languageTitle / languagePreferenceLabel /
  // languagePreferenceDescription / languageAutoOption /
  // languageEnglishOption / languageTraditionalChineseOption`. Mobile
  // re-declares them here because the boundary cannot import the full
  // shared catalog without dragging the entire 3000+-key tree into
  // the mobile bundle. Keep the values in lockstep — a CI cross-check
  // could land later if drift becomes a concern.
  languageSection: string;
  languageSectionDescription: string;
  languagePreferenceLabel: string;
  languageAutoLabel: string;
  languageAutoDescription: string;
  languageEnglishLabel: string;
  languageTraditionalChineseLabel: string;
  languageReopenFooter: string;
  languagePickerCloseLabel: string;
}

export interface MobileTabsCopy {
  channelTitle: Record<MobileProductMode, MobileChannelTitleMap>;
  createChannelError: (message: string) => string;
  creatingChannelLabel: string;
  desktopOnlyOkAction: string;
  dismissAction: string;
  parallelChatDesktopOnlyBody: string;
  parallelChatDesktopOnlyTitle: string;
  parallelWorkDesktopOnlyBody: string;
  parallelWorkDesktopOnlyTitle: string;
  peerCodeDesktopOnlyBody: string;
  peerCodeDesktopOnlyTitle: string;
  /**
   * Surfaced when the user taps a cat in the Chat tab's DIRECT
   * MESSAGES section that does NOT yet have a direct-lane channel.
   * Web auto-creates a draft DM; mobile's create contract doesn't
   * yet support `defaultRecipientCatId`, so we route the tap to a
   * desktop-only alert instead of silently doing nothing.
   */
  directChatDesktopOnlyBody: string;
  directChatDesktopOnlyTitle: string;
  tabTitle: Record<MobileTabId, string>;
}

export interface MobileProductSidebarProductCopy {
  productLabel: string;
  primaryActions: Record<string, string>;
  recentsLabel: string;
}

export interface MobileProductSidebarCopy {
  emptyRecentsLabel: string;
  /**
   * Label for the swipe-to-delete action revealed when the user
   * swipes a Recents row. Mirrors web's overflow-menu Delete entry
   * (`messageKeys.conversationSidebarDeleteAllLabel`); same "no
   * confirmation" semantics — the swipe gesture itself is the
   * commit.
   */
  deleteAction: string;
  /**
   * Title for the failure Alert when the DELETE call rejects.
   * Body text comes from the underlying `MobileApiError.message`
   * (already localized through `MobileApiCopy`), so no separate
   * body string is needed here.
   */
  deleteFailedTitle: string;
  /**
   * Section header above the cat list on the Chat tab. Mirrors web's
   * `conversationSidebarDirectMessagesLabel` ('Direct messages' /
   * '直接訊息'). Top-level on this copy object because only the Chat
   * sidebar renders a DM section today; if Code / Work ever grow
   * one, this can stay shared.
   */
  directMessagesLabel: string;
  products: Record<MobileProductMode, MobileProductSidebarProductCopy>;
}

const MOBILE_CATS_TAB_COPY: Record<MobileLocale, MobileCatsTabCopy> = {
  en: {
    connectDesktopTitle: 'Connect to your desktop',
    connectDesktopBody: 'Set the desktop base URL in Settings to load your cats directory.',
    couldNotLoadDirectoryTitle: 'Could not load directory',
    catsTabTitle: 'Cats',
    openSettingsAction: 'Open Settings',
    sectionMyCats: 'My Cats',
    sectionMyClowders: 'My Clowders',
    sectionMyCatteries: 'My Catteries',
    emptyCats: 'No cats yet.',
    emptyClowders: 'No clowders yet.',
    emptyCatteries: 'No catteries yet.',
    newCat: '+ New Cat',
    newClowder: '+ New Clowder',
    newCattery: '+ New Cattery',
    newCatDesktopOnlyTitle: 'New cat — desktop only',
    newCatDesktopOnlyBody:
      'Creating a new cat is not yet wired on mobile. Use the desktop app to add one; it will appear here once created.',
    newClowderDesktopOnlyTitle: 'New clowder — desktop only',
    newClowderDesktopOnlyBody:
      'Creating a new clowder is not yet wired on mobile. Use the desktop app to add one; it will appear here once created.',
    newCatteryDesktopOnlyTitle: 'New cattery — desktop only',
    newCatteryDesktopOnlyBody:
      'Creating a new cattery is not yet wired on mobile. Use the desktop app to add one; it will appear here once created.',
    entityDetailEyebrow: 'Coming soon',
    entityDetailTitleCat: 'Cat home',
    entityDetailTitleClowder: 'Clowder home',
    entityDetailTitleCattery: 'Cattery home',
    entityDetailIdLabel: 'ID',
    entityDetailBody:
      'This entity page is being built. The route resolves; richer content lands with PLAN-091 phase 6 once the data model SPEC is approved.',
    entityDetailBackToDirectoryLabel: 'Back to Cats',
  },
  'zh-TW': {
    connectDesktopTitle: '連接桌面版',
    connectDesktopBody: '請在設定中填入桌面版基底網址，以載入你的貓咪目錄。',
    couldNotLoadDirectoryTitle: '無法載入目錄',
    catsTabTitle: 'Cats',
    openSettingsAction: '開啟設定',
    sectionMyCats: '我的貓咪',
    sectionMyClowders: '我的貓群',
    sectionMyCatteries: '我的貓窩',
    emptyCats: '尚未有貓咪。',
    emptyClowders: '尚未有貓群。',
    emptyCatteries: '尚未有貓窩。',
    newCat: '+ 新增貓咪',
    newClowder: '+ 新增貓群',
    newCattery: '+ 新增貓窩',
    newCatDesktopOnlyTitle: '新增貓咪僅限桌面版',
    newCatDesktopOnlyBody:
      '行動版尚未支援新增貓咪。請在桌面版新增，建立後會出現在這裡。',
    newClowderDesktopOnlyTitle: '新增貓群僅限桌面版',
    newClowderDesktopOnlyBody:
      '行動版尚未支援新增貓群。請在桌面版新增，建立後會出現在這裡。',
    newCatteryDesktopOnlyTitle: '新增貓窩僅限桌面版',
    newCatteryDesktopOnlyBody:
      '行動版尚未支援新增貓窩。請在桌面版新增，建立後會出現在這裡。',
    entityDetailEyebrow: '開發中',
    entityDetailTitleCat: '貓的主頁',
    entityDetailTitleClowder: '貓群主頁',
    entityDetailTitleCattery: '貓窩主頁',
    entityDetailIdLabel: '識別碼',
    entityDetailBody: '此頁面正在建置中。路由已連通，等 PLAN-091 phase 6 的資料模型 SPEC 通過後就會接上實際內容。',
    entityDetailBackToDirectoryLabel: '返回 Cats',
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

const MOBILE_API_COPY: Record<MobileLocale, MobileApiCopy> = {
  en: {
    configureBaseUrlBeforeCreatingChannel:
      'Set a desktop base URL in Settings before creating a channel.',
    configureBaseUrlBeforeSending:
      'Set a desktop base URL in Settings before sending.',
    configureBaseUrlForClient:
      'Mobile API client requires a configured base URL. Set "Desktop base URL" in Settings.',
    createChannelFailed: 'Create channel failed.',
    sendFailed: 'Send failed.',
    unknownError: 'Unknown error.',
  },
  'zh-TW': {
    configureBaseUrlBeforeCreatingChannel:
      '建立頻道前，請先在設定中填入桌面版基底網址。',
    configureBaseUrlBeforeSending:
      '送出前，請先在設定中填入桌面版基底網址。',
    configureBaseUrlForClient:
      '行動版 API 用戶端需要已設定的基底網址。請在設定中填入「桌面版網址」。',
    createChannelFailed: '無法建立頻道。',
    sendFailed: '無法送出。',
    unknownError: '未知錯誤。',
  },
};

const MOBILE_SETTINGS_COPY: Record<MobileLocale, MobileSettingsCopy> = {
  en: {
    advancedSection: 'Advanced',
    approvalsOnlyDescription: 'Suppress task completion and informational pushes.',
    approvalsOnlyLabel: 'Approvals only',
    baseUrlHint: 'Use the LAN address of the machine running cats. Saves on blur.',
    desktopSection: 'Desktop',
    desktopSectionDescription: 'Where this device should reach your desktop cats.',
    desktopUrlLabel: 'Desktop URL',
    nameLabel: 'Name',
    notConnectedName: 'Not connected',
    notificationsFooter:
      'Notification delivery is not yet enabled. Your choices are saved on this device.',
    notificationsSection: 'Notifications',
    openWebDashboardDescription: (url) => `Opens ${url}`,
    openWebDashboardDisabledDescription: 'Set the desktop URL above to enable this link.',
    openWebDashboardLabel: 'Open web dashboard',
    ownerAvatarLabel: 'Owner avatar',
    ownerFallbackName: 'Owner',
    profileFooter: 'Edit your avatar and name on the desktop.',
    profileSection: 'Profile',
    profileSectionDescription:
      'Your platform-wide profile across Chat, Code, Work, and Cats.',
    pushNotificationsDescription:
      'Alerts when an approval, escalation, or task completion lands.',
    pushNotificationsLabel: 'Push notifications',
    settingsTitle: 'Settings',
    languageSection: 'Language',
    languageSectionDescription: 'Choose how Cats displays its interface.',
    languagePreferenceLabel: 'Display language',
    languageAutoLabel: 'Auto-detect',
    languageAutoDescription: 'Follows your phone language.',
    languageEnglishLabel: 'English',
    languageTraditionalChineseLabel: 'Traditional Chinese',
    languageReopenFooter:
      'Reopen the app to apply the new language across every tab.',
    languagePickerCloseLabel: 'Close language picker',
  },
  'zh-TW': {
    advancedSection: '進階',
    approvalsOnlyDescription: '只保留核准提醒，隱藏任務完成與資訊型推播。',
    approvalsOnlyLabel: '僅核准提醒',
    baseUrlHint: '使用執行 Cats 的電腦 LAN 位址。離開欄位時會自動儲存。',
    desktopSection: '桌面版',
    desktopSectionDescription: '這台裝置要連到哪一台桌面版 Cats。',
    desktopUrlLabel: '桌面版網址',
    nameLabel: '名字',
    notConnectedName: '尚未連線',
    notificationsFooter: '通知傳送尚未啟用。你的選擇會儲存在這台裝置上。',
    notificationsSection: '通知',
    openWebDashboardDescription: (url) => `開啟 ${url}`,
    openWebDashboardDisabledDescription: '先在上方設定桌面版網址，才能啟用這個連結。',
    openWebDashboardLabel: '開啟網頁儀表板',
    ownerAvatarLabel: '使用者頭像',
    ownerFallbackName: '使用者',
    profileFooter: '請在桌面版編輯你的頭像與名字。',
    profileSection: '個人檔案',
    profileSectionDescription: '這是跨聊天、程式碼、工作與 Cats 的平台個人檔案。',
    pushNotificationsDescription: '核准、升級或任務完成時提醒。',
    pushNotificationsLabel: '推播通知',
    settingsTitle: '設定',
    languageSection: '語言',
    languageSectionDescription: '選擇 Cats 介面的顯示語言。',
    languagePreferenceLabel: '顯示語言',
    languageAutoLabel: '自動偵測',
    languageAutoDescription: '跟隨手機語言。',
    languageEnglishLabel: '英文',
    languageTraditionalChineseLabel: '繁體中文',
    languageReopenFooter:
      '重新開啟 app 才會在每個分頁套用新的語言。',
    languagePickerCloseLabel: '關閉語言選擇器',
  },
};

const MOBILE_TABS_COPY: Record<MobileLocale, MobileTabsCopy> = {
  en: {
    channelTitle: {
      chat: {
        fallback: 'New chat',
        new: 'New chat',
        group: 'New group chat',
      },
      code: {
        fallback: 'New code',
        new: 'New code',
        team: 'New team code',
        peer: 'New peer code',
      },
      work: {
        fallback: 'New work',
        new: 'New work',
        team: 'New team work',
        parallel: 'New parallel work',
      },
    },
    createChannelError: (message) => `Could not create channel: ${message}`,
    creatingChannelLabel: 'Creating channel…',
    desktopOnlyOkAction: 'OK',
    dismissAction: 'Dismiss',
    parallelChatDesktopOnlyBody:
      'Parallel chat creation is not yet wired on mobile. Use the desktop app to start one; it will appear in RECENTS here once created.',
    parallelChatDesktopOnlyTitle: 'Parallel chat — desktop only',
    parallelWorkDesktopOnlyBody:
      'Parallel work creation is not yet wired on mobile. Use the desktop app to start one; it will appear in RECENTS here once created.',
    parallelWorkDesktopOnlyTitle: 'Parallel work — desktop only',
    peerCodeDesktopOnlyBody:
      'Peer code creation is not yet wired on mobile. Use the desktop app to start one; it will appear in RECENTS here once created.',
    peerCodeDesktopOnlyTitle: 'Peer code — desktop only',
    directChatDesktopOnlyBody:
      'Starting a direct message with this cat is not yet wired on mobile. Use the desktop app to start one; it will appear in DIRECT MESSAGES here once created.',
    directChatDesktopOnlyTitle: 'Direct message — desktop only',
    tabTitle: {
      cats: 'Cats',
      chat: 'Chat',
      code: 'Code',
      work: 'Work',
      settings: 'Settings',
    },
  },
  'zh-TW': {
    channelTitle: {
      chat: {
        fallback: '新聊天',
        new: '新聊天',
        group: '新群組聊天',
      },
      code: {
        fallback: '新程式碼',
        new: '新程式碼',
        team: '新團隊程式碼',
        peer: '新同儕程式碼',
      },
      work: {
        fallback: '新工作',
        new: '新工作',
        team: '新團隊工作',
        parallel: '新平行工作',
      },
    },
    createChannelError: (message) => `無法建立頻道：${message}`,
    creatingChannelLabel: '建立頻道中…',
    desktopOnlyOkAction: '確定',
    dismissAction: '關閉',
    parallelChatDesktopOnlyBody:
      '行動版尚未支援建立平行聊天。請在桌面版開始，建立後會出現在這裡的近期項目。',
    parallelChatDesktopOnlyTitle: '平行聊天僅限桌面版',
    parallelWorkDesktopOnlyBody:
      '行動版尚未支援建立平行工作。請在桌面版開始，建立後會出現在這裡的近期項目。',
    parallelWorkDesktopOnlyTitle: '平行工作僅限桌面版',
    peerCodeDesktopOnlyBody:
      '行動版尚未支援建立同儕程式碼。請在桌面版開始，建立後會出現在這裡的近期項目。',
    peerCodeDesktopOnlyTitle: '同儕程式碼僅限桌面版',
    directChatDesktopOnlyBody:
      '行動版尚未支援與這隻貓開啟直接訊息。請在桌面版開始，建立後會出現在直接訊息區塊。',
    directChatDesktopOnlyTitle: '直接訊息僅限桌面版',
    tabTitle: {
      // The four product tabs ship as fixed English brand
      // labels in every locale ("Cats" / "Chat" / "Code" /
      // "Work"). Only the platform-generic Settings tab gets
      // a localized label. Keeps the rail brand-stable across
      // locales while still translating the one chrome entry
      // that is not a product name.
      cats: 'Cats',
      chat: 'Chat',
      code: 'Code',
      work: 'Work',
      settings: '設定',
    },
  },
};

const MOBILE_PRODUCT_SIDEBAR_COPY: Record<MobileLocale, MobileProductSidebarCopy> = {
  en: {
    emptyRecentsLabel: 'No recent conversations yet.',
    deleteAction: 'Delete',
    deleteFailedTitle: "Couldn't delete",
    directMessagesLabel: 'Direct messages',
    products: {
      chat: {
        productLabel: 'CHAT',
        primaryActions: {
          new: '+ New Chat',
          group: '+ Group Chat',
          parallel: '+ Parallel Chat',
        },
        recentsLabel: 'RECENTS',
      },
      code: {
        productLabel: 'CODE',
        primaryActions: {
          new: '+ New Code',
          team: '+ Team Code',
          peer: '+ Peer Code',
        },
        recentsLabel: 'RECENTS',
      },
      work: {
        productLabel: 'WORK',
        primaryActions: {
          new: '+ New Work',
          team: '+ Team Work',
          parallel: '+ Parallel Work',
        },
        recentsLabel: 'RECENTS',
      },
    },
  },
  'zh-TW': {
    emptyRecentsLabel: '尚未有近期對話。',
    deleteAction: '刪除',
    deleteFailedTitle: '無法刪除',
    directMessagesLabel: '直接訊息',
    products: {
      chat: {
        productLabel: '聊天',
        primaryActions: {
          new: '+ 新聊天',
          group: '+ 群組聊天',
          parallel: '+ 平行聊天',
        },
        recentsLabel: '近期項目',
      },
      code: {
        productLabel: '程式碼',
        primaryActions: {
          new: '+ 新程式碼',
          team: '+ 團隊程式碼',
          peer: '+ 同儕程式碼',
        },
        recentsLabel: '近期項目',
      },
      work: {
        productLabel: '工作',
        primaryActions: {
          new: '+ 新工作',
          team: '+ 團隊工作',
          parallel: '+ 平行工作',
        },
        recentsLabel: '近期項目',
      },
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

/**
 * User's persisted display-language choice.
 *
 *   - `'auto'`: follow the phone's locale (current default behaviour)
 *   - `'en'` / `'zh-TW'`: explicit override
 *
 * The persistence layer (`mobile/src/api/persistence.ts`) reads/writes
 * the choice on AsyncStorage. The root layout calls
 * `setMobileLocaleOverride()` once on app boot to apply the persisted
 * choice before the first screen renders, and again from the Settings
 * picker when the user changes it.
 */
export type MobileLocaleOverride = 'auto' | MobileLocale;

let mobileLocaleOverride: MobileLocale | null = null;

/**
 * Subscriber set for components that want to re-render on locale
 * change. Each `subscribeMobileLocale` call adds a callback;
 * `setMobileLocaleOverride` invokes every callback after updating
 * the module state. Components that consume `resolveDefaultMobileLocale()`
 * at render time (e.g. the bottom-tab rail in `(tabs)/_layout.tsx`)
 * pair the subscriber with a forced re-render via the
 * `useMobileLocale()` hook so a Settings → Language change is
 * reflected immediately, not on next reopen.
 */
const localeSubscribers = new Set<() => void>();

/**
 * Apply a display-language override to subsequent calls of
 * `resolveDefaultMobileLocale()`. Pass `'auto'` to clear the
 * override and fall back to the device's `Intl` locale.
 *
 * Notifies every `useMobileLocale()` subscriber so subscribed
 * components re-render with the new locale on the next render
 * cycle. Components that read `resolveDefaultMobileLocale()`
 * directly without subscribing keep whatever locale they captured
 * at render time — full propagation across those still requires
 * reopening the app (Settings copy `languageReopenFooter` mentions
 * this).
 */
export function setMobileLocaleOverride(
  override: MobileLocaleOverride,
): void {
  mobileLocaleOverride = override === 'auto' ? null : override;
  for (const callback of localeSubscribers) {
    callback();
  }
}

export function getMobileLocaleOverride(): MobileLocaleOverride {
  return mobileLocaleOverride ?? 'auto';
}

/**
 * Register `callback` to fire whenever `setMobileLocaleOverride`
 * runs. Returns an unsubscribe function suitable for
 * `useEffect`'s cleanup slot. Used internally by
 * `useMobileLocale()`; renderer code should prefer the hook.
 */
export function subscribeMobileLocale(callback: () => void): () => void {
  localeSubscribers.add(callback);
  return () => {
    localeSubscribers.delete(callback);
  };
}

export function resolveDefaultMobileLocale(): MobileLocale {
  if (mobileLocaleOverride !== null) {
    return mobileLocaleOverride;
  }
  try {
    return resolveMobileLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return 'en';
  }
}

export function getMobileCatsTabCopy(locale?: string | null): MobileCatsTabCopy {
  return MOBILE_CATS_TAB_COPY[resolveMobileLocale(locale)];
}

export function getMobileChatCopy(locale?: string | null): MobileChatCopy {
  return MOBILE_CHAT_COPY[resolveMobileLocale(locale)];
}

export function getMobileApiCopy(locale?: string | null): MobileApiCopy {
  return MOBILE_API_COPY[resolveMobileLocale(locale)];
}

export function getMobileSettingsCopy(locale?: string | null): MobileSettingsCopy {
  return MOBILE_SETTINGS_COPY[resolveMobileLocale(locale)];
}

export function getMobileTabsCopy(locale?: string | null): MobileTabsCopy {
  return MOBILE_TABS_COPY[resolveMobileLocale(locale)];
}

export function getMobileProductSidebarCopy(
  locale?: string | null,
): MobileProductSidebarCopy {
  return MOBILE_PRODUCT_SIDEBAR_COPY[resolveMobileLocale(locale)];
}

export function getMobileChannelTitle(
  copy: MobileTabsCopy,
  productMode: MobileProductMode,
  actionId: string,
): string {
  return copy.channelTitle[productMode][actionId] ?? copy.channelTitle[productMode].fallback;
}

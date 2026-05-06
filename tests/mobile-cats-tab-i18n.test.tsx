import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findMobileDirectLaneForCat,
  getMobileApiCopy,
  getMobileChatCopy,
  getMobileChannelTitle,
  getMobileCatsTabCopy,
  getMobileLocaleOverride,
  getMobileProductSidebarCopy,
  getMobileSettingsCopy,
  getMobileTabsCopy,
  type MobileAppShellPayload,
  type MobileChatCat,
  type MobileChatChannelSummary,
  resolveDefaultMobileLocale,
  resolveMobileLocale,
  selectMobileCatsDirectory,
  selectMobileChatDirectLaneCats,
  selectMobileProductRecents,
  setMobileLocaleOverride,
  sortChatCatsByRecency,
} from '../src/mobile/index.ts';
import {
  getMobileDesktopOnlyAlertCopy,
  getMobileNewEntityDesktopOnlyAlertCopy,
  resolveMobileDraftApiEntryKind,
} from '../mobile/src/api/fixtures/productSidebar.ts';

function createPayload(): MobileAppShellPayload {
  return {
    ownerDisplayName: 'Ken',
    ownerAvatarUrl: null,
    ownerAvatarColor: null,
    chat: {
      cats: [
        {
          id: 'cat-1',
          name: 'Catlas',
          avatarColor: null,
          avatarUrl: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          status: 'active',
          products: ['chat'],
        },
      ],
      channels: [
        {
          id: 'chat-1',
          title: 'Planning',
          topic: '',
          status: 'active',
          unreadCount: 2,
          lastMessageAt: '2026-05-03T12:00:00.000Z',
          lastActivatedAt: null,
          originSurface: 'chat',
        },
      ],
    },
  };
}

test('selectMobileCatsDirectory projects chat cats into the mobile directory shape (PLAN-091 phase 5)', () => {
  // Locale resolution still routes zh-Hant-TW → zh-TW for the rest of
  // the mobile copy surfaces; assert that pre-existing contract here
  // even though selectMobileCatsDirectory itself no longer takes a locale.
  assert.equal(resolveMobileLocale('zh-Hant-TW'), 'zh-TW');

  const data = selectMobileCatsDirectory(createPayload());

  assert.deepEqual(data.cats, [
    {
      id: 'cat-1',
      name: 'Catlas',
      avatarUrl: null,
      avatarColor: null,
      isBoss: false,
    },
  ]);
  assert.deepEqual(data.clowders, []);
  assert.deepEqual(data.catteries, []);
});

test('mobile cats tab copy ships directory section labels and entity-detail strings', () => {
  const en = getMobileCatsTabCopy('en');
  const zh = getMobileCatsTabCopy('zh-TW');

  assert.equal(en.catsTabTitle, 'Cats');
  assert.equal(zh.catsTabTitle, 'Cats');

  assert.equal(en.sectionMyCats, 'My Cats');
  assert.equal(en.sectionMyClowders, 'My Clowders');
  assert.equal(en.sectionMyCatteries, 'My Catteries');
  assert.equal(en.newCat, '+ New Cat');

  assert.equal(zh.sectionMyCats, '我的貓咪');
  assert.equal(zh.sectionMyClowders, '我的貓群');
  assert.equal(zh.sectionMyCatteries, '我的貓窩');
  assert.equal(zh.newCat, '+ 新增貓咪');

  // `+ New X` rows on the Cats tab fire a desktop-only alert until the
  // mobile entity-creation contract lands. The copy must round-trip
  // cleanly so the runtime intercept (CatsDirectoryTab) has something
  // non-undefined to render.
  assert.equal(en.newCatDesktopOnlyTitle, 'New cat — desktop only');
  assert.equal(zh.newCatDesktopOnlyTitle, '新增貓咪僅限桌面版');
  assert.match(en.newCatDesktopOnlyBody, /Creating a new cat is not yet wired/u);
  assert.match(zh.newCatDesktopOnlyBody, /行動版尚未支援新增貓咪/u);

  assert.equal(en.newClowderDesktopOnlyTitle, 'New clowder — desktop only');
  assert.equal(zh.newClowderDesktopOnlyTitle, '新增貓群僅限桌面版');
  assert.match(en.newClowderDesktopOnlyBody, /Creating a new clowder is not yet wired/u);
  assert.match(zh.newClowderDesktopOnlyBody, /行動版尚未支援新增貓群/u);

  assert.equal(en.newCatteryDesktopOnlyTitle, 'New cattery — desktop only');
  assert.equal(zh.newCatteryDesktopOnlyTitle, '新增貓窩僅限桌面版');
  assert.match(en.newCatteryDesktopOnlyBody, /Creating a new cattery is not yet wired/u);
  assert.match(zh.newCatteryDesktopOnlyBody, /行動版尚未支援新增貓窩/u);

  // Entity detail (Stack screens that drill into a single Cat /
  // Clowder / Cattery from the Cats tab)
  assert.equal(en.entityDetailEyebrow, 'Coming soon');
  assert.equal(en.entityDetailTitleCat, 'Cat home');
  assert.equal(en.entityDetailTitleClowder, 'Clowder home');
  assert.equal(en.entityDetailTitleCattery, 'Cattery home');
  assert.equal(en.entityDetailIdLabel, 'ID');
  assert.equal(en.entityDetailBackToDirectoryLabel, 'Back to Cats');
  assert.match(en.entityDetailBody, /This entity page is being built/u);

  assert.equal(zh.entityDetailEyebrow, '開發中');
  assert.equal(zh.entityDetailTitleCat, '貓的主頁');
  assert.equal(zh.entityDetailTitleClowder, '貓群主頁');
  assert.equal(zh.entityDetailTitleCattery, '貓窩主頁');
  assert.equal(zh.entityDetailBackToDirectoryLabel, '返回 Cats');
});

test('selectMobileCatsDirectory honors catsLimit when slicing the projection', () => {
  const data = selectMobileCatsDirectory(
    {
      ...createPayload(),
      chat: {
        cats: [
          { id: 'a', name: 'A', avatarColor: null, avatarUrl: null, createdAt: '2026-05-01T00:00:00.000Z', status: 'active', products: ['chat'] },
          { id: 'b', name: 'B', avatarColor: null, avatarUrl: null, createdAt: '2026-05-02T00:00:00.000Z', status: 'active', products: ['chat'] },
          { id: 'c', name: 'C', avatarColor: null, avatarUrl: null, createdAt: '2026-05-03T00:00:00.000Z', status: 'active', products: ['chat'] },
        ],
        channels: [],
      },
    },
    { catsLimit: 2 },
  );

  assert.deepEqual(
    data.cats.map((cat) => cat.id),
    ['a', 'b'],
  );
});

test('mobile chat copy exposes localized fixed controls', () => {
  const zh = getMobileChatCopy('zh-TW');
  const en = getMobileChatCopy('en-US');

  assert.equal(zh.sendAction, '送出');
  assert.equal(zh.retryAction, '重試');
  assert.equal(zh.composerPlaceholder.code, '描述程式碼任務…');
  assert.equal(zh.productLabel.work, '工作');
  assert.equal(en.sendAction, 'Send');
  assert.equal(en.productLabel.code, 'CODE');
});

test('mobile settings copy exposes localized fixed controls', () => {
  const zh = getMobileSettingsCopy('zh-TW');
  const en = getMobileSettingsCopy('en');

  assert.equal(zh.settingsTitle, '設定');
  assert.equal(zh.desktopUrlLabel, '桌面版網址');
  assert.equal(
    zh.openWebDashboardDisabledDescription,
    '先在上方設定桌面版網址，才能啟用這個連結。',
  );
  assert.equal(
    zh.openWebDashboardDescription('http://192.168.1.2:8181'),
    '開啟 http://192.168.1.2:8181',
  );
  assert.equal(en.settingsTitle, 'Settings');
  assert.equal(en.openWebDashboardLabel, 'Open web dashboard');

  // Language section. Values mirror the web Settings → General
  // language card (`src/shared/i18n/catalogs/{en,zh-TW}.ts` keys
  // `settings.general.language*`). Pin them here so a future drift
  // on web doesn't silently leave mobile saying something different.
  assert.equal(en.languageSection, 'Language');
  assert.equal(zh.languageSection, '語言');
  assert.equal(en.languagePreferenceLabel, 'Display language');
  assert.equal(zh.languagePreferenceLabel, '顯示語言');
  assert.equal(en.languageAutoLabel, 'Auto-detect');
  assert.equal(zh.languageAutoLabel, '自動偵測');
  assert.equal(en.languageEnglishLabel, 'English');
  assert.equal(zh.languageEnglishLabel, '英文');
  assert.equal(en.languageTraditionalChineseLabel, 'Traditional Chinese');
  assert.equal(zh.languageTraditionalChineseLabel, '繁體中文');
  assert.match(en.languageReopenFooter, /Reopen the app/u);
  assert.match(zh.languageReopenFooter, /重新開啟 app/u);
  assert.equal(en.languagePickerCloseLabel, 'Close language picker');
  assert.equal(zh.languagePickerCloseLabel, '關閉語言選擇器');
});

// Recents-row delete copy. The swipe-to-delete reveal label and the
// failure-Alert title both live on `MobileProductSidebarCopy` so the
// Chat / Code / Work sidebars share the same strings. Pin them so a
// regression that drops either key shows up here before it ships.
test('mobile product sidebar copy exposes Recents delete strings', () => {
  const en = getMobileProductSidebarCopy('en');
  const zh = getMobileProductSidebarCopy('zh-TW');

  assert.equal(en.deleteAction, 'Delete');
  assert.equal(zh.deleteAction, '刪除');
  assert.equal(en.deleteFailedTitle, "Couldn't delete");
  assert.equal(zh.deleteFailedTitle, '無法刪除');
});

// `setMobileLocaleOverride` lets the Settings → Language picker pin
// the UI to a specific locale that ignores the device default. The
// override is module-level so subsequent `resolveDefaultMobileLocale`
// calls (used by every screen at render time) honor it. These tests
// pin the contract so a regression to a stateless resolver — which
// would silently revert the user's choice on every render — fails CI.
test('setMobileLocaleOverride pins resolveDefaultMobileLocale to the chosen locale', () => {
  // Reset to auto first so the test is deterministic regardless of
  // earlier test state.
  setMobileLocaleOverride('auto');
  assert.equal(getMobileLocaleOverride(), 'auto');

  setMobileLocaleOverride('en');
  assert.equal(getMobileLocaleOverride(), 'en');
  assert.equal(resolveDefaultMobileLocale(), 'en');

  setMobileLocaleOverride('zh-TW');
  assert.equal(getMobileLocaleOverride(), 'zh-TW');
  assert.equal(resolveDefaultMobileLocale(), 'zh-TW');

  // 'auto' clears the pin and falls back to whatever Intl reports
  // (which inside `node --test` is typically en-* — assert the
  // override reads back as 'auto', not the resolver's exact answer,
  // since that depends on the test environment's Intl locale).
  setMobileLocaleOverride('auto');
  assert.equal(getMobileLocaleOverride(), 'auto');
});

test('mobile tabs copy exposes localized fixed controls', () => {
  const zh = getMobileTabsCopy('zh-TW');
  const en = getMobileTabsCopy('en');

  // Only the Settings tab carries a localized rail label; the four
  // product tabs ship as fixed English brand labels in every locale
  // ("Cats" / "Chat" / "Code" / "Work"). Pin both halves so a
  // future drift back to translated product names fails CI.
  assert.equal(en.tabTitle.cats, 'Cats');
  assert.equal(zh.tabTitle.cats, 'Cats');
  assert.equal(en.tabTitle.chat, 'Chat');
  assert.equal(zh.tabTitle.chat, 'Chat');
  assert.equal(en.tabTitle.code, 'Code');
  assert.equal(zh.tabTitle.code, 'Code');
  assert.equal(en.tabTitle.work, 'Work');
  assert.equal(zh.tabTitle.work, 'Work');
  assert.equal(en.tabTitle.settings, 'Settings');
  assert.equal(zh.tabTitle.settings, '設定');
  assert.equal(zh.creatingChannelLabel, '建立頻道中…');
  assert.equal(zh.dismissAction, '關閉');
  assert.equal(zh.createChannelError('offline'), '無法建立頻道：offline');
  assert.equal(getMobileChannelTitle(zh, 'code', 'peer'), '新同儕程式碼');
  assert.equal(getMobileChannelTitle(zh, 'work', 'unknown'), '新工作');

  // The three fan-out chips (`+ Parallel Chat`, `+ Parallel Work`,
  // `+ Peer Code`) all surface as desktop-only alerts; the copy
  // must round-trip cleanly so the runtime intercept
  // (chat/index.tsx, work/index.tsx, code/index.tsx) has something
  // non-undefined to render.
  assert.equal(en.parallelChatDesktopOnlyTitle, 'Parallel chat — desktop only');
  assert.equal(zh.parallelChatDesktopOnlyTitle, '平行聊天僅限桌面版');
  assert.match(en.parallelChatDesktopOnlyBody, /Parallel chat creation is not yet wired/u);
  assert.match(zh.parallelChatDesktopOnlyBody, /行動版尚未支援建立平行聊天/u);

  assert.equal(en.parallelWorkDesktopOnlyTitle, 'Parallel work — desktop only');
  assert.equal(zh.parallelWorkDesktopOnlyTitle, '平行工作僅限桌面版');
  assert.match(en.parallelWorkDesktopOnlyBody, /Parallel work creation is not yet wired/u);
  assert.match(zh.parallelWorkDesktopOnlyBody, /行動版尚未支援建立平行工作/u);

  assert.equal(en.peerCodeDesktopOnlyTitle, 'Peer code — desktop only');
  assert.equal(zh.peerCodeDesktopOnlyTitle, '同儕程式碼僅限桌面版');
  assert.match(en.peerCodeDesktopOnlyBody, /Peer code creation is not yet wired/u);
  assert.match(zh.peerCodeDesktopOnlyBody, /行動版尚未支援建立同儕程式碼/u);
});

test('mobile api copy exposes localized deterministic errors', () => {
  const zh = getMobileApiCopy('zh-TW');
  const en = getMobileApiCopy('en');

  assert.equal(
    zh.configureBaseUrlBeforeCreatingChannel,
    '建立頻道前，請先在設定中填入桌面版基底網址。',
  );
  assert.equal(zh.configureBaseUrlBeforeSending, '送出前，請先在設定中填入桌面版基底網址。');
  assert.equal(zh.createChannelFailed, '無法建立頻道。');
  assert.equal(zh.sendFailed, '無法送出。');
  assert.equal(en.unknownError, 'Unknown error.');
});

// `getMobileDesktopOnlyAlertCopy` is the single canonical answer for
// "should this primary-action chip skip createChannel and surface a
// desktop-only alert instead?". `chat/index.tsx` and `work/index.tsx`
// both consume it. These tests pin the contract so a regression to
// the silent `entryKind: 'default'` fallback (the bug that caused the
// 2026-05-05 follow-up) gets caught in CI instead of in production.
test('getMobileDesktopOnlyAlertCopy routes Chat parallel into the desktop-only alert', () => {
  const en = getMobileTabsCopy('en');
  const zh = getMobileTabsCopy('zh-TW');

  const enAlert = getMobileDesktopOnlyAlertCopy('chat', 'parallel', en);
  assert.ok(enAlert, 'expected chat/parallel to be desktop-only on mobile');
  assert.equal(enAlert.title, en.parallelChatDesktopOnlyTitle);
  assert.equal(enAlert.body, en.parallelChatDesktopOnlyBody);

  const zhAlert = getMobileDesktopOnlyAlertCopy('chat', 'parallel', zh);
  assert.ok(zhAlert, 'expected chat/parallel to be desktop-only on mobile (zh-TW)');
  assert.equal(zhAlert.title, zh.parallelChatDesktopOnlyTitle);
  assert.equal(zhAlert.body, zh.parallelChatDesktopOnlyBody);
});

test('getMobileDesktopOnlyAlertCopy routes Work parallel into the desktop-only alert', () => {
  const en = getMobileTabsCopy('en');
  const zh = getMobileTabsCopy('zh-TW');

  const enAlert = getMobileDesktopOnlyAlertCopy('work', 'parallel', en);
  assert.ok(enAlert, 'expected work/parallel to be desktop-only on mobile');
  assert.equal(enAlert.title, en.parallelWorkDesktopOnlyTitle);
  assert.equal(enAlert.body, en.parallelWorkDesktopOnlyBody);

  const zhAlert = getMobileDesktopOnlyAlertCopy('work', 'parallel', zh);
  assert.ok(zhAlert, 'expected work/parallel to be desktop-only on mobile (zh-TW)');
  assert.equal(zhAlert.title, zh.parallelWorkDesktopOnlyTitle);
  assert.equal(zhAlert.body, zh.parallelWorkDesktopOnlyBody);
});

test('getMobileDesktopOnlyAlertCopy routes Code peer into the desktop-only alert', () => {
  // `+ Peer Code` is the Code-tab analogue of `+ Parallel Chat /
  // Work` — multi-recipient fan-out with no `default | group |
  // direct` API on mobile. The contract has to match the other
  // two so the three fan-out chips are consistent.
  const en = getMobileTabsCopy('en');
  const zh = getMobileTabsCopy('zh-TW');

  const enAlert = getMobileDesktopOnlyAlertCopy('code', 'peer', en);
  assert.ok(enAlert, 'expected code/peer to be desktop-only on mobile');
  assert.equal(enAlert.title, en.peerCodeDesktopOnlyTitle);
  assert.equal(enAlert.body, en.peerCodeDesktopOnlyBody);

  const zhAlert = getMobileDesktopOnlyAlertCopy('code', 'peer', zh);
  assert.ok(zhAlert, 'expected code/peer to be desktop-only on mobile (zh-TW)');
  assert.equal(zhAlert.title, zh.peerCodeDesktopOnlyTitle);
  assert.equal(zhAlert.body, zh.peerCodeDesktopOnlyBody);
});

// `getMobileNewEntityDesktopOnlyAlertCopy` is the parallel of
// `getMobileDesktopOnlyAlertCopy` for the Cats tab's `+ New X` rows.
// Until the mobile entity-creation contract lands, all three section
// keys (`cats`, `clowders`, `catteries`) MUST resolve to a desktop-only
// alert pair — a regression to the silent no-op (the bug that prompted
// 2026-05-06 follow-up after the user reported `+ New cat` did
// nothing) gets caught in CI instead of in production.
test('getMobileNewEntityDesktopOnlyAlertCopy returns desktop-only copy for every Cats-tab section', () => {
  const en = getMobileCatsTabCopy('en');
  const zh = getMobileCatsTabCopy('zh-TW');

  const enCats = getMobileNewEntityDesktopOnlyAlertCopy('cats', en);
  assert.ok(enCats, 'expected cats section to be desktop-only on mobile');
  assert.equal(enCats.title, en.newCatDesktopOnlyTitle);
  assert.equal(enCats.body, en.newCatDesktopOnlyBody);

  const zhCats = getMobileNewEntityDesktopOnlyAlertCopy('cats', zh);
  assert.ok(zhCats, 'expected cats section to be desktop-only on mobile (zh-TW)');
  assert.equal(zhCats.title, zh.newCatDesktopOnlyTitle);
  assert.equal(zhCats.body, zh.newCatDesktopOnlyBody);

  const enClowders = getMobileNewEntityDesktopOnlyAlertCopy('clowders', en);
  assert.ok(enClowders, 'expected clowders section to be desktop-only on mobile');
  assert.equal(enClowders.title, en.newClowderDesktopOnlyTitle);
  assert.equal(enClowders.body, en.newClowderDesktopOnlyBody);

  const enCatteries = getMobileNewEntityDesktopOnlyAlertCopy('catteries', en);
  assert.ok(enCatteries, 'expected catteries section to be desktop-only on mobile');
  assert.equal(enCatteries.title, en.newCatteryDesktopOnlyTitle);
  assert.equal(enCatteries.body, en.newCatteryDesktopOnlyBody);
});

test('getMobileDesktopOnlyAlertCopy lets non-fan-out actions through to the draft route', () => {
  const en = getMobileTabsCopy('en');

  // Chat: New / Group go through to the draft route; only Parallel
  // is desktop-only.
  assert.equal(getMobileDesktopOnlyAlertCopy('chat', 'new', en), null);
  assert.equal(getMobileDesktopOnlyAlertCopy('chat', 'group', en), null);

  // Code: New / Team go through to the draft route; only Peer is
  // desktop-only (it's the Code-tab fan-out flow).
  assert.equal(getMobileDesktopOnlyAlertCopy('code', 'new', en), null);
  assert.equal(getMobileDesktopOnlyAlertCopy('code', 'team', en), null);

  // Work: New / Team go through; only Parallel is desktop-only. This
  // is the regression the helper was extracted to pin — a previous
  // version of work/index.tsx silently created a default Work channel
  // on Parallel because the entryKind ternary fell through.
  assert.equal(getMobileDesktopOnlyAlertCopy('work', 'new', en), null);
  assert.equal(getMobileDesktopOnlyAlertCopy('work', 'team', en), null);
});

// `resolveMobileDraftApiEntryKind` is the single source of truth for
// "given a sidebar primary-action chip id, what `entryKind` should we
// pass to `POST /api/channels`?". Both `useDraftChannel` (the
// draft-mode send path that mirrors web's `<NewChatDraft>` lifecycle)
// and any future entry point that needs to translate a chip id into
// the create-channel API contract must consume this helper. The two
// previous in-line ternaries in `chat/index.tsx` and `code/index.tsx`
// were extracted here so the mapping cannot drift across products.
test('resolveMobileDraftApiEntryKind maps Group/Team chips onto API entryKind="group"', () => {
  // Chat: + Group Chat → 'group'.
  assert.equal(resolveMobileDraftApiEntryKind('chat', 'group'), 'group');
  // Code: + Team Code → 'group'.
  assert.equal(resolveMobileDraftApiEntryKind('code', 'team'), 'group');
  // Work: + Team Work → 'group'.
  assert.equal(resolveMobileDraftApiEntryKind('work', 'team'), 'group');
});

test('resolveMobileDraftApiEntryKind maps fan-out chips to null (desktop-only)', () => {
  // The send path must short-circuit on null and surface the same
  // desktop-only alert as the sidebar tap. Mapping any of these
  // chips to 'default' would silently create a default channel and
  // re-introduce the bug pinned by the chat/work/code fan-out alert
  // tests above. The three fan-out chips are kept consistent here
  // — `+ Parallel Chat`, `+ Parallel Work`, `+ Peer Code` all
  // belong to the same desktop-only equivalence class because the
  // mobile create contract has no fan-out / multi-recipient path.
  assert.equal(resolveMobileDraftApiEntryKind('chat', 'parallel'), null);
  assert.equal(resolveMobileDraftApiEntryKind('work', 'parallel'), null);
  assert.equal(resolveMobileDraftApiEntryKind('code', 'peer'), null);
});

// `selectMobileProductRecents` powers the trimmed sidebar Recents
// list on Chat / Code / Work. The previous filter (`status === 'active'
// && originSurface === product`) over-filtered: empty / configured-only
// channels showed up on the web Chat sidebar but were invisible on
// mobile. The contract was tightened to match web's
// `recentsChannels` filter:
//
//   - originSurface === product   (SPEC-070 product scoping)
//   - channelKind !== 'direct_message'   (DMs live under the Cats
//                                          tab, not in product Recents)
//
// Status is no longer a gate. These tests pin both halves so a
// regression to the old behavior — either re-adding the status gate
// or letting DMs leak into Recents — fails CI.

function buildChannel(
  overrides: Partial<MobileChatChannelSummary> & Pick<MobileChatChannelSummary, 'id' | 'title'>,
): MobileChatChannelSummary {
  return {
    topic: '',
    status: 'configured',
    unreadCount: 0,
    lastMessageAt: null,
    lastActivatedAt: '2026-05-05T00:00:00.000Z',
    originSurface: 'chat',
    ...overrides,
  };
}

function buildPayloadWithChannels(
  channels: MobileChatChannelSummary[],
): MobileAppShellPayload {
  return {
    ownerDisplayName: 'Ken',
    ownerAvatarUrl: null,
    ownerAvatarColor: null,
    chat: {
      cats: [],
      channels,
    },
  };
}

test('selectMobileProductRecents includes non-active channels (matches web filter)', () => {
  const payload = buildPayloadWithChannels([
    buildChannel({
      id: 'configured-channel',
      title: 'New chat',
      status: 'configured',
      lastMessageAt: '2026-05-05T10:00:00.000Z',
    }),
    buildChannel({
      id: 'planned-channel',
      title: 'New group chat',
      status: 'planned',
      lastMessageAt: '2026-05-05T11:00:00.000Z',
    }),
    buildChannel({
      id: 'active-channel',
      title: 'hi',
      status: 'active',
      lastMessageAt: '2026-05-05T12:00:00.000Z',
    }),
  ]);

  const recents = selectMobileProductRecents(payload, 'chat');
  // All three appear (the previous filter dropped configured /
  // planned channels and only `active-channel` survived); order is
  // the input/wire order — desktop maintains `state.channels`
  // newest-first via `unshift`, and mobile preserves it now to
  // match web. Earlier the selector re-sorted by `lastMessageAt`,
  // which produced a divergent order from the web Chat sidebar.
  assert.deepEqual(
    recents.map((entry) => entry.id),
    ['configured-channel', 'planned-channel', 'active-channel'],
  );
});

test('selectMobileProductRecents excludes direct-message channels', () => {
  const payload = buildPayloadWithChannels([
    buildChannel({
      id: 'dm-with-qq',
      title: 'QQ',
      channelKind: 'direct_message',
      status: 'active',
      lastMessageAt: '2026-05-05T13:00:00.000Z',
    }),
    buildChannel({
      id: 'public-chat',
      title: 'Open thread',
      channelKind: 'chat_channel',
      status: 'active',
      lastMessageAt: '2026-05-05T12:00:00.000Z',
    }),
    buildChannel({
      id: 'no-kind-set',
      title: 'Legacy channel',
      // channelKind unset on the wire — must NOT be classified as DM.
      status: 'active',
      lastMessageAt: '2026-05-05T11:00:00.000Z',
    }),
  ]);

  const recents = selectMobileProductRecents(payload, 'chat');
  assert.deepEqual(
    recents.map((entry) => entry.id),
    ['public-chat', 'no-kind-set'],
  );
});

// Direct-lane (DIRECT MESSAGES) helpers. The Chat tab renders a
// DM section above RECENTS, sorted via the shared
// `sortChatCatsByRecency` algorithm — same pure function the web
// Chat sidebar uses (defined in
// `src/products/chat/renderer/components/Sidebar.tsx`). Pinning
// here covers the boundary copy of the algorithm so a regression
// surfaces before it ships.

function buildCat(
  overrides: Partial<MobileChatCat> & Pick<MobileChatCat, 'id' | 'name' | 'createdAt'>,
): MobileChatCat {
  return {
    avatarColor: null,
    avatarUrl: null,
    status: 'active',
    products: ['chat'],
    ...overrides,
  };
}

test('sortChatCatsByRecency sorts cats by their direct-lane channel activity desc', () => {
  const cats: MobileChatCat[] = [
    buildCat({ id: 'cat-old', name: 'Old', createdAt: '2026-04-01T00:00:00.000Z' }),
    buildCat({ id: 'cat-new', name: 'New', createdAt: '2026-04-02T00:00:00.000Z' }),
    buildCat({ id: 'cat-fresh', name: 'Fresh', createdAt: '2026-04-03T00:00:00.000Z' }),
  ];
  const channels: MobileChatChannelSummary[] = [
    buildChannel({
      id: 'dm-old',
      title: 'Old DM',
      channelKind: 'direct_message',
      defaultRecipientCatId: 'cat-old',
      lastActivatedAt: '2026-05-01T00:00:00.000Z',
      lastMessageAt: null,
    }),
    buildChannel({
      id: 'dm-new',
      title: 'New DM',
      channelKind: 'direct_message',
      defaultRecipientCatId: 'cat-new',
      lastActivatedAt: '2026-05-05T00:00:00.000Z',
      lastMessageAt: null,
    }),
    // cat-fresh has NO direct-lane channel — falls back to its
    // own createdAt (2026-04-03), which is earlier than both DM
    // activity timestamps, so it sorts to the bottom.
  ];

  const sorted = sortChatCatsByRecency(cats, channels);
  assert.deepEqual(
    sorted.map((cat) => cat.id),
    ['cat-new', 'cat-old', 'cat-fresh'],
  );
});

test('sortChatCatsByRecency surfaces brand-new cats with no DM at the top via createdAt', () => {
  // Mirror of the web `sortChatCatsByRecency` fallback rule: when
  // a cat has no direct-lane channel, its `createdAt` is the
  // sort key. A cat created today appears above an older cat
  // whose only DM has gone stale.
  const cats: MobileChatCat[] = [
    buildCat({ id: 'cat-stale-dm', name: 'Stale', createdAt: '2025-01-01T00:00:00.000Z' }),
    buildCat({ id: 'cat-fresh', name: 'Fresh', createdAt: '2026-05-06T12:00:00.000Z' }),
  ];
  const channels: MobileChatChannelSummary[] = [
    buildChannel({
      id: 'dm-stale',
      title: 'Stale DM',
      channelKind: 'direct_message',
      defaultRecipientCatId: 'cat-stale-dm',
      lastActivatedAt: '2026-04-01T00:00:00.000Z',
      lastMessageAt: null,
    }),
  ];

  const sorted = sortChatCatsByRecency(cats, channels);
  assert.deepEqual(sorted.map((cat) => cat.id), ['cat-fresh', 'cat-stale-dm']);
});

test('sortChatCatsByRecency ignores non-direct-lane channels when building the recency map', () => {
  // A regular chat channel for cat-x should NOT bump cat-x in the
  // DM list — only direct_message channels feed the recency map.
  const cats: MobileChatCat[] = [
    buildCat({ id: 'cat-x', name: 'X', createdAt: '2026-04-01T00:00:00.000Z' }),
    buildCat({ id: 'cat-y', name: 'Y', createdAt: '2026-04-02T00:00:00.000Z' }),
  ];
  const channels: MobileChatChannelSummary[] = [
    // Regular chat with cat-x as default recipient — irrelevant.
    buildChannel({
      id: 'group-x',
      title: 'Group X',
      channelKind: 'chat_channel',
      defaultRecipientCatId: 'cat-x',
      lastActivatedAt: '2026-05-05T00:00:00.000Z',
      lastMessageAt: null,
    }),
  ];

  const sorted = sortChatCatsByRecency(cats, channels);
  // Both cats fall back to createdAt; cat-y is later, so it's first.
  assert.deepEqual(sorted.map((cat) => cat.id), ['cat-y', 'cat-x']);
});

test('selectMobileChatDirectLaneCats filters archived cats and applies the recency sort', () => {
  const payload: MobileAppShellPayload = {
    ownerDisplayName: 'Ken',
    ownerAvatarUrl: null,
    ownerAvatarColor: null,
    chat: {
      cats: [
        buildCat({ id: 'cat-archived', name: 'Z', createdAt: '2026-05-10T00:00:00.000Z', status: 'archived' }),
        buildCat({ id: 'cat-a', name: 'A', createdAt: '2026-05-01T00:00:00.000Z' }),
        buildCat({ id: 'cat-b', name: 'B', createdAt: '2026-05-02T00:00:00.000Z' }),
      ],
      channels: [
        buildChannel({
          id: 'dm-a',
          title: 'DM A',
          channelKind: 'direct_message',
          defaultRecipientCatId: 'cat-a',
          lastActivatedAt: '2026-05-06T00:00:00.000Z',
          lastMessageAt: null,
        }),
      ],
    },
  };

  const sorted = selectMobileChatDirectLaneCats(payload);
  // Archived cat is filtered out even though its createdAt would
  // sort it first; remaining cats sort by recency (cat-a's DM
  // activity beats cat-b's createdAt fallback).
  assert.deepEqual(sorted.map((cat) => cat.id), ['cat-a', 'cat-b']);
});

test('findMobileDirectLaneForCat returns the direct-lane channel when one exists', () => {
  const channels: MobileChatChannelSummary[] = [
    buildChannel({
      id: 'group-public',
      title: 'Public',
      channelKind: 'chat_channel',
      defaultRecipientCatId: 'cat-a',
    }),
    buildChannel({
      id: 'dm-with-a',
      title: 'A',
      channelKind: 'direct_message',
      defaultRecipientCatId: 'cat-a',
    }),
    buildChannel({
      id: 'dm-with-b',
      title: 'B',
      channelKind: 'direct_message',
      defaultRecipientCatId: 'cat-b',
    }),
  ];

  // Returns the direct-lane channel, not the public one with the
  // same defaultRecipientCatId. A regression that drops the
  // `channelKind === 'direct_message'` guard would make this
  // return `group-public` and break the DM tap target.
  assert.equal(findMobileDirectLaneForCat(channels, 'cat-a')?.id, 'dm-with-a');
  assert.equal(findMobileDirectLaneForCat(channels, 'cat-b')?.id, 'dm-with-b');
  assert.equal(findMobileDirectLaneForCat(channels, 'cat-missing'), null);
});

test('mobile product sidebar copy ships the DIRECT MESSAGES section label', () => {
  const en = getMobileProductSidebarCopy('en');
  const zh = getMobileProductSidebarCopy('zh-TW');
  assert.equal(en.directMessagesLabel, 'Direct messages');
  assert.equal(zh.directMessagesLabel, '直接訊息');
});

test('mobile tabs copy ships the desktop-only direct-chat alert pair', () => {
  // Surfaced when the user taps a cat in the Chat-tab DIRECT
  // MESSAGES list that has no direct-lane channel yet. Keeps the
  // round-trip verification consistent with the parallel-chat /
  // parallel-work / peer-code intercepts.
  const en = getMobileTabsCopy('en');
  const zh = getMobileTabsCopy('zh-TW');
  assert.equal(en.directChatDesktopOnlyTitle, 'Direct message — desktop only');
  assert.equal(zh.directChatDesktopOnlyTitle, '直接訊息僅限桌面版');
  assert.match(en.directChatDesktopOnlyBody, /Starting a direct message with this cat is not yet wired/u);
  assert.match(zh.directChatDesktopOnlyBody, /行動版尚未支援與這隻貓開啟直接訊息/u);
});

test('selectMobileProductRecents continues to scope by originSurface (SPEC-070)', () => {
  const payload = buildPayloadWithChannels([
    buildChannel({
      id: 'chat-channel',
      title: 'Chat one',
      originSurface: 'chat',
      lastMessageAt: '2026-05-05T10:00:00.000Z',
    }),
    buildChannel({
      id: 'code-channel',
      title: 'Code one',
      originSurface: 'code',
      lastMessageAt: '2026-05-05T11:00:00.000Z',
    }),
    buildChannel({
      id: 'work-channel',
      title: 'Work one',
      originSurface: 'work',
      lastMessageAt: '2026-05-05T12:00:00.000Z',
    }),
  ]);

  assert.deepEqual(
    selectMobileProductRecents(payload, 'chat').map((entry) => entry.id),
    ['chat-channel'],
  );
  assert.deepEqual(
    selectMobileProductRecents(payload, 'code').map((entry) => entry.id),
    ['code-channel'],
  );
  assert.deepEqual(
    selectMobileProductRecents(payload, 'work').map((entry) => entry.id),
    ['work-channel'],
  );
});

test('resolveMobileDraftApiEntryKind maps every other chip to "default"', () => {
  assert.equal(resolveMobileDraftApiEntryKind('chat', 'new'), 'default');
  assert.equal(resolveMobileDraftApiEntryKind('code', 'new'), 'default');
  assert.equal(resolveMobileDraftApiEntryKind('work', 'new'), 'default');
  // Unknown ids fall through to 'default' rather than throwing — the
  // route layer is responsible for input validation, not this mapping.
  assert.equal(resolveMobileDraftApiEntryKind('chat', 'unknown'), 'default');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getMobileApiCopy,
  getMobileChatCopy,
  getMobileChannelTitle,
  getMobileCatsTabCopy,
  getMobileSettingsCopy,
  getMobileTabsCopy,
  type MobileAppShellPayload,
  resolveMobileLocale,
  selectMobileCatsDirectory,
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
  assert.equal(en.expandSectionLabel('My Cats'), 'Expand My Cats');
  assert.equal(en.collapseSectionLabel('My Cats'), 'Collapse My Cats');

  assert.equal(zh.sectionMyCats, '我的貓咪');
  assert.equal(zh.sectionMyClowders, '我的貓群');
  assert.equal(zh.sectionMyCatteries, '我的貓窩');
  assert.equal(zh.newCat, '+ 新增貓咪');
  assert.equal(zh.expandSectionLabel('我的貓咪'), '展開 我的貓咪');

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
          { id: 'a', name: 'A', avatarColor: null, status: 'active', products: ['chat'] },
          { id: 'b', name: 'B', avatarColor: null, status: 'active', products: ['chat'] },
          { id: 'c', name: 'C', avatarColor: null, status: 'active', products: ['chat'] },
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
});

test('mobile tabs copy exposes localized fixed controls', () => {
  const zh = getMobileTabsCopy('zh-TW');
  const en = getMobileTabsCopy('en');

  assert.equal(zh.tabTitle.settings, '設定');
  assert.equal(en.tabTitle.cats, 'Cats');
  assert.equal(zh.tabTitle.cats, 'Cats');
  assert.equal(zh.creatingChannelLabel, '建立頻道中…');
  assert.equal(zh.dismissAction, '關閉');
  assert.equal(zh.createChannelError('offline'), '無法建立頻道：offline');
  assert.equal(getMobileChannelTitle(zh, 'code', 'peer'), '新同儕程式碼');
  assert.equal(getMobileChannelTitle(zh, 'work', 'unknown'), '新工作');

  // Both `+ Parallel X` paths surface as desktop-only alerts; the copy
  // must round-trip cleanly so the runtime intercept (chat/index.tsx,
  // work/index.tsx) has something non-undefined to render.
  assert.equal(en.parallelChatDesktopOnlyTitle, 'Parallel chat — desktop only');
  assert.equal(zh.parallelChatDesktopOnlyTitle, '平行聊天僅限桌面版');
  assert.match(en.parallelChatDesktopOnlyBody, /Parallel chat creation is not yet wired/u);
  assert.match(zh.parallelChatDesktopOnlyBody, /行動版尚未支援建立平行聊天/u);

  assert.equal(en.parallelWorkDesktopOnlyTitle, 'Parallel work — desktop only');
  assert.equal(zh.parallelWorkDesktopOnlyTitle, '平行工作僅限桌面版');
  assert.match(en.parallelWorkDesktopOnlyBody, /Parallel work creation is not yet wired/u);
  assert.match(zh.parallelWorkDesktopOnlyBody, /行動版尚未支援建立平行工作/u);
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

test('getMobileDesktopOnlyAlertCopy lets non-parallel actions through to the draft route', () => {
  const en = getMobileTabsCopy('en');

  // Chat: New / Group go through to the draft route; only Parallel
  // is desktop-only.
  assert.equal(getMobileDesktopOnlyAlertCopy('chat', 'new', en), null);
  assert.equal(getMobileDesktopOnlyAlertCopy('chat', 'group', en), null);

  // Code: nothing is desktop-only today (no Parallel chip, no other
  // create-time fan-out kinds). All three go through to the draft
  // route.
  assert.equal(getMobileDesktopOnlyAlertCopy('code', 'new', en), null);
  assert.equal(getMobileDesktopOnlyAlertCopy('code', 'team', en), null);
  assert.equal(getMobileDesktopOnlyAlertCopy('code', 'peer', en), null);

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

test('resolveMobileDraftApiEntryKind maps Parallel chips to null (desktop-only)', () => {
  // The send path must short-circuit on null and surface the same
  // desktop-only alert as the sidebar tap. Mapping Parallel to
  // 'default' would silently create a default channel and re-introduce
  // the bug pinned by the chat/work parallel-chat tests above.
  assert.equal(resolveMobileDraftApiEntryKind('chat', 'parallel'), null);
  assert.equal(resolveMobileDraftApiEntryKind('work', 'parallel'), null);
});

test('resolveMobileDraftApiEntryKind maps every other chip to "default"', () => {
  assert.equal(resolveMobileDraftApiEntryKind('chat', 'new'), 'default');
  assert.equal(resolveMobileDraftApiEntryKind('code', 'new'), 'default');
  assert.equal(resolveMobileDraftApiEntryKind('code', 'peer'), 'default');
  assert.equal(resolveMobileDraftApiEntryKind('work', 'new'), 'default');
  // Unknown ids fall through to 'default' rather than throwing — the
  // route layer is responsible for input validation, not this mapping.
  assert.equal(resolveMobileDraftApiEntryKind('chat', 'unknown'), 'default');
});

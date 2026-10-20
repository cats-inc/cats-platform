import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

import { AppMarketList, AppMarketPage, describeAppMarketError, describeAppPermissions } from '../src/app/renderer/AppMarketPage.tsx';
import type { AppMarketEntry, AppMarketSnapshot } from '../src/shared/appMarket.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

const en = createTranslator('en');
const zh = createTranslator('zh-TW');

function entry(overrides: Partial<AppMarketEntry>): AppMarketEntry {
  return {
    id: 'cats.studio', displayName: 'Studio', description: 'Image studio', icon: 'image', version: '0.2.1', notes: 'Grok images',
    permissions: ['ui.route', 'ui.lobby', 'media.images'], publisher: { name: 'sammykenny2' },
    compatibility: { catsPlatform: '^0.6.0', appSdk: '^1.3.0' }, installedVersion: null, installedSource: null, installedWithdrawnReason: null, action: 'install',
    ...overrides,
  };
}

function snapshot(overrides: Partial<AppMarketSnapshot> = {}): AppMarketSnapshot {
  return { status: 'fresh', revision: 10, issuedAt: '2026-10-20T00:00:00.000Z', expiresAt: '2026-11-19T00:00:00.000Z',
    fetchedAt: '2026-10-20T01:00:00.000Z', apps: [entry({})], ...overrides };
}

function list(value: AppMarketSnapshot | null, t = en, loading = false) {
  return renderToStaticMarkup(<AppMarketList snapshot={value} loading={loading} busyAppId={null} locale="en" t={t} onInstall={() => {}} />);
}

test('each catalog action renders one clear control', () => {
  const markup = list(snapshot({ apps: [
    entry({ id: 'a', displayName: 'Fresh', action: 'install' }),
    entry({ id: 'b', displayName: 'Older', action: 'update', installedVersion: '0.2.0' }),
    entry({ id: 'c', displayName: 'Current', action: 'installed', installedVersion: '0.2.1' }),
    entry({ id: 'd', displayName: 'Bundled', action: 'managed-by-desktop' }),
    entry({ id: 'e', displayName: 'Future', action: 'incompatible' }),
  ] }));
  assert.match(markup, />Install<\/button>/u);
  assert.match(markup, />Update to 0\.2\.1<\/button>/u);
  assert.match(markup, /Installed 0\.2\.0/u);
  assert.match(markup, /class="appMarketCardState">Installed</u);
  assert.match(markup, />Included with Cats Desktop</u);
  assert.match(markup, />Needs a newer Cats Desktop</u);
  assert.equal(markup.match(/<button/gu)?.length, 2);
  assert.match(markup, /Can: open its own page, show a card on Home, generate images with your AI tools/u);
  assert.match(markup, /By sammykenny2/u);
});

test('catalog status notices tell the user what still works', () => {
  assert.match(list(null, en, true), /Loading the App catalog/u);
  assert.match(list(null), /The App catalog is unavailable right now/u);
  assert.match(list(snapshot({ status: 'unavailable', apps: [], error: { code: 'catalog_unavailable', message: 'offline' } })), /Could not reach GitHub/u);
  assert.match(list(snapshot({ status: 'cached' })), /Offline: showing the catalog fetched/u);
  const expired = list(snapshot({ status: 'expired' }));
  assert.match(expired, /This catalog has expired/u);
  assert.match(expired, /<button[^>]*disabled=""[^>]*>Install<\/button>/u);
  assert.match(list(snapshot({ apps: [] })), /No Apps are listed yet/u);
  assert.match(list(snapshot({ apps: [entry({ action: 'installed', installedVersion: '0.2.0', installedWithdrawnReason: 'Broken export' })] })),
    /Your installed version was withdrawn: Broken export/u);
});

test('errors and permissions are localized', () => {
  assert.equal(describeAppPermissions(['ui.route', 'media.images', 'future.permission'], zh), '開啟自己的頁面、用你的 AI 工具產生圖片、future.permission');
  assert.equal(describeAppPermissions(['ui.route', 'media.images'], en), 'open its own page, generate images with your AI tools');
  assert.equal(describeAppMarketError({ code: 'catalog_mismatch', message: 'x' }, zh), '下載內容沒有通過驗證，所以沒有安裝任何東西。');
  assert.equal(describeAppMarketError({ code: 'app_managed_by_desktop', message: 'x' }, en), 'Included with Cats Desktop');
  assert.equal(describeAppMarketError({ code: 'catalog_changed', message: 'x' }, en), 'The catalog changed since you opened it. Review the App again before installing.');
  assert.equal(describeAppMarketError({ code: 'something_else', message: 'Server said no.' }, en), 'Server said no.');
  assert.match(list(snapshot(), zh), />安裝<\/button>/u);
});

test('a browser gets the Desktop-only notice and never asks the server', () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response('{}'); }) as typeof fetch;
  try {
    const markup = renderToStaticMarkup(<StaticRouter location="/lobby/market"><AppMarketPage desktop={false} /></StaticRouter>);
    assert.match(markup, /Install Apps from Cats Desktop/u);
    assert.doesNotMatch(markup, />Refresh</u);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(called, false);
});

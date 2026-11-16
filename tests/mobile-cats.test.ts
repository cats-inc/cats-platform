import assert from 'node:assert/strict';
import test from 'node:test';

import { createProviderAdvancedCatalogFromModelCatalog, type ProviderModelCatalog } from '../src/shared/providerCatalog.ts';
import { classifyCatalogSelection, createExplicitProviderModelSelection } from '../src/shared/providerSelection.ts';
import {
  createMobileModelSelection,
  fillMobileCopy,
  getMobileCatCopy,
  mobileCatLimit,
  mobileCatRequests,
  mobileCatSaveError,
  mobileModelChange,
  mobileProviderPaths,
  pickMobileDefaultModel,
  selectMobileCatProfile,
  type MobileAppShellPayload,
  type MobileChatCat,
  type MobileDirectoryView,
  type MobileProviderModelCatalog,
} from '../src/mobile/index.ts';

const T = '2026-11-02T00:00:00.000Z';
const NOW = new Date('2026-11-16T12:00:00.000Z');

function cat(id: string, name: string, extra: Partial<MobileChatCat> = {}): MobileChatCat {
  return { id, name, group: 'standard', avatarColor: null, createdAt: T, avatarUrl: null, status: 'active', products: ['chat'], ...extra };
}

function payload(cats: MobileChatCat[], maxCats?: number): MobileAppShellPayload {
  return {
    ownerDisplayName: 'Ken',
    ownerAvatarUrl: null,
    ownerAvatarColor: null,
    chat: {
      cats,
      channels: [],
      botBindings: [{ catId: 'mochi', platform: 'telegram' }],
      ...(maxCats ? { capabilities: { maxCats } } : {}),
    },
    lobby: { cats: [{ id: 'mochi', executionLabel: 'Claude-CLI · Opus 5.5 · medium' }] },
  };
}

const DIRECTORY: MobileDirectoryView = {
  catteries: [
    { id: 'acme', name: 'Acme', description: null, domain: null, createdAt: T, members: [] },
    { id: 'beta', name: 'Beta', description: null, domain: null, createdAt: T, members: [{ catId: 'mochi', role: 'admin', status: 'external', joinedAt: T }] },
  ],
  clowders: [
    {
      id: 'dev', name: 'Dev', description: null, parentCatteryId: 'acme', createdAt: T,
      members: [{ catId: 'mochi', role: 'lead', status: 'formal', expiresAt: null, joinedAt: T }],
    },
    {
      id: 'night', name: 'Night', description: null, parentCatteryId: null, createdAt: T,
      members: [{ catId: 'mochi', role: 'member', status: 'temp', expiresAt: '2026-11-10T00:00:00.000Z', joinedAt: T }],
    },
  ],
};

test('Cat requests are the ones Desktop sends, with ids encoded', () => {
  assert.deepEqual(mobileCatRequests.create({ name: 'Mochi', provider: 'claude', model: 'opus' }), {
    method: 'POST', path: '/api/cats', body: { name: 'Mochi', provider: 'claude', model: 'opus' },
  });
  assert.deepEqual(mobileCatRequests.update('a/b', { archive: true }), { method: 'PATCH', path: '/api/cats/a%2Fb', body: { archive: true } });
  assert.deepEqual(mobileCatRequests.remove('mochi'), { method: 'DELETE', path: '/api/cats/mochi' });
  assert.equal(mobileProviderPaths.models('claude', 'cli/default'), '/api/providers/claude/models?instance=cli%2Fdefault');
  assert.equal(mobileProviderPaths.models('codex', null), '/api/providers/codex/models');
});

test('a model pick is recorded exactly as Desktop records one', () => {
  assert.deepEqual(createMobileModelSelection('opus', 'rev-7'), createExplicitProviderModelSelection('opus', { catalogRevision: 'rev-7' }));
  assert.deepEqual(createMobileModelSelection(' opus '), createExplicitProviderModelSelection(' opus '));
  assert.equal(createMobileModelSelection('  '), null);
  // A new pick replaces the saved selection, so another model's controls do not linger.
  assert.deepEqual(mobileModelChange('claude', null, 'opus', { catalogRevision: 'rev-7' }), {
    provider: 'claude', instance: null, model: 'opus', modelSelection: { entryId: 'opus', entryMode: 'explicit', catalogRevision: 'rev-7' },
  });
});

test('a phone pick reads as current on Desktop, so no chat is flagged to repair it', () => {
  const catalog: ProviderModelCatalog = {
    catalogRevision: 'rev-7', provider: 'claude', backend: null, instance: null, defaultModel: 'opus',
    source: 'dynamic', cache: null, warnings: [],
    models: [{ id: 'opus', label: 'Opus', default: true }, { id: 'sonnet', label: 'Sonnet' }],
  };
  const selection = mobileModelChange('claude', null, 'sonnet', catalog).modelSelection!;
  assert.deepEqual(
    classifyCatalogSelection({ selection, catalog, advancedCatalog: createProviderAdvancedCatalogFromModelCatalog(catalog) }),
    { status: 'current' },
  );
});

test('a model picker opens on the Cat\'s model when it is listed, else the default', () => {
  const catalog: MobileProviderModelCatalog = {
    provider: 'claude', instance: null, defaultModel: 'sonnet',
    models: [{ id: 'haiku', label: 'Haiku' }, { id: 'sonnet', label: 'Sonnet' }, { id: 'opus', label: 'Opus', default: true }],
  };
  assert.equal(pickMobileDefaultModel(catalog, 'haiku'), 'haiku');
  assert.equal(pickMobileDefaultModel(catalog, 'gone'), 'opus');
  assert.equal(pickMobileDefaultModel({ ...catalog, models: catalog.models.slice(0, 2) }, null), 'sonnet');
  assert.equal(pickMobileDefaultModel({ ...catalog, defaultModel: null, models: [] }, null), null);
});

test('a Cat\'s screen lists its Catteries then Clowders, only by its own memberships (FR-16)', () => {
  const profile = selectMobileCatProfile(payload([cat('mochi', 'Mochi', { group: 'admin' })]), DIRECTORY, 'mochi', 'en', NOW);
  assert.ok(profile);
  assert.equal(profile.isBoss, true);
  assert.equal(profile.executionLabel, 'Claude-CLI · Opus 5.5 · medium');
  assert.equal(profile.hasBotBinding, true);
  assert.equal(selectMobileCatProfile(payload([cat('tofu', 'Tofu')]), DIRECTORY, 'tofu', 'en', NOW)?.hasBotBinding, false);
  // Mochi leads Dev in Acme but is not in Acme itself.
  assert.deepEqual(profile.memberships?.map((tag) => [tag.kind, tag.name, tag.role, tag.statusLabel, tag.ended]), [
    ['cattery', 'Beta', 'Admin', 'External', false],
    ['clowder', 'Dev', 'Lead', null, false],
    ['clowder', 'Night', 'Member', 'Temporary, ended 11/10/2026', true],
  ]);
});

test('memberships are unknown, not empty, before the Directory loads and for an archived Cat', () => {
  assert.equal(selectMobileCatProfile(payload([cat('mochi', 'Mochi')]), null, 'mochi', 'en', NOW)?.memberships, null);
  const archived = selectMobileCatProfile(payload([cat('mochi', 'Mochi', { status: 'archived' })]), DIRECTORY, 'mochi', 'en', NOW);
  assert.equal(archived?.archived, true);
  assert.equal(archived?.memberships, null);
  assert.deepEqual(selectMobileCatProfile(payload([cat('tofu', 'Tofu')]), DIRECTORY, 'tofu', 'en', NOW)?.memberships, []);
  assert.equal(selectMobileCatProfile(payload([]), DIRECTORY, 'gone', 'en', NOW), null);
});

test('the Cat limit counts active Cats, and an older server leaves it to the server', () => {
  const cats = [cat('a', 'A'), cat('b', 'B'), cat('c', 'C', { status: 'archived' })];
  assert.deepEqual(mobileCatLimit(payload(cats, 2)), { reached: true, max: 2 });
  assert.deepEqual(mobileCatLimit(payload(cats, 3)), { reached: false, max: 3 });
  assert.deepEqual(mobileCatLimit(payload(cats)), { reached: false, max: null });
});

test('Cat errors read as Desktop Settings shows them', () => {
  assert.equal(
    mobileCatSaveError('zh-TW', { error: { code: 'x', message: 'A cat named "Mochi" already exists' } }, 'failed'),
    '已存在名為「Mochi」的貓咪。',
  );
  assert.equal(mobileCatSaveError('zh-TW', null, 'Cat limit reached (max 5)'), '已達貓咪數量上限（最多 5 隻）。');
  assert.equal(mobileCatSaveError('en', { error: { message: 'Something new' } }, 'failed'), 'Something new');
});

test('Cat copy reads Desktop wording and keeps the Cat name to fill in', () => {
  const zh = getMobileCatCopy('zh-TW');
  assert.equal(zh.archiveConfirmTitle, '封存貓咪');
  assert.match(fillMobileCopy(zh.archiveWithBotConfirmMessage, { catName: 'Mochi' }), /Telegram/u);
  assert.equal(zh.recoverAction, '恢復');
  assert.equal(fillMobileCopy(zh.recoverConfirmMessage, { catName: 'Mochi' }), '要從封存復原「Mochi」嗎？');
  assert.match(fillMobileCopy(zh.deleteConfirmMessage, { catName: 'Mochi' }), /^要刪除「Mochi」嗎？/u);
  assert.equal(zh.deleteConfirmAction, '刪除');
  assert.equal(getMobileCatCopy('en').limitReached, 'Cat limit reached');
});

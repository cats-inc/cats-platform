import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCatsCanvasRedirect } from '../src/products/shared/renderer/components/cats/catsSupport.ts';
import {
  buildCatProfilePath,
  buildCatSettingsPath,
} from '../src/shared/catsDirectoryPaths.ts';

// The cats canvas reads the selected cat only from its URL
// (`/entities/cats/:catId/settings`); this rule decides where a URL that
// names no visible cat goes.
const mochi = { id: 'mochi', status: 'active' as const };
const tofu = { id: 'tofu', status: 'active' as const };
const kuro = { id: 'kuro', status: 'archived' as const };

function resolve(overrides: Partial<Parameters<typeof resolveCatsCanvasRedirect>[0]>) {
  return resolveCatsCanvasRedirect({
    isCreateRoute: false,
    selectedCatId: null,
    cats: [mochi, tofu, kuro],
    sortedActiveCats: [mochi, tofu],
    sortedArchivedCats: [kuro],
    showArchived: false,
    ...overrides,
  });
}

test('cat paths: the profile stays at /entities/cats/:id, settings sit beside it', () => {
  assert.equal(buildCatProfilePath('mochi'), '/entities/cats/mochi');
  assert.equal(buildCatSettingsPath('mochi'), '/entities/cats/mochi/settings');
  assert.equal(buildCatSettingsPath('a/b'), '/entities/cats/a%2Fb/settings');
});

test('with no cats at all, the roster opens the add-cat flow', () => {
  assert.equal(
    resolve({ cats: [], sortedActiveCats: [], sortedArchivedCats: [] }),
    '/entities/cats/new',
  );
});

test('the roster root opens the first active cat in the display order', () => {
  assert.equal(resolve({}), '/entities/cats/mochi/settings');
});

test('a URL naming a visible cat stays put', () => {
  assert.equal(resolve({ selectedCatId: 'tofu' }), null);
});

test('a deleted cat falls back to the first active cat', () => {
  assert.equal(resolve({ selectedCatId: 'gone' }), '/entities/cats/mochi/settings');
});

test('an archived cat stays while archived rows show, and falls back once they are hidden', () => {
  assert.equal(resolve({ selectedCatId: 'kuro', showArchived: true }), null);
  assert.equal(resolve({ selectedCatId: 'kuro', showArchived: false }), '/entities/cats/mochi/settings');
});

test('with only archived cats, the first archived cat opens when archived rows show', () => {
  const onlyArchived = { cats: [kuro], sortedActiveCats: [], sortedArchivedCats: [kuro] };
  assert.equal(resolve({ ...onlyArchived, showArchived: true }), '/entities/cats/kuro/settings');
  assert.equal(resolve({ ...onlyArchived, showArchived: false }), '/entities/cats/new');
});

test('the add-cat route never redirects', () => {
  assert.equal(
    resolve({ isCreateRoute: true, cats: [], sortedActiveCats: [], sortedArchivedCats: [] }),
    null,
  );
});

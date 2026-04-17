import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findNewlyCreatedActiveCat,
  hasModelSelectionChanged,
} from '../src/products/shared/renderer/components/settings-cats/settingsCatsSupport.ts';

test('hasModelSelectionChanged treats advanced-control changes as dirty', () => {
  assert.equal(
    hasModelSelectionChanged(
      {
        controls: {
          'claude.reasoning_effort': 'medium',
        },
      },
      {
        controls: {
          'claude.reasoning_effort': 'xhigh',
        },
      },
    ),
    true,
  );
});

test('findNewlyCreatedActiveCat identifies the new active cat from the mutation payload', () => {
  const nextCat = findNewlyCreatedActiveCat(
    [
      { id: 'cat-1' },
      { id: 'cat-2' },
    ],
    [
      { id: 'cat-1', status: 'active' },
      { id: 'cat-2', status: 'active' },
      { id: 'cat-3', status: 'archived' },
      { id: 'cat-4', status: 'active' },
    ] as never,
  );

  assert.equal(nextCat?.id, 'cat-4');
});

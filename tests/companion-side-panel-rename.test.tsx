import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPANION_SIDE_PANEL_SECTION_IDS,
  companionTabLabel,
} from '../src/products/chat/renderer/companionViewTypes.ts';

test('companion side panel ships the SPEC-085 labels in the new order', () => {
  assert.deepEqual(
    COMPANION_SIDE_PANEL_SECTION_IDS.map((id) => companionTabLabel(id)),
    ['Status', 'Sources', 'Memory', 'Behavior', 'Inspector'],
  );
});

test('companion side panel does not include the dropped Creations section', () => {
  assert.equal(
    COMPANION_SIDE_PANEL_SECTION_IDS.includes('creations' as never),
    false,
  );
});

test('Inspector is the last side-panel entry', () => {
  const lastId =
    COMPANION_SIDE_PANEL_SECTION_IDS[COMPANION_SIDE_PANEL_SECTION_IDS.length - 1];
  assert.equal(lastId, 'inspector');
});

test('label mapping covers every side-panel id', () => {
  assert.equal(companionTabLabel('overview'), 'Status');
  assert.equal(companionTabLabel('resources'), 'Sources');
  assert.equal(companionTabLabel('memory'), 'Memory');
  assert.equal(companionTabLabel('settings'), 'Behavior');
  assert.equal(companionTabLabel('inspector'), 'Inspector');
});

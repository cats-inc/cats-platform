import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGACY_COMPANION_SIDE_PANEL_SECTION_IDS,
  PROFILE_IA_COMPANION_SIDE_PANEL_SECTION_IDS,
  companionProfileIaTabLabel,
  companionTabLabel,
} from '../src/products/chat/renderer/companionViewTypes.ts';

test('legacy side panel keeps the original five-section order', () => {
  assert.deepEqual(
    LEGACY_COMPANION_SIDE_PANEL_SECTION_IDS.map((id) => companionTabLabel(id)),
    ['Overview', 'Resources', 'Creations', 'Memory', 'Settings'],
  );
});

test('profile-IA side panel ships the SPEC-085 labels in the new order', () => {
  assert.deepEqual(
    PROFILE_IA_COMPANION_SIDE_PANEL_SECTION_IDS.map((id) =>
      companionProfileIaTabLabel(id),
    ),
    ['Status', 'Sources', 'Memory', 'Behavior', 'Inspector'],
  );
});

test('profile-IA side panel drops the Creations section from the side surface', () => {
  assert.equal(
    PROFILE_IA_COMPANION_SIDE_PANEL_SECTION_IDS.includes('creations'),
    false,
  );
});

test('profile-IA side panel introduces the Inspector section as the last entry', () => {
  const lastId =
    PROFILE_IA_COMPANION_SIDE_PANEL_SECTION_IDS[
      PROFILE_IA_COMPANION_SIDE_PANEL_SECTION_IDS.length - 1
    ];
  assert.equal(lastId, 'inspector');
});

test('legacy and profile-IA labels diverge for overview / resources / settings; memory stays', () => {
  assert.equal(companionTabLabel('overview'), 'Overview');
  assert.equal(companionProfileIaTabLabel('overview'), 'Status');

  assert.equal(companionTabLabel('resources'), 'Resources');
  assert.equal(companionProfileIaTabLabel('resources'), 'Sources');

  assert.equal(companionTabLabel('settings'), 'Settings');
  assert.equal(companionProfileIaTabLabel('settings'), 'Behavior');

  assert.equal(companionTabLabel('memory'), 'Memory');
  assert.equal(companionProfileIaTabLabel('memory'), 'Memory');
});

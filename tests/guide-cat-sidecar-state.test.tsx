import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collapseGuideCatSidecarState,
  toggleGuideCatSidecarState,
} from '../src/app/renderer/useGuideCatSidecarState.ts';
import { resolveGuideCatSidecarAnchorSelector } from '../src/design/components/GuideCatSidecar.tsx';

test('Guide Cat sidecar collapse persists seen state only when dismissing welcome-peek', () => {
  assert.deepEqual(collapseGuideCatSidecarState('welcome-peek'), {
    nextState: 'collapsed',
    persistSeen: true,
  });
  assert.deepEqual(collapseGuideCatSidecarState('open'), {
    nextState: 'collapsed',
    persistSeen: false,
  });
  assert.deepEqual(collapseGuideCatSidecarState('collapsed'), {
    nextState: 'collapsed',
    persistSeen: false,
  });
});

test('Guide Cat sidecar toggle persists seen state when promoting welcome-peek into open', () => {
  assert.deepEqual(toggleGuideCatSidecarState('collapsed'), {
    nextState: 'open',
    persistSeen: false,
  });
  assert.deepEqual(toggleGuideCatSidecarState('welcome-peek'), {
    nextState: 'open',
    persistSeen: true,
  });
  assert.deepEqual(toggleGuideCatSidecarState('open'), {
    nextState: 'collapsed',
    persistSeen: false,
  });
});

test('Guide Cat sidecar anchors to Lobby content and product canvas but hides on setup/settings', () => {
  assert.equal(resolveGuideCatSidecarAnchorSelector('/lobby'), '.platformLobby');
  assert.equal(resolveGuideCatSidecarAnchorSelector('/chat'), '.canvas');
  assert.equal(resolveGuideCatSidecarAnchorSelector('/work'), '.canvas');
  assert.equal(resolveGuideCatSidecarAnchorSelector('/code/task-1'), '.canvas');
  assert.equal(resolveGuideCatSidecarAnchorSelector('/setup'), null);
  assert.equal(resolveGuideCatSidecarAnchorSelector('/settings/general'), null);
});

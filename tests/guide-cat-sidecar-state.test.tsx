import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import {
  collapseGuideCatSidecarState,
  resolveGuideCatSidecarPreferenceState,
  toggleGuideCatSidecarState,
} from '../src/app/renderer/useGuideCatSidecarState.ts';
import {
  GUIDE_CAT_AVATAR_URL,
  GuideCatSidecarView,
  resolveGuideCatSidecarAnchorSelector,
  resolveGuideCatSidecarOffsets,
  resolveGuideCatSidecarSurfaceMode,
} from '../src/design/components/GuideCatSidecar.tsx';

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

test('Guide Cat sidecar toggle respects interaction mode transitions', () => {
  assert.deepEqual(toggleGuideCatSidecarState('collapsed', 'auto'), {
    nextState: 'open',
    persistSeen: false,
  });
  assert.deepEqual(toggleGuideCatSidecarState('collapsed', 'bubble'), {
    nextState: 'welcome-peek',
    persistSeen: false,
  });
  assert.deepEqual(toggleGuideCatSidecarState('welcome-peek', 'drawer'), {
    nextState: 'open',
    persistSeen: true,
  });
  assert.deepEqual(toggleGuideCatSidecarState('welcome-peek', 'bubble'), {
    nextState: 'collapsed',
    persistSeen: true,
  });
  assert.deepEqual(toggleGuideCatSidecarState('open', 'drawer'), {
    nextState: 'collapsed',
    persistSeen: false,
  });
});

test('Guide Cat sidecar preference state recalculates from seen flag and interaction mode', () => {
  assert.equal(resolveGuideCatSidecarPreferenceState(false, 'auto'), 'welcome-peek');
  assert.equal(resolveGuideCatSidecarPreferenceState(false, 'bubble'), 'welcome-peek');
  assert.equal(resolveGuideCatSidecarPreferenceState(false, 'drawer'), 'collapsed');
  assert.equal(resolveGuideCatSidecarPreferenceState(true, 'auto'), 'collapsed');
  assert.equal(resolveGuideCatSidecarPreferenceState(true, 'bubble'), 'collapsed');
});

test('Guide Cat sidecar anchors to Lobby content and product canvas but hides on setup/settings', () => {
  assert.equal(resolveGuideCatSidecarAnchorSelector('/lobby'), null);
  assert.equal(resolveGuideCatSidecarAnchorSelector('/chat'), '.canvas');
  assert.equal(resolveGuideCatSidecarAnchorSelector('/work'), '.canvas');
  assert.equal(resolveGuideCatSidecarAnchorSelector('/code/task-1'), '.canvas');
  assert.equal(resolveGuideCatSidecarAnchorSelector('/setup'), null);
  assert.equal(resolveGuideCatSidecarAnchorSelector('/settings/general'), null);
});

test('Guide Cat sidecar resolves surface mode by route', () => {
  assert.equal(resolveGuideCatSidecarSurfaceMode('/lobby'), 'lobby');
  assert.equal(resolveGuideCatSidecarSurfaceMode('/chat'), 'product');
  assert.equal(resolveGuideCatSidecarSurfaceMode('/work'), 'product');
  assert.equal(resolveGuideCatSidecarSurfaceMode('/settings/general'), 'hidden');
  assert.equal(resolveGuideCatSidecarSurfaceMode('/setup'), 'hidden');
});

test('Guide Cat sidecar uses different offsets for Lobby and product surfaces', () => {
  assert.deepEqual(resolveGuideCatSidecarOffsets('/lobby', 0), {
    pillLeft: 18,
    peekLeft: 56,
    panelLeft: 0,
  });
  assert.deepEqual(resolveGuideCatSidecarOffsets('/chat', 260), {
    pillLeft: 276,
    peekLeft: 304,
    panelLeft: 262,
  });
});

test('Guide Cat sidecar avatar resolves from the shared guide cat asset', () => {
  assert.match(GUIDE_CAT_AVATAR_URL, /guide-cat-avatar.*\.svg|guide-cat-avatar/u);
});

test('Guide Cat sidecar welcome-peek renders the dismiss confirmation dialog when present', () => {
  const markup = renderToStaticMarkup(
    <GuideCatSidecarView
      viewState="welcome-peek"
      guideCat={{
        id: 'guide-cat-primary',
        name: 'Guide Cat',
        status: 'active',
        executionTarget: {
          provider: 'claude',
          instance: null,
          model: 'claude-sonnet',
        },
        modelSelection: null,
        createdAt: '2026-04-08T00:00:00.000Z',
        updatedAt: '2026-04-08T00:00:00.000Z',
      }}
      ownerDisplayName="Kenny"
      unreadCount={0}
      onToggle={() => {}}
      onAction={() => {}}
      onCollapse={() => {}}
      onDismissWelcome={() => {}}
      onDismissClick={() => {}}
      anchorStyle={{}}
      surfaceMode="lobby"
      dialog={{
        options: {
          title: 'Dismiss Guide Cat?',
          message: 'Your guide cat will be hidden. You can restore it later from Settings.',
          confirmLabel: 'Dismiss',
          cancelLabel: 'Keep',
        },
      }}
      onDialogClose={() => {}}
    />,
  );

  assert.match(markup, /Dismiss Guide Cat\?/u);
  assert.match(markup, /restore it later from Settings/u);
  assert.match(markup, /Keep/u);
  assert.match(markup, /Dismiss/u);
});

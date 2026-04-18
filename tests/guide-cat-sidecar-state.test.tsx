import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { shouldRenderGuideCatSidecar } from '../src/app/renderer/App.tsx';
import {
  collapseGuideCatSidecarState,
  consumeGuideCatProactiveGreeting,
  queueGuideCatProactiveGreeting,
  resolveGuideCatSidecarProactiveState,
  resolveGuideCatSidecarPreferenceState,
  toggleGuideCatSidecarState,
} from '../src/app/renderer/useGuideCatSidecarState.ts';
import {
  GUIDE_CAT_AVATAR_URL,
  GuideCatSidecarView,
  resolveGuideCatSidecarSurfaceMode,
} from '../src/design/components/GuideCatSidecar.tsx';
import {
  clearRememberedExecutionLabels,
  rememberExecutionLabel,
} from '../src/shared/executionLabel.ts';

function createGuideCat() {
  return {
    id: 'guide-cat-primary',
    name: 'Guide Cat',
    status: 'active' as const,
    executionTarget: {
      provider: 'claude',
      instance: 'native',
      model: 'opus',
    },
    modelSelection: {
      entryMode: 'explicit' as const,
      controls: {
        'claude.reasoning_effort': 'max',
      },
    },
    createdAt: '2026-04-08T00:00:00.000Z',
    updatedAt: '2026-04-08T00:00:00.000Z',
  };
}

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

test('Guide Cat sidecar resting state stays collapsed by default', () => {
  assert.equal(resolveGuideCatSidecarPreferenceState(), 'collapsed');
});

test('Guide Cat proactive greeting uses bubble-style peek except in drawer mode', () => {
  assert.equal(resolveGuideCatSidecarProactiveState('auto'), 'welcome-peek');
  assert.equal(resolveGuideCatSidecarProactiveState('bubble'), 'welcome-peek');
  assert.equal(resolveGuideCatSidecarProactiveState('drawer'), 'open');
});

test('Guide Cat proactive greeting queue waits until a visible route before consuming a trigger', () => {
  const queued = queueGuideCatProactiveGreeting(
    { lastQueuedToken: 0, pendingToken: null },
    1,
  );
  assert.deepEqual(queued, { lastQueuedToken: 1, pendingToken: 1 });

  const hidden = consumeGuideCatProactiveGreeting(queued, true);
  assert.equal(hidden.shouldOpen, false);
  assert.deepEqual(hidden.queue, queued);

  const visible = consumeGuideCatProactiveGreeting(hidden.queue, false);
  assert.equal(visible.shouldOpen, true);
  assert.deepEqual(visible.queue, { lastQueuedToken: 1, pendingToken: null });
});

test('Guide Cat proactive greeting queue ignores duplicate tokens and accepts newer triggers', () => {
  const initial = { lastQueuedToken: 1, pendingToken: null };
  assert.equal(queueGuideCatProactiveGreeting(initial, 1), initial);
  assert.deepEqual(
    queueGuideCatProactiveGreeting(initial, 2),
    { lastQueuedToken: 2, pendingToken: 2 },
  );
});

test('Guide Cat sidecar resolves surface mode by route', () => {
  assert.equal(resolveGuideCatSidecarSurfaceMode('/lobby'), 'lobby');
  assert.equal(resolveGuideCatSidecarSurfaceMode('/chat'), 'product');
  assert.equal(resolveGuideCatSidecarSurfaceMode('/work'), 'product');
  assert.equal(resolveGuideCatSidecarSurfaceMode('/settings/general'), 'hidden');
  assert.equal(resolveGuideCatSidecarSurfaceMode('/setup'), 'hidden');
});

test('Guide Cat sidecar stays hidden while a product surface fallback is active', () => {
  assert.equal(
    shouldRenderGuideCatSidecar({
      guideCat: createGuideCat(),
      productSurfaceFallbackActive: true,
    }),
    false,
  );
  assert.equal(
    shouldRenderGuideCatSidecar({
      guideCat: createGuideCat(),
      productSurfaceFallbackActive: false,
    }),
    true,
  );
  assert.equal(
    shouldRenderGuideCatSidecar({
      guideCat: { ...createGuideCat(), status: 'dismissed' },
      productSurfaceFallbackActive: false,
    }),
    false,
  );
});

test('Guide Cat sidecar avatar resolves from the shared guide cat asset', () => {
  assert.match(GUIDE_CAT_AVATAR_URL, /guide-cat-avatar.*\.svg|guide-cat-avatar/u);
});

test('Guide Cat sidecar collapsed pill shows the same execution tooltip metadata on lobby and product surfaces', () => {
  const markup = renderToStaticMarkup(
    <GuideCatSidecarView
      viewState="collapsed"
      guideCat={createGuideCat()}
      ownerDisplayName="Kenny"
      unreadCount={2}
      onToggle={() => {}}
      onAction={() => {}}
      onCollapse={() => {}}
      onDismissClick={() => {}}
      pillStyle={{}}
      peekStyle={{}}
      panelStyle={{}}
      surfaceMode="lobby"
      dialog={null}
      onDialogClose={() => {}}
    />,
  );

  assert.match(markup, /class="guideCatPill"/u);
  assert.match(markup, /data-tooltip="Guide Cat · Claude-CLI · [^"]* · Max"/u);
});

test('Guide Cat sidecar open panel header keeps the execution tooltip metadata on product pages', () => {
  const markup = renderToStaticMarkup(
    <GuideCatSidecarView
      viewState="open"
      guideCat={createGuideCat()}
      ownerDisplayName="Kenny"
      unreadCount={0}
      onToggle={() => {}}
      onAction={() => {}}
      onCollapse={() => {}}
      onDismissClick={() => {}}
      pillStyle={{}}
      peekStyle={{}}
      panelStyle={{}}
      surfaceMode="product"
      dialog={null}
      onDialogClose={() => {}}
    />,
  );

  assert.match(markup, /class="guideCatPanelHeader" data-tooltip="Guide Cat · Claude-CLI · [^"]* · Max"/u);
});

test('Guide Cat sidecar reuses remembered runtime-backed execution labels for tooltips', () => {
  clearRememberedExecutionLabels();
  rememberExecutionLabel({
    provider: 'claude',
    instance: 'native',
    model: 'opus',
    modelSelection: {
      controls: {
        'claude.reasoning_effort': 'max',
      },
    },
    executionLabel: 'Claude-CLI · Opus 4.7 with 1M context · xHigh',
  });

  try {
    const markup = renderToStaticMarkup(
      <GuideCatSidecarView
        viewState="collapsed"
        guideCat={createGuideCat()}
        ownerDisplayName="Kenny"
        unreadCount={0}
        onToggle={() => {}}
        onAction={() => {}}
        onCollapse={() => {}}
        onDismissClick={() => {}}
        pillStyle={{}}
        peekStyle={{}}
        panelStyle={{}}
        surfaceMode="product"
        dialog={null}
        onDialogClose={() => {}}
      />,
    );

    assert.match(
      markup,
      /data-tooltip="Guide Cat · Claude-CLI · Opus 4\.7 with 1M context · xHigh"/u,
    );
  } finally {
    clearRememberedExecutionLabels();
  }
});

test('Guide Cat sidecar welcome-peek renders the dismiss confirmation dialog when present', () => {
  const markup = renderToStaticMarkup(
    <GuideCatSidecarView
      viewState="welcome-peek"
      guideCat={createGuideCat()}
      ownerDisplayName="Kenny"
      unreadCount={0}
      onToggle={() => {}}
      onAction={() => {}}
      onCollapse={() => {}}
      onDismissWelcome={() => {}}
      onDismissClick={() => {}}
      pillStyle={{}}
      peekStyle={{}}
      panelStyle={{}}
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

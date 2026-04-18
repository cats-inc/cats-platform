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
  tickGuideCatProactiveGreeting,
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
import { resolveGuideCatSystemName } from '../src/shared/guideCatIdentity.ts';

function createGuideCat() {
  return {
    id: 'guide-cat-primary',
    name: 'Catlas',
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

test('tickGuideCatProactiveGreeting does nothing at token=0 and no pending greeting', () => {
  const result = tickGuideCatProactiveGreeting({
    queue: { lastQueuedToken: 0, pendingToken: null },
    token: 0,
    isHiddenRoute: false,
    mode: 'auto',
  });
  assert.equal(result.commit, null);
  assert.deepEqual(result.queue, { lastQueuedToken: 0, pendingToken: null });
});

test('tickGuideCatProactiveGreeting commits a peek on a fresh token bump in a visible route', () => {
  const result = tickGuideCatProactiveGreeting({
    queue: { lastQueuedToken: 0, pendingToken: null },
    token: 1,
    isHiddenRoute: false,
    mode: 'auto',
  });
  assert.deepEqual(result.commit, { innerState: 'welcome-peek', proactive: true });
  assert.deepEqual(result.queue, { lastQueuedToken: 1, pendingToken: null });
});

test('tickGuideCatProactiveGreeting defers the greeting on hidden routes and keeps the token pending', () => {
  const result = tickGuideCatProactiveGreeting({
    queue: { lastQueuedToken: 0, pendingToken: null },
    token: 1,
    isHiddenRoute: true,
    mode: 'bubble',
  });
  assert.equal(result.commit, null);
  assert.deepEqual(result.queue, { lastQueuedToken: 1, pendingToken: 1 });
});

test('tickGuideCatProactiveGreeting ignores the same token after it has been consumed, even if mode changed', () => {
  const consumed = { lastQueuedToken: 1, pendingToken: null };
  const result = tickGuideCatProactiveGreeting({
    queue: consumed,
    token: 1,
    isHiddenRoute: false,
    mode: 'drawer',
  });
  assert.equal(result.commit, null);
  assert.equal(result.queue, consumed);
});

test('tickGuideCatProactiveGreeting uses the latest mode for a newer token after the previous one was consumed', () => {
  const consumed = { lastQueuedToken: 1, pendingToken: null };
  const result = tickGuideCatProactiveGreeting({
    queue: consumed,
    token: 2,
    isHiddenRoute: false,
    mode: 'drawer',
  });
  assert.deepEqual(result.commit, { innerState: 'open', proactive: true });
  assert.deepEqual(result.queue, { lastQueuedToken: 2, pendingToken: null });
});

test('Guide Cat sidecar resolves surface mode by route', () => {
  assert.equal(resolveGuideCatSidecarSurfaceMode('/lobby'), 'lobby');
  assert.equal(resolveGuideCatSidecarSurfaceMode('/chat'), 'product');
  assert.equal(resolveGuideCatSidecarSurfaceMode('/work'), 'product');
  assert.equal(resolveGuideCatSidecarSurfaceMode('/settings/general'), 'hidden');
  assert.equal(resolveGuideCatSidecarSurfaceMode('/setup'), 'hidden');
});

test('Guide Cat sidecar keeps product surface for docked pill on /settings', () => {
  assert.equal(resolveGuideCatSidecarSurfaceMode('/settings', 'docked'), 'product');
  assert.equal(resolveGuideCatSidecarSurfaceMode('/settings/general', 'docked'), 'product');
  // Setup has no dock, so it stays hidden even if placement is docked.
  assert.equal(resolveGuideCatSidecarSurfaceMode('/setup', 'docked'), 'hidden');
});

test('toggleGuideCatSidecarState on a cramped surface downgrades auto to welcome-peek instead of open', () => {
  // Cramped surface (e.g. /settings with a docked pill): auto clicks behave
  // like bubble mode so the drawer does not smother the settings canvas.
  assert.deepEqual(
    toggleGuideCatSidecarState('collapsed', 'auto', true),
    { nextState: 'welcome-peek', persistSeen: false },
  );
  assert.deepEqual(
    toggleGuideCatSidecarState('welcome-peek', 'auto', true),
    { nextState: 'collapsed', persistSeen: true },
  );
  // Drawer users opted into the full panel — keep it even on a cramped
  // surface.
  assert.deepEqual(
    toggleGuideCatSidecarState('collapsed', 'drawer', true),
    { nextState: 'open', persistSeen: false },
  );
  // Default (prefersBubble=false) path still matches the pre-existing
  // manual-toggle contract for auto mode.
  assert.deepEqual(
    toggleGuideCatSidecarState('collapsed', 'auto'),
    { nextState: 'open', persistSeen: false },
  );
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
  const guideCatName = resolveGuideCatSystemName(null);
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
  assert.match(markup, new RegExp(`data-tooltip="${guideCatName} · Claude-CLI · [^\"]* · Max"`, 'u'));
});

test('Guide Cat sidecar open panel header keeps the execution tooltip metadata on product pages', () => {
  const guideCatName = resolveGuideCatSystemName(null);
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

  assert.match(
    markup,
    new RegExp(`class="guideCatPanelHeader" data-tooltip="${guideCatName} · Claude-CLI · [^\"]* · Max"`, 'u'),
  );
});

test('Guide Cat sidecar reuses remembered runtime-backed execution labels for tooltips', () => {
  const guideCatName = resolveGuideCatSystemName(null);
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
      new RegExp(`data-tooltip="${guideCatName} · Claude-CLI · Opus 4\\.7 with 1M context · xHigh"`, 'u'),
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
          title: 'Disable Catlas?',
          message: 'This turns off Catlas help in Cats. If you just want it out of the way, you can dock it now instead. You can enable it again from Settings > Assistants.',
          confirmLabel: 'Disable',
          cancelLabel: 'Keep enabled',
          auxiliaryLabel: 'Dock now',
          defaultAction: 'auxiliary',
        },
      }}
      onDialogClose={() => {}}
    />,
  );

  assert.match(markup, /Disable Catlas\?/u);
  assert.match(markup, /dock it now instead/u);
  assert.match(markup, /Settings &gt; Assistants/u);
  assert.match(markup, /Keep enabled/u);
  assert.match(markup, /Dock now/u);
  assert.match(markup, /Disable/u);
});

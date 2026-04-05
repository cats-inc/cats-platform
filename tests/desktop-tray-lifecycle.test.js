import assert from 'node:assert/strict';
import test from 'node:test';

import { createGuardedTrayLifecycle } from '../build/desktop/trayLifecycle.js';

test('guarded tray lifecycle ignores menu updates after disposal', () => {
  const appliedStates = [];
  let destroyCalls = 0;
  const lifecycle = createGuardedTrayLifecycle({
    apply(state) {
      appliedStates.push(state);
    },
    destroy() {
      destroyCalls += 1;
    },
  });

  lifecycle.update('starting');
  lifecycle.dispose();
  lifecycle.update('after-dispose');
  lifecycle.dispose();

  assert.deepEqual(appliedStates, ['starting']);
  assert.equal(destroyCalls, 1);
  assert.equal(lifecycle.isDisposed(), true);
});


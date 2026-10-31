import assert from 'node:assert/strict';
import test from 'node:test';

import { showDesktopUpdateMessageBox } from '../build/desktop/updateDialogPresenter.js';

const dialogSpec = {
  title: 'Update available',
  message: 'Cats 0.9.2 is available.',
  detail: 'The installed app is replaced in place.',
  buttons: ['Update and Restart', 'Later'],
  action: 'update',
};

function fixture(overrides = {}) {
  const events = [];
  const focusListeners = new Set();
  let destroyed = false;
  const window = {
    // Mirrors a real window: it becomes key, and emits focus, once Cats is active.
    focusesOnFocus: true,
    show() { events.push('show'); },
    focus() {
      events.push('focus-window');
      if (window.focusesOnFocus) queueMicrotask(() => window.emitFocus());
    },
    once(event, listener) {
      assert.equal(event, 'focus');
      focusListeners.add(listener);
    },
    removeListener(event, listener) {
      assert.equal(event, 'focus');
      focusListeners.delete(listener);
    },
    emitFocus() {
      const listeners = [...focusListeners];
      focusListeners.clear();
      for (const listener of listeners) listener();
    },
    listenerCount: () => focusListeners.size,
    isDestroyed() { return destroyed; },
    destroy() { destroyed = true; events.push('destroy'); },
  };
  return {
    events,
    window,
    input: {
      platform: 'darwin',
      dialogSpec,
      createActivationWindow(options) {
        events.push('create');
        assert.equal(options.width, 1);
        assert.equal(options.height, 1);
        assert.equal(options.show, false);
        assert.equal(options.transparent, true);
        assert.equal(options.frame, false);
        assert.equal(options.hasShadow, false);
        assert.equal(options.skipTaskbar, true);
        return window;
      },
      focusApp() { events.push('focus-app'); },
      isShuttingDown: () => false,
      showMessageBox: async (...args) => {
        events.push('dialog');
        assert.equal(args.length, 1, 'the alert is parentless so macOS places it');
        return { response: 1, checkboxChecked: false };
      },
      activationTimeoutMs: 1_000,
      ...overrides,
    },
  };
}

test('macOS activates Cats through a transient window and releases it before the standard alert', async () => {
  const f = fixture();
  f.input.showMessageBox = async (...args) => {
    f.events.push('dialog');
    const [options] = args;
    assert.equal(args.length, 1, 'a parent would make the alert a sheet hanging from that window');
    assert.equal(f.window.isDestroyed(), true, 'no window may stay behind the alert');
    assert.equal(options.type, 'question');
    assert.equal(options.message, dialogSpec.message);
    assert.deepEqual(options.buttons, dialogSpec.buttons);
    assert.equal(options.defaultId, 0);
    assert.equal(options.cancelId, 1);
    return { response: 1, checkboxChecked: false };
  };

  assert.equal(await showDesktopUpdateMessageBox(f.input), 1);
  assert.deepEqual(f.events, ['create', 'show', 'focus-app', 'focus-window', 'destroy', 'dialog']);
});

test('macOS waits for the window to become key before opening the alert', async () => {
  const f = fixture();
  f.window.focusesOnFocus = false;
  const pending = showDesktopUpdateMessageBox(f.input);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(f.events, ['create', 'show', 'focus-app', 'focus-window'], 'the alert waits for activation');
  f.window.emitFocus();
  assert.equal(await pending, 1);
  assert.deepEqual(f.events.slice(-2), ['destroy', 'dialog']);
});

test('macOS still opens the alert when activation never arrives', async () => {
  const f = fixture({ activationTimeoutMs: 5 });
  f.window.focusesOnFocus = false;
  assert.equal(await showDesktopUpdateMessageBox(f.input), 1);
  assert.deepEqual(f.events.slice(-2), ['destroy', 'dialog']);
  assert.equal(f.window.listenerCount(), 0, 'the timed-out focus listener is released');
});

for (const [label, spec, dismissal] of [
  ['an offer', dialogSpec, 1],
  ['a single-button result', { ...dialogSpec, action: 'none', buttons: ['OK'] }, 0],
]) {
  test(`macOS answers ${label} with its dismissal when quitting begins during activation`, async () => {
    let shuttingDown = false;
    const f = fixture({ dialogSpec: spec, isShuttingDown: () => shuttingDown });
    f.window.focusesOnFocus = false;
    const pending = showDesktopUpdateMessageBox(f.input);
    await new Promise((resolve) => setImmediate(resolve));
    shuttingDown = true;
    f.window.emitFocus();
    assert.equal(await pending, dismissal);
    assert.equal(f.events.includes('dialog'), false, 'no alert opens over a host that is quitting');
    assert.equal(f.events.at(-1), 'destroy');
  });
}

test('macOS releases the activation window when focusing it fails', async () => {
  const failure = new Error('focus failed');
  const f = fixture();
  f.window.focus = () => { throw failure; };
  await assert.rejects(showDesktopUpdateMessageBox(f.input), failure);
  assert.equal(f.events.at(-1), 'destroy');
  assert.equal(f.events.includes('dialog'), false);
});

for (const synchronous of [false, true]) {
  test(`macOS propagates a failing alert after releasing the window (${synchronous ? 'throw' : 'reject'})`, async () => {
    const failure = new Error('dialog failed');
    const f = fixture({
      showMessageBox() {
        f.events.push('dialog');
        if (synchronous) throw failure;
        return Promise.reject(failure);
      },
    });
    await assert.rejects(showDesktopUpdateMessageBox(f.input), failure);
    assert.deepEqual(f.events.slice(-2), ['destroy', 'dialog']);
  });
}

test('a window closed during shutdown is not destroyed again', async () => {
  const f = fixture();
  f.window.focus = () => {
    f.events.push('focus-window');
    f.window.destroy();
    queueMicrotask(() => f.window.emitFocus());
  };
  assert.equal(await showDesktopUpdateMessageBox(f.input), 1);
  assert.equal(f.events.filter((event) => event === 'destroy').length, 1);
});

for (const platform of ['win32', 'linux']) {
  test(`${platform} keeps the existing parentless dialog and response`, async () => {
    const f = fixture({ platform, dialogSpec: { ...dialogSpec, action: 'none', buttons: ['OK'] } });
    f.input.createActivationWindow = () => assert.fail('only macOS needs an activation window');
    f.input.showMessageBox = async (...args) => {
      f.events.push('dialog');
      assert.equal(args.length, 1);
      assert.equal(args[0].type, 'info');
      assert.equal(args[0].cancelId, 0);
      return { response: 0, checkboxChecked: false };
    };
    assert.equal(await showDesktopUpdateMessageBox(f.input), 0);
    assert.deepEqual(f.events, ['focus-app', 'dialog']);
  });
}

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
  let destroyed = false;
  const owner = {
    show() { events.push('show'); },
    focus() { events.push('focus-owner'); },
    isDestroyed() { return destroyed; },
    destroy() { destroyed = true; events.push('destroy'); },
  };
  return {
    events,
    owner,
    input: {
      platform: 'darwin',
      dialogSpec,
      createOwner(options) {
        events.push('create');
        assert.equal(options.show, false);
        assert.equal(options.transparent, true);
        assert.equal(options.frame, false);
        assert.equal(options.hasShadow, false);
        assert.equal(options.skipTaskbar, true);
        return owner;
      },
      focusApp() { events.push('focus-app'); },
      showMessageBox: async () => ({ response: 1, checkboxChecked: false }),
      ...overrides,
    },
  };
}

test('macOS creates the native sheet before activating and focusing its owner', async () => {
  const f = fixture();
  let dismiss;
  f.input.showMessageBox = (options, owner) => {
    f.events.push('sheet');
    assert.equal(owner, f.owner, 'a parentless macOS message box blocks before focus can run');
    assert.equal(options.type, 'question');
    assert.equal(options.message, dialogSpec.message);
    assert.deepEqual(options.buttons, dialogSpec.buttons);
    assert.equal(options.defaultId, 0);
    assert.equal(options.cancelId, 1);
    return new Promise((resolve) => { dismiss = resolve; });
  };

  const pending = showDesktopUpdateMessageBox(f.input);
  assert.deepEqual(f.events, ['create', 'show', 'sheet', 'focus-app', 'focus-owner']);
  dismiss({ response: 1, checkboxChecked: false });
  assert.equal(await pending, 1);
  assert.equal(f.events.at(-1), 'destroy', 'the owner lives only as long as the dialog');
});

for (const synchronous of [false, true]) {
  test(`macOS destroys the owner when presenting the dialog fails (${synchronous ? 'throw' : 'reject'})`, async () => {
    const failure = new Error('dialog failed');
    const f = fixture({
      showMessageBox() {
        if (synchronous) throw failure;
        return Promise.reject(failure);
      },
    });
    await assert.rejects(showDesktopUpdateMessageBox(f.input), failure);
    assert.equal(f.events.at(-1), 'destroy');
  });
}

test('closing an owner during shutdown does not destroy it again', async () => {
  const f = fixture();
  f.input.showMessageBox = async () => {
    f.owner.destroy();
    return { response: 1, checkboxChecked: false };
  };
  assert.equal(await showDesktopUpdateMessageBox(f.input), 1);
  assert.equal(f.events.filter((event) => event === 'destroy').length, 1);
});

for (const platform of ['win32', 'linux']) {
  test(`${platform} keeps the existing parentless dialog and response`, async () => {
    const f = fixture({ platform, dialogSpec: { ...dialogSpec, action: 'none', buttons: ['OK'] } });
    f.input.showMessageBox = async (options, owner) => {
      f.events.push('dialog');
      assert.equal(owner, undefined);
      assert.equal(options.type, 'info');
      assert.equal(options.cancelId, 0);
      return { response: 0, checkboxChecked: false };
    };
    assert.equal(await showDesktopUpdateMessageBox(f.input), 0);
    assert.deepEqual(f.events, ['focus-app', 'dialog']);
  });
}

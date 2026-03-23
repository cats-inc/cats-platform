import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDesktopHostConfig } from '../dist-electron/config.js';
import { buildManagedServiceSpecs } from '../dist-electron/processSupervisor.js';

test('desktop host config and managed service specs preserve the app/runtime process split', () => {
  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_PORT: '48181',
      CATS_DESKTOP_RUNTIME_PORT: '43110',
      CATS_DESKTOP_STATE_PATH: 'C:/Cats/chat-state.local.json',
      CATS_DESKTOP_RUNTIME_DATA_DIR: 'C:/Cats/runtime/data',
      CATS_DESKTOP_RUNTIME_SESSION_BASE_DIR: 'C:/Cats/runtime/sessions',
      CATS_DESKTOP_RUNTIME_CONFIG_PATH: 'C:/Cats/runtime/providers.yaml',
      CATS_DESKTOP_APP_ENTRY: 'C:/repo/cats/dist-server/index.js',
      CATS_DESKTOP_RUNTIME_ENTRY: 'C:/repo/cats-runtime/dist/index.js',
      CATS_DESKTOP_RUNTIME_ROOT: 'C:/repo/cats-runtime',
    },
    userDataDir: 'C:/Users/test/AppData/Roaming/Cats',
  });

  const [runtimeSpec, appSpec] = buildManagedServiceSpecs(config, {});

  assert.equal(runtimeSpec.name, 'cats-runtime');
  assert.deepEqual(runtimeSpec.args.slice(1), [
    '--startup-mode=app-managed',
    '--managed-by=cats-electron',
    '--ready-output=json',
  ]);
  assert.equal(runtimeSpec.env.CATS_RUNTIME_PORT, '43110');
  assert.equal(runtimeSpec.env.CATS_RUNTIME_CONFIG_PATH, 'C:\\Cats\\runtime\\providers.yaml');
  assert.equal(runtimeSpec.cwd, 'C:\\repo\\cats-runtime');

  assert.equal(appSpec.name, 'cats');
  assert.deepEqual(appSpec.args.slice(1), [
    '--startup-mode=app-managed',
    '--managed-by=cats-electron',
    '--ready-output=json',
  ]);
  assert.equal(appSpec.env.CATS_PORT, '48181');
  assert.equal(appSpec.env.CATS_RUNTIME_BASE_URL, 'http://127.0.0.1:43110');
  assert.equal(appSpec.env.CATS_STATE_PATH, 'C:\\Cats\\chat-state.local.json');
  assert.equal(appSpec.cwd, 'C:\\Users\\sammy\\Source\\SK2\\one-man-digital-company\\cats');
});

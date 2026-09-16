import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { resolveDesktopHostConfig } from '../build/desktop/config.js';
import { loadDesktopEnvFile, loadDesktopEnvFiles } from '../build/desktop/env.js';

const WINDOWS_USER_DATA_DIR = 'C:/Users/test/AppData/Roaming/Cats';
const WINDOWS_CATS_HOME_DIR = 'C:/Users/test/.cats';

test('loadDesktopEnvFile loads .env values without overriding explicit env vars', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'cats-desktop-env-'));
  await writeFile(
    join(tempDir, '.env'),
    'CATS_DESKTOP_SHOW_WINDOW_ON_STARTUP=false\nCATS_PORT=49000\n',
    'utf8',
  );

  const env = {
    CATS_PORT: '8181',
  };

  const loadedPath = loadDesktopEnvFile(tempDir, env);
  assert.equal(loadedPath, join(tempDir, '.env'));
  assert.equal(env.CATS_PORT, '8181');
  assert.equal(env.CATS_DESKTOP_SHOW_WINDOW_ON_STARTUP, 'false');
});

test('loadDesktopEnvFiles also loads packaged desktop env from cats home', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'cats-desktop-env-home-'));
  const desktopDir = join(tempDir, '.cats', 'desktop');
  await mkdir(desktopDir, { recursive: true });
  await writeFile(
    join(desktopDir, '.env'),
    'CATS_DESKTOP_SHOW_WINDOW_ON_STARTUP=false\n',
    'utf8',
  );

  const env = {};
  const loadedPaths = loadDesktopEnvFiles({
    cwd: tempDir,
    env,
    desktopDir,
  });

  assert.deepEqual(loadedPaths, [join(desktopDir, '.env')]);
  assert.equal(env.CATS_DESKTOP_SHOW_WINDOW_ON_STARTUP, 'false');
});

test('desktop host config accepts selection-first onboarding and rejects the removed CLI gate', () => {
  const options = { userDataDir: WINDOWS_USER_DATA_DIR, catsHomeDir: WINDOWS_CATS_HOME_DIR };
  assert.equal(resolveDesktopHostConfig({ ...options, env: {} }).bootstrap.onboardingMode, 'setup_status');
  assert.throws(() => resolveDesktopHostConfig({ ...options,
    env: { CATS_DESKTOP_BOOTSTRAP_ONBOARDING_MODE: 'cli_inventory_gate' } }), /Invalid/);
});

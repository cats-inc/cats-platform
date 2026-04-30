import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { resolveDesktopHostConfig } from '../build/desktop/config.js';
import { loadDesktopEnvFile, loadDesktopEnvFiles } from '../build/desktop/env.js';
import { resolveDefaultSetupAuditAction } from '../build/desktop/setupAudit.js';

const WINDOWS_USER_DATA_DIR = 'C:/Users/test/AppData/Roaming/Cats';
const WINDOWS_CATS_HOME_DIR = 'C:/Users/test/.cats';

test('loadDesktopEnvFile loads .env values without overriding explicit env vars', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'cats-desktop-env-'));
  await writeFile(
    join(tempDir, '.env'),
    'CATS_DESKTOP_SETUP_AUDIT_PARALLEL=false\nCATS_PORT=49000\n',
    'utf8',
  );

  const env = {
    CATS_PORT: '8181',
  };

  const loadedPath = loadDesktopEnvFile(tempDir, env);
  assert.equal(loadedPath, join(tempDir, '.env'));
  assert.equal(env.CATS_PORT, '8181');
  assert.equal(env.CATS_DESKTOP_SETUP_AUDIT_PARALLEL, 'false');
});

test('loadDesktopEnvFiles also loads packaged desktop env from cats home', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'cats-desktop-env-home-'));
  const desktopDir = join(tempDir, '.cats', 'desktop');
  await mkdir(desktopDir, { recursive: true });
  await writeFile(
    join(desktopDir, '.env'),
    'CATS_DESKTOP_SETUP_AUDIT_PARALLEL=false\n',
    'utf8',
  );

  const env = {};
  const loadedPaths = loadDesktopEnvFiles({
    cwd: tempDir,
    env,
    desktopDir,
  });

  assert.deepEqual(loadedPaths, [join(desktopDir, '.env')]);
  assert.equal(env.CATS_DESKTOP_SETUP_AUDIT_PARALLEL, 'false');
});

test('desktop host config exposes setup audit parallel policy', () => {
  const defaultConfig = resolveDesktopHostConfig({
    env: {},
    userDataDir: WINDOWS_USER_DATA_DIR,
    catsHomeDir: WINDOWS_CATS_HOME_DIR,
  });
  const serialConfig = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_SETUP_AUDIT_PARALLEL: 'false',
    },
    userDataDir: WINDOWS_USER_DATA_DIR,
    catsHomeDir: WINDOWS_CATS_HOME_DIR,
  });

  assert.equal(defaultConfig.setupAudit.parallel, true);
  assert.equal(serialConfig.setupAudit.parallel, false);
});

test('desktop host config defaults bootstrap onboarding to setup status', () => {
  const defaultConfig = resolveDesktopHostConfig({
    env: {},
    userDataDir: WINDOWS_USER_DATA_DIR,
    catsHomeDir: WINDOWS_CATS_HOME_DIR,
  });
  const legacyConfig = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_BOOTSTRAP_ONBOARDING_MODE: 'cli_inventory_gate',
    },
    userDataDir: WINDOWS_USER_DATA_DIR,
    catsHomeDir: WINDOWS_CATS_HOME_DIR,
  });

  assert.equal(defaultConfig.bootstrap.onboardingMode, 'setup_status');
  assert.equal(legacyConfig.bootstrap.onboardingMode, 'cli_inventory_gate');
});

test('resolveDefaultSetupAuditAction maps setup audit parallel policy onto platform helpers', () => {
  const defaultConfig = resolveDesktopHostConfig({
    env: {},
    userDataDir: WINDOWS_USER_DATA_DIR,
    catsHomeDir: WINDOWS_CATS_HOME_DIR,
  });
  const serialConfig = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_SETUP_AUDIT_PARALLEL: 'false',
    },
    userDataDir: WINDOWS_USER_DATA_DIR,
    catsHomeDir: WINDOWS_CATS_HOME_DIR,
  });

  assert.deepEqual(resolveDefaultSetupAuditAction(defaultConfig, 'win32'), {
    helperId: 'windows-install-readiness-audit',
    extraArguments: ['-IncludeLocalModels:$true'],
  });
  assert.deepEqual(resolveDefaultSetupAuditAction(serialConfig, 'win32'), {
    helperId: 'windows-install-readiness-audit',
    extraArguments: ['-IncludeLocalModels:$true', '-Parallel:$false'],
  });
  assert.deepEqual(resolveDefaultSetupAuditAction(serialConfig, 'darwin'), {
    helperId: 'macos-install-readiness-audit',
    extraArguments: ['--include-local-models', '--serial'],
  });
  assert.deepEqual(resolveDefaultSetupAuditAction(serialConfig, 'linux'), {
    helperId: 'linux-install-readiness-audit',
    extraArguments: ['--include-local-models', '--serial'],
  });
});

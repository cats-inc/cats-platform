import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  ensureDesktopAuthSessionSecret,
  resolveDesktopAuthSessionSecretPath,
} from '../build/desktop/authSessionSecret.js';
import { resolveDesktopHostConfig } from '../build/desktop/config.js';
import {
  buildManagedServiceSpecs,
  ManagedServiceSupervisor,
} from '../build/desktop/processSupervisor.js';

const GENERATED_SECRET = 'generated-desktop-auth-session-secret-0123456789';

function createConfig(root) {
  return resolveDesktopHostConfig({
    env: {},
    userDataDir: join(root, 'user-data'),
    catsHomeDir: join(root, 'cats-home'),
  });
}

test('desktop auth provisioning preserves an explicit session secret without writing a file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cats-desktop-auth-explicit-'));
  const config = createConfig(root);
  const secretPath = resolveDesktopAuthSessionSecretPath(config);

  try {
    const result = await ensureDesktopAuthSessionSecret(config, {
      CATS_AUTH_SESSION_SECRET: 'operator-configured-auth-session-secret-123456',
    }, {
      generateSecret: () => {
        throw new Error('generator should not run');
      },
    });

    assert.deepEqual(result, {
      secret: 'operator-configured-auth-session-secret-123456',
      source: 'environment',
      secretPath: null,
    });
    await assert.rejects(access(secretPath, constants.F_OK));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('desktop auth provisioning warns without rejecting a weak explicit session secret', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cats-desktop-auth-weak-explicit-'));
  const config = createConfig(root);
  const warnings = [];

  try {
    const result = await ensureDesktopAuthSessionSecret(config, {
      CATS_AUTH_SESSION_SECRET: 'weak-secret',
    }, {
      warn: (message) => warnings.push(message),
    });

    assert.equal(result.secret, 'weak-secret');
    assert.equal(result.source, 'environment');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /shorter than 32 characters/u);
    assert.doesNotMatch(warnings[0], /weak-secret/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('clean desktop install generates and reuses one persisted auth session secret', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cats-desktop-auth-generated-'));
  const config = createConfig(root);
  const secretPath = resolveDesktopAuthSessionSecretPath(config);

  try {
    const first = await ensureDesktopAuthSessionSecret(config, {}, {
      generateSecret: () => GENERATED_SECRET,
    });
    const second = await ensureDesktopAuthSessionSecret(config, {}, {
      generateSecret: () => {
        throw new Error('persisted secret should be reused');
      },
    });

    assert.deepEqual(first, {
      secret: GENERATED_SECRET,
      source: 'generated',
      secretPath,
    });
    assert.deepEqual(second, {
      secret: GENERATED_SECRET,
      source: 'persisted',
      secretPath,
    });
    assert.equal(await readFile(secretPath, 'utf8'), `${GENERATED_SECRET}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('desktop auth provisioning quarantines an invalid persisted secret and regenerates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cats-desktop-auth-invalid-'));
  const config = createConfig(root);
  const secretPath = resolveDesktopAuthSessionSecretPath(config);
  const warnings = [];

  try {
    await mkdir(config.paths.platformConfigDir, { recursive: true });
    await writeFile(secretPath, 'truncated\n', 'utf8');
    const result = await ensureDesktopAuthSessionSecret(config, {}, {
      generateSecret: () => GENERATED_SECRET,
      warn: (message) => warnings.push(message),
    });

    assert.equal(result.secret, GENERATED_SECRET);
    assert.equal(result.source, 'generated');
    assert.equal(await readFile(secretPath, 'utf8'), `${GENERATED_SECRET}\n`);
    const configEntries = await readdir(config.paths.platformConfigDir);
    const quarantined = configEntries.find((entry) => (
      entry.startsWith('auth-session-secret.local.invalid-')
    ));
    assert.ok(quarantined);
    assert.equal(
      await readFile(join(config.paths.platformConfigDir, quarantined), 'utf8'),
      'truncated\n',
    );
    assert.equal(configEntries.some((entry) => entry.includes('.tmp-')), false);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /moved to/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('managed services inject the auth session secret only into cats-platform', () => {
  const config = resolveDesktopHostConfig({
    env: {},
    userDataDir: 'C:/Users/test/AppData/Roaming/Cats',
    catsHomeDir: 'C:/Users/test/.cats',
  });
  const [runtimeSpec, appSpec] = buildManagedServiceSpecs(config, {
    CATS_AUTH_SESSION_SECRET: GENERATED_SECRET,
  }, 'win32');

  assert.equal(runtimeSpec.env.CATS_AUTH_SESSION_SECRET, undefined);
  assert.equal(appSpec.env.CATS_AUTH_SESSION_SECRET, GENERATED_SECRET);
});

test('desktop supervisor keeps the provisioned auth secret in its restart environment snapshot', () => {
  const config = resolveDesktopHostConfig({
    env: {},
    userDataDir: 'C:/Users/test/AppData/Roaming/Cats',
    catsHomeDir: 'C:/Users/test/.cats',
  });
  const supervisor = new ManagedServiceSupervisor(config, { env: {} });

  supervisor.setPlatformAuthSessionSecret(GENERATED_SECRET);

  assert.equal(supervisor.managedEnv.CATS_AUTH_SESSION_SECRET, GENERATED_SECRET);
});

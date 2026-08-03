import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  ensureDesktopAuthSessionSecret,
  resolveDesktopAuthSessionSecretPath,
} from '../build/desktop/authSessionSecret.js';
import { resolveDesktopHostConfig } from '../build/desktop/config.js';
import { buildManagedServiceSpecs } from '../build/desktop/processSupervisor.js';

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
      CATS_AUTH_SESSION_SECRET: 'operator-configured-secret',
    }, {
      generateSecret: () => {
        throw new Error('generator should not run');
      },
    });

    assert.deepEqual(result, {
      secret: 'operator-configured-secret',
      source: 'environment',
      secretPath: null,
    });
    await assert.rejects(access(secretPath, constants.F_OK));
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

test('desktop auth provisioning fails closed for an invalid persisted secret', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cats-desktop-auth-invalid-'));
  const config = createConfig(root);
  const secretPath = resolveDesktopAuthSessionSecretPath(config);

  try {
    await mkdir(config.paths.platformConfigDir, { recursive: true });
    await writeFile(secretPath, 'truncated\n', 'utf8');
    await assert.rejects(
      ensureDesktopAuthSessionSecret(config, {}, {
        generateSecret: () => GENERATED_SECRET,
      }),
      /Desktop auth session secret is invalid/u,
    );
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

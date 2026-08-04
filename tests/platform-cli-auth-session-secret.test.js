import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function reserveAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Could not reserve a local test port.');
  }
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function waitForHealth(url, child, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      return false;
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

test('standalone cats-platform start provisions the auth secret before serving', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cats-platform-cli-auth-'));
  const platformDir = join(root, 'platform');
  const secretPath = join(platformDir, 'config', 'auth-session-secret.local');
  const port = await reserveAvailablePort();
  const env = {
    ...process.env,
    HOME: root,
    USERPROFILE: root,
    CATS_PLATFORM_DIR: platformDir,
    CATS_HOST: '127.0.0.1',
    CATS_PORT: String(port),
    CATS_RUNTIME_BASE_URL: 'http://127.0.0.1:9',
  };
  delete env.CATS_AUTH_SESSION_SECRET;

  const child = spawn(
    process.execPath,
    [
      join(process.cwd(), 'build', 'server', 'index.js'),
      '--startup-mode=app-managed',
      '--managed-by=platform-cli-auth-test',
      '--ready-output=silent',
    ],
    {
      cwd: root,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });
  const exit = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });

  try {
    assert.equal(
      await waitForHealth(`http://127.0.0.1:${port}/health`, child),
      true,
      `cats-platform did not become healthy. stderr:\n${stderr}`,
    );
    const secret = (await readFile(secretPath, 'utf8')).trim();
    assert.ok(secret.length >= 32);
    assert.doesNotMatch(secret, /\s/u);
    assert.match(stderr, /Generated a local auth session secret at/u);
    assert.match(stderr, /clustered or ephemeral deployments/u);
    assert.doesNotMatch(stderr, new RegExp(secret, 'u'));

    child.stdin.end();
    const outcome = await exit;
    assert.equal(outcome.code, 0);
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await exit;
    }
    await rm(root, { recursive: true, force: true });
  }
});

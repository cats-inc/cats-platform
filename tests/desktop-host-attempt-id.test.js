import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { readDesktopHostBootstrapAttemptId } from '../dist-server/shared/desktopHostState.js';

async function withHostStateFile(callback) {
  const tempDir = await mkdtemp(join(tmpdir(), 'cats-host-attempt-id-'));
  const hostStatePath = join(tempDir, 'state.json');
  try {
    await callback(hostStatePath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('readDesktopHostBootstrapAttemptId returns the persisted active attempt id', async () => {
  await withHostStateFile(async (hostStatePath) => {
    await writeFile(hostStatePath, JSON.stringify({
      diagnostics: {
        activeAttemptId: 'attempt-1',
      },
    }), 'utf8');

    assert.equal(
      await readDesktopHostBootstrapAttemptId(hostStatePath),
      'attempt-1',
    );
  });
});

test('readDesktopHostBootstrapAttemptId refreshes when the host state file changes', async () => {
  await withHostStateFile(async (hostStatePath) => {
    await writeFile(hostStatePath, JSON.stringify({
      diagnostics: {
        activeAttemptId: 'attempt-1',
      },
    }), 'utf8');
    assert.equal(await readDesktopHostBootstrapAttemptId(hostStatePath), 'attempt-1');

    await writeFile(hostStatePath, JSON.stringify({
      diagnostics: {
        activeAttemptId: 'attempt-2',
      },
      padding: 'cache-bust',
    }), 'utf8');

    assert.equal(await readDesktopHostBootstrapAttemptId(hostStatePath), 'attempt-2');
  });
});

test('readDesktopHostBootstrapAttemptId falls back to the cached attempt id during transient parse failures', async () => {
  await withHostStateFile(async (hostStatePath) => {
    await writeFile(hostStatePath, JSON.stringify({
      diagnostics: {
        activeAttemptId: 'attempt-stable',
      },
    }), 'utf8');
    assert.equal(await readDesktopHostBootstrapAttemptId(hostStatePath), 'attempt-stable');

    await writeFile(hostStatePath, '{"diagnostics":', 'utf8');
    assert.equal(await readDesktopHostBootstrapAttemptId(hostStatePath), 'attempt-stable');

    await writeFile(hostStatePath, JSON.stringify({
      diagnostics: {
        activeAttemptId: 'attempt-recovered',
      },
      padding: 'cache-bust-again',
    }), 'utf8');
    assert.equal(await readDesktopHostBootstrapAttemptId(hostStatePath), 'attempt-recovered');
  });
});

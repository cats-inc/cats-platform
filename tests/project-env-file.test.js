import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadProjectEnvFile } from '../build/server/shared/loadProjectEnvFile.js';

test('loadProjectEnvFile loads .env values without overriding shell-provided env vars', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cats-platform-env-'));
  const envFilePath = path.join(tempDir, '.env');
  const originalParallel = process.env.CATS_MAX_PARALLEL_CHATS;
  const originalAudience = process.env.CATS_MAX_AUDIENCE_PARTICIPANTS;

  try {
    await fs.writeFile(
      envFilePath,
      [
        'CATS_MAX_PARALLEL_CHATS=5',
        'CATS_MAX_AUDIENCE_PARTICIPANTS=4',
      ].join('\n'),
      'utf8',
    );

    process.env.CATS_MAX_PARALLEL_CHATS = '7';
    delete process.env.CATS_MAX_AUDIENCE_PARTICIPANTS;

    const loadedPath = loadProjectEnvFile(tempDir);

    assert.equal(loadedPath, envFilePath);
    assert.equal(process.env.CATS_MAX_PARALLEL_CHATS, '7');
    assert.equal(process.env.CATS_MAX_AUDIENCE_PARTICIPANTS, '4');
  } finally {
    if (originalParallel === undefined) {
      delete process.env.CATS_MAX_PARALLEL_CHATS;
    } else {
      process.env.CATS_MAX_PARALLEL_CHATS = originalParallel;
    }

    if (originalAudience === undefined) {
      delete process.env.CATS_MAX_AUDIENCE_PARTICIPANTS;
    } else {
      process.env.CATS_MAX_AUDIENCE_PARTICIPANTS = originalAudience;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

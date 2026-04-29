import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ensureChannelAttachmentWorkspace,
  syncChannelAttachmentsToWorkspace,
} from '../build/server/products/chat/state/workspace.js';

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

test('foreign Windows repo paths use the channel attachment workspace on POSIX', {
  skip: process.platform === 'win32',
}, async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-foreign-workspace-'));
  const previousCwd = process.cwd();

  try {
    process.chdir(tempDir);

    const workspacePath = await ensureChannelAttachmentWorkspace({
      channelId: 'channel-win-path',
      repoPath: 'C:/repo/cats-platform',
      chatCwd: null,
      runtimeDataDir: path.join(tempDir, 'runtime-data'),
    });

    assert.equal(
      workspacePath,
      path.join(tempDir, 'runtime-data', 'channels', 'channel-win-path'),
    );
    assert.equal(await pathExists(path.join(tempDir, 'C:')), false);
  } finally {
    process.chdir(previousCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('attachment sync skips foreign Windows target paths on POSIX', {
  skip: process.platform === 'win32',
}, async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-foreign-sync-'));
  const previousCwd = process.cwd();

  try {
    process.chdir(tempDir);

    const attachmentWorkspacePath = path.join(tempDir, 'channel-workspace');
    await mkdir(path.join(attachmentWorkspacePath, '.cats-attachments'), { recursive: true });
    await writeFile(
      path.join(attachmentWorkspacePath, '.cats-attachments', 'note.txt'),
      'fixture',
      'utf8',
    );

    await syncChannelAttachmentsToWorkspace({
      attachmentWorkspacePath,
      targetWorkspacePath: 'C:/repo/cats-platform',
    });

    assert.equal(await pathExists(path.join(tempDir, 'C:')), false);
  } finally {
    process.chdir(previousCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
});

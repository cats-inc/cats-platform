import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ensureAttachmentsDirectory,
  ensureChannelAttachmentWorkspace,
  syncChannelAttachmentsToWorkspace,
} from '../build/server/products/chat/state/workspace.js';

const gitAvailable = spawnSync('git', ['--version']).status === 0;

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

test('attachment folders stay out of a bound repo\'s Git status', {
  skip: !gitAvailable,
}, async () => {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), 'cats-attachment-ignore-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: repoPath });

    const directory = await ensureAttachmentsDirectory(repoPath);
    await writeFile(path.join(directory, 'screenshot.png'), 'fixture');

    assert.equal(directory, path.join(repoPath, '.cats-attachments'));
    assert.equal(
      execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
        cwd: repoPath,
        encoding: 'utf8',
      }),
      '',
    );
  } finally {
    await rm(repoPath, { recursive: true, force: true });
  }
});

test('ensureAttachmentsDirectory marks an existing folder without touching its files', async () => {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), 'cats-attachment-marker-'));
  try {
    const directory = path.join(workspacePath, '.cats-attachments');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'note.txt'), 'fixture', 'utf8');

    await ensureAttachmentsDirectory(workspacePath);
    await ensureAttachmentsDirectory(workspacePath);

    assert.equal(await readFile(path.join(directory, '.gitignore'), 'utf8'), '*\n');
    assert.equal(await readFile(path.join(directory, 'note.txt'), 'utf8'), 'fixture');
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('attachment sync marks the target folder even when the source predates the marker', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-attachment-sync-marker-'));
  try {
    const attachmentWorkspacePath = path.join(tempDir, 'channel-workspace');
    const targetWorkspacePath = path.join(tempDir, 'repo');
    await mkdir(path.join(attachmentWorkspacePath, '.cats-attachments'), { recursive: true });
    await writeFile(
      path.join(attachmentWorkspacePath, '.cats-attachments', 'note.txt'),
      'fixture',
      'utf8',
    );

    await syncChannelAttachmentsToWorkspace({ attachmentWorkspacePath, targetWorkspacePath });

    const targetDirectory = path.join(targetWorkspacePath, '.cats-attachments');
    assert.equal(await readFile(path.join(targetDirectory, '.gitignore'), 'utf8'), '*\n');
    assert.equal(await readFile(path.join(targetDirectory, 'note.txt'), 'utf8'), 'fixture');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

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

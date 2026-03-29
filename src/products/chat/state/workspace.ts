import { access, cp, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { isRuntimeSessionWorkspacePath } from '../../../core/workspacePaths.js';

function normalizeWorkspacePath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveRuntimeDataDir(runtimeDataDir: string | null | undefined): string | null {
  const configured = normalizeWorkspacePath(runtimeDataDir);
  if (configured) {
    return path.resolve(configured);
  }

  const envConfigured = normalizeWorkspacePath(process.env.CATS_RUNTIME_DATA_DIR);
  if (envConfigured) {
    return path.resolve(envConfigured);
  }

  const homeDir = normalizeWorkspacePath(os.homedir());
  return homeDir ? path.join(homeDir, '.cats-runtime', 'data') : null;
}

export function resolveChannelSpawnCwd(
  repoPath: string | null | undefined,
  chatCwd: string | null | undefined,
): string | null {
  const normalizedRepoPath = normalizeWorkspacePath(repoPath);
  if (normalizedRepoPath) {
    return normalizedRepoPath;
  }

  const normalizedChatCwd = normalizeWorkspacePath(chatCwd);
  return normalizedChatCwd && isRuntimeSessionWorkspacePath(normalizedChatCwd)
    ? normalizedChatCwd
    : null;
}

export function deriveChannelAttachmentWorkspacePath(
  runtimeDataDir: string,
  channelId: string,
): string {
  return path.join(path.resolve(runtimeDataDir), 'channels', channelId);
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyAttachmentsDirectory(
  sourceWorkspacePath: string,
  targetWorkspacePath: string,
): Promise<boolean> {
  if (path.resolve(sourceWorkspacePath) === path.resolve(targetWorkspacePath)) {
    return false;
  }

  const sourcePath = path.join(sourceWorkspacePath, '.cats-attachments');
  if (!await exists(sourcePath)) {
    return false;
  }

  const targetPath = path.join(targetWorkspacePath, '.cats-attachments');
  await mkdir(targetPath, { recursive: true });
  await cp(sourcePath, targetPath, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });
  return true;
}

export async function ensureChannelAttachmentWorkspace(options: {
  channelId: string;
  repoPath: string | null | undefined;
  chatCwd: string | null | undefined;
  runtimeDataDir?: string | null;
}): Promise<string | null> {
  const repoPath = normalizeWorkspacePath(options.repoPath);
  if (repoPath) {
    await mkdir(repoPath, { recursive: true });
    return path.resolve(repoPath);
  }

  const resolvedRuntimeDataDir = resolveRuntimeDataDir(options.runtimeDataDir);
  if (!resolvedRuntimeDataDir) {
    return null;
  }

  const attachmentWorkspacePath = deriveChannelAttachmentWorkspacePath(
    resolvedRuntimeDataDir,
    options.channelId,
  );
  await mkdir(attachmentWorkspacePath, { recursive: true });

  const currentChatCwd = normalizeWorkspacePath(options.chatCwd);
  if (currentChatCwd) {
    await copyAttachmentsDirectory(currentChatCwd, attachmentWorkspacePath);
  }

  return attachmentWorkspacePath;
}

export async function syncChannelAttachmentsToWorkspace(options: {
  attachmentWorkspacePath: string | null | undefined;
  targetWorkspacePath: string | null | undefined;
}): Promise<void> {
  const attachmentWorkspacePath = normalizeWorkspacePath(options.attachmentWorkspacePath);
  const targetWorkspacePath = normalizeWorkspacePath(options.targetWorkspacePath);
  if (!attachmentWorkspacePath || !targetWorkspacePath) {
    return;
  }

  const sourcePath = path.join(attachmentWorkspacePath, '.cats-attachments');
  if (!await exists(sourcePath)) {
    return;
  }

  await mkdir(targetWorkspacePath, { recursive: true });
  await copyAttachmentsDirectory(attachmentWorkspacePath, targetWorkspacePath);
}

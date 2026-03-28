import { access, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { isRuntimeSessionWorkspacePath } from '../../../core/workspacePaths.js';

function normalizeWorkspacePath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function deriveChannelWorkspacePath(
  chatStatePath: string,
  channelId: string,
): string {
  return path.join(path.dirname(path.resolve(chatStatePath)), 'channel-workspaces', channelId);
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function migrateLegacyAttachments(
  legacyCwd: string,
  workspacePath: string,
): Promise<void> {
  const sourcePath = path.join(legacyCwd, '.cats-attachments');
  if (!await exists(sourcePath)) {
    return;
  }

  const targetPath = path.join(workspacePath, '.cats-attachments');
  await mkdir(targetPath, { recursive: true });
  await cp(sourcePath, targetPath, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });
}

export async function ensureChannelWorkspace(options: {
  channelId: string;
  repoPath: string | null | undefined;
  chatCwd: string | null | undefined;
  chatStatePath?: string | null;
}): Promise<{
  workspacePath: string | null;
  nextChatCwd: string | null;
}> {
  const repoPath = normalizeWorkspacePath(options.repoPath);
  if (repoPath) {
    return {
      workspacePath: repoPath,
      nextChatCwd: normalizeWorkspacePath(options.chatCwd),
    };
  }

  const currentChatCwd = normalizeWorkspacePath(options.chatCwd);
  const currentChatCwdIsRuntimeSession = isRuntimeSessionWorkspacePath(currentChatCwd);

  let workspacePath = currentChatCwd && !currentChatCwdIsRuntimeSession
    ? currentChatCwd
    : null;

  if (!workspacePath && options.chatStatePath) {
    workspacePath = deriveChannelWorkspacePath(options.chatStatePath, options.channelId);
  }

  if (!workspacePath) {
    return {
      workspacePath: currentChatCwd,
      nextChatCwd: currentChatCwd,
    };
  }

  await mkdir(workspacePath, { recursive: true });

  if (currentChatCwd && currentChatCwdIsRuntimeSession && currentChatCwd !== workspacePath) {
    await migrateLegacyAttachments(currentChatCwd, workspacePath);
  }

  return {
    workspacePath,
    nextChatCwd: workspacePath,
  };
}

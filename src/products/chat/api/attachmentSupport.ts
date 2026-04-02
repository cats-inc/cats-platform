import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { requireChannel } from '../state/model/index.js';
import {
  ensureChannelAttachmentWorkspace,
  syncChannelAttachmentsToWorkspace,
} from '../state/workspace.js';
import type { SendConcurrentChatMessageInput, ChatState } from './contracts.js';

type EncodedAttachmentInput = NonNullable<SendConcurrentChatMessageInput['attachments']>[number];

export interface StoredChannelAttachment {
  name: string;
  relativePath: string;
}

export function sanitizeAttachmentName(rawName: string): string {
  const basename = path.basename(typeof rawName === 'string' ? rawName : '');
  const normalized = basename
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_')
    .replace(/[. ]+$/gu, '');

  if (!normalized || normalized === '.' || normalized === '..') {
    return 'attachment';
  }

  return normalized;
}

async function resolveUniqueAttachmentName(
  directory: string,
  rawName: string,
  reservedNames: Set<string>,
): Promise<string> {
  const sanitizedName = sanitizeAttachmentName(rawName);
  const parsed = path.parse(sanitizedName);
  const baseName = parsed.name || 'attachment';
  const extension = parsed.ext;

  let attempt = 0;
  while (true) {
    const candidate = attempt === 0
      ? `${baseName}${extension}`
      : `${baseName}-${attempt + 1}${extension}`;

    if (reservedNames.has(candidate)) {
      attempt += 1;
      continue;
    }

    try {
      await access(path.join(directory, candidate));
      attempt += 1;
      continue;
    } catch {
      reservedNames.add(candidate);
      return candidate;
    }
  }
}

function collectChannelAttachmentSyncTargets(
  channel: ReturnType<typeof requireChannel>,
): string[] {
  const targets = new Set<string>();
  const pushIfPresent = (value: string | null | undefined) => {
    const normalized = value?.trim();
    if (normalized) {
      targets.add(normalized);
    }
  };

  pushIfPresent(channel.orchestratorLease.cwd);
  for (const assignment of channel.catAssignments) {
    if (assignment.status === 'active') {
      pushIfPresent(assignment.execution.lease.cwd);
    }
  }

  return [...targets];
}

async function writeAttachmentsToWorkspace(
  attachmentWorkspacePath: string,
  files: EncodedAttachmentInput[],
): Promise<StoredChannelAttachment[]> {
  const attachDir = path.join(attachmentWorkspacePath, '.cats-attachments');
  await mkdir(attachDir, { recursive: true });

  const attachments: StoredChannelAttachment[] = [];
  const reservedNames = new Set<string>();

  for (const file of files) {
    const safeName = await resolveUniqueAttachmentName(
      attachDir,
      file.name,
      reservedNames,
    );
    const filePath = path.join(attachDir, safeName);
    await writeFile(filePath, Buffer.from(file.data, 'base64'));
    attachments.push({
      name: safeName,
      relativePath: `.cats-attachments/${safeName}`,
    });
  }

  return attachments;
}

export async function persistAttachmentsForChannels(options: {
  state: ChatState;
  channelIds: string[];
  files: EncodedAttachmentInput[];
  runtimeDataDir?: string | null;
}): Promise<Map<string, StoredChannelAttachment[]>> {
  const attachmentPlans = new Map<string, { workspacePath: string; syncTargets: string[] }>();
  const workspaceChannelIds = new Map<string, string[]>();

  for (const channelId of options.channelIds) {
    const channel = requireChannel(options.state, channelId);
    const attachmentWorkspacePath = await ensureChannelAttachmentWorkspace({
      channelId,
      repoPath: channel.repoPath,
      chatCwd: channel.chatCwd,
      runtimeDataDir: options.runtimeDataDir,
    });

    if (!attachmentWorkspacePath) {
      continue;
    }

    attachmentPlans.set(channelId, {
      workspacePath: attachmentWorkspacePath,
      syncTargets: collectChannelAttachmentSyncTargets(channel),
    });

    const workspaceChannels = workspaceChannelIds.get(attachmentWorkspacePath) ?? [];
    workspaceChannels.push(channelId);
    workspaceChannelIds.set(attachmentWorkspacePath, workspaceChannels);
  }

  const attachmentsByChannelId = new Map<string, StoredChannelAttachment[]>();
  for (const [workspacePath, channelIds] of workspaceChannelIds.entries()) {
    const attachments = await writeAttachmentsToWorkspace(workspacePath, options.files);
    for (const channelId of channelIds) {
      attachmentsByChannelId.set(channelId, attachments);
    }
  }

  for (const plan of attachmentPlans.values()) {
    for (const targetWorkspacePath of plan.syncTargets) {
      await syncChannelAttachmentsToWorkspace({
        attachmentWorkspacePath: plan.workspacePath,
        targetWorkspacePath,
      });
    }
  }

  return attachmentsByChannelId;
}

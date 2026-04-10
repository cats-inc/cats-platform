import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { matchRoute, readJsonBody, sendBinary, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import { ensureChannelAttachmentWorkspace } from '../../state/workspace.js';
import type { ChatApiRouteContext } from '../routeSupport.js';
import {
  DEFAULT_CHAT_SCOPE_ID,
  handleRestError,
  requireValidChatScopeId,
  sendRestError,
} from '../routeSupport.js';
import { persistAttachmentsForChannels, sanitizeAttachmentName } from '../attachmentSupport.js';

async function handleRestUploadAttachments(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const body = await readJsonBody<{
      files: Array<{ name: string; data: string }>;
    }>(context.request);

    if (!Array.isArray(body.files) || body.files.length === 0) {
      sendRestError(
        context,
        400,
        'attachments_required',
        'No files provided.',
      );
      return;
    }

    const state = await context.dependencies.chatStore.read();
    const attachments = (
      await persistAttachmentsForChannels({
        state,
        channelIds: [channelId],
        files: body.files,
        runtimeDataDir: context.dependencies.config.runtimeDataDir,
      })
    ).get(channelId);

    if (!attachments) {
      sendRestError(
        context,
        409,
        'channel_cwd_required',
        'Channel has no working directory. Activate the channel first.',
      );
      return;
    }

    sendJson(context.response, 200, { attachments });
  } catch (error) {
    handleRestError(context, error);
  }
}

const INLINE_ATTACHMENT_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

const ATTACHMENT_MIME_TYPES: Record<string, string> = {
  ...INLINE_ATTACHMENT_MIME_TYPES,
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
};

function buildAttachmentContentDisposition(
  filename: string,
  disposition: 'attachment' | 'inline',
): string {
  const safeFilename = filename
    .replace(/["\\]/gu, '_')
    .replace(/[^\x20-\x7E]/gu, '_');
  return `${disposition}; filename="${safeFilename}"`;
}

async function handleRestServeAttachment(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
  filename: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const state = await context.dependencies.chatStore.read();
    const channel = state.channels.find((entry) => entry.id === channelId);
    if (!channel) {
      sendRestError(context, 404, 'not_found', 'Channel not found.');
      return;
    }

    const attachmentWorkspacePath = await ensureChannelAttachmentWorkspace({
      channelId,
      repoPath: channel.repoPath,
      chatCwd: channel.chatCwd,
      runtimeDataDir: context.dependencies.config.runtimeDataDir,
    });

    if (!attachmentWorkspacePath) {
      sendRestError(context, 404, 'not_found', 'Channel has no working directory.');
      return;
    }

    const safeName = sanitizeAttachmentName(filename);
    const filePath = path.join(attachmentWorkspacePath, '.cats-attachments', safeName);

    try {
      await access(filePath);
    } catch {
      sendRestError(context, 404, 'not_found', 'Attachment not found.');
      return;
    }

    const ext = path.extname(safeName).toLowerCase();
    const contentType = ATTACHMENT_MIME_TYPES[ext] ?? 'application/octet-stream';
    const disposition = INLINE_ATTACHMENT_MIME_TYPES[ext] ? 'inline' : 'attachment';
    const data = await readFile(filePath);
    sendBinary(context.response, 200, data, contentType, {
      'content-disposition': buildAttachmentContentDisposition(
        safeName,
        disposition,
      ),
      'x-content-type-options': 'nosniff',
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeChatChannelAttachmentResourceApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  const canonicalChannelAttachmentsMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/attachments$/u,
  );
  if (canonicalChannelAttachmentsMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleRestUploadAttachments(
      context,
      DEFAULT_CHAT_SCOPE_ID,
      canonicalChannelAttachmentsMatch[0]!,
    );
    return true;
  }

  const canonicalChannelAttachmentFileMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/attachments\/([^/]+)$/u,
  );
  if (canonicalChannelAttachmentFileMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleRestServeAttachment(
      context,
      DEFAULT_CHAT_SCOPE_ID,
      canonicalChannelAttachmentFileMatch[0]!,
      canonicalChannelAttachmentFileMatch[1]!,
    );
    return true;
  }

  return false;
}

import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { TRANSPORT_MEDIA_METADATA_KEY } from '../../../../platform/transports/telegram/media.js';
import type { ChatState } from '../../api/contracts.js';
import { persistAttachmentsForChannels } from '../../state/channelAttachments.js';

/**
 * SPEC-124 FR-29..FR-32: the owner's photo folder is the Cat's album. The Cat
 * browses and opens it with its own tools and names a photo to send with a
 * `[photo: <path>]` line; the platform only sends a file that is inside the album.
 */

export const COMPANION_PHOTO_EXTENSIONS: ReadonlySet<string> = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
]);
/** Telegram's multipart photo limit. */
export const COMPANION_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

const PHOTO_DIRECTIVE_PATTERN = /^[ \t]*\[photo:[ \t]*([^\]\r\n]+?)[ \t]*\][ \t]*$/gimu;

export interface CompanionAlbumPhoto {
  /** Real path of the photo, inside the album. */
  sourcePath: string;
  fileName: string;
}

/** Removes every `[photo: ...]` line and returns the first requested path. */
export function extractCompanionPhotoDirective(
  text: string,
): { body: string; requested: string | null } {
  let requested: string | null = null;
  const body = text.replace(PHOTO_DIRECTIVE_PATTERN, (_line, value: string) => {
    requested ??= value.trim();
    return '';
  });
  return { body: body.replace(/\n{3,}/gu, '\n\n').trim(), requested };
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** Models often lower-case an extension ("breakfast.jpg" for "breakfast.JPG"). */
async function findCaseInsensitive(target: string): Promise<string | null> {
  const wanted = path.basename(target).toLowerCase();
  try {
    const match = (await readdir(path.dirname(target)))
      .find((name) => name.toLowerCase() === wanted);
    return match ? path.join(path.dirname(target), match) : null;
  } catch {
    return null;
  }
}

/**
 * Resolves a requested photo against the album: relative to it or absolute,
 * after symlinks, it must stay inside the album and be a sendable image.
 */
export async function resolveCompanionAlbumPhoto(
  album: string | null,
  requested: string | null,
): Promise<CompanionAlbumPhoto | null> {
  if (!album || !requested) {
    return null;
  }
  let albumReal: string;
  try {
    albumReal = await realpath(album);
  } catch {
    return null;
  }
  const target = path.resolve(album, requested);
  let targetReal: string;
  try {
    targetReal = await realpath(target);
  } catch {
    const match = await findCaseInsensitive(target);
    if (!match) {
      return null;
    }
    try {
      targetReal = await realpath(match);
    } catch {
      return null;
    }
  }
  if (
    !isInside(albumReal, targetReal)
    || !COMPANION_PHOTO_EXTENSIONS.has(path.extname(targetReal).toLowerCase())
  ) {
    return null;
  }
  const info = await stat(targetReal).catch(() => null);
  if (!info?.isFile() || info.size > COMPANION_PHOTO_MAX_BYTES) {
    return null;
  }
  return { sourcePath: targetReal, fileName: path.basename(targetReal) };
}

export interface AttachedCompanionPhoto extends CompanionAlbumPhoto {
  /** Lane-relative copy the Desktop shows inline; null when the copy failed. */
  relativePath: string | null;
}

/**
 * Resolves the requested photo and copies it into the lane's attachment folder
 * so the Desktop shows it inline; Telegram uploads the original. A copy failure
 * still lets the photo reach Telegram, just without the Desktop preview.
 */
export async function attachCompanionAlbumPhoto(input: {
  state: ChatState;
  laneId: string;
  album: string | null;
  requested: string | null;
  runtimeDataDir?: string | null;
}): Promise<AttachedCompanionPhoto | null> {
  const photo = await resolveCompanionAlbumPhoto(input.album, input.requested);
  if (!photo) {
    return null;
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(photo.sourcePath);
  } catch {
    return null;
  }
  try {
    const stored = (await persistAttachmentsForChannels({
      state: input.state,
      channelIds: [input.laneId],
      files: [{ name: photo.fileName, data: bytes.toString('base64') }],
      runtimeDataDir: input.runtimeDataDir,
    })).get(input.laneId)?.[0];
    return { ...photo, relativePath: stored?.relativePath ?? null };
  } catch {
    return { ...photo, relativePath: null };
  }
}

/** The leading block the Desktop renders as an inline attachment. */
export function formatCompanionPhotoAttachmentBlock(photo: AttachedCompanionPhoto): string {
  return photo.relativePath
    ? `[Attached files in working directory:]\n- ${photo.relativePath}\n\n`
    : '';
}

/** Message metadata that makes transports upload the original photo. */
export function buildCompanionPhotoTransportMetadata(
  photo: AttachedCompanionPhoto,
): Record<string, unknown> {
  return {
    [TRANSPORT_MEDIA_METADATA_KEY]: {
      kind: 'photo',
      path: photo.sourcePath,
      fileName: photo.fileName,
    },
  };
}

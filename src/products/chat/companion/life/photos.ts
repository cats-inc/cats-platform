import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * SPEC-124 FR-29..FR-30: the Cat picks a photo from the owner's folder by file
 * name. It never sees the image, so the prompt says so.
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
export const COMPANION_PHOTO_CANDIDATE_LIMIT = 6;

const PHOTO_DIRECTIVE_PATTERN = /^[ \t]*\[photo:[ \t]*([^\]\r\n]+?)[ \t]*\][ \t]*$/gimu;

/** Up to `limit` random image names directly inside `folder`; none when it is unreadable. */
export async function listCompanionPhotoCandidates(
  folder: string | null,
  random: () => number = Math.random,
  limit: number = COMPANION_PHOTO_CANDIDATE_LIMIT,
): Promise<string[]> {
  if (!folder) {
    return [];
  }
  let names: string[];
  try {
    names = (await readdir(folder, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && COMPANION_PHOTO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
  // Partial Fisher-Yates: only the picked prefix is shuffled.
  const picked: string[] = [];
  for (let index = 0; index < names.length && picked.length < limit; index += 1) {
    const swap = index + Math.floor(random() * (names.length - index));
    [names[index], names[swap]] = [names[swap]!, names[index]!];
    const size = await stat(path.join(folder, names[index]!)).then((info) => info.size, () => Infinity);
    if (size <= COMPANION_PHOTO_MAX_BYTES) {
      picked.push(names[index]!);
    }
  }
  return picked;
}

/**
 * Pulls `[photo: name]` lines out of a reply. Only a name that was offered is
 * honoured, so a reply can never reach a path outside the folder.
 */
export function extractCompanionPhotoDirective(
  text: string,
  candidates: readonly string[],
): { body: string; photo: string | null } {
  let photo: string | null = null;
  const body = text.replace(PHOTO_DIRECTIVE_PATTERN, (_line, name: string) => {
    // Models often lower-case an extension ("breakfast.jpg" for "breakfast.JPG").
    const wanted = name.trim().toLowerCase();
    photo ??= candidates.find((candidate) => candidate.toLowerCase() === wanted) ?? null;
    return '';
  });
  return { body: body.replace(/\n{3,}/gu, '\n\n').trim(), photo };
}

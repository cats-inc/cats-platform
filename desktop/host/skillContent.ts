import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type DesktopSkillContentProfile = 'release' | 'preview';

export function resolveDesktopSkillContentProfile(value: unknown): DesktopSkillContentProfile {
  if (value === undefined || value === 'release') return 'release';
  if (value === 'preview') return 'preview';
  throw new Error('Desktop skill content profile must be release or preview.');
}

/** Capture only the selected content, without following links or copying a source manifest. */
export async function collectRuntimeSkillContent(
  source: string,
  profile: DesktopSkillContentProfile,
): Promise<Map<string, Buffer>> {
  resolveDesktopSkillContentProfile(profile);
  const files = new Map<string, Buffer>();
  let bytes = 0;
  let nodes = 0;
  async function visit(relativePath: string, depth: number): Promise<void> {
    if (++nodes > 8192 || depth > 16) throw new Error('Runtime skill content tree is too large.');
    const sourcePath = join(source, relativePath);
    const stat = await lstat(sourcePath);
    if (stat.isSymbolicLink()) throw new Error('Runtime skill staging rejects linked content.');
    if (stat.isDirectory()) {
      for (const name of (await readdir(sourcePath)).sort()) {
        if (!relativePath && (name.toLowerCase() === 'content-profile.json'
          || (profile === 'release' && name.toLowerCase() === 'preview'))) continue;
        await visit(join(relativePath, name), depth + 1);
      }
      return;
    }
    if (!stat.isFile() || stat.nlink > 1) throw new Error('Runtime skill staging requires regular files.');
    bytes += stat.size;
    if (bytes > 16 * 1024 * 1024) throw new Error('Runtime skill staging exceeds 16 MiB.');
    const content = await readFile(sourcePath);
    if (content.length !== stat.size) throw new Error('Runtime skill content changed during staging.');
    files.set(relativePath, content);
  }
  if (profile === 'preview') {
    const supplement = await lstat(join(source, 'preview'));
    if (!supplement.isDirectory() || supplement.isSymbolicLink()) {
      throw new Error('Preview staging requires the Runtime preview supplement.');
    }
  }
  await visit('', 0);
  files.set('content-profile.json', Buffer.from(`${JSON.stringify({ schemaVersion: 1, profile })}\n`));
  return files;
}

/** The packaging owner recreates its stage before writing this captured inventory. */
export async function writeRuntimeSkillContent(files: Map<string, Buffer>, target: string): Promise<void> {
  for (const [relativePath, content] of files) {
    const file = join(target, relativePath);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content, { flag: 'wx' });
  }
}

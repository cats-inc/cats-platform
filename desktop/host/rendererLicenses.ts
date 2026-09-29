import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const RENDERER_NOTICE_TEXT = 'THIRD-PARTY-NOTICES.txt';
export const RENDERER_NOTICE_MANIFEST = 'THIRD-PARTY-NOTICES.json';
export const rendererDigest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export interface RendererLicensePackage {
  name: string;
  version: string;
  license: unknown;
  notices: Array<{ file: string; sha256: string; text: string }>;
}

export function renderRendererNotices(packages: RendererLicensePackage[]): string {
  return 'Third-party notices for the Cats Platform renderer.\n'
    + 'Collected from the dependencies included by the Vite build.\n\n'
    + packages.map(pkg => `${pkg.name}@${pkg.version}\n${'='.repeat(72)}\n`
      + pkg.notices.map(notice => `${notice.file}\n${notice.text}\n`).join('\n')).join('\n');
}

// Enumerate every shipped renderer file, including public assets and both HTML
// entry points. Never follow symlinks in a build or installed resource tree.
export async function rendererOutputFiles(root: string, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (!prefix && [RENDERER_NOTICE_TEXT, RENDERER_NOTICE_MANIFEST].includes(entry.name)) continue;
    if (entry.isDirectory()) files.push(...await rendererOutputFiles(root, relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Unsupported renderer resource: ${relative}`);
  }
  return files.sort();
}

export async function verifyRendererNotices(root: string): Promise<void> {
  const fail = () => { throw new Error('Renderer third-party notices are missing, invalid or stale; rebuild cats-platform'); };
  const text = await readFile(join(root, RENDERER_NOTICE_TEXT));
  const manifest = JSON.parse(await readFile(join(root, RENDERER_NOTICE_MANIFEST), 'utf8')) as {
    schemaVersion: number; noticesSha256: string; packages: RendererLicensePackage[];
    outputs: Array<{ file: string; sha256: string }>;
  };
  if (manifest.schemaVersion !== 1 || manifest.noticesSha256 !== rendererDigest(text)
    || !Array.isArray(manifest.packages) || !manifest.packages.length
    || !Array.isArray(manifest.outputs) || !manifest.outputs.length) return fail();
  const identities = new Set<string>();
  for (const pkg of manifest.packages) {
    if (!pkg || typeof pkg.name !== 'string' || !pkg.name || typeof pkg.version !== 'string' || !pkg.version
      || !Array.isArray(pkg.notices) || !pkg.notices.length) return fail();
    const identity = `${pkg.name}@${pkg.version}`;
    if (identities.has(identity)) return fail();
    identities.add(identity);
    for (const notice of pkg.notices) {
      if (!notice || typeof notice.file !== 'string' || !notice.file || typeof notice.text !== 'string'
        || !notice.text.trim() || notice.sha256 !== rendererDigest(Buffer.from(notice.text))) return fail();
    }
  }
  if (!text.equals(Buffer.from(renderRendererNotices(manifest.packages)))) return fail();
  const actual = await rendererOutputFiles(root);
  const listed = manifest.outputs.map(row => row?.file);
  // Comparing with enumerated relative paths also rejects traversal, duplicates,
  // omitted/new assets and Windows-specific absolute path syntax before reading.
  if (JSON.stringify(listed) !== JSON.stringify(actual)) return fail();
  for (const row of manifest.outputs) {
    if (rendererDigest(await readFile(join(root, row.file))) !== row.sha256) return fail();
  }
}

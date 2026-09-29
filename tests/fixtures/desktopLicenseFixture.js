import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { rendererOutputFiles, renderRendererNotices } from '../../build/desktop/rendererLicenses.js';

const sha = (value) => createHash('sha256').update(value).digest('hex');
export async function seedRendererNotices(root) {
  const text = await readFile(new URL('../../LICENSE', import.meta.url), 'utf8');
  const packages = [{ name: 'fixture-renderer-dependency', version: '1.0.0', license: 'MIT',
    notices: [{ file: 'LICENSE', sha256: sha(text), text }] }];
  const notices = renderRendererNotices(packages);
  const outputs = [];
  for (const file of await rendererOutputFiles(root)) outputs.push({ file, sha256: sha(await readFile(join(root, file))) });
  await writeFile(join(root, 'THIRD-PARTY-NOTICES.txt'), notices);
  await writeFile(join(root, 'THIRD-PARTY-NOTICES.json'), JSON.stringify({ schemaVersion: 1,
    noticesSha256: sha(notices), packages, outputs }));
}
export async function seedRuntimeNotices(root, entry) {
  const license = await readFile(new URL('../../LICENSE', import.meta.url));
  const notices = Buffer.concat([Buffer.from('fixture-dependency@1.0.0\n'), license]);
  const manifest = { schemaVersion: 1, bundleSha256: sha(entry), noticesSha256: sha(notices),
    packages: [{ name: 'fixture-dependency', version: '1.0.0', license: 'MIT',
      notices: [{ file: 'LICENSE', sha256: sha(license) }] }] };
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'THIRD-PARTY-NOTICES.txt'), notices);
  await writeFile(join(root, 'THIRD-PARTY-NOTICES.json'), JSON.stringify(manifest));
}

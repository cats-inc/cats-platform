import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const sha = (value) => createHash('sha256').update(value).digest('hex');
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

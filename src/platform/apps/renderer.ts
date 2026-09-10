import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { decodeAppPackage, readBrowserSdk, MAX_PACKAGE_BYTES } from '#cats-app-package';
import type { CatsInstalledAppRecord } from '../../shared/catsAppManifest.js';

export async function readAppRenderer(record: CatsInstalledAppRecord): Promise<{ html: string; sdk: string }> {
  if (!record.packageSha256 || !record.packageSource) throw new Error('This app has no verified renderer package. Install a .catsapp artifact.');
  const archivePath = path.join(record.packagePath, 'payload.catsapp');
  if ((await stat(archivePath)).size > MAX_PACKAGE_BYTES) throw new Error('App package exceeds size limit.');
  const decoded = decodeAppPackage(await readFile(archivePath), {
    id: record.id, version: record.manifest.version, sha256: record.packageSha256,
  });
  const html = decoded.files.find((file) => file.path === record.manifest.entrypoints?.renderer)?.data.toString('utf8');
  if (!html || !/<head\s*>/i.test(html)) throw new Error('App renderer must contain an explicit <head>.');
  return { html, sdk: await readBrowserSdk() };
}

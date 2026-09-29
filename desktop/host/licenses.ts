import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export function assertCatsLicense(bytes: Uint8Array, label: string): void {
  const text = Buffer.from(bytes).toString('utf8');
  for (const required of ['MIT License', 'Copyright', 'Permission is hereby granted',
    'The above copyright notice', 'WITHOUT WARRANTY', 'LIABLE FOR ANY CLAIM']) {
    if (!text.includes(required)) throw new Error(`Missing or incomplete ${label} MIT license`);
  }
}

export function verifyRuntimeBundleNotices(bundle: Uint8Array, notices: Uint8Array, manifestBytes: Uint8Array): void {
  const manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8')) as {
    schemaVersion?: unknown; bundleSha256?: unknown; noticesSha256?: unknown;
    packages?: Array<{ name?: unknown; version?: unknown; notices?: Array<{ file?: unknown; sha256?: unknown }> }>;
  };
  if (manifest.schemaVersion !== 1 || manifest.bundleSha256 !== sha256(bundle)
    || manifest.noticesSha256 !== sha256(notices) || !Array.isArray(manifest.packages)
    || !manifest.packages.length || manifest.packages.some((pkg) => !pkg
      || typeof pkg.name !== 'string' || !pkg.name || typeof pkg.version !== 'string' || !pkg.version
      || !Array.isArray(pkg.notices) || !pkg.notices.length
      || pkg.notices.some((notice) => !notice || typeof notice.file !== 'string'
        || typeof notice.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(notice.sha256)))) {
    throw new Error('Runtime bundle third-party notices are missing, invalid or stale; rebuild cats-runtime');
  }
}

export async function collectDesktopLicenses(
  packageRoot: string, runtimeRoot: string, runtimeLayout: 'split' | 'bundle',
): Promise<Array<{ source: string; target: string; bytes: Buffer }>> {
  const sources = [
    { source: join(packageRoot, 'LICENSE'), target: 'shared/app-sidecar/LICENSE' },
    { source: join(runtimeRoot, 'LICENSE'), target: 'shared/cats-runtime/LICENSE' },
  ];
  const assets = await Promise.all(sources.map(async (asset) => ({ ...asset, bytes: await readFile(asset.source) })));
  for (const asset of assets) assertCatsLicense(asset.bytes, asset.target);
  if (runtimeLayout === 'bundle') {
    const directory = join(runtimeRoot, 'build/runtime-bundle');
    const notices = await Promise.all(['THIRD-PARTY-NOTICES.txt', 'THIRD-PARTY-NOTICES.json'].map(async (name) => ({
      source: join(directory, name), target: `shared/cats-runtime/build/runtime/${name}`,
      bytes: await readFile(join(directory, name)),
    })));
    verifyRuntimeBundleNotices(await readFile(join(directory, 'index.js')), notices[0].bytes, notices[1].bytes);
    assets.push(...notices);
  }
  return assets;
}

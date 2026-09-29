import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

// Validate the complete standard permission/condition/disclaimer body, allowing
// different copyright holders and line wrapping. Staging still copies raw bytes.
const MIT_BODY = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`.replace(/\s+/g, ' ');

export function assertCatsLicense(bytes: Uint8Array, label: string): void {
  const text = Buffer.from(bytes).toString('utf8');
  const copyright = text.split(/\r?\n/).find((line) => line.startsWith('Copyright'));
  if (!text.trimStart().startsWith('MIT License')
    || !copyright?.slice('Copyright'.length).trim()
    || !text.replace(/\s+/g, ' ').includes(MIT_BODY)) {
    throw new Error(`Missing or incomplete ${label} MIT license`);
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

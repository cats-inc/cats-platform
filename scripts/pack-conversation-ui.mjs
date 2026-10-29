#!/usr/bin/env node
/**
 * Build an immutable, local conversation renderer candidate. Does not publish.
 * Usage: npm run pack:conversation-ui
 * Prints the artifact filename and SHA-256. Install that same file in both products.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const producer = path.join(root, 'packages/platform-ui-web');
const hash = createHash('sha256');
for (const name of [...readdirSync(path.join(producer, 'src')).map(name => `src/${name}`),
  'conversation.css', 'package.json', 'tsconfig.json', 'LICENSE', 'README.md'].sort()) {
  hash.update(name).update('\0').update(readFileSync(path.join(producer, name), 'utf8').replace(/\r\n/gu, '\n'));
}
const sourceSha256 = hash.digest('hex');
writeFileSync(path.join(producer, 'provenance.json'), `${JSON.stringify({
  format: 1, repository: 'https://github.com/cats-inc/cats-platform',
  desktopBaseline: '157652085b39a0be0f68190e532e35df50208454', sourceSha256,
}, null, 2)}\n`);
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'packages/platform-ui-web/tsconfig.json'],
  { cwd: root, stdio: 'inherit', windowsHide: true });
mkdirSync(path.join(root, 'vendor'), { recursive: true });
if (!process.env.npm_execpath) throw new Error('Run with npm run pack:conversation-ui.');
const packed = JSON.parse(execFileSync(process.execPath,
  [process.env.npm_execpath, 'pack', producer, '--pack-destination', path.join(root, 'vendor'), '--ignore-scripts', '--json'],
  { cwd: root, encoding: 'utf8', windowsHide: true }));
const filename = `platform-ui-web-0.1.0-${sourceSha256.slice(0, 12)}.tgz`;
const receipt = Array.isArray(packed) ? packed[0] : packed['@cats-inc/platform-ui-web'];
if (!receipt?.filename) throw new Error('npm pack did not return the candidate filename.');
renameSync(path.join(root, 'vendor', receipt.filename), path.join(root, 'vendor', filename));
console.log(JSON.stringify({ filename, sourceSha256,
  sha256: createHash('sha256').update(readFileSync(path.join(root, 'vendor', filename))).digest('hex') }));

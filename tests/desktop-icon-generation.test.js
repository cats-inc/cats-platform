import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { Icns } from '@fiahfy/icns';
import sharp from 'sharp';

import { generateElectronIcons } from '../scripts/shared/generate-electron-icons.mjs';

const SOURCE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1f2937" />
  <circle cx="256" cy="256" r="172" fill="#f9fafb" />
</svg>
`;

async function createWorkspace() {
  return mkdtemp(join(tmpdir(), 'cats-platform-icons-'));
}

async function readImageSize(path) {
  const metadata = await sharp(path).metadata();
  return {
    width: metadata.width,
    height: metadata.height,
  };
}

test('generateElectronIcons creates the cross-platform app and tray icon set from one svg', async () => {
  const workspace = await createWorkspace();
  const inputSvgPath = join(workspace, 'icon-source.svg');
  const assetsRoot = join(workspace, 'assets');
  const buildResourcesDir = join(assetsRoot, 'build');

  await writeFile(inputSvgPath, SOURCE_SVG);

  const manifest = await generateElectronIcons({
    inputSvgPath,
    assetsRoot,
    buildResourcesDir,
  });

  assert.equal(typeof manifest.sourceSvg, 'string');
  assert.equal(manifest.app.ico.endsWith('assets/build/icon.ico'), true);
  assert.equal(manifest.app.icns.endsWith('assets/build/icon.icns'), true);
  assert.equal(manifest.tray.default.endsWith('assets/tray-icon.png'), true);
  assert.equal(manifest.tray.template.endsWith('assets/tray-iconTemplate.png'), true);
  assert.deepEqual(
    Object.keys(manifest.app.linuxIcons),
    ['16', '24', '32', '48', '64', '128', '256', '512'],
  );

  const iconPngSize = await readImageSize(join(buildResourcesDir, 'icon.png'));
  assert.deepEqual(iconPngSize, { width: 512, height: 512 });

  const trayIconSize = await readImageSize(join(assetsRoot, 'tray-icon.png'));
  assert.deepEqual(trayIconSize, { width: 32, height: 32 });

  const trayRetinaSize = await readImageSize(join(assetsRoot, 'tray-icon@2x.png'));
  assert.deepEqual(trayRetinaSize, { width: 64, height: 64 });

  const trayTemplateSize = await readImageSize(join(assetsRoot, 'tray-iconTemplate.png'));
  assert.deepEqual(trayTemplateSize, { width: 16, height: 16 });

  const linux256Size = await readImageSize(join(buildResourcesDir, 'icons', 'linux', '256x256.png'));
  assert.deepEqual(linux256Size, { width: 256, height: 256 });

  const iconIco = await readFile(join(buildResourcesDir, 'icon.ico'));
  assert.equal(iconIco.length > 0, true);

  const iconIcns = Icns.from(await readFile(join(buildResourcesDir, 'icon.icns')));
  assert.deepEqual(
    iconIcns.images.map((image) => image.osType),
    ['icp4', 'ic11', 'icp5', 'ic12', 'icp6', 'ic07', 'ic13', 'ic08', 'ic14', 'ic09', 'ic10'],
  );

  const manifestFromDisk = JSON.parse(await readFile(join(buildResourcesDir, 'icon-manifest.json'), 'utf8'));
  assert.deepEqual(manifestFromDisk, manifest);
});

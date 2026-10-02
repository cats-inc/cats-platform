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

const GRADIENT_BACKGROUND_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#111827" />
      <stop offset="100%" stop-color="#2563eb" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)" />
  <circle cx="256" cy="256" r="96" fill="#f9fafb" />
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

async function readPixel(path, x, y) {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const index = ((y * info.width) + x) * 4;
  return {
    red: data[index],
    green: data[index + 1],
    blue: data[index + 2],
    alpha: data[index + 3],
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
  assert.equal(manifest.shape, 'circle');
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
  assert.deepEqual(trayTemplateSize, { width: 20, height: 20 });

  const linux256Size = await readImageSize(join(buildResourcesDir, 'icons', 'linux', '256x256.png'));
  assert.deepEqual(linux256Size, { width: 256, height: 256 });

  const iconIco = await readFile(join(buildResourcesDir, 'icon.ico'));
  assert.equal(iconIco.length > 0, true);

  const iconIcns = Icns.from(await readFile(join(buildResourcesDir, 'icon.icns')));
  assert.deepEqual(
    iconIcns.images.map((image) => image.osType),
    ['icp4', 'ic11', 'icp5', 'ic12', 'icp6', 'ic07', 'ic13', 'ic08', 'ic14', 'ic09', 'ic10'],
  );

  const appCorner = await readPixel(join(buildResourcesDir, 'icon.png'), 0, 0);
  assert.equal(appCorner.alpha, 0);

  const trayCorner = await readPixel(join(assetsRoot, 'tray-icon.png'), 0, 0);
  assert.equal(trayCorner.alpha, 0);

  const manifestFromDisk = JSON.parse(await readFile(join(buildResourcesDir, 'icon-manifest.json'), 'utf8'));
  assert.deepEqual(manifestFromDisk, manifest);
});

test('generateElectronIcons can keep explicit square outputs when requested', async () => {
  const workspace = await createWorkspace();
  const inputSvgPath = join(workspace, 'icon-source.svg');
  const assetsRoot = join(workspace, 'assets');
  const buildResourcesDir = join(assetsRoot, 'build');

  await writeFile(inputSvgPath, SOURCE_SVG);

  const manifest = await generateElectronIcons({
    inputSvgPath,
    assetsRoot,
    buildResourcesDir,
    iconShape: 'square',
  });

  assert.equal(manifest.shape, 'square');

  const appCorner = await readPixel(join(buildResourcesDir, 'icon.png'), 0, 0);
  assert.equal(appCorner.alpha > 0, true);

  const iconCenter = await readPixel(join(buildResourcesDir, 'icon.png'), 256, 256);
  assert.equal(iconCenter.alpha > 0, true);

  const trayCorner = await readPixel(join(assetsRoot, 'tray-icon.png'), 0, 0);
  assert.equal(trayCorner.alpha > 0, true);

  const trayTemplateCorner = await readPixel(join(assetsRoot, 'tray-iconTemplate.png'), 0, 0);
  assert.equal(trayTemplateCorner.alpha >= 0, true);
});

test('generateElectronIcons removes edge-connected gradient backgrounds from tray templates', async () => {
  const workspace = await createWorkspace();
  const inputSvgPath = join(workspace, 'icon-source.svg');
  const assetsRoot = join(workspace, 'assets');
  const buildResourcesDir = join(assetsRoot, 'build');

  await writeFile(inputSvgPath, GRADIENT_BACKGROUND_SVG);

  await generateElectronIcons({
    inputSvgPath,
    assetsRoot,
    buildResourcesDir,
    iconShape: 'square',
  });

  const trayTemplateBackground = await readPixel(
    join(assetsRoot, 'tray-iconTemplate.png'),
    19,
    19,
  );
  assert.equal(trayTemplateBackground.alpha, 0);

  const trayTemplateForeground = await readPixel(
    join(assetsRoot, 'tray-iconTemplate.png'),
    10,
    10,
  );
  assert.equal(trayTemplateForeground.alpha > 0, true);
});

// A black square with a transparent hole in the middle: the hole must survive as
// transparency (knocked-out eyes) and nothing may be treated as background.
const TRAY_TEMPLATE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><mask id="hole"><rect width="512" height="512" fill="#fff"/><circle cx="256" cy="256" r="96" fill="#000"/></mask></defs>
  <rect x="64" y="64" width="384" height="384" fill="#ff0000" mask="url(#hole)"/>
</svg>
`;

test('generateElectronIcons renders a dedicated tray template source with its holes intact', async () => {
  const workspace = await createWorkspace();
  const inputSvgPath = join(workspace, 'icon-source.svg');
  const trayInputSvgPath = join(workspace, 'tray-source.svg');
  const assetsRoot = join(workspace, 'assets');
  const buildResourcesDir = join(assetsRoot, 'build');

  await writeFile(inputSvgPath, SOURCE_SVG);
  await writeFile(trayInputSvgPath, TRAY_TEMPLATE_SVG);

  const manifest = await generateElectronIcons({
    inputSvgPath,
    trayInputSvgPath,
    assetsRoot,
    buildResourcesDir,
    iconShape: 'square',
  });
  assert.equal(manifest.traySourceSvg.endsWith('tray-source.svg'), true);

  const templatePath = join(assetsRoot, 'tray-iconTemplate@2x.png');
  assert.deepEqual(await readImageSize(templatePath), { width: 40, height: 40 });
  const outside = await readPixel(templatePath, 1, 1);
  assert.equal(outside.alpha, 0, 'transparent source pixels stay transparent');
  const body = await readPixel(templatePath, 6, 6);
  assert.equal(body.alpha > 0, true, 'opaque source pixels are kept');
  assert.deepEqual([body.red, body.green, body.blue], [0, 0, 0], 'template colour is forced to black');
  const hole = await readPixel(templatePath, 20, 20);
  assert.equal(hole.alpha, 0, 'a hole inside the silhouette is not treated as background');

  // The colour tray icons and the app icon still come from the app source.
  const trayColour = await readPixel(join(assetsRoot, 'tray-icon.png'), 16, 16);
  assert.equal(trayColour.alpha > 0, true);
});

test('generateElectronIcons insets only the macOS icns artwork when asked', async () => {
  const workspace = await createWorkspace();
  const inputSvgPath = join(workspace, 'icon-source.svg');
  const assetsRoot = join(workspace, 'assets');
  const buildResourcesDir = join(assetsRoot, 'build');
  await writeFile(inputSvgPath, SOURCE_SVG);

  const manifest = await generateElectronIcons({
    inputSvgPath,
    assetsRoot,
    buildResourcesDir,
    iconShape: 'square',
    macosInset: 'apple',
  });
  assert.equal(manifest.macosInset, 100 / 1024);

  // Windows/Linux stay full-bleed.
  const appCorner = await readPixel(join(buildResourcesDir, 'icon.png'), 0, 0);
  assert.equal(appCorner.alpha > 0, true);

  // The 1024 icns image is transparent in the Apple margin and opaque inside it.
  const icns = Icns.from(await readFile(join(buildResourcesDir, 'icon.icns')));
  const largest = icns.images.find((image) => image.osType === 'ic10');
  const largestPng = join(workspace, 'ic10.png');
  await writeFile(largestPng, largest.image);
  assert.deepEqual(await readImageSize(largestPng), { width: 1024, height: 1024 });
  const margin = await readPixel(largestPng, 40, 512);
  assert.equal(margin.alpha, 0);
  const inside = await readPixel(largestPng, 140, 512);
  assert.equal(inside.alpha > 0, true);

  await assert.rejects(
    generateElectronIcons({ inputSvgPath, assetsRoot, buildResourcesDir, macosInset: '0.5' }),
    /Unsupported macOS inset/u,
  );
});

// png-to-ico stores each size as a bottom-up BGRA DIB after a 40-byte header.
async function readIcoPixel(path, size, x, y) {
  const ico = await readFile(path);
  for (let entry = 0; entry < ico.readUInt16LE(4); entry += 1) {
    const directory = 6 + (entry * 16);
    if ((ico[directory] || 256) !== size) {
      continue;
    }
    const offset = ico.readUInt32LE(directory + 12) + 40 + ((((size - 1 - y) * size) + x) * 4);
    return { blue: ico[offset], green: ico[offset + 1], red: ico[offset + 2], alpha: ico[offset + 3] };
  }
  throw new Error(`No ${size}px image in ${path}`);
}

test('generateElectronIcons takes separate macOS and Windows sources', async () => {
  const workspace = await createWorkspace();
  const inputSvgPath = join(workspace, 'icon-source.svg');
  const macosInputSvgPath = join(workspace, 'icon-macos.svg');
  const windowsInputSvgPath = join(workspace, 'icon-windows.svg');
  const assetsRoot = join(workspace, 'assets');
  const buildResourcesDir = join(assetsRoot, 'build');
  await writeFile(inputSvgPath, SOURCE_SVG);
  await writeFile(macosInputSvgPath, SOURCE_SVG.replace('#1f2937', '#ffffff'));
  await writeFile(windowsInputSvgPath, SOURCE_SVG.replace(/ {2}<rect [^\n]*\n/u, ''));

  const manifest = await generateElectronIcons({
    inputSvgPath,
    macosInputSvgPath,
    windowsInputSvgPath,
    assetsRoot,
    buildResourcesDir,
    iconShape: 'square',
  });
  assert.equal(manifest.macosSourceSvg.endsWith('icon-macos.svg'), true);
  assert.equal(manifest.windowsSourceSvg.endsWith('icon-windows.svg'), true);

  // Linux and icon.png keep the default source's dark tile.
  const linuxCorner = await readPixel(join(buildResourcesDir, 'icons', 'linux', '256x256.png'), 0, 0);
  assert.deepEqual([linuxCorner.red, linuxCorner.alpha], [0x1f, 255]);

  // The .icns comes from the macOS source.
  const icns = Icns.from(await readFile(join(buildResourcesDir, 'icon.icns')));
  const largestPng = join(workspace, 'ic10.png');
  await writeFile(largestPng, icns.images.find((image) => image.osType === 'ic10').image);
  const macosCorner = await readPixel(largestPng, 0, 0);
  assert.deepEqual([macosCorner.red, macosCorner.alpha], [255, 255]);

  // The app .ico, every NSIS icon and the colour tray icon come from the Windows source.
  const icoPath = join(buildResourcesDir, 'icon.ico');
  assert.equal((await readIcoPixel(icoPath, 32, 0, 0)).alpha, 0);
  assert.equal((await readIcoPixel(icoPath, 32, 16, 16)).alpha, 255);
  const ico = await readFile(icoPath);
  for (const name of ['installerIcon.ico', 'uninstallerIcon.ico', 'installerHeaderIcon.ico']) {
    assert.equal(ico.equals(await readFile(join(buildResourcesDir, name))), true, name);
  }
  assert.equal((await readPixel(join(assetsRoot, 'tray-icon.png'), 0, 0)).alpha, 0);
  assert.equal((await readPixel(join(assetsRoot, 'tray-icon@2x.png'), 32, 32)).alpha, 255);
});

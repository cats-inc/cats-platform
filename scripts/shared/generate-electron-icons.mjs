#!/usr/bin/env node

import process from 'node:process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Icns, IcnsImage } from '@fiahfy/icns';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_INPUT = resolve(PROJECT_ROOT, 'assets', 'app-icon-silhouette.svg');
const DEFAULT_ASSETS_ROOT = resolve(PROJECT_ROOT, 'assets');
const DEFAULT_BUILD_RESOURCES_DIR = resolve(DEFAULT_ASSETS_ROOT, 'build');
const DEFAULT_ICON_SHAPE = 'square';
const SUPPORTED_ICON_SHAPES = new Set(['square', 'circle']);

const LINUX_ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_VARIANTS = [
  { type: 'icp4', size: 16 },
  { type: 'ic11', size: 32 },
  { type: 'icp5', size: 32 },
  { type: 'ic12', size: 64 },
  { type: 'icp6', size: 64 },
  { type: 'ic07', size: 128 },
  { type: 'ic13', size: 256 },
  { type: 'ic08', size: 256 },
  { type: 'ic14', size: 512 },
  { type: 'ic09', size: 512 },
  { type: 'ic10', size: 1024 },
];

function printHelp() {
  process.stdout.write(`Usage: node scripts/shared/generate-electron-icons.mjs [options]

Generate cross-platform Electron app and tray icons from a single SVG source.

Options:
  --input <path>               Source SVG. Defaults to assets/app-icon-silhouette.svg
  --assets-root <path>         Asset root for tray outputs. Defaults to assets/
  --build-resources <path>     Build-resource root for app icons. Defaults to assets/build
  --shape <square|circle>      Output mask shape. Defaults to square
  --help                       Show this help text.
`);
}

function normalizeIconShape(value) {
  if (!value) {
    return DEFAULT_ICON_SHAPE;
  }
  if (!SUPPORTED_ICON_SHAPES.has(value)) {
    throw new Error(`Unsupported icon shape: ${value}`);
  }
  return value;
}

function parseArgs(argv) {
  let inputSvgPath = DEFAULT_INPUT;
  let assetsRoot = DEFAULT_ASSETS_ROOT;
  let buildResourcesDir = DEFAULT_BUILD_RESOURCES_DIR;
  let iconShape = DEFAULT_ICON_SHAPE;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') {
      return {
        help: true,
        inputSvgPath,
        assetsRoot,
        buildResourcesDir,
        iconShape,
      };
    }
    if (value === '--input') {
      inputSvgPath = resolve(PROJECT_ROOT, argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (value === '--assets-root') {
      assetsRoot = resolve(PROJECT_ROOT, argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (value === '--build-resources') {
      buildResourcesDir = resolve(PROJECT_ROOT, argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (value === '--shape') {
      iconShape = normalizeIconShape(argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${value}`);
  }

  return {
    help: false,
    inputSvgPath,
    assetsRoot,
    buildResourcesDir,
    iconShape,
  };
}

function toProjectRelative(pathValue) {
  return relative(PROJECT_ROOT, pathValue).replaceAll('\\', '/');
}

async function writeBuffer(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
}

async function rasterizeSvgPng(svgBuffer, size) {
  return sharp(svgBuffer, { density: 1024 })
    .resize(size, size, { fit: 'contain' })
    .ensureAlpha()
    .png()
    .toBuffer();
}

function buildCircleMask(size) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff" /></svg>`,
  );
}

async function applyIconShapeMask(pngBuffer, size, iconShape) {
  if (iconShape === 'square') {
    return pngBuffer;
  }

  return sharp(pngBuffer)
    .composite([
      {
        input: buildCircleMask(size),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();
}

async function renderSvgPng(svgBuffer, size, iconShape) {
  const pngBuffer = await rasterizeSvgPng(svgBuffer, size);
  return applyIconShapeMask(pngBuffer, size, iconShape);
}

function rgbaDistance(rawBuffer, index, background) {
  return Math.abs(rawBuffer[index] - background[0])
    + Math.abs(rawBuffer[index + 1] - background[1])
    + Math.abs(rawBuffer[index + 2] - background[2])
    + Math.abs(rawBuffer[index + 3] - background[3]);
}

async function renderTrayTemplate(svgBuffer, size, iconShape) {
  const { data, info } = await sharp(svgBuffer, { density: 1024 })
    .resize(size, size, { fit: 'contain' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(data.length);
  const background = [data[0], data[1], data[2], data[3]];

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha === 0) {
      continue;
    }
    const keepPixel = rgbaDistance(data, index, background) > 48;
    if (!keepPixel) {
      continue;
    }
    output[index] = 0;
    output[index + 1] = 0;
    output[index + 2] = 0;
    output[index + 3] = alpha;
  }

  const templatePngBuffer = await sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  }).png().toBuffer();

  return applyIconShapeMask(templatePngBuffer, size, iconShape);
}

function buildIcns(pngBuffersBySize) {
  const icns = new Icns();
  for (const variant of ICNS_VARIANTS) {
    const imageBuffer = pngBuffersBySize.get(variant.size);
    if (!imageBuffer) {
      throw new Error(`Missing PNG buffer for ICNS size ${variant.size}`);
    }
    icns.append(IcnsImage.fromPNG(imageBuffer, variant.type));
  }
  return icns.data;
}

export async function generateElectronIcons(options = {}) {
  const inputSvgPath = options.inputSvgPath
    ? resolve(PROJECT_ROOT, options.inputSvgPath)
    : DEFAULT_INPUT;
  const assetsRoot = options.assetsRoot
    ? resolve(PROJECT_ROOT, options.assetsRoot)
    : DEFAULT_ASSETS_ROOT;
  const buildResourcesDir = options.buildResourcesDir
    ? resolve(PROJECT_ROOT, options.buildResourcesDir)
    : DEFAULT_BUILD_RESOURCES_DIR;
  const iconShape = normalizeIconShape(options.iconShape);
  const linuxIconDir = resolve(buildResourcesDir, 'icons', 'linux');

  const svgBuffer = await readFile(inputSvgPath);
  const pngBuffersBySize = new Map();

  for (const size of new Set([
    ...LINUX_ICON_SIZES,
    ...ICO_SIZES,
    1024,
  ])) {
    pngBuffersBySize.set(size, await renderSvgPng(svgBuffer, size, iconShape));
  }

  await rm(linuxIconDir, { recursive: true, force: true });
  await mkdir(linuxIconDir, { recursive: true });

  const linuxIcons = {};
  for (const size of LINUX_ICON_SIZES) {
    const filePath = resolve(linuxIconDir, `${size}x${size}.png`);
    await writeBuffer(filePath, pngBuffersBySize.get(size));
    linuxIcons[size] = toProjectRelative(filePath);
  }

  const icoBuffer = await pngToIco(ICO_SIZES.map((size) => pngBuffersBySize.get(size)));
  const icnsBuffer = buildIcns(pngBuffersBySize);
  const appPngPath = resolve(buildResourcesDir, 'icon.png');
  const iconIcoPath = resolve(buildResourcesDir, 'icon.ico');
  const installerIconPath = resolve(buildResourcesDir, 'installerIcon.ico');
  const uninstallerIconPath = resolve(buildResourcesDir, 'uninstallerIcon.ico');
  const installerHeaderIconPath = resolve(buildResourcesDir, 'installerHeaderIcon.ico');
  const iconIcnsPath = resolve(buildResourcesDir, 'icon.icns');
  const trayIconPath = resolve(assetsRoot, 'tray-icon.png');
  const trayIcon2xPath = resolve(assetsRoot, 'tray-icon@2x.png');
  const trayTemplatePath = resolve(assetsRoot, 'tray-iconTemplate.png');
  const trayTemplate2xPath = resolve(assetsRoot, 'tray-iconTemplate@2x.png');
  const manifestPath = resolve(buildResourcesDir, 'icon-manifest.json');

  await writeBuffer(appPngPath, pngBuffersBySize.get(512));
  await writeBuffer(iconIcoPath, icoBuffer);
  await writeBuffer(installerIconPath, icoBuffer);
  await writeBuffer(uninstallerIconPath, icoBuffer);
  await writeBuffer(installerHeaderIconPath, icoBuffer);
  await writeBuffer(iconIcnsPath, icnsBuffer);
  await writeBuffer(trayIconPath, pngBuffersBySize.get(32));
  await writeBuffer(trayIcon2xPath, pngBuffersBySize.get(64));
  await writeBuffer(trayTemplatePath, await renderTrayTemplate(svgBuffer, 16, iconShape));
  await writeBuffer(trayTemplate2xPath, await renderTrayTemplate(svgBuffer, 32, iconShape));

  const manifest = {
    sourceSvg: toProjectRelative(inputSvgPath),
    shape: iconShape,
    app: {
      png: toProjectRelative(appPngPath),
      ico: toProjectRelative(iconIcoPath),
      icns: toProjectRelative(iconIcnsPath),
      installerIcon: toProjectRelative(installerIconPath),
      uninstallerIcon: toProjectRelative(uninstallerIconPath),
      installerHeaderIcon: toProjectRelative(installerHeaderIconPath),
      linuxIcons,
    },
    tray: {
      default: toProjectRelative(trayIconPath),
      retina: toProjectRelative(trayIcon2xPath),
      template: toProjectRelative(trayTemplatePath),
      templateRetina: toProjectRelative(trayTemplate2xPath),
    },
  };
  await writeBuffer(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return manifest;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }

  const manifest = await generateElectronIcons(parsed);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

if (resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

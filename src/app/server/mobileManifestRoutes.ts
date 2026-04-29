import { basename, extname, resolve, sep } from 'node:path';
import { readFile, stat } from 'node:fs/promises';

import type { AppConfig } from '../../config.js';
import type { RouteContext } from '../../shared/http.js';
import {
  matchRoute,
  sendBinary,
  sendJson,
  sendMethodNotAllowed,
} from '../../shared/http.js';

type MobilePlatform = 'ios' | 'android';

interface MobileAssetMetadata {
  path?: unknown;
  ext?: unknown;
}

interface MobilePlatformMetadata {
  bundle?: unknown;
  assets?: unknown;
}

interface MobileExportMetadata {
  version?: unknown;
  bundler?: unknown;
  fileMetadata?: unknown;
}

interface MobileBundleFile {
  relativePath: string;
  absolutePath: string;
  fileName: string;
  contentType: string;
}

interface MobileAssetFile {
  relativePath: string;
  absolutePath: string;
  hash: string;
  ext: string | null;
  contentType: string;
}

interface MobilePlatformFiles {
  bundle: MobileBundleFile;
  assets: MobileAssetFile[];
}

interface MobileExportFiles {
  metadata: MobileExportMetadata;
  platforms: Record<MobilePlatform, MobilePlatformFiles | null>;
}

export interface MobileManifestRouteDependencies {
  config: Pick<AppConfig, 'mobilePairingEnabled' | 'mobileBundleRoot'>;
  now?: () => Date;
}

export type MobileManifestRouteContext = RouteContext<MobileManifestRouteDependencies>;

const MOBILE_PLATFORMS = new Set<MobilePlatform>(['ios', 'android']);
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};
const IMMUTABLE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
};

function normalizePlatform(value: string | null | undefined): MobilePlatform | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'ios' || normalized === 'android' ? normalized : null;
}

function readHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function normalizeRelativeMobilePath(rawPath: string): string | null {
  const normalized = rawPath.replace(/\\/gu, '/').replace(/^\/+/u, '');
  if (!normalized || normalized.includes('\0')) {
    return null;
  }
  const parts = normalized.split('/').filter((part) => part.length > 0);
  if (parts.some((part) => part === '.' || part === '..')) {
    return null;
  }
  return parts.join('/');
}

function resolveMobileFile(root: string, rawPath: string): {
  absolutePath: string;
  relativePath: string;
} | null {
  const relativePath = normalizeRelativeMobilePath(rawPath);
  if (!relativePath) {
    return null;
  }

  const normalizedRoot = resolve(root);
  const absolutePath = resolve(normalizedRoot, ...relativePath.split('/'));
  if (absolutePath !== normalizedRoot && !absolutePath.startsWith(`${normalizedRoot}${sep}`)) {
    return null;
  }

  return { absolutePath, relativePath };
}

function guessContentType(fileName: string, assetExt?: string | null): string {
  const extension = (assetExt ? `.${assetExt}` : extname(fileName)).toLowerCase();
  switch (extension) {
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.webp':
      return 'image/webp';
    case '.hbc':
    default:
      return 'application/octet-stream';
  }
}

async function readMobileExportFiles(root: string): Promise<MobileExportFiles | null> {
  const metadataPath = resolve(root, 'metadata.json');
  let metadata: MobileExportMetadata;
  try {
    metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as MobileExportMetadata;
  } catch {
    return null;
  }

  const fileMetadata = typeof metadata.fileMetadata === 'object' && metadata.fileMetadata !== null
    ? metadata.fileMetadata as Partial<Record<MobilePlatform, MobilePlatformMetadata>>
    : {};

  const platforms: Record<MobilePlatform, MobilePlatformFiles | null> = {
    ios: null,
    android: null,
  };

  for (const platform of MOBILE_PLATFORMS) {
    const platformMetadata = fileMetadata[platform];
    if (!platformMetadata || typeof platformMetadata.bundle !== 'string') {
      continue;
    }

    const bundleFile = resolveMobileFile(root, platformMetadata.bundle);
    if (!bundleFile) {
      continue;
    }

    const assets = Array.isArray(platformMetadata.assets)
      ? platformMetadata.assets
        .map((asset): MobileAssetFile | null => {
          const candidate = asset as MobileAssetMetadata;
          if (typeof candidate.path !== 'string') {
            return null;
          }
          const assetFile = resolveMobileFile(root, candidate.path);
          if (!assetFile) {
            return null;
          }
          const hash = basename(assetFile.relativePath);
          const ext = typeof candidate.ext === 'string' && candidate.ext.trim()
            ? candidate.ext.trim().replace(/^\./u, '')
            : null;
          return {
            ...assetFile,
            hash,
            ext,
            contentType: guessContentType(assetFile.relativePath, ext),
          };
        })
        .filter((asset): asset is MobileAssetFile => asset !== null)
      : [];

    platforms[platform] = {
      bundle: {
        ...bundleFile,
        fileName: basename(bundleFile.relativePath),
        contentType: guessContentType(bundleFile.relativePath),
      },
      assets,
    };
  }

  return { metadata, platforms };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

function buildAbsoluteUrl(url: URL, pathname: string): string {
  return `${url.origin}${pathname}`;
}

async function handleMobileManifest(
  context: MobileManifestRouteContext,
  exportFiles: MobileExportFiles,
): Promise<void> {
  const platform = normalizePlatform(readHeaderValue(context.request.headers['expo-platform']));
  if (!platform) {
    sendJson(
      context.response,
      400,
      {
        error: {
          code: 'unsupported_mobile_platform',
          message: 'expo-platform must be ios or android.',
        },
      },
      NO_STORE_HEADERS,
    );
    return;
  }

  const platformFiles = exportFiles.platforms[platform];
  if (!platformFiles || !await fileExists(platformFiles.bundle.absolutePath)) {
    sendJson(
      context.response,
      404,
      {
        error: {
          code: 'mobile_bundle_not_found',
          message: `No mobile bundle is available for ${platform}.`,
        },
      },
      NO_STORE_HEADERS,
    );
    return;
  }

  const bundlePathname = `/api/mobile/bundle/${platform}/${encodeURIComponent(platformFiles.bundle.fileName)}`;
  const assets = [];
  for (const asset of platformFiles.assets) {
    if (!await fileExists(asset.absolutePath)) {
      continue;
    }
    assets.push({
      hash: asset.hash,
      ext: asset.ext,
      path: asset.relativePath,
      url: buildAbsoluteUrl(context.url, `/api/mobile/assets/${encodeURIComponent(asset.hash)}`),
      contentType: asset.contentType,
    });
  }

  sendJson(
    context.response,
    200,
    {
      schema: 'cats.mobilePairing.diagnostic.v1',
      generatedAt: (context.dependencies.now?.() ?? new Date()).toISOString(),
      platform,
      requestHeaders: {
        expoPlatform: readHeaderValue(context.request.headers['expo-platform']),
        expoRuntimeVersion: readHeaderValue(context.request.headers['expo-runtime-version']),
        expoProtocolVersion: readHeaderValue(context.request.headers['expo-protocol-version']),
      },
      metadata: {
        version: exportFiles.metadata.version ?? null,
        bundler: exportFiles.metadata.bundler ?? null,
      },
      bundle: {
        fileName: platformFiles.bundle.fileName,
        path: platformFiles.bundle.relativePath,
        url: buildAbsoluteUrl(context.url, bundlePathname),
        contentType: platformFiles.bundle.contentType,
      },
      assets,
      phase1: {
        expoGoManifestSchema: 'unresolved',
        expoGoPairingUrlForm: 'unresolved',
      },
    },
    NO_STORE_HEADERS,
  );
}

async function handleMobileBundle(
  context: MobileManifestRouteContext,
  exportFiles: MobileExportFiles,
  platform: string | undefined,
  fileName: string | undefined,
): Promise<void> {
  const normalizedPlatform = normalizePlatform(platform);
  if (!normalizedPlatform || !fileName || fileName !== basename(fileName)) {
    sendJson(context.response, 404, {
      error: { code: 'mobile_bundle_not_found', message: 'Mobile bundle not found.' },
    });
    return;
  }

  const platformFiles = exportFiles.platforms[normalizedPlatform];
  if (!platformFiles || platformFiles.bundle.fileName !== fileName) {
    sendJson(context.response, 404, {
      error: { code: 'mobile_bundle_not_found', message: 'Mobile bundle not found.' },
    });
    return;
  }

  if (!await fileExists(platformFiles.bundle.absolutePath)) {
    sendJson(context.response, 404, {
      error: { code: 'mobile_bundle_not_found', message: 'Mobile bundle not found.' },
    });
    return;
  }

  sendBinary(
    context.response,
    200,
    await readFile(platformFiles.bundle.absolutePath),
    platformFiles.bundle.contentType,
    IMMUTABLE_HEADERS,
  );
}

async function handleMobileAsset(
  context: MobileManifestRouteContext,
  exportFiles: MobileExportFiles,
  hash: string | undefined,
): Promise<void> {
  if (!hash || hash !== basename(hash)) {
    sendJson(context.response, 404, {
      error: { code: 'mobile_asset_not_found', message: 'Mobile asset not found.' },
    });
    return;
  }

  const asset = Array.from(MOBILE_PLATFORMS)
    .flatMap((platform) => exportFiles.platforms[platform]?.assets ?? [])
    .find((candidate) => candidate.hash === hash);

  if (!asset || !await fileExists(asset.absolutePath)) {
    sendJson(context.response, 404, {
      error: { code: 'mobile_asset_not_found', message: 'Mobile asset not found.' },
    });
    return;
  }

  sendBinary(
    context.response,
    200,
    await readFile(asset.absolutePath),
    asset.contentType,
    IMMUTABLE_HEADERS,
  );
}

export async function routeMobileManifestApi(
  context: MobileManifestRouteContext,
): Promise<boolean> {
  if (!context.url.pathname.startsWith('/api/mobile/')) {
    return false;
  }

  if (!context.dependencies.config.mobilePairingEnabled) {
    sendJson(context.response, 404, {
      error: {
        code: 'mobile_pairing_disabled',
        message: 'Mobile pairing is disabled.',
      },
    });
    return true;
  }

  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  const exportFiles = await readMobileExportFiles(context.dependencies.config.mobileBundleRoot);
  if (!exportFiles) {
    sendJson(context.response, 404, {
      error: {
        code: 'mobile_bundle_not_found',
        message: 'Mobile bundle metadata is unavailable.',
      },
    });
    return true;
  }

  if (context.url.pathname === '/api/mobile/manifest') {
    await handleMobileManifest(context, exportFiles);
    return true;
  }

  const bundleMatch = matchRoute(
    context.url.pathname,
    /^\/api\/mobile\/bundle\/([^/]+)\/([^/]+)$/u,
  );
  if (bundleMatch) {
    await handleMobileBundle(context, exportFiles, bundleMatch[0], bundleMatch[1]);
    return true;
  }

  const assetMatch = matchRoute(context.url.pathname, /^\/api\/mobile\/assets\/([^/]+)$/u);
  if (assetMatch) {
    await handleMobileAsset(context, exportFiles, assetMatch[0]);
    return true;
  }

  sendJson(context.response, 404, {
    error: {
      code: 'mobile_route_not_found',
      message: 'Mobile pairing route not found.',
    },
  });
  return true;
}

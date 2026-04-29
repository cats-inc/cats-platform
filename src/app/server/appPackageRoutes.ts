import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { AppConfig } from '../../config.js';
import type { CatsAppManifestV1 } from '../../shared/catsAppManifest.js';
import {
  parseCatsAppManifestV1,
  type CatsAppManifestValidationIssue,
} from '../../shared/catsAppValidation.js';
import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../shared/http.js';
import { listPlatformProductDescriptors } from '../../shared/platformProducts.js';
import { readPlatformInstalledAppDescriptors } from '../../platform/apps/envelope.js';
import { resolveCatsAppStoragePathsFromChatState } from '../../platform/apps/paths.js';
import { FileCatsAppRegistry } from '../../platform/apps/registry.js';

export interface AppPackageApiDependencies {
  config: Pick<AppConfig, 'chatStatePath'>;
  now?: () => Date;
}

export type AppPackageRouteContext = RouteContext<AppPackageApiDependencies>;

interface AppPackagePathInput {
  packagePath?: string;
}

interface AppPackageInstallInput extends AppPackagePathInput {
  enable?: boolean;
}

interface LocalManifestReadResult {
  packagePath: string;
  manifestPath: string;
  manifestJson: unknown;
}

const CATS_APP_MANIFEST_FILE = 'cats.app.json';

const RESERVED_SETTINGS_PATHS = [
  '/settings',
  '/settings/general',
  '/settings/cats',
  '/settings/cats/my-cats',
  '/settings/cats/assistants',
  '/settings/apps',
  '/settings/desktop',
  '/settings/runtime',
  '/settings/data',
  ...listPlatformProductDescriptors().flatMap((product) =>
    product.settings?.map((setting) => setting.path) ?? []),
];

function appRegistryFor(context: AppPackageRouteContext): FileCatsAppRegistry {
  const paths = resolveCatsAppStoragePathsFromChatState(context.dependencies.config.chatStatePath);
  return new FileCatsAppRegistry({
    registryPath: paths.registryPath,
    now: context.dependencies.now,
  });
}

function badRequestIssue(
  message: string,
  pathName = 'packagePath',
): CatsAppManifestValidationIssue {
  return {
    code: 'invalid_cats_app_package_request',
    message,
    path: pathName,
  };
}

async function readLocalManifestPackage(input: AppPackagePathInput): Promise<
  | { ok: true; value: LocalManifestReadResult }
  | { ok: false; issues: CatsAppManifestValidationIssue[] }
> {
  const rawPackagePath = input.packagePath?.trim();
  if (!rawPackagePath) {
    return { ok: false, issues: [badRequestIssue('packagePath is required.')] };
  }

  const resolvedPackagePath = path.resolve(rawPackagePath);
  let manifestPath = resolvedPackagePath;
  try {
    const packageStats = await stat(resolvedPackagePath);
    if (packageStats.isDirectory()) {
      manifestPath = path.join(resolvedPackagePath, CATS_APP_MANIFEST_FILE);
    }
  } catch {
    return {
      ok: false,
      issues: [badRequestIssue(`Package path does not exist: ${resolvedPackagePath}.`)],
    };
  }

  try {
    const manifestJson = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
    return {
      ok: true,
      value: {
        packagePath: resolvedPackagePath,
        manifestPath,
        manifestJson,
      },
    };
  } catch (error) {
    const message = error instanceof SyntaxError
      ? `Invalid ${CATS_APP_MANIFEST_FILE} JSON.`
      : `Cannot read ${CATS_APP_MANIFEST_FILE}.`;
    return {
      ok: false,
      issues: [badRequestIssue(message, 'manifest')],
    };
  }
}

async function validateLocalManifestPackage(
  context: AppPackageRouteContext,
  input: AppPackagePathInput,
): Promise<
  | { ok: true; packagePath: string; manifestPath: string; manifest: CatsAppManifestV1 }
  | {
    ok: false;
    packagePath?: string;
    manifestPath?: string;
    issues: CatsAppManifestValidationIssue[];
  }
> {
  const packageRead = await readLocalManifestPackage(input);
  if (!packageRead.ok) {
    return { ok: false, issues: packageRead.issues };
  }

  const registry = appRegistryFor(context);
  const registryState = await registry.readState();
  const parsed = parseCatsAppManifestV1(packageRead.value.manifestJson, {
    existingAppIds: registryState.apps
      .filter((record) => record.installState !== 'uninstalled')
      .map((record) => record.id),
    productRoutePrefixes: listPlatformProductDescriptors().map((product) => product.routePrefix),
    reservedSettingsPaths: RESERVED_SETTINGS_PATHS,
  });

  if (!parsed.ok) {
    return {
      ok: false,
      packagePath: packageRead.value.packagePath,
      manifestPath: packageRead.value.manifestPath,
      issues: parsed.issues,
    };
  }

  return {
    ok: true,
    packagePath: packageRead.value.packagePath,
    manifestPath: packageRead.value.manifestPath,
    manifest: parsed.manifest,
  };
}

async function handleValidate(context: AppPackageRouteContext): Promise<void> {
  let body: AppPackagePathInput;
  try {
    body = await readJsonBody<AppPackagePathInput>(context.request);
  } catch (error) {
    sendJson(context.response, 400, {
      ok: false,
      issues: [badRequestIssue(error instanceof Error ? error.message : 'Invalid request body.')],
    });
    return;
  }

  const result = await validateLocalManifestPackage(context, body);
  sendJson(context.response, result.ok ? 200 : 400, result);
}

async function handleInstall(context: AppPackageRouteContext): Promise<void> {
  let body: AppPackageInstallInput;
  try {
    body = await readJsonBody<AppPackageInstallInput>(context.request);
  } catch (error) {
    sendJson(context.response, 400, {
      ok: false,
      issues: [badRequestIssue(error instanceof Error ? error.message : 'Invalid request body.')],
    });
    return;
  }

  const result = await validateLocalManifestPackage(context, body);
  if (!result.ok) {
    sendJson(context.response, 400, result);
    return;
  }

  const registry = appRegistryFor(context);
  const record = await registry.installApp({
    manifest: result.manifest,
    packagePath: result.packagePath,
    installState: body.enable === true ? 'enabled' : 'installed',
  });

  sendJson(context.response, 201, {
    ok: true,
    app: (await readPlatformInstalledAppDescriptors(context.dependencies.config.chatStatePath))
      .find((descriptor) => descriptor.id === record.id) ?? null,
  });
}

async function handleList(context: AppPackageRouteContext): Promise<void> {
  sendJson(context.response, 200, {
    apps: await readPlatformInstalledAppDescriptors(context.dependencies.config.chatStatePath),
  });
}

async function handleDetail(context: AppPackageRouteContext, appId: string): Promise<void> {
  const app = (await readPlatformInstalledAppDescriptors(context.dependencies.config.chatStatePath))
    .find((descriptor) => descriptor.id === appId);
  if (!app) {
    sendJson(context.response, 404, {
      error: { code: 'cats_app_not_found', message: `Cats app "${appId}" is not installed.` },
    });
    return;
  }
  sendJson(context.response, 200, { app });
}

async function handleStateMutation(
  context: AppPackageRouteContext,
  appId: string,
  installState: 'enabled' | 'disabled',
): Promise<void> {
  try {
    const registry = appRegistryFor(context);
    await registry.updateAppState(appId, { installState });
    await handleDetail(context, appId);
  } catch (error) {
    sendJson(context.response, 404, {
      error: {
        code: 'cats_app_not_found',
        message: error instanceof Error ? error.message : `Cats app "${appId}" is not installed.`,
      },
    });
  }
}

async function handleUninstall(context: AppPackageRouteContext, appId: string): Promise<void> {
  const registry = appRegistryFor(context);
  const purge = ['1', 'true'].includes(context.url.searchParams.get('purge') ?? '');
  const app = await registry.uninstallApp(appId, { purge });
  if (!app) {
    sendJson(context.response, 404, {
      error: { code: 'cats_app_not_found', message: `Cats app "${appId}" is not installed.` },
    });
    return;
  }
  sendJson(context.response, 200, { ok: true, appId, purged: purge });
}

export async function routeAppPackageApi(
  context: AppPackageRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/apps') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleList(context);
    return true;
  }

  if (context.url.pathname === '/api/apps/validate') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleValidate(context);
    return true;
  }

  if (context.url.pathname === '/api/apps/install') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleInstall(context);
    return true;
  }

  const stateMutationMatch = matchRoute(
    context.url.pathname,
    /^\/api\/apps\/([^/]+)\/(enable|disable)$/u,
  );
  if (stateMutationMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleStateMutation(
      context,
      stateMutationMatch[0]!,
      stateMutationMatch[1] === 'enable' ? 'enabled' : 'disabled',
    );
    return true;
  }

  const uninstallMatch = matchRoute(context.url.pathname, /^\/api\/apps\/([^/]+)$/u);
  if (uninstallMatch && context.method === 'DELETE') {
    await handleUninstall(context, uninstallMatch[0]!);
    return true;
  }

  if (uninstallMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET', 'DELETE']);
      return true;
    }
    await handleDetail(context, uninstallMatch[0]!);
    return true;
  }

  return false;
}

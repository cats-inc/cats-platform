import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { AppConfig } from '../../config.js';
import type {
  CatsAppManifestV1,
  CatsInstalledAppRecord,
} from '../../shared/catsAppManifest.js';
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
import {
  readPlatformInstalledAppDescriptors,
  readPlatformProductDescriptors,
  toPlatformInstalledAppDescriptor,
} from '../../platform/apps/envelope.js';
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
const RESERVED_APP_IDS = new Set(['install', 'validate']);

const BASE_RESERVED_SETTINGS_PATHS = [
  '/settings',
  '/settings/general',
  '/settings/cats',
  '/settings/cats/my-cats',
  '/settings/cats/assistants',
  '/settings/apps',
  '/settings/desktop',
  '/settings/runtime',
  '/settings/data',
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

function reservedAppIdIssue(appId: string): CatsAppManifestValidationIssue {
  return {
    code: 'reserved_cats_app_id',
    message: `Cats app id "${appId}" is reserved by the app management API.`,
    path: 'id',
    details: { appId },
  };
}

function readInstalledProductModuleRoutePrefixes(
  records: readonly CatsInstalledAppRecord[],
): string[] {
  return records
    .filter((record) =>
      record.installState !== 'uninstalled'
      && record.manifest.category === 'product-module'
      && record.manifest.trustTier === 'system')
    .flatMap((record) =>
      record.manifest.contributions.products?.map((product) => product.routePrefix) ?? []);
}

function readInstalledProductModuleSettingsPaths(
  records: readonly CatsInstalledAppRecord[],
): string[] {
  return records
    .filter((record) =>
      record.installState !== 'uninstalled'
      && record.manifest.category === 'product-module'
      && record.manifest.trustTier === 'system')
    .flatMap((record) =>
      record.manifest.contributions.products?.flatMap((product) =>
        product.settings?.map((setting) => setting.path) ?? []) ?? []);
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
  const productDescriptors = await readPlatformProductDescriptors(
    context.dependencies.config.chatStatePath,
  );
  const parsed = parseCatsAppManifestV1(packageRead.value.manifestJson, {
    existingAppIds: registryState.apps
      .filter((record) => record.installState !== 'uninstalled')
      .map((record) => record.id),
    productRoutePrefixes: [
      ...productDescriptors.map((product) => product.routePrefix),
      ...readInstalledProductModuleRoutePrefixes(registryState.apps),
    ],
    reservedSettingsPaths: [
      ...BASE_RESERVED_SETTINGS_PATHS,
      ...productDescriptors.flatMap((product) =>
        product.settings?.map((setting) => setting.path) ?? []),
      ...readInstalledProductModuleSettingsPaths(registryState.apps),
    ],
  });

  if (!parsed.ok) {
    return {
      ok: false,
      packagePath: packageRead.value.packagePath,
      manifestPath: packageRead.value.manifestPath,
      issues: parsed.issues,
    };
  }

  if (RESERVED_APP_IDS.has(parsed.manifest.id)) {
    return {
      ok: false,
      packagePath: packageRead.value.packagePath,
      manifestPath: packageRead.value.manifestPath,
      issues: [reservedAppIdIssue(parsed.manifest.id)],
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

async function handleInspect(context: AppPackageRouteContext, appId: string): Promise<void> {
  const registry = appRegistryFor(context);
  const record = await registry.getInstalledApp(appId);
  if (!record) {
    sendJson(context.response, 404, {
      error: { code: 'cats_app_not_found', message: `Cats app "${appId}" is not installed.` },
    });
    return;
  }

  sendJson(context.response, 200, {
    app: toPlatformInstalledAppDescriptor(record),
    record,
  });
}

function resolveScopedApiRoute(record: CatsAppManifestV1, method: string, scopedPath: string) {
  return record.contributions.apiRoutes?.find((route) =>
    route.method === method && route.path === scopedPath) ?? null;
}

async function handleScopedApiRoute(
  context: AppPackageRouteContext,
  appId: string,
  scopedPath: string,
): Promise<void> {
  const registry = appRegistryFor(context);
  const record = await registry.getInstalledApp(appId);
  if (!record) {
    sendJson(context.response, 404, {
      error: { code: 'cats_app_not_found', message: `Cats app "${appId}" is not installed.` },
    });
    return;
  }

  if (!record.enabled || record.installState !== 'enabled') {
    sendJson(context.response, 409, {
      error: {
        code: 'cats_app_not_enabled',
        message: `Cats app "${appId}" is not enabled.`,
      },
    });
    return;
  }

  const route = resolveScopedApiRoute(record.manifest, context.method, scopedPath);
  if (!route) {
    sendJson(context.response, 404, {
      error: {
        code: 'cats_app_scoped_route_not_found',
        message: `Cats app "${appId}" does not declare ${context.method} ${scopedPath}.`,
      },
    });
    return;
  }

  sendJson(context.response, 501, {
    error: {
      code: 'cats_app_scoped_route_not_implemented',
      message: `Cats app scoped route "${route.routeKey}" is declared but no executor is mounted yet.`,
    },
  });
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

  const inspectMatch = matchRoute(context.url.pathname, /^\/api\/apps\/([^/]+)\/inspect$/u);
  if (inspectMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleInspect(context, inspectMatch[0]!);
    return true;
  }

  const scopedMatch = matchRoute(
    context.url.pathname,
    /^\/api\/apps\/([^/]+)\/scoped(?:\/(.*))?$/u,
  );
  if (scopedMatch) {
    const scopedPath = scopedMatch[1] ? `/${scopedMatch[1]}` : '/';
    await handleScopedApiRoute(context, scopedMatch[0]!, scopedPath);
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

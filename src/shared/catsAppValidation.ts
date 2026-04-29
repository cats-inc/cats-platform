import {
  CATS_APP_CATEGORIES,
  CATS_APP_MANIFEST_SCHEMA_VERSION,
  CATS_APP_PERMISSIONS,
  CATS_APP_TRUST_TIERS,
  type CatsAppContributions,
  type CatsAppManifestV1,
  type CatsAppPermission,
} from './catsAppManifest.js';

export interface CatsAppManifestValidationIssue {
  code: string;
  message: string;
  path?: string;
  details?: Record<string, unknown>;
}

export interface CatsAppManifestValidationOptions {
  existingAppIds?: ReadonlyArray<string>;
  productRoutePrefixes?: ReadonlyArray<string>;
  reservedSettingsPaths?: ReadonlyArray<string>;
}

export type CatsAppManifestParseResult =
  | { ok: true; manifest: CatsAppManifestV1 }
  | { ok: false; issues: CatsAppManifestValidationIssue[] };

const APP_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const TOOL_NAME_PATTERN = /^[a-z][a-z0-9.-]*\.[a-z][a-z0-9.-]*$/u;

const CATEGORIES = new Set<string>(CATS_APP_CATEGORIES);
const TRUST_TIERS = new Set<string>(CATS_APP_TRUST_TIERS);
const PERMISSIONS = new Set<string>(CATS_APP_PERMISSIONS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function hasPermission(permissions: ReadonlySet<string>, permission: CatsAppPermission): boolean {
  return permissions.has(permission);
}

function addIssue(
  issues: CatsAppManifestValidationIssue[],
  code: string,
  message: string,
  path?: string,
  details?: Record<string, unknown>,
): void {
  issues.push({ code, message, path, details });
}

function validateRequiredString(
  issues: CatsAppManifestValidationIssue[],
  record: Record<string, unknown>,
  key: string,
  path: string,
): void {
  if (!isNonEmptyString(record[key])) {
    addIssue(issues, 'invalid_cats_app_manifest_string', `${path} must be a non-empty string.`, path);
  }
}

function asContributionArray(
  contributions: CatsAppContributions,
  key: keyof CatsAppContributions,
): unknown[] {
  const value = contributions[key];
  return Array.isArray(value) ? value : [];
}

function validateStringArrayField(
  issues: CatsAppManifestValidationIssue[],
  record: Record<string, unknown>,
  key: string,
  path: string,
): void {
  if (record[key] !== undefined && !isStringArray(record[key])) {
    addIssue(issues, 'invalid_cats_app_manifest_array', `${path} must be an array of strings.`, path);
  }
}

function routePathBelongsToApp(appId: string, routePath: string): boolean {
  const root = `/apps/${appId}`;
  return routePath === root || routePath.startsWith(`${root}/`);
}

function pathStartsWithAny(pathname: string, prefixes: ReadonlyArray<string> = []): string | null {
  return prefixes.find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ?? null;
}

export function parseCatsAppManifestV1(
  input: unknown,
  options: CatsAppManifestValidationOptions = {},
): CatsAppManifestParseResult {
  const issues: CatsAppManifestValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        {
          code: 'invalid_cats_app_manifest',
          message: 'Cats app manifest must be an object.',
        },
      ],
    };
  }

  if (input.schemaVersion !== CATS_APP_MANIFEST_SCHEMA_VERSION) {
    addIssue(
      issues,
      'unsupported_cats_app_manifest_version',
      `cats.app.json schemaVersion must be ${CATS_APP_MANIFEST_SCHEMA_VERSION}.`,
      'schemaVersion',
      { received: input.schemaVersion },
    );
  }

  validateRequiredString(issues, input, 'id', 'id');
  validateRequiredString(issues, input, 'displayName', 'displayName');
  validateRequiredString(issues, input, 'version', 'version');

  if (isNonEmptyString(input.id) && !APP_ID_PATTERN.test(input.id)) {
    addIssue(
      issues,
      'invalid_cats_app_id',
      'Cats app id must be lowercase dot/dash separated text.',
      'id',
      { received: input.id },
    );
  }

  if (isNonEmptyString(input.id) && options.existingAppIds?.includes(input.id)) {
    addIssue(
      issues,
      'duplicate_cats_app_id',
      `Cats app id "${input.id}" is already installed.`,
      'id',
      { appId: input.id },
    );
  }

  if (!isNonEmptyString(input.category) || !CATEGORIES.has(input.category)) {
    addIssue(
      issues,
      'invalid_cats_app_category',
      `category must be one of: ${CATS_APP_CATEGORIES.join(', ')}.`,
      'category',
      { received: input.category },
    );
  }

  if (!isNonEmptyString(input.trustTier) || !TRUST_TIERS.has(input.trustTier)) {
    addIssue(
      issues,
      'invalid_cats_app_trust_tier',
      `trustTier must be one of: ${CATS_APP_TRUST_TIERS.join(', ')}.`,
      'trustTier',
      { received: input.trustTier },
    );
  }

  if (!isRecord(input.publisher)) {
    addIssue(issues, 'invalid_cats_app_publisher', 'publisher must be an object.', 'publisher');
  } else {
    validateRequiredString(issues, input.publisher, 'name', 'publisher.name');
  }

  if (!isRecord(input.compatibility)) {
    addIssue(issues, 'invalid_cats_app_compatibility', 'compatibility must be an object.', 'compatibility');
  } else {
    validateRequiredString(issues, input.compatibility, 'catsPlatform', 'compatibility.catsPlatform');
    validateRequiredString(issues, input.compatibility, 'appSdk', 'compatibility.appSdk');
  }

  if (input.entrypoints !== undefined) {
    if (!isRecord(input.entrypoints)) {
      addIssue(issues, 'invalid_cats_app_entrypoints', 'entrypoints must be an object.', 'entrypoints');
    } else {
      for (const key of ['renderer', 'server', 'worker']) {
        if (input.entrypoints[key] !== undefined && !isNonEmptyString(input.entrypoints[key])) {
          addIssue(issues, 'invalid_cats_app_entrypoint', `entrypoints.${key} must be a non-empty string.`, `entrypoints.${key}`);
        }
      }
    }
  }

  if (!Array.isArray(input.permissions)) {
    addIssue(issues, 'invalid_cats_app_permissions', 'permissions must be an array.', 'permissions');
  } else {
    for (const [index, permission] of input.permissions.entries()) {
      if (typeof permission !== 'string' || !PERMISSIONS.has(permission)) {
        addIssue(
          issues,
          'invalid_cats_app_permission',
          `permissions[${index}] must be one of: ${CATS_APP_PERMISSIONS.join(', ')}.`,
          `permissions.${index}`,
          { received: permission },
        );
      }
    }
  }

  if (!isRecord(input.contributions)) {
    addIssue(issues, 'invalid_cats_app_contributions', 'contributions must be an object.', 'contributions');
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const manifest = input as unknown as CatsAppManifestV1;
  const permissions = new Set(manifest.permissions);
  validateContributionRules(issues, manifest, permissions, options);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, manifest };
}

function validateContributionRules(
  issues: CatsAppManifestValidationIssue[],
  manifest: CatsAppManifestV1,
  permissions: ReadonlySet<string>,
  options: CatsAppManifestValidationOptions,
): void {
  validateLobbyContributions(issues, manifest, permissions, options);
  validateProductContributions(issues, manifest, options);
  validateSettingsContributions(issues, manifest, permissions, options);
  validateToolContributions(issues, manifest, permissions);
  validateConnectorContributions(issues, manifest, permissions);
  validateScopedApiContributions(issues, manifest, permissions);
  validateJobContributions(issues, manifest, permissions);
}

function validateLobbyContributions(
  issues: CatsAppManifestValidationIssue[],
  manifest: CatsAppManifestV1,
  permissions: ReadonlySet<string>,
  options: CatsAppManifestValidationOptions,
): void {
  const entries = asContributionArray(manifest.contributions, 'lobbyApps');
  if (entries.length === 0) return;
  if (!hasPermission(permissions, 'ui.lobby')) {
    addIssue(issues, 'missing_cats_app_permission', 'lobbyApps require ui.lobby permission.', 'permissions');
  }
  if (!hasPermission(permissions, 'ui.route')) {
    addIssue(issues, 'missing_cats_app_permission', 'lobbyApps require ui.route permission.', 'permissions');
  }

  for (const [index, entry] of entries.entries()) {
    const path = `contributions.lobbyApps.${index}`;
    if (!isRecord(entry)) {
      addIssue(issues, 'invalid_cats_app_lobby_entry', `${path} must be an object.`, path);
      continue;
    }
    validateRequiredString(issues, entry, 'id', `${path}.id`);
    validateRequiredString(issues, entry, 'title', `${path}.title`);
    validateRequiredString(issues, entry, 'routePath', `${path}.routePath`);
    if (isNonEmptyString(entry.routePath) && !routePathBelongsToApp(manifest.id, entry.routePath)) {
      addIssue(
        issues,
        'invalid_cats_app_lobby_route',
        `Lobby app routePath must stay under /apps/${manifest.id}.`,
        `${path}.routePath`,
        { routePath: entry.routePath },
      );
    }
    if (isNonEmptyString(entry.routePath)) {
      const conflictingProduct = pathStartsWithAny(entry.routePath, options.productRoutePrefixes);
      if (conflictingProduct) {
        addIssue(
          issues,
          'cats_app_route_collision',
          `Lobby app routePath conflicts with product route prefix ${conflictingProduct}.`,
          `${path}.routePath`,
          { routePath: entry.routePath, conflictingProduct },
        );
      }
    }
  }
}

function validateProductContributions(
  issues: CatsAppManifestValidationIssue[],
  manifest: CatsAppManifestV1,
  options: CatsAppManifestValidationOptions,
): void {
  const entries = asContributionArray(manifest.contributions, 'products');
  if (entries.length === 0) return;
  if (manifest.trustTier !== 'system') {
    addIssue(issues, 'forbidden_cats_app_product_contribution', 'Only system apps may contribute products.', 'contributions.products');
  }

  for (const [index, entry] of entries.entries()) {
    const path = `contributions.products.${index}`;
    if (!isRecord(entry)) {
      addIssue(issues, 'invalid_cats_app_product_contribution', `${path} must be an object.`, path);
      continue;
    }
    validateRequiredString(issues, entry, 'productId', `${path}.productId`);
    validateRequiredString(issues, entry, 'productName', `${path}.productName`);
    validateRequiredString(issues, entry, 'routePrefix', `${path}.routePrefix`);
    if (isNonEmptyString(entry.routePrefix)) {
      const conflictingProduct = pathStartsWithAny(entry.routePrefix, options.productRoutePrefixes);
      if (conflictingProduct) {
        addIssue(
          issues,
          'cats_app_product_route_collision',
          `Product routePrefix conflicts with existing product route prefix ${conflictingProduct}.`,
          `${path}.routePrefix`,
          { routePrefix: entry.routePrefix, conflictingProduct },
        );
      }
    }
  }
}

function validateSettingsContributions(
  issues: CatsAppManifestValidationIssue[],
  manifest: CatsAppManifestV1,
  permissions: ReadonlySet<string>,
  options: CatsAppManifestValidationOptions,
): void {
  const entries = asContributionArray(manifest.contributions, 'settings');
  if (entries.length === 0) return;
  if (!hasPermission(permissions, 'settings.app')) {
    addIssue(issues, 'missing_cats_app_permission', 'settings contributions require settings.app permission.', 'permissions');
  }

  for (const [index, entry] of entries.entries()) {
    const path = `contributions.settings.${index}`;
    if (!isRecord(entry)) {
      addIssue(issues, 'invalid_cats_app_settings_contribution', `${path} must be an object.`, path);
      continue;
    }
    validateRequiredString(issues, entry, 'id', `${path}.id`);
    validateRequiredString(issues, entry, 'label', `${path}.label`);
    validateRequiredString(issues, entry, 'path', `${path}.path`);
    if (isNonEmptyString(entry.path) && options.reservedSettingsPaths?.includes(entry.path)) {
      addIssue(
        issues,
        'cats_app_settings_path_collision',
        `Settings path "${entry.path}" is reserved by the host.`,
        `${path}.path`,
        { settingsPath: entry.path },
      );
    }
    if (
      manifest.trustTier !== 'system'
      && isNonEmptyString(entry.path)
      && !entry.path.startsWith(`/settings/apps/${manifest.id}`)
    ) {
      addIssue(
        issues,
        'invalid_cats_app_settings_path',
        `Non-system app settings must stay under /settings/apps/${manifest.id}.`,
        `${path}.path`,
        { settingsPath: entry.path },
      );
    }
  }
}

function validateToolContributions(
  issues: CatsAppManifestValidationIssue[],
  manifest: CatsAppManifestV1,
  permissions: ReadonlySet<string>,
): void {
  const entries = asContributionArray(manifest.contributions, 'tools');
  if (entries.length === 0) return;
  if (!hasPermission(permissions, 'agent.tools.register')) {
    addIssue(issues, 'missing_cats_app_permission', 'tools require agent.tools.register permission.', 'permissions');
  }
  for (const [index, entry] of entries.entries()) {
    const path = `contributions.tools.${index}`;
    if (!isRecord(entry)) {
      addIssue(issues, 'invalid_cats_app_tool_contribution', `${path} must be an object.`, path);
      continue;
    }
    validateRequiredString(issues, entry, 'name', `${path}.name`);
    validateRequiredString(issues, entry, 'title', `${path}.title`);
    validateRequiredString(issues, entry, 'description', `${path}.description`);
    if (isNonEmptyString(entry.name) && !TOOL_NAME_PATTERN.test(entry.name)) {
      addIssue(issues, 'invalid_cats_app_tool_name', 'Tool name must be app-namespaced.', `${path}.name`);
    }
    if (!isRecord(entry.inputSchema)) {
      addIssue(issues, 'invalid_cats_app_tool_schema', `${path}.inputSchema must be an object.`, `${path}.inputSchema`);
    }
  }
}

function validateConnectorContributions(
  issues: CatsAppManifestValidationIssue[],
  manifest: CatsAppManifestV1,
  permissions: ReadonlySet<string>,
): void {
  const entries = asContributionArray(manifest.contributions, 'connectors');
  for (const [index, entry] of entries.entries()) {
    const path = `contributions.connectors.${index}`;
    if (!isRecord(entry)) {
      addIssue(issues, 'invalid_cats_app_connector_contribution', `${path} must be an object.`, path);
      continue;
    }
    validateRequiredString(issues, entry, 'id', `${path}.id`);
    validateRequiredString(issues, entry, 'service', `${path}.service`);
    validateStringArrayField(issues, entry, 'capabilities', `${path}.capabilities`);
    if (entry.auth !== undefined && !hasPermission(permissions, 'connector.auth')) {
      addIssue(issues, 'missing_cats_app_permission', 'connector auth declarations require connector.auth permission.', 'permissions');
    }
  }
}

function validateScopedApiContributions(
  issues: CatsAppManifestValidationIssue[],
  manifest: CatsAppManifestV1,
  permissions: ReadonlySet<string>,
): void {
  const entries = asContributionArray(manifest.contributions, 'apiRoutes');
  for (const [index, entry] of entries.entries()) {
    const path = `contributions.apiRoutes.${index}`;
    if (!isRecord(entry)) {
      addIssue(issues, 'invalid_cats_app_api_route_contribution', `${path} must be an object.`, path);
      continue;
    }
    validateRequiredString(issues, entry, 'routeKey', `${path}.routeKey`);
    validateRequiredString(issues, entry, 'path', `${path}.path`);
    if (!isNonEmptyString(entry.permission) || !PERMISSIONS.has(entry.permission)) {
      addIssue(issues, 'invalid_cats_app_api_route_permission', `${path}.permission must be a known permission.`, `${path}.permission`);
    } else if (!permissions.has(entry.permission)) {
      addIssue(
        issues,
        'missing_cats_app_permission',
        `api route ${entry.routeKey ?? index} requires ${entry.permission} permission.`,
        'permissions',
      );
    }
  }
}

function validateJobContributions(
  issues: CatsAppManifestValidationIssue[],
  manifest: CatsAppManifestV1,
  permissions: ReadonlySet<string>,
): void {
  const entries = asContributionArray(manifest.contributions, 'jobs');
  if (entries.length === 0) return;
  if (!hasPermission(permissions, 'jobs.schedule')) {
    addIssue(issues, 'missing_cats_app_permission', 'jobs require jobs.schedule permission.', 'permissions');
  }
  for (const [index, entry] of entries.entries()) {
    const path = `contributions.jobs.${index}`;
    if (!isRecord(entry)) {
      addIssue(issues, 'invalid_cats_app_job_contribution', `${path} must be an object.`, path);
      continue;
    }
    validateRequiredString(issues, entry, 'id', `${path}.id`);
    validateRequiredString(issues, entry, 'title', `${path}.title`);
  }
}

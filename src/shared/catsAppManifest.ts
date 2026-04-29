export const CATS_APP_MANIFEST_SCHEMA_VERSION = 1;

export const CATS_APP_CATEGORIES = [
  'user-app',
  'capability-connector',
  'product-module',
] as const;

export type CatsAppCategory = typeof CATS_APP_CATEGORIES[number];

export const CATS_APP_TRUST_TIERS = [
  'system',
  'local-user',
  'third-party',
] as const;

export type CatsAppTrustTier = typeof CATS_APP_TRUST_TIERS[number];

export const CATS_APP_PERMISSIONS = [
  'ui.route',
  'ui.lobby',
  'settings.app',
  'storage.appData',
  'agent.tools.register',
  'agent.tools.execute',
  'connector.auth',
  'runtime.adapter',
  'jobs.schedule',
  'core.read',
  'core.write',
] as const;

export type CatsAppPermission = typeof CATS_APP_PERMISSIONS[number];

export interface CatsAppPublisher {
  name: string;
  homepage?: string;
  email?: string;
}

export interface CatsAppCompatibility {
  catsPlatform: string;
  appSdk: string;
}

export interface CatsAppEntrypoints {
  renderer?: string;
  server?: string;
  worker?: string;
}

export interface CatsLobbyAppContribution {
  id: string;
  title: string;
  subtitle?: string;
  routePath: `/apps/${string}`;
  icon?: string;
  maturity?: 'active' | 'preview';
}

export interface CatsProductModuleContribution {
  productId: string;
  productName: string;
  subtitle: string;
  routePrefix: `/${string}`;
  group: 'home' | 'office';
  installPolicy: 'required' | 'optional';
  maturity: 'active' | 'preview';
  settings?: CatsAppSettingsContribution[];
}

export interface CatsAppSettingsContribution {
  id: string;
  label: string;
  path: `/settings/apps/${string}` | `/settings/${string}`;
}

export interface CatsAgentToolContribution {
  name: `${string}.${string}`;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  requiresApproval?: boolean;
  runtimeBridge?: 'platform' | 'cats-runtime';
}

export interface CatsConnectorAuthDeclaration {
  kind: 'none' | 'api-key' | 'oauth' | 'local-token' | 'external-cli';
  setupHint?: string;
  secretRefs?: string[];
}

export interface CatsConnectorContribution {
  id: string;
  service: string;
  auth?: CatsConnectorAuthDeclaration;
  capabilities: string[];
  setupPath?: `/settings/apps/${string}` | `/settings/${string}`;
}

export interface CatsScopedApiRouteContribution {
  routeKey: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: `/${string}`;
  permission: CatsAppPermission;
}

export interface CatsJobContribution {
  id: string;
  title: string;
  schedule?: string;
  permission: 'jobs.schedule';
}

export interface CatsAppContributions {
  lobbyApps?: CatsLobbyAppContribution[];
  products?: CatsProductModuleContribution[];
  settings?: CatsAppSettingsContribution[];
  tools?: CatsAgentToolContribution[];
  connectors?: CatsConnectorContribution[];
  apiRoutes?: CatsScopedApiRouteContribution[];
  jobs?: CatsJobContribution[];
}

export interface CatsAppManifestV1 {
  schemaVersion: typeof CATS_APP_MANIFEST_SCHEMA_VERSION;
  id: string;
  displayName: string;
  version: string;
  description?: string;
  category: CatsAppCategory;
  trustTier: CatsAppTrustTier;
  publisher: CatsAppPublisher;
  compatibility: CatsAppCompatibility;
  entrypoints?: CatsAppEntrypoints;
  contributions: CatsAppContributions;
  permissions: CatsAppPermission[];
}

export type CatsAppInstallState =
  | 'installed'
  | 'enabled'
  | 'disabled'
  | 'error'
  | 'upgrade-pending'
  | 'uninstalled';

export interface CatsInstalledAppRecord {
  id: string;
  manifest: CatsAppManifestV1;
  packagePath: string;
  installState: CatsAppInstallState;
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
  lastError?: string | null;
}

export interface PlatformInstalledAppDescriptor {
  id: string;
  displayName: string;
  publisher: string;
  version: string;
  category: CatsAppCategory;
  trustTier: CatsAppTrustTier;
  permissions: CatsAppPermission[];
  installState: CatsAppInstallState;
  enabled: boolean;
  lobbyEntries: CatsLobbyAppContribution[];
  settings?: CatsAppSettingsContribution[];
}

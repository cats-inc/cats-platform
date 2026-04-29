import type {
  CatsAgentToolContribution,
  CatsAppCategory,
  CatsAppPermission,
  CatsAppTrustTier,
} from './catsAppManifest.js';
import type { PlatformSurfaceId } from './platform-contract.js';

export interface CatsAppModule {
  activate?: (ctx: CatsAppActivationContext) => Promise<void> | void;
  deactivate?: (ctx: CatsAppActivationContext) => Promise<void> | void;
}

export interface CatsAppActivationContext {
  app: {
    id: string;
    version: string;
    category: CatsAppCategory;
    trustTier: CatsAppTrustTier;
  };
  permissions: CatsAppPermissionGate;
  storage: CatsScopedAppStorage;
  settings: CatsScopedSettingsStore;
  tools: CatsToolRegistrationApi;
  runtime: CatsRuntimeBridgeApi;
  core: CatsCoreBridgeApi;
  log: CatsAppLogger;
}

export interface CatsAppPermissionGate {
  has(permission: CatsAppPermission): boolean;
  require(permission: CatsAppPermission): void;
}

export interface CatsScopedAppStorage {
  get<TValue>(key: string): Promise<TValue | null>;
  set<TValue>(key: string, value: TValue): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface CatsScopedSettingsStore {
  get<TValue>(key: string): Promise<TValue | null>;
  set<TValue>(key: string, value: TValue): Promise<void>;
}

export interface CatsToolRegistrationApi {
  register(tool: CatsAgentToolContribution): void;
}

export interface CatsRuntimeBridgeApi {
  request<TInput, TOutput>(operation: string, input: TInput): Promise<TOutput>;
}

export interface CatsCoreBridgeApi {
  query<TInput, TOutput>(operation: string, input: TInput): Promise<TOutput>;
  mutate<TInput, TOutput>(operation: string, input: TInput): Promise<TOutput>;
}

export interface CatsAppLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface CatsAppRendererContext {
  appId: string;
  route: CatsAppRendererRouteContext;
  locale: string;
  theme: 'system' | 'light' | 'dark';
  navigate(path: string): void;
  openCatsSurface(surface: PlatformSurfaceId, path?: string): void;
  callAction<TInput, TOutput>(key: string, input: TInput): Promise<TOutput>;
  readState<TValue>(key: string): Promise<TValue | null>;
  writeState<TValue>(key: string, value: TValue): Promise<void>;
}

export interface CatsAppRendererRouteContext {
  pathname: string;
  params: Record<string, string>;
  query: URLSearchParams;
}

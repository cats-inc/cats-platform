import type { MobileSecureTokenStorage } from './authTokenStore';

export interface ExpoSecureStoreModule {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface ExpoSecureStoreResolveOptions {
  loadModule?: () => unknown;
}

declare const require: ((id: string) => unknown) | undefined;

export function createExpoSecureStoreAuthTokenStorage(
  secureStore: ExpoSecureStoreModule,
): MobileSecureTokenStorage {
  return {
    getItemAsync: (key) => secureStore.getItemAsync(key),
    setItemAsync: (key, value) => secureStore.setItemAsync(key, value),
    deleteItemAsync: (key) => secureStore.deleteItemAsync(key),
  };
}

export function resolveExpoSecureStoreAuthTokenStorage(
  options: ExpoSecureStoreResolveOptions = {},
): MobileSecureTokenStorage | null {
  const loaded = options.loadModule ? options.loadModule() : loadExpoSecureStoreModule();
  const secureStore = unwrapExpoSecureStoreModule(loaded);
  return secureStore ? createExpoSecureStoreAuthTokenStorage(secureStore) : null;
}

function loadExpoSecureStoreModule(): unknown {
  if (typeof require !== 'function') {
    return null;
  }
  try {
    return require('expo-secure-store');
  } catch {
    return null;
  }
}

function unwrapExpoSecureStoreModule(value: unknown): ExpoSecureStoreModule | null {
  if (isExpoSecureStoreModule(value)) {
    return value;
  }
  if (
    typeof value === 'object'
    && value !== null
    && 'default' in value
    && isExpoSecureStoreModule(value.default)
  ) {
    return value.default;
  }
  return null;
}

function isExpoSecureStoreModule(value: unknown): value is ExpoSecureStoreModule {
  return typeof value === 'object'
    && value !== null
    && 'getItemAsync' in value
    && 'setItemAsync' in value
    && 'deleteItemAsync' in value
    && typeof value.getItemAsync === 'function'
    && typeof value.setItemAsync === 'function'
    && typeof value.deleteItemAsync === 'function';
}

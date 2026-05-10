export interface MobileSecureTokenStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const MOBILE_AUTH_TOKEN_STORAGE_KEY = 'cats-mobile.authToken.v1';

let volatileAuthToken: string | null = null;

export const volatileMobileAuthTokenStorage: MobileSecureTokenStorage = {
  async getItemAsync(key: string): Promise<string | null> {
    return key === MOBILE_AUTH_TOKEN_STORAGE_KEY ? volatileAuthToken : null;
  },
  async setItemAsync(key: string, value: string): Promise<void> {
    if (key === MOBILE_AUTH_TOKEN_STORAGE_KEY) {
      volatileAuthToken = value;
    }
  },
  async deleteItemAsync(key: string): Promise<void> {
    if (key === MOBILE_AUTH_TOKEN_STORAGE_KEY) {
      volatileAuthToken = null;
    }
  },
};

export async function loadMobileAuthToken(
  storage: MobileSecureTokenStorage,
): Promise<string | null> {
  const token = await storage.getItemAsync(MOBILE_AUTH_TOKEN_STORAGE_KEY);
  return normalizeToken(token);
}

export async function saveMobileAuthToken(
  storage: MobileSecureTokenStorage,
  token: string,
): Promise<void> {
  const normalized = normalizeToken(token);
  if (!normalized) {
    await clearMobileAuthToken(storage);
    return;
  }
  await storage.setItemAsync(MOBILE_AUTH_TOKEN_STORAGE_KEY, normalized);
}

export async function clearMobileAuthToken(storage: MobileSecureTokenStorage): Promise<void> {
  await storage.deleteItemAsync(MOBILE_AUTH_TOKEN_STORAGE_KEY);
}

export function createExpoSecureStoreAuthTokenStorage(
  secureStore: MobileSecureTokenStorage,
): MobileSecureTokenStorage {
  return secureStore;
}

export function getDefaultMobileAuthTokenStorage(): MobileSecureTokenStorage {
  return volatileMobileAuthTokenStorage;
}

function normalizeToken(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

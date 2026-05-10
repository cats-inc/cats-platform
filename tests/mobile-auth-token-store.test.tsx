import assert from 'node:assert/strict';
import test from 'node:test';

import tokenStoreModule from '../mobile/src/api/authTokenStore.ts';

const {
  MOBILE_AUTH_TOKEN_STORAGE_KEY,
  clearMobileAuthToken,
  createExpoSecureStoreAuthTokenStorage,
  loadMobileAuthToken,
  saveMobileAuthToken,
} = tokenStoreModule as typeof import('../mobile/src/api/authTokenStore.ts');

test('mobile auth token store persists tokens only through secure-store interface', async () => {
  const storage = createMemorySecureStorage();
  await saveMobileAuthToken(storage, '  mobile-token  ');

  assert.equal(storage.values.get(MOBILE_AUTH_TOKEN_STORAGE_KEY), 'mobile-token');
  assert.equal(await loadMobileAuthToken(storage), 'mobile-token');
});

test('mobile auth token store clears blank or explicit logout tokens', async () => {
  const storage = createMemorySecureStorage();
  await saveMobileAuthToken(storage, 'mobile-token');
  await saveMobileAuthToken(storage, '   ');
  assert.equal(await loadMobileAuthToken(storage), null);

  await saveMobileAuthToken(storage, 'mobile-token');
  await clearMobileAuthToken(storage);
  assert.equal(await loadMobileAuthToken(storage), null);
});

test('expo secure-store adapter keeps the injected storage boundary explicit', async () => {
  const storage = createMemorySecureStorage();
  const secureStore = createExpoSecureStoreAuthTokenStorage(storage);
  await secureStore.setItemAsync(MOBILE_AUTH_TOKEN_STORAGE_KEY, 'mobile-token');

  assert.equal(await secureStore.getItemAsync(MOBILE_AUTH_TOKEN_STORAGE_KEY), 'mobile-token');
});

function createMemorySecureStorage() {
  const values = new Map<string, string>();
  return {
    values,
    async getItemAsync(key: string): Promise<string | null> {
      return values.get(key) ?? null;
    },
    async setItemAsync(key: string, value: string): Promise<void> {
      values.set(key, value);
    },
    async deleteItemAsync(key: string): Promise<void> {
      values.delete(key);
    },
  };
}

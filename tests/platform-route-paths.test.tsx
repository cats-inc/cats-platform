import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isLobbyPath,
  isPlatformEntityPath,
  isPlatformNonProductPath,
  isProductsPath,
  isSetupPath,
  LOBBY_PATH,
  PRODUCTS_PATH,
  SETTINGS_PATH,
  SETUP_PATH,
} from '../src/shared/platformRoutePaths.ts';

test('platform route path helpers recognize canonical non-product routes', () => {
  assert.equal(SETUP_PATH, '/setup');
  assert.equal(LOBBY_PATH, '/lobby');
  assert.equal(PRODUCTS_PATH, '/products');
  assert.equal(SETTINGS_PATH, '/settings');
  assert.equal(isSetupPath('/setup'), true);
  assert.equal(isSetupPath('/setup/wizard'), false);
  assert.equal(isLobbyPath('/lobby'), true);
  assert.equal(isLobbyPath('/lobby/tips'), true);
  assert.equal(isLobbyPath('/lobbies'), false);
  assert.equal(isProductsPath('/products'), true);
  assert.equal(isProductsPath('/products/chat'), true);
  assert.equal(isProductsPath('/product'), false);
  assert.equal(isPlatformEntityPath('/entities'), true);
  assert.equal(isPlatformEntityPath('/entities/cats'), true);
  assert.equal(isPlatformEntityPath('/entities/cats/cat-1'), true);
  assert.equal(isPlatformEntityPath('/entities/clowders'), true);
  assert.equal(isPlatformEntityPath('/entities/clowders/clw-dev'), true);
  assert.equal(isPlatformEntityPath('/entities/catteries'), true);
  assert.equal(isPlatformEntityPath('/entities/catteries/acme'), true);
  assert.equal(isPlatformEntityPath('/entitiestail'), false);
  assert.equal(isPlatformEntityPath('/cats'), false);
  assert.equal(isPlatformEntityPath('/clowders'), false);
  assert.equal(isPlatformEntityPath('/catteries'), false);
  assert.equal(isPlatformNonProductPath('/setup'), true);
  assert.equal(isPlatformNonProductPath('/lobby'), true);
  assert.equal(isPlatformNonProductPath('/products'), true);
  assert.equal(isPlatformNonProductPath('/entities/cats/cat-1'), true);
  assert.equal(isPlatformNonProductPath('/entities/clowders/clw-dev'), true);
  assert.equal(isPlatformNonProductPath('/entities/catteries/acme'), true);
  assert.equal(isPlatformNonProductPath('/settings'), true);
  assert.equal(isPlatformNonProductPath('/settings/general'), true);
  assert.equal(isPlatformNonProductPath('/chat/new'), false);
  assert.equal(isPlatformNonProductPath('/work'), false);
});

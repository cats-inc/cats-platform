import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CATS_VITE_PROXY_PATHS,
  createCatsViteProxyOptions,
} from '../vite.config.ts';

test('vite auth proxy preserves browser origin and rewrites cookies to renderer host', () => {
  const proxy = createCatsViteProxyOptions('http://127.0.0.1:8181');

  assert.equal(proxy.target, 'http://127.0.0.1:8181');
  assert.equal(proxy.changeOrigin, false);
  assert.equal(proxy.cookieDomainRewrite, '');
  assert.equal(proxy.cookiePathRewrite, '/');
});

test('vite auth proxy covers api, health, and runtime ingress paths', () => {
  assert.deepEqual([...CATS_VITE_PROXY_PATHS], ['/api', '/health', '/runtime']);
});

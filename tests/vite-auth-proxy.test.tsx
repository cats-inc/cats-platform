import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CATS_VITE_PROXY_PATHS,
  createCatsViteProxyOptions,
} from '../src/platform/auth/viteProxy.ts';
import {
  clearAuthSessionCookie,
  serializeAuthSessionCookie,
} from '../src/platform/auth/index.ts';

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

test('browser auth cookies remain host-only for built server and dev proxy', () => {
  const cookie = serializeAuthSessionCookie('session-token', 60_000);
  const cleared = clearAuthSessionCookie();

  for (const header of [cookie, cleared]) {
    assert.match(header, /Path=\//u);
    assert.match(header, /HttpOnly/u);
    assert.match(header, /SameSite=Lax/u);
    assert.doesNotMatch(header, /Domain=/iu);
  }
});

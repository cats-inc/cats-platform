import assert from 'node:assert/strict';
import test from 'node:test';
import { hasDesktopAppAuthority } from '../src/platform/apps/desktopAuthority.ts';
import { validateDesktopAppRequest } from '../desktop/host/appRequests.ts';

test('App management requires the loopback Desktop credential, with no browser Origin', () => {
  const key = 'a'.repeat(64);
  const request = (headers = {}, remoteAddress = '127.0.0.1') => ({ headers, socket: { remoteAddress } }) as never;
  assert.equal(hasDesktopAppAuthority(request({ 'x-cats-desktop-apps': key }), key), true);
  for (const req of [request(), request({ 'x-cats-desktop-apps': 'b'.repeat(64) }),
    request({ 'x-cats-desktop-apps': '界'.repeat(64) }),
    request({ 'x-cats-desktop-apps': key, origin: 'http://127.0.0.1:8181' }),
    request({ 'x-cats-desktop-apps': key }, '192.0.2.1')]) {
    assert.equal(hasDesktopAppAuthority(req, key), false);
  }
  assert.equal(hasDesktopAppAuthority(request({ 'x-cats-desktop-apps': key }), undefined), false);
});

test('Desktop App IPC accepts bounded management paths and rejects arbitrary destinations', () => {
  assert.equal(validateDesktopAppRequest({ path: '/api/apps/test.ask/renderer', method: 'GET' }).path, '/api/apps/test.ask/renderer');
  for (const path of ['https://example.com/api/apps', '//example.com/api/apps', '/api/auth', '/api/apps/../../auth', '/api/apps/../auth',
    '/api/apps/%2e%2e/auth', '/api/apps/test.ask#fragment']) {
    assert.throws(() => validateDesktopAppRequest({ path, method: 'POST' }));
  }
  assert.throws(() => validateDesktopAppRequest({ path: '/api/apps', method: 'TRACE' }));
});

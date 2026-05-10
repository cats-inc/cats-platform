import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyPlatformAuthRoute,
  type PlatformAuthGatePhase,
} from '../src/app/server/authGatePolicy.ts';

test('platform auth gate keeps renderer, health, mobile, and auth bootstrap routes public', () => {
  const publicRoutes = [
    ['GET', '/'],
    ['GET', '/chat/chats/channel-1'],
    ['GET', '/assets/index.js'],
    ['GET', '/health'],
    ['GET', '/api/mobile/manifest'],
    ['GET', '/api/mobile/bundle/ios/main.js'],
    ['GET', '/api/mobile/assets/icon.png'],
    ['GET', '/api/mobile/auth/status'],
    ['POST', '/api/mobile/auth/login'],
    ['POST', '/api/mobile/auth/logout'],
    ['GET', '/api/auth/status'],
    ['POST', '/api/auth/login'],
    ['POST', '/api/auth/logout'],
  ] as const;

  for (const [method, pathname] of publicRoutes) {
    assert.equal(
      classifyPlatformAuthRoute({ phase: 'post_setup', method, pathname }).access,
      'public',
      `${method} ${pathname}`,
    );
  }
});

test('platform auth gate marks app-shell reads as public minimal envelopes', () => {
  for (const phase of ['pre_setup', 'post_setup', 'repair'] satisfies PlatformAuthGatePhase[]) {
    const policy = classifyPlatformAuthRoute({
      phase,
      method: 'GET',
      pathname: '/api/app-shell',
    });
    assert.equal(policy.access, 'public');
    assert.equal(policy.minimalEnvelope, true);
  }
});

test('platform auth gate exposes setup bootstrap routes only before setup', () => {
  const setupRoutes = [
    ['GET', '/api/platform/ingress'],
    ['GET', '/api/platform/bootstrap-diagnostics'],
    ['POST', '/api/platform/bootstrap-diagnostics/opened'],
    ['POST', '/api/platform/setup/complete'],
    ['POST', '/api/setup/complete'],
    ['POST', '/api/platform/preferences'],
    ['PUT', '/api/platform/guide-cat'],
    ['PATCH', '/api/platform/guide-cat'],
    ['DELETE', '/api/platform/guide-cat'],
    ['GET', '/api/platform/assistants'],
    ['POST', '/api/platform/assistants'],
    ['PUT', '/api/platform/assistants/assistant-1'],
    ['DELETE', '/api/platform/assistants/assistant-1'],
  ] as const;

  for (const [method, pathname] of setupRoutes) {
    assert.equal(
      classifyPlatformAuthRoute({ phase: 'pre_setup', method, pathname }).access,
      'public',
      `${method} ${pathname} before setup`,
    );
    assert.equal(
      classifyPlatformAuthRoute({ phase: 'post_setup', method, pathname }).access,
      'protected',
      `${method} ${pathname} after setup`,
    );
  }
});

test('platform auth gate protects product, core, runtime, shell, transport, and subscription APIs', () => {
  const protectedRoutes = [
    ['GET', '/api/channels'],
    ['POST', '/api/channels'],
    ['GET', '/api/core/tasks'],
    ['GET', '/api/artifact-canvas/artifacts/artifact-1'],
    ['GET', '/api/subscribe?kind=artifact&id=artifact-1'],
    ['GET', '/api/work/projects'],
    ['POST', '/api/code/tasks'],
    ['GET', '/api/mobile/work/items'],
    ['GET', '/api/mobile/auth/sessions'],
    ['GET', '/api/providers'],
    ['POST', '/api/providers/models/refresh'],
    ['GET', '/api/transports/telegram'],
    ['POST', '/api/transports/telegram/webhook'],
    ['GET', '/api/shell/browse'],
    ['POST', '/api/shell/open-folder'],
    ['GET', '/runtime/setup-state'],
    ['POST', '/api/runtime/setup-apply'],
  ] as const;

  for (const [method, pathname] of protectedRoutes) {
    assert.equal(
      classifyPlatformAuthRoute({ phase: 'post_setup', method, pathname }).access,
      'protected',
      `${method} ${pathname}`,
    );
  }
});

test('platform auth gate fails closed during repair except narrow public bootstrap routes', () => {
  assert.equal(
    classifyPlatformAuthRoute({
      phase: 'repair',
      method: 'POST',
      pathname: '/api/platform/setup/complete',
    }).access,
    'protected',
  );
  assert.equal(
    classifyPlatformAuthRoute({
      phase: 'repair',
      method: 'GET',
      pathname: '/api/auth/status',
    }).access,
    'public',
  );
});

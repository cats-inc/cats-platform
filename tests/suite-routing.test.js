import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../dist-server/core/model/index.js';
import {
  isSuiteNonProductPath,
  resolveSuiteSurfaceForPath,
  SUITE_SURFACE_ROUTES,
} from '../dist-server/app/renderer/routeMap.js';
import {
  buildWorkPlaceholderProjection,
} from '../dist-server/products/work/api/projection.js';
import {
  buildCodePlaceholderProjection,
} from '../dist-server/products/code/api/projection.js';

test('resolveSuiteSurfaceForPath routes work and code prefixes to their dedicated suite surfaces', () => {
  assert.equal(resolveSuiteSurfaceForPath('/'), 'chat');
  assert.equal(resolveSuiteSurfaceForPath('/chat'), 'chat');
  assert.equal(resolveSuiteSurfaceForPath('/chat/chats/abc'), 'chat');
  assert.equal(resolveSuiteSurfaceForPath('/chat/settings/general'), 'chat');
  assert.equal(resolveSuiteSurfaceForPath('/work'), 'work');
  assert.equal(resolveSuiteSurfaceForPath('/work/war-room'), 'work');
  assert.equal(resolveSuiteSurfaceForPath('/code'), 'code');
  assert.equal(resolveSuiteSurfaceForPath('/code/projects/demo'), 'code');

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(SUITE_SURFACE_ROUTES).map(([surface, route]) => [
        surface,
        { routePrefix: route.routePrefix, placeholder: route.placeholder, apiBase: route.apiBase },
      ]),
    ),
    {
      chat: { routePrefix: '/chat', placeholder: false, apiBase: null },
      work: { routePrefix: '/work', placeholder: true, apiBase: '/api/work' },
      code: { routePrefix: '/code', placeholder: true, apiBase: '/api/code' },
    },
  );
});

test('isSuiteNonProductPath excludes suite settings and legacy chat settings from product sync', () => {
  assert.equal(isSuiteNonProductPath('/setup'), true);
  assert.equal(isSuiteNonProductPath('/settings'), true);
  assert.equal(isSuiteNonProductPath('/settings/general'), true);
  assert.equal(isSuiteNonProductPath('/chat/settings'), true);
  assert.equal(isSuiteNonProductPath('/chat/settings/general'), true);
  assert.equal(isSuiteNonProductPath('/chat/new'), false);
  assert.equal(isSuiteNonProductPath('/work'), false);
});

test('Work and Code placeholder projections reserve product-specific extension points while staying core-backed', () => {
  const core = createDefaultCoreState();

  const work = buildWorkPlaceholderProjection(core);
  const code = buildCodePlaceholderProjection(core);

  assert.equal(work.summary.ownerActorId, core.ownerProfile.actorId);
  assert.equal(code.summary.ownerActorId, core.ownerProfile.actorId);
  assert.equal(work.summary.actorCount, core.actors.length);
  assert.equal(code.summary.conversationCount, core.conversations.length);
  assert.ok(work.extensionPoints.futureRoutes.includes('/api/work/teams'));
  assert.ok(work.extensionPoints.futureRoutes.includes('/api/work/war-room'));
  assert.ok(code.extensionPoints.futureRoutes.includes('/api/code/projects'));
  assert.ok(code.extensionPoints.futureRoutes.includes('/api/code/previews'));
});

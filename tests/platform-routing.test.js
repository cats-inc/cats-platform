import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../build/server/core/model/index.js';
import {
  isPlatformNonProductPath,
  resolvePreferredPlatformSurface,
  resolvePlatformShellSurface,
  resolvePlatformSurfaceForPath,
  PLATFORM_SURFACE_ROUTES,
} from '../build/server/app/renderer/routeMap.js';
import {
  listPlatformSurfaceDescriptors,
  platformSurfaceRoutePrefix,
  platformSurfaceSubtitle,
} from '../build/server/core/platformSurface.js';
import {
  buildWorkDashboardProjection,
} from '../build/server/products/work/api/projection.js';
import {
  buildCodeDashboardProjection,
} from '../build/server/products/code/api/projection.js';

test('resolvePlatformSurfaceForPath routes work and code prefixes to their dedicated platform surfaces', () => {
  assert.equal(resolvePlatformSurfaceForPath('/'), 'chat');
  assert.equal(resolvePlatformSurfaceForPath('/chat'), 'chat');
  assert.equal(resolvePlatformSurfaceForPath('/chat/chats/abc'), 'chat');
  assert.equal(resolvePlatformSurfaceForPath('/work'), 'work');
  assert.equal(resolvePlatformSurfaceForPath('/work/war-room'), 'work');
  assert.equal(resolvePlatformSurfaceForPath('/code'), 'code');
  assert.equal(resolvePlatformSurfaceForPath('/code/projects/demo'), 'code');

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(PLATFORM_SURFACE_ROUTES).map(([surface, route]) => [
        surface,
        { routePrefix: route.routePrefix, placeholder: route.placeholder, apiBase: route.apiBase },
      ]),
    ),
    {
      chat: { routePrefix: '/chat', placeholder: false, apiBase: null },
      work: { routePrefix: '/work', placeholder: false, apiBase: '/api/work' },
      code: { routePrefix: '/code', placeholder: false, apiBase: '/api/code' },
    },
  );
});

test('platform surface descriptors expose product switcher metadata and stable root routes', () => {
  assert.deepEqual(
    listPlatformSurfaceDescriptors().map((descriptor) => ({
      id: descriptor.id,
      routePrefix: descriptor.routePrefix,
      subtitle: descriptor.subtitle,
      maturity: descriptor.maturity,
    })),
    [
      {
        id: 'chat',
        routePrefix: '/chat',
        subtitle: 'Conversations with companions and personal agents',
        maturity: 'active',
      },
      {
        id: 'work',
        routePrefix: '/work',
        subtitle: 'Projects, approvals, and operator workflow',
        maturity: 'preview',
      },
      {
        id: 'code',
        routePrefix: '/code',
        subtitle: 'Repos, runs, and coding workspace',
        maturity: 'preview',
      },
    ],
  );
  assert.equal(platformSurfaceRoutePrefix('chat'), '/chat');
  assert.equal(platformSurfaceRoutePrefix('work'), '/work');
  assert.equal(platformSurfaceRoutePrefix('code'), '/code');
  assert.equal(
    platformSurfaceSubtitle('code'),
    'Repos, runs, and coding workspace',
  );
});

test('isPlatformNonProductPath excludes only canonical platform routes from product sync', () => {
  assert.equal(isPlatformNonProductPath('/setup'), true);
  assert.equal(isPlatformNonProductPath('/lobby'), true);
  assert.equal(isPlatformNonProductPath('/products'), true);
  assert.equal(isPlatformNonProductPath('/settings'), true);
  assert.equal(isPlatformNonProductPath('/settings/general'), true);
  assert.equal(isPlatformNonProductPath('/chat/settings'), false);
  assert.equal(isPlatformNonProductPath('/chat/settings/general'), false);
  assert.equal(isPlatformNonProductPath('/chat/new'), false);
  assert.equal(isPlatformNonProductPath('/work'), false);
});

test('resolvePlatformShellSurface keeps settings inside the last active product shell', () => {
  assert.equal(resolvePlatformShellSurface('/settings/general', 'work'), 'work');
  assert.equal(resolvePlatformShellSurface('/settings/runtime', 'code'), 'code');
  assert.equal(resolvePlatformShellSurface('/settings/chat', null), 'chat');
  assert.equal(resolvePlatformShellSurface('/work', 'chat'), 'work');
  assert.equal(resolvePlatformShellSurface('/code/build', 'work'), 'code');
});

test('resolvePreferredPlatformSurface prioritizes explicit settings route state before session and stored fallbacks', () => {
  assert.equal(resolvePreferredPlatformSurface('code', 'work', 'chat', 'chat'), 'code');
  assert.equal(resolvePreferredPlatformSurface(null, 'work', 'chat', 'chat'), 'work');
  assert.equal(resolvePreferredPlatformSurface(null, null, 'code', 'chat'), 'code');
  assert.equal(resolvePreferredPlatformSurface(null, null, null, 'work'), 'work');
  assert.equal(resolvePreferredPlatformSurface(null, null, null, null), 'chat');
});

test('Work and Code dashboard projections stay core-backed without inventing new schemas', () => {
  const core = createDefaultCoreState();

  const work = buildWorkDashboardProjection(core);
  const code = buildCodeDashboardProjection(core);

  assert.equal(work.summary.ownerActorId, core.ownerProfile.actorId);
  assert.equal(code.summary.ownerActorId, core.ownerProfile.actorId);
  assert.equal(work.summary.actorCount, core.actors.length);
  assert.equal(work.product.status, 'active');
  assert.equal(work.sections.projects.summary.totalAvailable, 0);
  assert.equal(work.sections.workItems.summary.totalAvailable, 0);
  assert.equal(work.sections.operatorInbox.summary.totalAvailable, 0);
  assert.equal(work.sections.controlPlane.summary.totalAvailable, 0);
  assert.equal(work.sections.recovery.summary.totalAvailable, 0);
  assert.equal(code.summary.conversationCount, core.conversations.length);
  assert.equal(code.product.status, 'active');
  assert.equal(code.sections.tasks.summary.totalAvailable, 0);
  assert.equal(code.sections.artifacts.summary.totalAvailable, 0);
  assert.ok(work.extensionPoints.futureRoutes.includes('/api/work/projects'));
  assert.ok(work.extensionPoints.futureRoutes.includes('/api/work/work-items'));
  assert.ok(work.extensionPoints.futureRoutes.includes('/api/work/war-room'));
  assert.ok(code.extensionPoints.futureRoutes.includes('/api/code/tasks'));
  assert.ok(code.extensionPoints.futureRoutes.includes('/api/code/artifacts'));
  assert.ok(code.extensionPoints.futureRoutes.includes('/api/code/previews'));
});

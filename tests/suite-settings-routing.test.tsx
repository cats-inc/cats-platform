import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidElement, type ReactNode } from 'react';
import { Navigate, Route } from 'react-router-dom';

import { SuiteSettingsRouteTree } from '../src/app/renderer/settings/SuiteSettingsRoutes.tsx';
import type { SuiteHostEnvelope } from '../src/shared/suite-contract.ts';

interface RouteDescriptor {
  path: string;
  element: ReactNode;
}

function collectRoutes(node: ReactNode, routes: RouteDescriptor[] = []): RouteDescriptor[] {
  if (Array.isArray(node)) {
    node.forEach((child) => collectRoutes(child, routes));
    return routes;
  }

  if (!isValidElement(node)) {
    return routes;
  }

  if (node.type === Route && typeof node.props.path === 'string') {
    routes.push({ path: node.props.path, element: node.props.element });
  }

  collectRoutes(node.props.children, routes);
  return routes;
}

function createEnvelope(): SuiteHostEnvelope {
  return {
    app: {
      name: 'cats',
      stage: 'phase-2-shell',
      runtimeBoundary: 'cats-runtime',
    },
    products: [
      {
        id: 'chat',
        surface: 'chat',
        routePrefix: '/chat',
        productName: 'Cats Chat',
        subtitle: 'Conversations with companions and personal agents',
        group: 'home',
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'active',
        setup: {
          selectable: true,
        },
      },
    ],
    runtime: {
      baseUrl: 'http://127.0.0.1:3110',
      reachable: true,
      status: 'ok',
      service: 'cats-runtime',
    },
    runtimeSetup: {
      source: 'runtime',
      bootstrapRequired: false,
      status: 'ready',
      stateStatus: 'ready',
      summary: 'Runtime ready',
      scannedAt: null,
      lastManualScanAt: null,
      appliedAt: null,
      providerCount: 1,
      availableCount: 1,
      providersReadyToApply: [],
      providersNeedingAttention: [],
      suggestedProviders: [],
      canRunManualScan: true,
      canApply: false,
      error: null,
    },
    metadata: {
      generatedAt: '2026-03-31T00:00:00.000Z',
      host: '127.0.0.1',
      port: 8181,
    },
    bootstrapAttemptId: null,
    setupCompleteAt: '2026-03-31T00:00:00.000Z',
    ownerDisplayName: 'Kenny',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    guideCat: null,
    lastProductSurface: 'chat',
  };
}

function assertNavigateRoute(routes: RouteDescriptor[], path: string, expectedTo: string): void {
  const route = routes.find((entry) => entry.path === path);
  assert.ok(route, `expected route "${path}"`);
  assert.ok(isValidElement(route.element));
  assert.equal(route.element.type, Navigate);
  assert.equal(route.element.props.to, expectedTo);
  assert.equal(route.element.props.replace, true);
}

function assertConcreteRoute(routes: RouteDescriptor[], path: string): void {
  const route = routes.find((entry) => entry.path === path);
  assert.ok(route, `expected route "${path}"`);
  assert.ok(isValidElement(route.element));
  assert.notEqual(route.element.type, Navigate);
}

test('SuiteSettingsRoutes owns canonical suite settings and preserves legacy cats redirect', () => {
  const routes = collectRoutes(
    SuiteSettingsRouteTree({
      envelope: createEnvelope(),
      onEnvelopeUpdate: () => {},
      feedback: '',
      busy: '',
      onFeedback: () => {},
      onResetSetup: () => {},
    }),
  );

  assertNavigateRoute(routes, 'cats', '/chat/settings/cats');
  assertNavigateRoute(routes, '*', '/settings/general');
  assertConcreteRoute(routes, 'general');
  assertConcreteRoute(routes, 'runtime');
  assertConcreteRoute(routes, 'data');
});

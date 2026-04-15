import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidElement, type ReactNode } from 'react';
import { Navigate, Route } from 'react-router-dom';

import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import { PlatformSettingsRoutes } from '../src/app/renderer/settings/PlatformSettingsRoutes.tsx';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';

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

function createPayload(): AppShellPayload {
  return {
    setupCompleteAt: '2026-03-31T00:00:00.000Z',
    ownerDisplayName: 'Kenny',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    guideCat: null,
    lastProductSurface: 'chat',
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
        settings: [
          {
            id: 'chat',
            label: 'Chat',
            path: '/settings/chat',
          },
        ],
      },
      {
        id: 'work',
        surface: 'work',
        routePrefix: '/work',
        productName: 'Cats Work',
        subtitle: 'Projects, approvals, and operator workflow',
        group: 'office',
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'preview',
        setup: {
          selectable: true,
        },
        settings: [
          {
            id: 'work',
            label: 'Work',
            path: '/settings/work',
          },
        ],
      },
      {
        id: 'code',
        surface: 'code',
        routePrefix: '/code',
        productName: 'Cats Code',
        subtitle: 'Repos, runs, and coding workspace',
        group: 'office',
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'preview',
        setup: {
          selectable: true,
        },
        settings: [
          {
            id: 'code',
            label: 'Code',
            path: '/settings/code',
          },
        ],
      },
    ],
    desktop: {
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
    },
    lobby: {
      animationMode: 'reduced',
      cats: [],
    },
    chat: {
      showVerboseMessages: false,
    },
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
  } as unknown as AppShellPayload;
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

test('PlatformSettingsRoutes owns canonical platform settings routes', () => {
  const previousBridge = (globalThis as typeof globalThis & {
    catsDesktopHost?: object;
  }).catsDesktopHost;
  (globalThis as typeof globalThis & {
    catsDesktopHost?: object;
  }).catsDesktopHost = {};

  const routes = collectRoutes(
    PlatformSettingsRoutes({
      payload: createPayload(),
      onPayloadUpdate: () => {},
      feedback: '',
      busy: clearBusyState(),
      onFeedback: () => {},
      onBusy: () => {},
      onResetSetup: () => {},
    }),
  );

  try {
    assertConcreteRoute(routes, 'general');
    assertConcreteRoute(routes, 'cats');
    assertConcreteRoute(routes, 'chat');
    assertConcreteRoute(routes, 'work');
    assertConcreteRoute(routes, 'code');
    assertConcreteRoute(routes, 'desktop');
    assertNavigateRoute(routes, 'desktop-startup', '/settings/desktop');
    assertConcreteRoute(routes, 'runtime');
    assertConcreteRoute(routes, 'data');
    assertNavigateRoute(routes, '*', '/settings/general');
  } finally {
    if (previousBridge === undefined) {
      delete (globalThis as typeof globalThis & { catsDesktopHost?: object }).catsDesktopHost;
    } else {
      (globalThis as typeof globalThis & { catsDesktopHost?: object }).catsDesktopHost = previousBridge;
    }
  }
});

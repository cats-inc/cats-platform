import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidElement, type ReactNode } from 'react';
import { Navigate, Route } from 'react-router-dom';

import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import { AppRoutes, type AppRoutesProps } from '../src/products/chat/renderer/AppRoutes.tsx';

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

function createProps(): AppRoutesProps {
  const payload = {
    setupCompleteAt: '2026-03-25T00:00:00.000Z',
    chat: {
      channels: [],
      selectedChannelId: null,
    },
  } as unknown as AppShellPayload;

  return {
    payload,
    selectedChannel: null,
    directLaneChannel: null,
    showDirectLaneBoot: false,
    feedback: '',
    busy: '',
    chatSurfaceProps: {} as AppRoutesProps['chatSurfaceProps'],
    draftSurfaceProps: {} as AppRoutesProps['draftSurfaceProps'],
    onToggleAddCat: () => {},
    onPayloadUpdate: () => {},
    onFeedback: () => {},
    onBusy: () => {},
    onResetSetup: () => {},
    addCatOpen: false,
    addCatPanelProps: {} as AppRoutesProps['addCatPanelProps'],
    folderBrowserProps: { folderBrowserOpen: false } as AppRoutesProps['folderBrowserProps'],
    onOpenDraftAddCat: () => {},
    onChangeDraftLeadCat: () => {},
  };
}

function assertNavigateRoute(
  routes: RouteDescriptor[],
  path: string,
  expectedTo: string,
): void {
  const route = routes.find((entry) => entry.path === path);
  assert.ok(route, `expected route "${path}"`);
  assert.ok(isValidElement(route.element), `expected "${path}" to have a React element`);
  assert.equal(route.element.type, Navigate, `expected "${path}" to be a Navigate route`);
  assert.equal(route.element.props.to, expectedTo);
  assert.equal(route.element.props.replace, true);
}

test('AppRoutes keeps legacy /chat/settings deep links as redirects to suite settings', () => {
  const routes = collectRoutes(AppRoutes(createProps()));

  assertNavigateRoute(routes, 'settings', '/settings/general');
  assertNavigateRoute(routes, 'settings/general', '/settings/general');
  assertNavigateRoute(routes, 'settings/cats', '/settings/cats');
  assertNavigateRoute(routes, 'settings/data', '/settings/data');
  assertNavigateRoute(routes, 'settings/*', '/settings/general');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidElement, type ReactNode } from 'react';
import { Navigate, Route } from 'react-router-dom';

import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import { AppRoutes, type AppRoutesProps } from '../src/products/chat/renderer/AppRoutes.tsx';
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
    busy: clearBusyState(),
    chatSurfaceProps: {} as AppRoutesProps['chatSurfaceProps'],
    draftSurfaceProps: {} as AppRoutesProps['draftSurfaceProps'],
    addCatOpen: false,
    onToggleAddCat: () => {},
    addCatPanelProps: {} as AppRoutesProps['addCatPanelProps'],
    folderBrowserProps: {} as AppRoutesProps['folderBrowserProps'],
    onOpenDraftAddCat: () => {},
    onChangeDraftDefaultRecipient: () => {},
    companionMode: false,
    companionCat: null,
    onToggleCompanionMode: () => {},
    onCompanionWake: () => {},
    onCompanionSleep: () => {},
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

function assertConcreteRoute(routes: RouteDescriptor[], path: string): void {
  const route = routes.find((entry) => entry.path === path);
  assert.ok(route, `expected route "${path}"`);
  assert.ok(isValidElement(route.element), `expected "${path}" to have a React element`);
  assert.notEqual(route.element.type, Navigate, `expected "${path}" to be a concrete route`);
}

test('AppRoutes no longer owns the settings namespace', () => {
  const routes = collectRoutes(AppRoutes(createProps()));

  assert.ok(!routes.some((route) => route.path.startsWith('settings')));
  assertConcreteRoute(routes, 'chats/:channelId');
  assertConcreteRoute(routes, 'new');
  assertNavigateRoute(routes, '*', '/chat/new');
});

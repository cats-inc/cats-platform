import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidElement, type ReactNode } from 'react';
import { Route } from 'react-router-dom';

import type { AppShellPayload } from '../src/products/work/api/contracts.ts';
import { AppRoutes, type AppRoutesProps } from '../src/products/work/renderer/AppRoutes.tsx';

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
    addCatOpen: false,
    chatSurfaceProps: {} as AppRoutesProps['chatSurfaceProps'],
    draftSurfaceProps: {} as AppRoutesProps['draftSurfaceProps'],
    addCatPanelProps: {} as AppRoutesProps['addCatPanelProps'],
    folderBrowserProps: {} as AppRoutesProps['folderBrowserProps'],
    onToggleAddCat: () => {},
    onOpenDraftAddCat: () => {},
    onChangeDraftDefaultRecipient: () => {},
  };
}

test('Work AppRoutes keeps intake and plan review surfaces reachable', () => {
  const routes = collectRoutes(AppRoutes(createProps()));

  const intakeRoute = routes.find((entry) => entry.path === 'intake');
  assert.ok(intakeRoute, 'expected /work/intake route');
  assert.ok(isValidElement(intakeRoute?.element));

  const planRoute = routes.find((entry) => entry.path === 'intake/:projectId');
  assert.ok(planRoute, 'expected /work/intake/:projectId route');
  assert.ok(isValidElement(planRoute?.element));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidElement, type ReactNode } from 'react';
import { Route } from 'react-router-dom';

import type { AppShellPayload } from '../src/products/code/api/contracts.ts';
import { AppRoutes, type AppRoutesProps } from '../src/products/code/renderer/AppRoutes.tsx';
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
    onPayloadUpdate: () => {},
    onFeedback: () => {},
    onBusy: () => {},
    onResetSetup: () => {},
    addCatOpen: false,
    onToggleAddCat: () => {},
    addCatPanelProps: {} as AppRoutesProps['addCatPanelProps'],
    folderBrowserProps: {} as AppRoutesProps['folderBrowserProps'],
    onOpenDraftAddCat: () => {},
    onChangeDraftDefaultRecipient: () => {},
  };
}

test('Code AppRoutes keeps relay, builder, and artifact detail surfaces reachable', () => {
  const routes = collectRoutes(AppRoutes(createProps()));

  const relayRoute = routes.find((entry) => entry.path === 'relay');
  assert.ok(relayRoute, 'expected /code/relay route');
  assert.ok(isValidElement(relayRoute?.element));

  const buildRoute = routes.find((entry) => entry.path === 'build');
  assert.ok(buildRoute, 'expected /code/build route');
  assert.ok(isValidElement(buildRoute?.element));

  const artifactRoute = routes.find((entry) => entry.path === 'artifacts/:artifactId');
  assert.ok(artifactRoute, 'expected /code/artifacts/:artifactId route');
  assert.ok(isValidElement(artifactRoute?.element));
});

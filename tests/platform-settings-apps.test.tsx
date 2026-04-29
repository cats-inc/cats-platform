import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { PlatformSettingsApps } from '../src/app/renderer/settings/PlatformSettingsApps.tsx';
import type { PlatformInstalledAppDescriptor } from '../src/shared/catsAppManifest.ts';

function createInstalledApp(
  overrides: Partial<PlatformInstalledAppDescriptor> = {},
): PlatformInstalledAppDescriptor {
  return {
    id: 'user.focus',
    displayName: 'Focus Timer',
    publisher: 'Local User',
    version: '0.1.0',
    category: 'user-app',
    trustTier: 'local-user',
    permissions: ['ui.route', 'ui.lobby'],
    connectors: [],
    tools: [],
    installState: 'enabled',
    enabled: true,
    lobbyEntries: [],
    ...overrides,
  };
}

test('PlatformSettingsApps renders an empty installed app state', () => {
  const markup = renderToStaticMarkup(<PlatformSettingsApps installedApps={[]} />);

  assert.match(markup, />Installed packages</u);
  assert.match(markup, />0</u);
  assert.match(markup, />No installed apps are registered yet\.</u);
  assert.match(markup, />Local install</u);
  assert.match(markup, />Review</u);
  assert.match(markup, />Needs review</u);
});

test('PlatformSettingsApps renders installed app and connector package status', () => {
  const markup = renderToStaticMarkup(
    <PlatformSettingsApps
      installedApps={[
        createInstalledApp({
          lobbyEntries: [
            {
              id: 'timer',
              title: 'Focus Timer',
              routePath: '/apps/user.focus',
            },
          ],
        }),
        createInstalledApp({
          id: 'connector.calendar',
          displayName: 'Calendar Connector',
          category: 'capability-connector',
          connectors: [
            {
              id: 'calendar',
              service: 'calendar',
              auth: { kind: 'oauth' },
              capabilities: ['calendar.read', 'calendar.write'],
            },
          ],
          tools: [
            {
              name: 'connector.calendar.search',
              title: 'Search calendar',
              description: 'Search calendar events.',
              inputSchema: {},
              runtimeBridge: 'cats-runtime',
            },
          ],
          installState: 'disabled',
          enabled: false,
        }),
      ]}
    />,
  );

  assert.match(markup, />Focus Timer</u);
  assert.match(markup, />Enabled</u);
  assert.match(markup, /href="\/apps\/user\.focus"[^>]*>Open</u);
  assert.match(markup, />Disable</u);
  assert.match(markup, />Uninstall</u);
  assert.match(markup, />Calendar Connector</u);
  assert.match(markup, />Connector</u);
  assert.match(markup, />Local user</u);
  assert.match(markup, />2 permissions</u);
  assert.match(markup, />calendar: 2 capabilities</u);
  assert.match(markup, />Auth: oauth</u);
  assert.match(markup, />1 tool</u);
  assert.match(markup, />Disabled</u);
  assert.match(markup, />Enable</u);
  assert.match(markup, />1 connector package</u);
});

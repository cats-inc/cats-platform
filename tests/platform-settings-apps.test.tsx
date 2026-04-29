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
});

test('PlatformSettingsApps renders installed app and connector package status', () => {
  const markup = renderToStaticMarkup(
    <PlatformSettingsApps
      installedApps={[
        createInstalledApp(),
        createInstalledApp({
          id: 'connector.calendar',
          displayName: 'Calendar Connector',
          category: 'capability-connector',
          installState: 'disabled',
          enabled: false,
        }),
      ]}
    />,
  );

  assert.match(markup, />Focus Timer</u);
  assert.match(markup, />Enabled</u);
  assert.match(markup, />Calendar Connector</u);
  assert.match(markup, />Connector</u);
  assert.match(markup, />Disabled</u);
  assert.match(markup, />1 connector package</u);
});

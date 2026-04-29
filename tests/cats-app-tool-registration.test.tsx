import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCatsAppToolRegistrations,
  registerCatsAppTools,
} from '../src/platform/apps/toolRegistration.ts';
import { createSupervisedToolRegistry } from '../src/platform/supervision/index.ts';
import type {
  CatsAgentToolContribution,
  CatsAppManifestV1,
  CatsInstalledAppRecord,
  CatsAppPermission,
  CatsAppCategory,
} from '../src/shared/catsAppManifest.ts';

function tool(
  name = 'connector.calendar.search',
  overrides: Partial<CatsAgentToolContribution> = {},
): CatsAgentToolContribution {
  return {
    name,
    title: 'Search calendar',
    description: 'Search calendar events.',
    inputSchema: {},
    outputSchema: {},
    runtimeBridge: 'cats-runtime',
    ...overrides,
  };
}

function manifest(
  id: string,
  tools: CatsAgentToolContribution[],
  permissions: CatsAppPermission[] = ['agent.tools.register'],
  category: CatsAppCategory = 'capability-connector',
): CatsAppManifestV1 {
  return {
    schemaVersion: 1,
    id,
    displayName: 'Calendar Connector',
    version: '0.1.0',
    category,
    trustTier: 'local-user',
    publisher: {
      name: 'Local User',
    },
    compatibility: {
      catsPlatform: '^0.1.0',
      appSdk: '1.x',
    },
    contributions: {
      connectors: [
        {
          id: 'calendar',
          service: 'calendar',
          capabilities: ['calendar.read'],
        },
      ],
      tools,
    },
    permissions,
  };
}

function record(
  id: string,
  tools: CatsAgentToolContribution[],
  options: {
    enabled?: boolean;
    permissions?: CatsAppPermission[];
    category?: CatsAppCategory;
  } = {},
): CatsInstalledAppRecord {
  return {
    id,
    manifest: manifest(id, tools, options.permissions, options.category),
    packagePath: `/tmp/${id}`,
    installState: options.enabled === false ? 'disabled' : 'enabled',
    enabled: options.enabled !== false,
    installedAt: '2026-04-30T00:00:00.000Z',
    updatedAt: '2026-04-30T00:00:00.000Z',
  };
}

test('createCatsAppToolRegistrations projects enabled app tools into supervised manifests', () => {
  const registrations = createCatsAppToolRegistrations([
    record('connector.calendar', [tool()]),
    record('connector.disabled', [tool('connector.disabled.search')], { enabled: false }),
    record('connector.no-permission', [tool('connector.no_permission.search')], {
      permissions: [],
    }),
  ]);

  assert.equal(registrations.length, 1);
  const registration = registrations[0]!;

  assert.equal(registration.appId, 'connector.calendar');
  assert.equal(registration.runtimeBridge, 'cats-runtime');
  assert.equal(registration.manifest.name, 'connector.calendar.search');
  assert.equal(registration.manifest.sideEffect, 'none');
  assert.equal(registration.manifest.approval, 'never');
  assert.equal(
    registration.manifest.inputSchema.uri,
    'cats-app://connector.calendar/tools/connector.calendar.search/input-schema',
  );
});

test('registerCatsAppTools registers declared app tools with the platform registry', () => {
  const registry = createSupervisedToolRegistry();
  const registrations = registerCatsAppTools(registry, [
    record('connector.calendar', [
      tool('connector.calendar.search'),
      tool('connector.calendar.create_event', {
        requiresApproval: true,
      }),
    ]),
  ]);

  assert.deepEqual(
    registry.list().map((registered) => [
      registered.name,
      registered.sideEffect,
      registered.approval,
    ]),
    [
      ['connector.calendar.create_event', 'external_visible', 'always'],
      ['connector.calendar.search', 'none', 'never'],
    ],
  );
  assert.deepEqual(
    registrations.map((registration) => registration.manifest.name),
    ['connector.calendar.create_event', 'connector.calendar.search'],
  );
});

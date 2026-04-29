import assert from 'node:assert/strict';
import test from 'node:test';

import type { CatsAppManifestV1 } from '../src/shared/catsAppManifest.ts';
import { parseCatsAppManifestV1 } from '../src/shared/catsAppValidation.ts';

function createPomodoroManifest(
  overrides: Partial<CatsAppManifestV1> = {},
): CatsAppManifestV1 {
  const base: CatsAppManifestV1 = {
    schemaVersion: 1,
    id: 'user.pomodoro',
    displayName: 'Pomodoro',
    version: '0.1.0',
    description: 'Focus timer with break reminders.',
    category: 'user-app',
    trustTier: 'local-user',
    publisher: {
      name: 'Local User',
    },
    compatibility: {
      catsPlatform: '^0.1.0',
      appSdk: '1.x',
    },
    entrypoints: {
      renderer: './dist/renderer/index.js',
    },
    contributions: {
      lobbyApps: [
        {
          id: 'main',
          title: 'Pomodoro',
          subtitle: 'Focus timer with break reminders',
          routePath: '/apps/user.pomodoro',
          icon: 'timer',
        },
      ],
      settings: [
        {
          id: 'preferences',
          label: 'Pomodoro',
          path: '/settings/apps/user.pomodoro',
        },
      ],
    },
    permissions: [
      'ui.route',
      'ui.lobby',
      'settings.app',
      'storage.appData',
    ],
  };

  return {
    ...base,
    ...overrides,
    publisher: {
      ...base.publisher,
      ...overrides.publisher,
    },
    compatibility: {
      ...base.compatibility,
      ...overrides.compatibility,
    },
    entrypoints: overrides.entrypoints ?? base.entrypoints,
    contributions: {
      ...base.contributions,
      ...overrides.contributions,
    },
    permissions: overrides.permissions ?? base.permissions,
  };
}

function issueCodes(input: unknown): string[] {
  const result = parseCatsAppManifestV1(input);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

test('parseCatsAppManifestV1 accepts a local user app with a Lobby contribution', () => {
  const manifest = createPomodoroManifest();
  const result = parseCatsAppManifestV1(manifest);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.manifest.id, 'user.pomodoro');
    assert.equal(result.manifest.contributions.lobbyApps?.[0]?.routePath, '/apps/user.pomodoro');
  }
});

test('parseCatsAppManifestV1 rejects duplicate app ids', () => {
  const result = parseCatsAppManifestV1(createPomodoroManifest(), {
    existingAppIds: ['user.pomodoro'],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(
      result.issues.map((issue) => issue.code),
      ['duplicate_cats_app_id'],
    );
  }
});

test('parseCatsAppManifestV1 rejects Lobby routes outside the app namespace', () => {
  const manifest = createPomodoroManifest({
    contributions: {
      lobbyApps: [
        {
          id: 'main',
          title: 'Pomodoro',
          routePath: '/apps/other',
        },
      ],
    },
  });
  const result = parseCatsAppManifestV1(manifest);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(
      result.issues.map((issue) => issue.code),
      ['invalid_cats_app_lobby_route'],
    );
  }
});

test('parseCatsAppManifestV1 requires Lobby permissions for Lobby app entries', () => {
  assert.deepEqual(
    issueCodes(createPomodoroManifest({ permissions: ['ui.route', 'settings.app'] })),
    ['missing_cats_app_permission'],
  );
});

test('parseCatsAppManifestV1 keeps local-user settings under the app settings namespace', () => {
  const result = parseCatsAppManifestV1(createPomodoroManifest({
    contributions: {
      lobbyApps: [],
      settings: [
        {
          id: 'preferences',
          label: 'Pomodoro',
          path: '/settings/runtime',
        },
      ],
    },
    permissions: ['settings.app'],
  }), {
    reservedSettingsPaths: ['/settings/runtime'],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(
      result.issues.map((issue) => issue.code),
      ['cats_app_settings_path_collision', 'invalid_cats_app_settings_path'],
    );
  }
});

test('parseCatsAppManifestV1 rejects non-system product contributions', () => {
  assert.deepEqual(
    issueCodes(createPomodoroManifest({
      contributions: {
        lobbyApps: [],
        settings: [],
        products: [
          {
            productId: 'learn',
            productName: 'Cats Learn',
            subtitle: 'Courses, flashcards, and study companions',
            routePrefix: '/learn',
            group: 'home',
            installPolicy: 'optional',
            maturity: 'preview',
          },
        ],
      },
      permissions: [],
    })),
    ['forbidden_cats_app_product_contribution'],
  );
});

test('parseCatsAppManifestV1 accepts connector packages without Lobby routes', () => {
  const result = parseCatsAppManifestV1(createPomodoroManifest({
    id: 'connector.github',
    displayName: 'GitHub Connector',
    category: 'capability-connector',
    contributions: {
      lobbyApps: [],
      settings: [],
      connectors: [
        {
          id: 'github',
          service: 'github',
          auth: {
            kind: 'oauth',
          },
          capabilities: ['issues', 'pull-requests'],
        },
      ],
    },
    permissions: ['connector.auth'],
  }));

  assert.equal(result.ok, true);
});

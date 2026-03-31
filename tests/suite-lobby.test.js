import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSuiteLobbySections } from '../dist-server/app/renderer/lobbyModel.js';

test('buildSuiteLobbySections groups suite products into Home and Office', () => {
  const sections = buildSuiteLobbySections({ lastUsedSurface: 'work' });

  assert.deepEqual(
    sections.map((section) => ({
      id: section.id,
      entries: section.entries.map((entry) => ({
        surface: entry.surface,
        preview: entry.preview,
        lastUsed: entry.lastUsed,
      })),
    })),
    [
      {
        id: 'home',
        entries: [
          {
            surface: 'chat',
            preview: false,
            lastUsed: false,
          },
        ],
      },
      {
        id: 'office',
        entries: [
          {
            surface: 'work',
            preview: true,
            lastUsed: true,
          },
          {
            surface: 'code',
            preview: true,
            lastUsed: false,
          },
        ],
      },
    ],
  );
});

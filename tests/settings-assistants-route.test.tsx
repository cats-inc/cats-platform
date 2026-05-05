import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSettingsSectionConfig } from '../src/app/renderer/settings/PlatformSettingsRoutes.tsx';

function translate(key: string): string {
  // The pure helper only needs identifiers; return the key so we can assert on it.
  return key;
}

test('resolveSettingsSectionConfig returns the assistants section for /settings/assistants (PLAN-091 phase 3 lift)', () => {
  const config = resolveSettingsSectionConfig('/settings/assistants', translate);
  assert.equal(config.section, 'assistants');
  assert.equal(config.title, 'settingsRouteTitleAssistants');
});

test('resolveSettingsSectionConfig keeps cats:my-cats for /settings/cats and /settings/cats/my-cats', () => {
  const cats = resolveSettingsSectionConfig('/settings/cats', translate);
  assert.equal(cats.section, 'cats:my-cats');

  const myCats = resolveSettingsSectionConfig('/settings/cats/my-cats', translate);
  assert.equal(myCats.section, 'cats:my-cats');
});

test('resolveSettingsSectionConfig no longer routes /settings/cats/assistants to the assistants section (clean-cut, no alias)', () => {
  const config = resolveSettingsSectionConfig('/settings/cats/assistants', translate);
  // Per PLAN-091 §Phase 3, the old path is gone. With no `/settings/cats/assistants`
  // matcher, the resolver falls through to the `/settings/cats` branch and returns
  // the cats:my-cats section. The /settings/assistants route is the only registered
  // home for assistants now.
  assert.equal(config.section, 'cats:my-cats');
  assert.notEqual(config.section, 'assistants');
});

test('resolveSettingsSectionConfig falls back to general for unknown settings paths', () => {
  const config = resolveSettingsSectionConfig('/settings/unknown', translate);
  assert.equal(config.section, 'general');
});

test('resolveSettingsSectionConfig only matches settings sections on path segment boundaries', () => {
  const cases = [
    '/settings/assistants-old',
    '/settings/catstack',
    '/settings/chatty',
    '/settings/workflow',
    '/settings/codecs',
    '/settings/apps2',
    '/settings/desktop-startup',
    '/settings/runtime2',
    '/settings/database',
  ];

  for (const pathname of cases) {
    const config = resolveSettingsSectionConfig(pathname, translate);
    assert.equal(config.section, 'general', pathname);
  }
});

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

test('resolveSettingsSectionConfig treats /settings root as General', () => {
  const root = resolveSettingsSectionConfig('/settings', translate);
  assert.equal(root.section, 'general');
  assert.equal(root.title, 'settingsRouteTitleGeneral');

  const trailingSlash = resolveSettingsSectionConfig('/settings/', translate);
  assert.equal(trailingSlash.section, 'general');
  assert.equal(trailingSlash.title, 'settingsRouteTitleGeneral');

  const general = resolveSettingsSectionConfig('/settings/general', translate);
  assert.equal(general.section, 'general');
  assert.equal(general.title, 'settingsRouteTitleGeneral');
});

test('resolveSettingsSectionConfig keeps cats active only for canonical cats settings routes', () => {
  const cats = resolveSettingsSectionConfig('/settings/cats', translate);
  assert.equal(cats.section, 'cats');

  const newCat = resolveSettingsSectionConfig('/settings/cats/new', translate);
  assert.equal(newCat.section, 'cats');

  const myCats = resolveSettingsSectionConfig('/settings/cats/my-cats', translate);
  assert.equal(myCats.section, 'not-found');
});

test('resolveSettingsSectionConfig no longer routes /settings/cats/assistants to the assistants section (clean-cut, no alias)', () => {
  const config = resolveSettingsSectionConfig('/settings/cats/assistants', translate);
  // The /settings/assistants route is the only registered home for assistants now.
  assert.equal(config.section, 'not-found');
  assert.notEqual(config.section, 'assistants');
});

test('resolveSettingsSectionConfig treats unknown settings paths as not found', () => {
  const config = resolveSettingsSectionConfig('/settings/unknown', translate);
  assert.equal(config.section, 'not-found');
  assert.equal(config.title, 'settingsRouteTitleNotFound');
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
    assert.equal(config.section, 'not-found', pathname);
  }
});

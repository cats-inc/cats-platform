import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSettingsAppsMutationError,
  localizeSettingsAppsValidationIssue,
} from '../src/app/renderer/settings/settingsAppsErrorLabels.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('settings apps localizes common validation issues', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    localizeSettingsAppsValidationIssue({
      code: 'invalid_cats_app_package_request',
      message: 'packagePath is required.',
      path: 'packagePath',
    }, t),
    '請填寫套件路徑。',
  );
  assert.equal(
    localizeSettingsAppsValidationIssue({
      code: 'invalid_cats_app_package_request',
      message: 'Package path does not exist: C:\\missing.',
      path: 'packagePath',
    }, t),
    '找不到套件路徑：C:\\missing。',
  );
  assert.equal(
    localizeSettingsAppsValidationIssue({
      code: 'invalid_cats_app_manifest_json',
      message: 'Invalid cats.app.json JSON.',
      path: 'manifest',
    }, t),
    'cats.app.json 不是有效的 JSON。',
  );
  assert.equal(
    localizeSettingsAppsValidationIssue({
      code: 'reserved_cats_app_id',
      message: 'Cats app id "install" is reserved by the app management API.',
      path: 'id',
      details: { appId: 'install' },
    }, t),
    'Cats app id「install」已被保留。',
  );
  assert.equal(
    localizeSettingsAppsValidationIssue({
      code: 'invalid_cats_app_manifest_string',
      message: 'displayName must be a non-empty string.',
      path: 'displayName',
    }, t),
    '套件驗證失敗（displayName）：invalid_cats_app_manifest_string。',
  );
});

test('settings apps formatter localizes known app mutation failures', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    formatSettingsAppsMutationError(
      new Error('Cats app "demo-app" is not installed.'),
      '操作失敗。',
      t,
    ),
    'Cats app「demo-app」尚未安裝。',
  );
  assert.equal(
    formatSettingsAppsMutationError(
      new Error('Cats app "demo-app" is not enabled.'),
      '操作失敗。',
      t,
    ),
    'Cats app「demo-app」尚未啟用。',
  );
  assert.equal(
    formatSettingsAppsMutationError(new Error('runtime unavailable'), '操作失敗。', t),
    'runtime unavailable',
  );
  assert.equal(formatSettingsAppsMutationError('not an error', '操作失敗。', t), '操作失敗。');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('browser-facing runtime setup links stay on platform-owned ingress paths', async () => {
  const [settingsSource, setupSource, wizardSource] = await Promise.all([
    readFile(
      new URL('../src/app/renderer/settings/PlatformSettingsRuntime.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/app/renderer/setup/plugins.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/app/renderer/setup/PlatformSetupWizard.tsx', import.meta.url),
      'utf8',
    ),
  ]);

  assert.match(settingsSource, /PLATFORM_RUNTIME_SETUP_PATH/u);
  assert.doesNotMatch(settingsSource, /payload\.runtime\.baseUrl\.replace/u);

  assert.match(setupSource, /PLATFORM_RUNTIME_SETUP_PATH/u);
  assert.doesNotMatch(setupSource, /runtimeBaseUrl\.replace/u);

  assert.doesNotMatch(wizardSource, /runtimeBaseUrl=\{envelope\.runtime\.baseUrl\}/u);
});

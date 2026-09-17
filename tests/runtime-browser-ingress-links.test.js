import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('browser-facing runtime setup links stay on platform-owned ingress paths', async () => {
  const [settingsSource, setupSource, pickerSource, brainSource, wizardSource] = await Promise.all([
    readFile(
      new URL('../src/app/renderer/settings/PlatformSettingsRuntime.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/app/renderer/setup/plugins.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/design/components/ProviderModelFields.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/design/components/ProviderModelBrainCard.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/app/renderer/setup/PlatformSetupWizard.tsx', import.meta.url),
      'utf8',
    ),
  ]);

  assert.match(settingsSource, /PLATFORM_RUNTIME_SETUP_PATH/u);
  assert.match(settingsSource, /AuthenticatedBrowserLink/u);
  assert.doesNotMatch(settingsSource, /payload\.runtime\.baseUrl\.replace/u);

  assert.doesNotMatch(setupSource, /runtimeBaseUrl\.replace/u);
  for (const source of [setupSource, pickerSource, brainSource]) {
    assert.doesNotMatch(source, /AuthenticatedBrowserLink|OpenRuntimeSetup|sharedCommonRetry|forceReloadProviderRegistry/u);
  }

  assert.doesNotMatch(wizardSource, /runtimeBaseUrl=\{envelope\.runtime\.baseUrl\}/u);
});

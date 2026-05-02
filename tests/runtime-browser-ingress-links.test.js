import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('settings runtime setup link opens the runtime origin while setup recovery uses ingress', async () => {
  const [
    settingsSource,
    assistantsSource,
    catsSource,
    providerFieldsSource,
    setupSource,
    wizardSource,
  ] = await Promise.all([
    readFile(
      new URL('../src/app/renderer/settings/PlatformSettingsRuntime.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/app/renderer/settings/SettingsAssistants.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL(
        '../src/products/shared/renderer/components/settings-cats/SettingsCats.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL('../src/design/components/ProviderModelFields.tsx', import.meta.url),
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

  assert.match(settingsSource, /payload\.runtime\.baseUrl\.replace/u);
  assert.doesNotMatch(settingsSource, /href=\{PLATFORM_RUNTIME_SETUP_PATH\}/u);

  assert.match(assistantsSource, /payload\.runtime\.baseUrl\.replace/u);
  assert.match(assistantsSource, /providerRegistrySetupHrefOverride=\{runtimeSetupHref\}/u);

  assert.match(catsSource, /payload\.runtime\.baseUrl\.replace/u);
  assert.match(catsSource, /providerRegistrySetupHrefOverride=\{runtimeSetupHref\}/u);

  assert.match(providerFieldsSource, /effectiveProviderRegistrySetupHref/u);

  assert.match(setupSource, /PLATFORM_RUNTIME_SETUP_PATH/u);
  assert.doesNotMatch(setupSource, /runtimeBaseUrl\.replace/u);

  assert.doesNotMatch(wizardSource, /runtimeBaseUrl=\{envelope\.runtime\.baseUrl\}/u);
});

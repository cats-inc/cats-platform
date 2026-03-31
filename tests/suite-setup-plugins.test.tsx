import assert from 'node:assert/strict';
import test from 'node:test';

import { getSuiteSetupPlugins } from '../src/app/renderer/setup/plugins.tsx';
import { listSuiteProductDescriptors } from '../src/shared/suiteProducts.ts';

test('getSuiteSetupPlugins derives setup metadata from shared suite product descriptors', () => {
  const plugins = getSuiteSetupPlugins(listSuiteProductDescriptors());

  assert.deepEqual(
    plugins.map((plugin) => ({
      surface: plugin.surface,
      enabled: plugin.enabled,
      installPolicy: plugin.installPolicy,
      installState: plugin.installState,
      maturity: plugin.maturity,
      hasConditionalStep: plugin.hasConditionalStep,
      disabledReason: plugin.disabledReason ?? null,
    })),
    [
      {
        surface: 'chat',
        enabled: true,
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'active',
        hasConditionalStep: true,
        disabledReason: null,
      },
      {
        surface: 'work',
        enabled: false,
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'preview',
        hasConditionalStep: false,
        disabledReason: 'Coming soon',
      },
      {
        surface: 'code',
        enabled: false,
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'preview',
        hasConditionalStep: false,
        disabledReason: 'Coming soon',
      },
    ],
  );
});

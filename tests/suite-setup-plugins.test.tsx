import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeGuideCatSetupChoice,
  getSuiteSetupPlugins,
  resolveInitialSetupProduct,
  validateGuideCatSetupStep,
} from '../src/app/renderer/setup/plugins.tsx';
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
      disabledReason: plugin.disabledReason ?? null,
    })),
    [
      {
        surface: 'chat',
        enabled: true,
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'active',
        disabledReason: null,
      },
      {
        surface: 'work',
        enabled: false,
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'preview',
        disabledReason: 'Coming soon',
      },
      {
        surface: 'code',
        enabled: false,
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'preview',
        disabledReason: 'Coming soon',
      },
    ],
  );
});

test('validateGuideCatSetupStep requires a selected model', () => {
  assert.equal(validateGuideCatSetupStep({ model: '' }), false);
  assert.equal(validateGuideCatSetupStep({ model: 'gpt-5.4' }), true);
});

test('resolveInitialSetupProduct prefers the first enabled setup surface', () => {
  assert.equal(
    resolveInitialSetupProduct([
      {
        surface: 'work',
        label: 'Cats Work',
        description: 'Work',
        enabled: false,
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'preview',
      },
      {
        surface: 'code',
        label: 'Cats Code',
        description: 'Code',
        enabled: true,
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'preview',
      },
    ]),
    'code',
  );
});

test('resolveInitialSetupProduct falls back to the first plugin and then chat', () => {
  assert.equal(
    resolveInitialSetupProduct([
      {
        surface: 'work',
        label: 'Cats Work',
        description: 'Work',
        enabled: false,
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'preview',
      },
    ]),
    'work',
  );
  assert.equal(resolveInitialSetupProduct([]), 'chat');
});

test('describeGuideCatSetupChoice summarizes the configured Guide Cat target', () => {
  const summary = describeGuideCatSetupChoice({
    createGuideCat: true,
    guideCatName: 'Milo',
    provider: 'claude',
    instance: 'native',
    model: 'claude-sonnet',
  });

  assert.deepEqual(summary?.title, 'Milo');
  assert.match(summary?.detail ?? '', /Claude/u);
  assert.match(summary?.detail ?? '', /claude-sonnet|Sonnet/u);

  assert.equal(
    describeGuideCatSetupChoice({
      createGuideCat: false,
      guideCatName: 'Milo',
      provider: 'claude',
      instance: 'native',
      model: 'claude-sonnet',
    }),
    null,
  );
});

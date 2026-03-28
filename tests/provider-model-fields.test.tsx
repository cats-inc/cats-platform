import assert from 'node:assert/strict';
import test from 'node:test';

import {
  catalogMatchesTarget,
  resolveSelectedInstanceEventCapabilities,
  shouldShowInstanceField,
  shouldDeferCatalogTargetReconciliation,
} from '../src/design/components/ProviderModelFields.tsx';
import { formatProviderEventCapabilitiesSummary } from '../src/shared/providerEventCapabilities.ts';

test('static fallback catalogs do not overwrite an existing model selection during panel reopen', () => {
  assert.equal(
    shouldDeferCatalogTargetReconciliation({
      catalogSource: 'static',
      advancedCatalogSource: 'static',
      model: 'claude-opus-4-6',
      modelSelection: {
        entryId: 'claude-opus-4-6',
        entryMode: 'explicit',
        presetId: 'deep-reasoning',
      },
    }),
    true,
  );
});

test('static fallback catalogs still resolve an initial empty target', () => {
  assert.equal(
    shouldDeferCatalogTargetReconciliation({
      catalogSource: 'static',
      advancedCatalogSource: 'static',
      model: '',
      modelSelection: null,
    }),
    false,
  );
});

test('stale catalogs from the previous instance are ignored during instance switches', () => {
  assert.equal(
    catalogMatchesTarget({
      catalogProvider: 'claude',
      catalogInstance: 'sdk',
      provider: 'claude',
      instance: 'sonnet',
    }),
    false,
  );
  assert.equal(
    catalogMatchesTarget({
      catalogProvider: 'claude',
      catalogInstance: 'sonnet',
      provider: 'claude',
      instance: 'sonnet',
    }),
    true,
  );
});

test('instance field stays hidden when a provider only exposes one runtime instance', () => {
  assert.equal(
    shouldShowInstanceField({
      resolvedInstance: 'native',
      instanceOptions: [
        {
          id: 'native',
          label: 'cli/native',
          target: 'cli/native',
          backend: 'cli',
        },
      ],
    }),
    false,
  );
});

test('selected instance capability summary reflects runtime-owned event truth', () => {
  const capabilities = resolveSelectedInstanceEventCapabilities({
    resolvedInstance: 'native',
    instanceOptions: [
      {
        id: 'native',
        label: 'cli/native',
        target: 'cli/native',
        backend: 'cli',
        eventCapabilities: {
          normalizedStream: {
            text: { mode: 'chunk', stepwise: true },
            toolUse: 'native',
            toolResult: 'native',
            progress: 'derived',
            reasoning: 'none',
          },
          transcript: {
            contentBlocks: 'native',
          },
          presentation: {
            recommended: 'content_blocks',
          },
          notes: [],
        },
      },
    ],
  });

  assert.equal(
    formatProviderEventCapabilitiesSummary(capabilities),
    'Runtime event surface: chunk text, tool use, tool results, derived progress, transcript blocks. Recommended host view: content blocks.',
  );
});

test('unknown capability truth stays silent in provider hints', () => {
  assert.equal(
    formatProviderEventCapabilitiesSummary({
      normalizedStream: {
        text: { mode: 'unknown', stepwise: false },
        toolUse: 'unknown',
        toolResult: 'unknown',
        progress: 'unknown',
        reasoning: 'unknown',
      },
      transcript: {
        contentBlocks: 'unknown',
      },
      presentation: {
        recommended: 'unknown',
      },
      notes: [],
    }),
    null,
  );
});

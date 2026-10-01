// Must come first: React captures `canUseDOM` when its module body runs.
import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { cleanup, render, waitFor } from '@testing-library/react';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import {
  readUnmappableSavedSelection,
  useSavedSelectionAttention,
  type SavedSelectionCatalogReader,
  type SavedSelectionTarget,
} from '../src/app/renderer/savedSelectionAttention.ts';
import { AudienceChip } from '../src/products/shared/renderer/components/AudienceChip.tsx';
import { listProductProviders } from '../src/shared/providerCatalog.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

function reader(options: { advancedRevision?: string } = {}): SavedSelectionCatalogReader & { reads: string[] } {
  const reads: string[] = [];
  const models = [{ id: 'opus', label: 'Opus 5.5', default: true }];
  const base = {
    catalogRevision: 'R2', catalogActivationId: 'A2', provider: 'claude', backend: 'cli', instance: 'cli/native',
    defaultModel: 'opus', source: 'config' as const, cache: null, warnings: [],
  };
  return {
    reads,
    readRegistry: async () => ({
      state: 'ready' as const,
      providers: listProductProviders().filter((provider) => provider.id === 'claude'),
    }),
    readModels: async (provider, instance) => {
      reads.push(`${provider}:${instance}`);
      return { ...base, models };
    },
    readAdvanced: async () => ({
      ...base,
      catalogRevision: options.advancedRevision ?? 'R2',
      entries: models,
      presets: [],
      controls: [{
        key: 'claude.reasoning_effort', label: 'Reasoning effort', kind: 'enum' as const, scope: 'session_default' as const,
        values: [{ value: 'medium', label: 'Medium' }, { value: 'xhigh', label: 'xHigh' }],
      }],
      defaultSelection: { entryId: 'opus', entryMode: 'explicit' as const },
      support: { tier: 'full' as const, notes: [] },
    }),
  };
}

const ultracode: SavedSelectionTarget = {
  provider: 'claude',
  instance: 'cli/native',
  modelSelection: {
    catalogRevision: 'R1', entryId: 'opus', entryMode: 'explicit', controls: { 'claude.reasoning_effort': 'ultracode' },
  },
};

test('a saved selection is unmappable only when the coherent catalog no longer offers it', async () => {
  const unmappable = await readUnmappableSavedSelection(ultracode, reader());
  assert.deepEqual(unmappable?.mismatch, {
    kind: 'control', entryId: 'opus', key: 'claude.reasoning_effort', value: 'ultracode',
  });
  assert.equal(await readUnmappableSavedSelection({
    ...ultracode,
    modelSelection: { ...ultracode.modelSelection!, controls: { 'claude.reasoning_effort': 'xhigh' } },
  }, reader()), null, 'a restampable selection needs no attention');
  assert.equal(await readUnmappableSavedSelection(ultracode, reader({ advancedRevision: 'R1' })), null,
    'a split base/advanced pair cannot judge a selection');
  assert.equal(await readUnmappableSavedSelection({ provider: 'claude', modelSelection: null }, reader()), null);
});

function Attention(props: { target: SavedSelectionTarget; reader: SavedSelectionCatalogReader }) {
  return <span>{useSavedSelectionAttention(props.target, props.reader) ?? 'none'}</span>;
}

test('the attention hook names the removed option once the catalog read settles', async (t) => {
  resetTestDom();
  t.after(() => { cleanup(); resetTestDom(); });
  const view = render(
    <I18nProvider locale="zh-TW"><Attention target={ultracode} reader={reader()} /></I18nProvider>,
  );
  assert.ok(view.getByText('none'));
  await waitFor(() => assert.ok(view.getByText('Opus 5.5 已不再提供Reasoning effort「ultracode」，請重新選擇。')));
});

test('the audience chip shows the attention mark with how to fix it', () => {
  const participant = {
    key: 'implicit', name: 'Claude-CLI · Opus 5.5 · ultracode', executionLabel: 'Claude-CLI · Opus 5.5 · ultracode',
    isCat: false,
  };
  const marked = renderToStaticMarkup(
    <AudienceChip audienceParticipants={[participant as never]} attention="Opus 5.5 no longer offers it." />,
  );
  assert.match(marked, /class="selectionAttentionBadge"/u);
  assert.match(marked, /data-tooltip="Opus 5.5 no longer offers it. Click to choose again."/u);
  assert.match(marked, />Claude-CLI · Opus 5.5 · ultracode</u, 'the saved label stays visible');
  assert.doesNotMatch(renderToStaticMarkup(
    <AudienceChip audienceParticipants={[participant as never]} />,
  ), /selectionAttentionBadge/u);
});

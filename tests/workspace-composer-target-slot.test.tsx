import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import type { AppShellPayload, ChatCat } from '../src/products/shared/api/workspaceContracts.ts';
import { WorkspaceComposerTargetSlot } from '../src/products/shared/renderer/components/chat-view/WorkspaceComposerTargetSlot.tsx';

function createPayload(): AppShellPayload {
  return {
    chat: {
      bossCatId: null,
      cats: [],
      capabilities: {},
    },
  } as unknown as AppShellPayload;
}

function createCat(overrides: Partial<ChatCat> & Pick<ChatCat, 'id' | 'name'>): ChatCat {
  return {
    id: overrides.id,
    name: overrides.name,
    avatarColor: overrides.avatarColor ?? '#7A5B3A',
    avatarUrl: overrides.avatarUrl ?? null,
    status: overrides.status ?? 'active',
    products: overrides.products ?? ['chat'],
    defaultExecutionTarget: overrides.defaultExecutionTarget ?? {
      provider: 'claude',
      instance: 'cli',
      model: 'opus',
    },
    defaultModelSelection: overrides.defaultModelSelection ?? null,
  } as ChatCat;
}

test('workspace composer renders a cat-backed audience chip for direct lanes', () => {
  const directLaneCat = createCat({
    id: 'cat-mochi',
    name: 'Mochi',
  });

  const markup = renderToStaticMarkup(
    <WorkspaceComposerTargetSlot
      payload={createPayload()}
      composerBusy={false}
      selectedExecutionTarget={undefined}
      directLaneCat={directLaneCat}
      defaultRecipientCat={null}
      assignedCatRecords={[]}
      leadCatRecord={null}
      isDirectLane
      isDefaultChatComposer={false}
      onOpenSection={() => {}}
    />,
  );

  assert.match(markup, /class="audienceChip"/u);
  assert.match(markup, /class="audienceChipAvatar"/u);
  assert.match(markup, /class="audienceChipLabel">Mochi</u);
  assert.match(markup, /data-tooltip="Mochi · Claude-CLI/u);
});

test('workspace composer renders a model-backed audience chip for default mode', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceComposerTargetSlot
      payload={createPayload()}
      composerBusy={false}
      selectedExecutionTarget={{
        provider: 'claude',
        instance: 'cli',
        model: 'sonnet',
        modelSelection: null,
      }}
      directLaneCat={null}
      defaultRecipientCat={null}
      assignedCatRecords={[]}
      leadCatRecord={null}
      isDirectLane={false}
      isDefaultChatComposer
      onOpenSection={() => {}}
    />,
  );

  assert.match(markup, /class="audienceChip"/u);
  assert.match(markup, /class="audienceChipLabel">Claude-CLI/u);
  assert.doesNotMatch(markup, /class="audienceChipAvatar"/u);
  assert.doesNotMatch(markup, /class="audienceChipWorkflow"/u);
});

test('workspace composer prefers runtime-backed execution labels for default audience chips', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceComposerTargetSlot
      payload={createPayload()}
      composerBusy={false}
      selectedExecutionTarget={{
        provider: 'claude',
        instance: 'native',
        model: 'opus',
        modelSelection: {
          entryId: 'opus',
          entryMode: 'explicit',
          controls: {
            'claude.reasoning_effort': 'xhigh',
          },
        },
        executionLabel: 'Claude-CLI · Opus 4.7 with 1M context · xHigh',
      }}
      directLaneCat={null}
      defaultRecipientCat={null}
      assignedCatRecords={[]}
      leadCatRecord={null}
      isDirectLane={false}
      isDefaultChatComposer
      onOpenSection={() => {}}
    />,
  );

  assert.match(markup, /class="audienceChip"/u);
  assert.match(markup, /Claude-CLI · Opus 4\.7 with 1M context · xHigh/u);
});

test('workspace composer renders a multi-cat audience chip for group rooms', () => {
  const leadCat = createCat({
    id: 'cat-mochi',
    name: 'Mochi',
  });
  const secondCat = createCat({
    id: 'cat-rin',
    name: 'Rin',
    avatarColor: '#375A7F',
  });

  const markup = renderToStaticMarkup(
    <WorkspaceComposerTargetSlot
      payload={createPayload()}
      composerBusy={false}
      selectedExecutionTarget={undefined}
      directLaneCat={null}
      defaultRecipientCat={{ id: leadCat.id, name: leadCat.name } as never}
      assignedCatRecords={[leadCat, secondCat]}
      leadCatRecord={leadCat}
      isDirectLane={false}
      isDefaultChatComposer={false}
      onOpenSection={() => {}}
    />,
  );

  assert.match(markup, /class="audienceChip"/u);
  assert.match(markup, /class="audienceChipAvatar"/u);
  assert.match(markup, /class="audienceChipLabel">Mochi \+1</u);
  assert.match(markup, /data-tooltip="Select audience"/u);
  assert.doesNotMatch(markup, /class="audienceChipWorkflow"/u);
});

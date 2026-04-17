import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { NewCodeDraftHeaderAccessory } from '../src/products/code/renderer/components/NewCodeDraftHeaderAccessory.tsx';

function createProps(
  overrides: Partial<ComponentProps<typeof NewCodeDraftHeaderAccessory>> = {},
): ComponentProps<typeof NewCodeDraftHeaderAccessory> {
  return {
    copy: {
      folderActionLabel: 'Choose workspace',
      executionActionLabel: 'Choose execution target',
    },
    draftCwd: null,
    selectedModel: undefined,
    disabled: false,
    onOpenSection: () => {},
    ...overrides,
  };
}

test('new code header accessory renders a distinct empty workspace chip state without redundant tooltip text', () => {
  const markup = renderToStaticMarkup(
    <NewCodeDraftHeaderAccessory {...createProps()} />,
  );

  assert.match(markup, /class="[^"]*draftContextChip[^"]*draftContextChipClickable[^"]*draftContextChipEmpty/u);
  assert.match(markup, /Choose workspace/u);
  assert.doesNotMatch(markup, /data-tooltip="Choose workspace"/u);
});

test('new code header accessory shows the selected workspace path as tooltip metadata', () => {
  const markup = renderToStaticMarkup(
    <NewCodeDraftHeaderAccessory
      {...createProps({
        draftCwd: 'C:\\repo\\cats-platform',
      })}
    />,
  );

  assert.match(markup, /data-tooltip="C:\\repo\\cats-platform"/u);
  assert.doesNotMatch(markup, /draftContextChipEmpty/u);
});

test('new code header accessory forwards disabled state to both draft context controls', () => {
  const markup = renderToStaticMarkup(
    <NewCodeDraftHeaderAccessory
      {...createProps({
        disabled: true,
      })}
    />,
  );

  assert.match(markup, /class="[^"]*draftContextChip[^"]*draftContextChipClickable[^"]*draftContextChipEmpty[^"]*" disabled=""/u);
  assert.match(markup, /class="modelSelectorChip" disabled=""/u);
});

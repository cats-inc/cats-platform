import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { useAppNavigationActions } from '../src/products/chat/renderer/hooks/useAppNavigationActions.ts';

test('chat +New chat resets a previously switched code draft surface back to chat', async () => {
  const navigateCalls: Array<{ path: string; options?: unknown }> = [];
  const draftSurfaceCalls: string[] = [];
  let actions: ReturnType<typeof useAppNavigationActions> | null = null;

  function Probe() {
    actions = useAppNavigationActions({
      state: { status: 'loading' },
      setState: () => {},
      navigate: (path: string, options?: unknown) => {
        navigateCalls.push({ path, options });
      },
      setBusy: () => {},
      setFeedback: () => {},
      setComposerDraft: () => {},
      setAccountMenuOpen: () => {},
      setAddCatOpen: () => {},
      setAddCatTab: () => {},
      setPlusMenuOpen: () => {},
      setChannelPlusMenuOpen: () => {},
      setDraftCwd: () => {},
      setDraftCatIds: () => {},
      setDraftTemporaryParticipants: () => {},
      setDraftHighlightedCatId: () => {},
      setDraftCatExecutionTargetOverrides: () => {},
      setDraftSurface: (value) => {
        draftSurfaceCalls.push(value as string);
      },
      setDraftWorkflowShape: () => {},
      setDraftAudienceKeys: () => {},
      resetDraftParallelChatTargets: () => {},
      createInitialGroupParticipants: () => [],
      setDraftFiles: () => {},
      setChannelFiles: () => {},
    });
    return null;
  }

  renderToStaticMarkup(<Probe />);
  await actions?.onStartNewChat();

  assert.deepEqual(navigateCalls, [{ path: '/chat/new', options: undefined }]);
  assert.deepEqual(draftSurfaceCalls, ['chat']);
});

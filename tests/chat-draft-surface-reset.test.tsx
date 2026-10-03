import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { useWorkspaceAppNavigationActions } from '../src/products/shared/renderer/hooks/useWorkspaceAppNavigationActions.ts';
import type { NavigateFunction } from 'react-router-dom';

type NavigationActions = ReturnType<typeof useWorkspaceAppNavigationActions>;

function capturedActions(actions: NavigationActions | null): NavigationActions | null {
  return actions;
}

// Chat runs on the shared workspace app, so its +New chat goes through
// useWorkspaceAppNavigationActions with the `chat` shell surface.
test('chat +New chat resets a previously switched code draft surface back to chat', async () => {
  const navigateCalls: Array<{ path: string; options?: unknown }> = [];
  const draftSurfaceCalls: string[] = [];
  let actions: NavigationActions | null = null;

  function Probe() {
    actions = useWorkspaceAppNavigationActions({
      state: { status: 'loading' },
      setState: () => {},
      navigate: ((path: string, options?: unknown) => {
        navigateCalls.push({ path, options });
      }) as unknown as NavigateFunction,
      platformShellSurface: 'chat',
      setBusy: () => {},
      setFeedback: () => {},
      setComposerDraft: () => {},
      setAccountMenuOpen: () => {},
      setAddCatOpen: () => {},
      setPlusMenuOpen: () => {},
      setChannelPlusMenuOpen: () => {},
      setDraftCwd: () => {},
      setDraftCatIds: () => {},
      setDraftHighlightedCatId: () => {},
      setDraftCatExecutionTargetOverrides: () => {},
      setDraftSurface: (value) => {
        draftSurfaceCalls.push(value as string);
      },
      setDraftFiles: () => {},
      setChannelFiles: () => {},
    });
    return null;
  }

  renderToStaticMarkup(<Probe />);
  await capturedActions(actions)?.onStartNewChat();

  assert.deepEqual(navigateCalls, [{ path: '/chat/new', options: undefined }]);
  assert.deepEqual(draftSurfaceCalls, ['chat']);
});

// Must come first: React captures `canUseDOM` when its module body runs.
import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import React from 'react';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import {
  useWorkspaceExecutionTargetState,
  type WorkspaceExecutionTargetChannelLike,
  type WorkspaceExecutionTargetChatLike,
} from '../src/products/shared/renderer/hooks/useWorkspaceExecutionTargetState.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

/**
 * Reproduces the report "conversation B shows conversation A's provider/model
 * after switching". The hook keeps one local target for whichever channel is
 * selected, and two effects write to it on a switch: a sync from the newly
 * selected channel, and an async runtime reconcile. The reconcile re-runs on
 * the switch render, where local state still holds the previous channel's
 * value, so it starts from A's target and -- if it resolves after the sync --
 * puts A back over B. The debounced save then persists A into channel B.
 *
 * The registry request is held open here so the reconcile that started from
 * A's value is guaranteed to resolve only after B has been synced in.
 */

type PendingPatch = {
  pendingProvider: string | null;
  pendingModel: string | null;
  pendingInstance: string | null;
  pendingModelSelection: unknown;
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function catalogBody(provider: string, model: string, label: string) {
  return {
    catalog: {
      provider,
      backend: 'cli',
      instance: 'native',
      source: 'dynamic',
      cache: null,
      defaultModel: model,
      models: [{ id: model, label, default: true }],
      warnings: [],
    },
  };
}

function advancedCatalogBody(provider: string, model: string, label: string) {
  return {
    catalog: {
      provider,
      backend: 'cli',
      instance: 'native',
      source: 'dynamic',
      cache: null,
      defaultModel: model,
      entries: [{ id: model, label, default: true }],
      presets: [],
      controls: [],
      defaultSelection: { entryId: model, entryMode: 'explicit', controls: {} },
      support: { tier: 'full', notes: [] },
      warnings: [],
    },
  };
}

const registryBody = {
  state: 'ready',
  providers: [
    {
      id: 'codex',
      label: 'Codex',
      defaultModel: 'gpt-5.6-sol',
      defaultInstance: 'native',
      defaultBackend: 'cli',
      instances: [{ id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true }],
      modelsPath: '/api/providers/codex/models',
    },
    {
      id: 'claude',
      label: 'Claude',
      defaultModel: 'opus',
      defaultInstance: 'native',
      defaultBackend: 'cli',
      instances: [{ id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true }],
      modelsPath: '/api/providers/claude/models',
    },
  ],
  warnings: [],
};

function installFetch(registry: Deferred<unknown>): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    if (url.startsWith('/api/providers/codex/models/advanced')) {
      return json(advancedCatalogBody('codex', 'gpt-5.6-sol', 'GPT-5.6-Sol'));
    }
    if (url.startsWith('/api/providers/codex/models')) {
      return json(catalogBody('codex', 'gpt-5.6-sol', 'GPT-5.6-Sol'));
    }
    if (url.startsWith('/api/providers/claude/models/advanced')) {
      return json(advancedCatalogBody('claude', 'opus', 'Opus 5 (1M context)'));
    }
    if (url.startsWith('/api/providers/claude/models')) {
      return json(catalogBody('claude', 'opus', 'Opus 5 (1M context)'));
    }
    if (url.startsWith('/api/providers')) {
      return json(await registry.promise);
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

const chat: WorkspaceExecutionTargetChatLike = {
  newChatDefaults: null,
  globalOrchestrator: {
    executionTarget: { provider: 'claude', model: 'opus', instance: 'native' },
    executionModelSelection: null,
  },
};

const channelA: WorkspaceExecutionTargetChannelLike = {
  id: 'channel-a',
  channelKind: 'chat_channel',
  pendingProvider: 'codex',
  pendingModel: 'gpt-5.6-sol',
  pendingInstance: 'native',
  pendingModelSelection: { entryId: 'gpt-5.6-sol', entryMode: 'explicit' },
};

const channelB: WorkspaceExecutionTargetChannelLike = {
  id: 'channel-b',
  channelKind: 'chat_channel',
  pendingProvider: 'claude',
  pendingModel: 'opus',
  pendingInstance: 'native',
  pendingModelSelection: { entryId: 'opus', entryMode: 'explicit' },
};

async function tick(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

test('switching conversations never writes the previous conversation\'s target into the new one', async (t) => {
  resetTestDom();
  const registry = deferred<unknown>();
  const restoreFetch = installFetch(registry);
  t.after(() => {
    cleanup();
    restoreFetch();
    resetTestDom();
  });

  const writes: Array<{ channelId: string; patch: PendingPatch }> = [];
  const payload = { chat: { newChatDefaults: null } };
  const state = { status: 'ready' as const, payload };

  const { result, rerender } = renderHook(
    (props: { channel: WorkspaceExecutionTargetChannelLike }) =>
      useWorkspaceExecutionTargetState({
        state,
        readyChat: chat,
        readySelectedChannel: props.channel,
        setState: () => {},
        setFeedback: () => {},
        updateNewChatDefaultsPreference: async () => payload,
        updateChannelPendingExecutionTarget: async (channelId, patch) => {
          writes.push({ channelId, patch: patch as PendingPatch });
          return payload;
        },
      }),
    {
      initialProps: { channel: channelA },
      wrapper: ({ children }) => <I18nProvider locale="en">{children}</I18nProvider>,
    },
  );

  await waitFor(() => {
    assert.equal(result.current.defaultChannelExecutionTarget.provider, 'codex');
  });

  // Switch to B while the reconcile that started from A's value is still
  // waiting on the registry. B must sync in and stay.
  rerender({ channel: channelB });
  await waitFor(() => {
    assert.equal(result.current.defaultChannelExecutionTarget.provider, 'claude');
  });

  // Now let every in-flight reconcile finish, then give the debounced save
  // (150ms) time to fire if anything decided to write.
  registry.resolve(registryBody);
  await tick(500);

  const staleWriteIntoB = writes.find((write) =>
    write.channelId === 'channel-b' && write.patch.pendingProvider === 'codex');
  assert.equal(
    staleWriteIntoB,
    undefined,
    `channel B received channel A's target: ${JSON.stringify(writes)}`,
  );
  assert.equal(
    result.current.defaultChannelExecutionTarget.provider,
    'claude',
    `local target drifted back to A after the switch: ${JSON.stringify(result.current.defaultChannelExecutionTarget)}`,
  );
  assert.equal(result.current.defaultChannelExecutionTarget.model, 'opus');
});

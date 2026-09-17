// Must come first: React captures `canUseDOM` when its module body runs.
import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import React, { startTransition, useState } from 'react';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { ProviderModelFields } from '../src/products/shared/renderer/components/ProviderModelFields.tsx';
import { createExecutionTargetValueFromProviderSelection, type ExecutionTargetValue } from '../src/products/shared/renderer/components/ExecutionTarget.ts';
import { AudienceChip } from '../src/products/shared/renderer/components/AudienceChip.tsx';
import { buildAudienceParticipantFromExecutionTarget } from '../src/products/shared/renderer/audienceParticipantBuilder.ts';
import { buildDefaultChatDispatchTarget } from '../src/products/shared/renderer/composerDispatch.ts';
import {
  useWorkspaceExecutionTargetState,
  type WorkspaceExecutionTargetChannelLike,
  type WorkspaceExecutionTargetChatLike,
  type PendingExecutionTargetUpdateInput,
  type PersistedNewChatDefaultsInput,
  type WorkspaceExecutionTargetLoadState,
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
      instance: 'cli/native',
      source: 'dynamic',
      cache: null,
      defaultModel: model,
      models: [
        { id: model, label, default: true },
        ...(provider === 'claude' ? [{ id: 'sonnet', label: 'Sonnet' }] : []),
      ],
      warnings: [],
    },
  };
}

function advancedCatalogBody(provider: string, model: string, label: string) {
  return {
    catalog: {
      provider,
      backend: 'cli',
      instance: 'cli/native',
      source: 'dynamic',
      cache: null,
      defaultModel: model,
      entries: [
        { id: model, label, default: true },
        ...(provider === 'claude' ? [{ id: 'sonnet', label: 'Sonnet' }] : []),
      ],
      presets: [],
      controls: [{
        key: `${provider}.reasoning_effort`,
        label: 'Reasoning effort',
        kind: 'enum',
        scope: 'both',
        values: ['low', 'medium', 'high', 'max'].map((value) => ({ value, label: value })),
      }],
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
  pendingInstance: 'cli/native',
  pendingModelSelection: { entryId: 'gpt-5.6-sol', entryMode: 'explicit' },
};

const channelB: WorkspaceExecutionTargetChannelLike = {
  id: 'channel-b',
  channelKind: 'chat_channel',
  pendingProvider: 'claude',
  pendingModel: 'opus',
  pendingInstance: 'cli/native',
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

test('four conversations keep their own chip, picker and send target with warm catalogs and async navigation', async (t) => {
  resetTestDom();
  const registry = deferred<unknown>();
  registry.resolve(registryBody);
  const restoreFetch = installFetch(registry);
  t.after(() => {
    cleanup();
    restoreFetch();
    resetTestDom();
  });

  const choices: WorkspaceExecutionTargetChannelLike[] = [
    { ...channelA, pendingModelSelection: { entryId: 'gpt-5.6-sol', entryMode: 'explicit', controls: { 'codex.reasoning_effort': 'high' } } },
    { ...channelB, pendingModelSelection: { entryId: 'opus', entryMode: 'explicit', controls: { 'claude.reasoning_effort': 'max' } } },
    { ...channelB, id: 'channel-c', pendingModel: 'sonnet', pendingModelSelection: { entryId: 'sonnet', entryMode: 'explicit', controls: { 'claude.reasoning_effort': 'medium' } } },
    { ...channelA, id: 'channel-d', pendingModelSelection: { entryId: 'gpt-5.6-sol', entryMode: 'explicit', controls: { 'codex.reasoning_effort': 'low' } } },
  ];
  const channels = new Map(choices.map((channel) => [channel.id, structuredClone(channel)]));
  let selectedId = channelA.id;
  let defaults: PersistedNewChatDefaultsInput = {
    provider: 'claude', model: 'opus', instance: 'cli/native',
    modelSelection: { entryId: 'opus', entryMode: 'explicit' },
  };
  const snapshot = () => ({ chat: { ...chat, newChatDefaults: structuredClone(defaults), selectedChannel: structuredClone(channels.get(selectedId)!) } });
  type Payload = ReturnType<typeof snapshot>;
  const writes: Array<{ channelId: string; patch: PendingExecutionTargetUpdateInput }> = [];
  const updateNewChatDefaultsPreference = async (next: PersistedNewChatDefaultsInput) => {
    defaults = structuredClone(next);
    return snapshot();
  };
  const updateChannelPendingExecutionTarget = async (channelId: string, patch: PendingExecutionTargetUpdateInput) => {
    writes.push({ channelId, patch });
    Object.assign(channels.get(channelId)!, structuredClone(patch));
    return snapshot();
  };
  const setFeedback = () => {};
  let controls!: {
    select: (id: string) => Promise<void>;
    refresh: () => void;
    target: ExecutionTargetValue;
    change: (target: ExecutionTargetValue) => void;
  };
  function Harness() {
    const [state, setState] = useState<WorkspaceExecutionTargetLoadState<Payload>>({ status: 'ready', payload: snapshot() });
    const readyChat = state.status === 'ready' ? state.payload.chat : null;
    const targetState = useWorkspaceExecutionTargetState({
      state,
      readyChat,
      readySelectedChannel: readyChat?.selectedChannel ?? null,
      setState,
      setFeedback,
      updateNewChatDefaultsPreference,
      updateChannelPendingExecutionTarget,
      debounceMs: 30,
    });
    const target = targetState.defaultChannelExecutionTarget;
    controls = {
      target,
      change: targetState.setDefaultChannelExecutionTarget,
      refresh: () => startTransition(() => setState({ status: 'ready', payload: snapshot() })),
      select: async (id) => {
        selectedId = id;
        await Promise.resolve();
        startTransition(() => setState({ status: 'ready', payload: snapshot() }));
      },
    };
    return <div data-channel={readyChat?.selectedChannel.id}>
      <AudienceChip audienceParticipants={[buildAudienceParticipantFromExecutionTarget(target)]} />
      <ProviderModelFields
        provider={target.provider}
        instance={target.instance ?? ''}
        model={target.model ?? ''}
        modelSelection={target.modelSelection}
        onTargetChange={(selection) => targetState.setDefaultChannelExecutionTarget(createExecutionTargetValueFromProviderSelection(selection))}
      />
    </div>;
  }
  let view = render(<I18nProvider locale="en"><Harness /></I18nProvider>);

  function assertChoice(choice: WorkspaceExecutionTargetChannelLike): void {
    assert.equal(controls.target.provider, choice.pendingProvider);
    assert.equal(controls.target.instance, choice.pendingInstance);
    assert.equal(controls.target.model, choice.pendingModel);
    assert.deepEqual(controls.target.modelSelection, choice.pendingModelSelection);
    assert.equal(view.container.querySelectorAll('select')[0]?.value, choice.pendingProvider);
    const effort = Object.values(choice.pendingModelSelection?.controls ?? {})[0];
    assert.match(view.container.querySelector('.audienceChipLabel')?.textContent ?? '', new RegExp(String(effort), 'i'));
    assert.deepEqual(buildDefaultChatDispatchTarget({
      wasDraftingNewChat: false, isCatScopedLaneRoute: false,
      channelId: choice.id,
      selectedChannel: { id: choice.id, channelKind: 'chat_channel', pendingProvider: choice.pendingProvider },
      defaultChannelExecutionTarget: controls.target,
    }), {
      pendingProvider: choice.pendingProvider,
      pendingModel: choice.pendingModel,
      pendingInstance: choice.pendingInstance,
      pendingModelSelection: choice.pendingModelSelection,
    });
  }

  await tick(200);
  assertChoice(choices[0]);
  writes.length = 0;
  const staleChangeFromA = controls.change;
  for (const choice of [choices[1], choices[2], choices[3], choices[0], choices[2]]) {
    await controls.select(choice.id);
    await tick(150);
    assertChoice(choice);
    assert.deepEqual(channels.get(choice.id), choice);
  }
  act(() => staleChangeFromA({ provider: 'codex', instance: 'cli/native', model: 'wrong-old-model', modelSelection: null }));
  await tick(80);
  assertChoice(choices[2]);
  assert.equal(writes.length, 0, 'navigation and label refresh must not save another conversation\'s selection');

  // Refreshing a cloned app-shell snapshot must not erase an edit while its
  // debounced save is pending. Only C should change, and remount must retain it.
  const editedSelection = { entryId: 'sonnet', entryMode: 'explicit' as const, controls: { 'claude.reasoning_effort': 'high' } };
  act(() => controls.change({ ...controls.target, modelSelection: editedSelection, executionLabel: null }));
  controls.refresh();
  await tick(150);
  const editedC = { ...choices[2], pendingModelSelection: editedSelection };
  assertChoice(editedC);
  assert.deepEqual(writes.map((write) => write.channelId), ['channel-c']);
  for (const choice of [choices[0], choices[1], choices[3]]) assert.deepEqual(channels.get(choice.id), choice);
  view.unmount();
  view = render(<I18nProvider locale="en"><Harness /></I18nProvider>);
  await tick(150);
  assertChoice(editedC);
});

test('late saves cannot replace another conversation or a newer effort choice', async (t) => {
  resetTestDom();
  const registry = deferred<unknown>();
  registry.resolve(registryBody);
  const restoreFetch = installFetch(registry);
  t.after(() => { cleanup(); restoreFetch(); resetTestDom(); });

  const stableChat = {
    ...chat,
    newChatDefaults: {
      provider: 'claude', model: 'opus', instance: 'cli/native',
      modelSelection: { entryId: 'opus', entryMode: 'explicit' as const },
    },
  };
  const payload = { chat: stableChat };
  const state = { status: 'ready' as const, payload };
  const published: Array<typeof payload> = [];
  const saves: Array<{
    channelId: string;
    patch: PendingExecutionTargetUpdateInput;
    signal: AbortSignal;
    response: Deferred<typeof payload>;
  }> = [];
  const options = {
    state,
    readyChat: stableChat,
    setState: (update: React.SetStateAction<WorkspaceExecutionTargetLoadState<typeof payload>>) => {
      const next = typeof update === 'function' ? update(state) : update;
      if (next.status === 'ready') published.push(next.payload);
    },
    setFeedback: () => {},
    updateNewChatDefaultsPreference: async () => payload,
    updateChannelPendingExecutionTarget: (channelId: string, patch: PendingExecutionTargetUpdateInput, signal: AbortSignal) => {
      const response = deferred<typeof payload>();
      saves.push({ channelId, patch, signal, response });
      return response.promise; // Deliberately resolves even after abort.
    },
    debounceMs: 10,
  };
  const { result, rerender } = renderHook(
    ({ channel }) => useWorkspaceExecutionTargetState({ ...options, readySelectedChannel: channel }),
    {
      initialProps: { channel: channelA },
      wrapper: ({ children }) => <I18nProvider locale="en">{children}</I18nProvider>,
    },
  );
  await tick(80);
  function changeEffort(effort: string): void {
    const target = result.current.defaultChannelExecutionTarget;
    act(() => result.current.setDefaultChannelExecutionTarget({
      ...target,
      modelSelection: {
        entryId: target.model!, entryMode: 'explicit',
        controls: { [`${target.provider}.reasoning_effort`]: effort },
      },
      executionLabel: null,
    }));
  }

  changeEffort('high');
  await waitFor(() => assert.equal(saves.length, 1));
  rerender({ channel: channelB });
  saves[0].response.resolve(payload);
  await tick(80);
  assert.equal(saves[0].channelId, channelA.id);
  assert.equal(saves[0].signal.aborted, true);
  assert.equal(published.length, 0);
  assert.equal(result.current.defaultChannelExecutionTarget.provider, 'claude');

  changeEffort('medium');
  await waitFor(() => assert.equal(saves.length, 2));
  changeEffort('low');
  await waitFor(() => assert.equal(saves.length, 3));
  assert.equal(saves[1].signal.aborted, true);
  const newestPayload = structuredClone(payload);
  saves[2].response.resolve(newestPayload);
  await tick(50);
  saves[1].response.resolve(payload);
  await tick(50);
  assert.equal(published.length, 1);
  assert.equal(published[0], newestPayload);
  assert.equal(result.current.defaultChannelExecutionTarget.modelSelection?.controls?.['claude.reasoning_effort'], 'low');
  assert.ok(saves.slice(1).every((save) => save.channelId === channelB.id));
});

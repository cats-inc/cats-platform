import assert from 'node:assert/strict';
import test from 'node:test';

import {
  catSelectionStillMaps,
  findUnmappableCatSelectionCopies,
  repairCatSelectionCopies,
} from '../build/server/products/chat/api/catSelectionRepair.js';
import {
  createCat,
  createChannel,
  setChannelParticipantExecutionTarget,
  updateCatExecutionTarget,
} from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';

const now = new Date('2026-10-01T00:00:00.000Z');

function runtimeCatalogs() {
  const reads = [];
  const models = [{ id: 'opus', label: 'Opus 5.5', default: true }, { id: 'sonnet', label: 'Sonnet 5.5' }];
  const base = {
    catalogRevision: 'R2', catalogActivationId: 'A2', provider: 'claude', backend: 'cli', instance: 'cli/native',
    defaultModel: 'opus', source: 'config', cache: null, warnings: [],
  };
  return {
    reads,
    async getProviderModels(provider, instance) {
      reads.push(`${provider}:${instance}`);
      return { ...base, models };
    },
    async getAdvancedProviderModels() {
      return {
        ...base,
        entries: models,
        presets: [],
        controls: [{
          key: 'claude.reasoning_effort', label: 'Reasoning effort', kind: 'enum', scope: 'session_default',
          values: [{ value: 'medium', label: 'Medium' }, { value: 'xhigh', label: 'xHigh' }],
        }],
        defaultSelection: { entryId: 'opus', entryMode: 'explicit' },
        support: { tier: 'full', notes: [] },
      };
    },
  };
}

function copyOf(state, channelId, catId) {
  return state.channels.find((channel) => channel.id === channelId)
    .catAssignments.find((assignment) => assignment.catId === catId).execution;
}

async function twoChatsWithOneCat() {
  let state = await new MemoryChatStore().read();
  state = createCat(state, { name: 'Mochi', provider: 'claude' }, now);
  const catId = state.cats.at(-1).id;
  const channelIds = [];
  for (const title of ['Stale copy', 'Chosen copy']) {
    state = createChannel(state, {
      title, topic: title, originSurface: 'chat', participantCatIds: [catId], defaultRecipientId: catId,
      skipBossCatGreeting: true,
    }, now);
    channelIds.push(state.selectedChannelId);
  }
  const participantIn = (channelId) => state.channels.find((channel) => channel.id === channelId)
    .catAssignments.find((assignment) => assignment.catId === catId).participantId;
  state = setChannelParticipantExecutionTarget(state, channelIds[0], participantIn(channelIds[0]), {
    provider: 'claude', instance: 'cli/native', model: 'opus',
    modelSelection: {
      catalogRevision: 'R1', entryId: 'opus', entryMode: 'explicit', controls: { 'claude.reasoning_effort': 'ultracode' },
    },
  }, now);
  state = setChannelParticipantExecutionTarget(state, channelIds[1], participantIn(channelIds[1]), {
    provider: 'claude', instance: 'cli/native', model: 'sonnet',
    modelSelection: { catalogRevision: 'R1', entryId: 'sonnet', entryMode: 'explicit' },
  }, now);
  return { state, catId, channelIds };
}

test('re-picking a cat replaces only its chat copies the catalog no longer offers', async () => {
  const { state, catId, channelIds } = await twoChatsWithOneCat();
  const runtime = runtimeCatalogs();
  const copies = await findUnmappableCatSelectionCopies(runtime, state, catId);
  assert.deepEqual(copies.map((copy) => copy.channelId), [channelIds[0]]);
  assert.deepEqual(runtime.reads, ['claude:cli/native'], 'one catalog read per provider target');

  const picked = { catalogRevision: 'R2', entryId: 'opus', entryMode: 'explicit', controls: { 'claude.reasoning_effort': 'xhigh' } };
  let next = updateCatExecutionTarget(state, catId, {
    provider: 'claude', instance: 'cli/native', model: 'opus', modelSelection: picked,
  });
  next = repairCatSelectionCopies(next, catId, copies, now);

  assert.deepEqual(copyOf(next, channelIds[0], catId).modelSelection, picked);
  assert.equal(copyOf(next, channelIds[1], catId).modelSelection.entryId, 'sonnet', 'a mappable copy keeps its choice');
});

test('a catalog that cannot judge selections repairs nothing', async () => {
  const { state, catId } = await twoChatsWithOneCat();
  const runtime = runtimeCatalogs();
  runtime.getAdvancedProviderModels = async () => { throw new Error('advanced catalog unavailable'); };
  assert.deepEqual(await findUnmappableCatSelectionCopies(runtime, state, catId), []);
});

test('a copy is judged against the target it runs, not the cat default', async () => {
  const { state, catId, channelIds } = await twoChatsWithOneCat();
  const copy = state.channels.find((channel) => channel.id === channelIds[0])
    .catAssignments.find((assignment) => assignment.catId === catId);
  copy.execution.target.instance = null;
  state.cats.find((cat) => cat.id === catId).defaultExecutionTarget.instance = 'agent/bridge';
  const runtime = runtimeCatalogs();
  await findUnmappableCatSelectionCopies(runtime, state, catId);
  assert.deepEqual(runtime.reads.sort(), ['claude:cli/native', 'claude:null']);
});

test('copies take the cat default only while the cat’s own choice still maps', async () => {
  const runtime = runtimeCatalogs();
  const cat = (controls) => ({
    defaultExecutionTarget: { provider: 'claude', instance: 'cli/native', model: 'opus' },
    defaultModelSelection: { catalogRevision: 'R1', entryId: 'opus', entryMode: 'explicit', controls },
  });
  assert.equal(await catSelectionStillMaps(runtime, cat({ 'claude.reasoning_effort': 'xhigh' })), true);
  assert.equal(await catSelectionStillMaps(runtime, cat({ 'claude.reasoning_effort': 'ultracode' })), false);
  assert.equal(await catSelectionStillMaps(runtime, { ...cat(), defaultModelSelection: null }), false);
});


import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChatChannelView, UpdateChannelParticipantInput } from '../src/products/shared/api/workspaceContracts.ts';
import {
  applyDraftCatExecutionTargets,
  type DraftCatExecutionTarget,
} from '../src/products/shared/renderer/draftCatExecutionTargets.ts';

const claude: DraftCatExecutionTarget = { provider: 'claude', instance: 'native', model: 'opus', modelSelection: null };
const codex: DraftCatExecutionTarget = {
  provider: 'codex',
  instance: 'native',
  model: 'gpt-5.6-sol',
  modelSelection: { entryId: 'gpt-5.6-sol', entryMode: 'explicit', controls: { 'openai.reasoning_effort': 'high' } },
};

// A deliberate partial: only the fields the applier reads and rewrites.
function createdChannel(): ChatChannelView {
  const cat = (participantId: string, catId: string) => ({
    participantId,
    catId,
    sourceKind: 'cat',
    sourceRefId: catId,
    status: 'active',
    execution: {
      target: { provider: claude.provider, instance: claude.instance, model: claude.model },
      modelSelection: null,
      lease: { status: 'idle' },
    },
  });
  return {
    id: 'channel-1',
    assignedCats: [cat('participant-a', 'cat-a'), cat('participant-b', 'cat-b')],
  } as unknown as ChatChannelView;
}

test('draft cat picks become the new conversation\'s participant targets before it is shown', async () => {
  const calls: Array<[string, string, UpdateChannelParticipantInput]> = [];
  const channel = createdChannel();
  const settled = await applyDraftCatExecutionTargets(
    channel,
    new Map([['cat-b', codex], ['cat-not-in-conversation', codex]]),
    async (channelId, participantId, input) => { calls.push([channelId, participantId, input]); },
  );

  assert.deepEqual(calls, [['channel-1', 'participant-b', {
    provider: 'codex',
    instance: 'native',
    model: 'gpt-5.6-sol',
    modelSelection: codex.modelSelection,
  }]]);
  const [first, second] = settled.assignedCats;
  assert.equal(first?.execution.target.provider, 'claude', 'cats without a pick keep their seeded default');
  assert.equal(second?.execution.target.provider, 'codex');
  assert.equal(second?.execution.target.model, 'gpt-5.6-sol');
  assert.deepEqual(second?.execution.modelSelection, codex.modelSelection);
  assert.equal(channel.assignedCats[1]?.execution.target.provider, 'claude', 'the created channel is not mutated');
});

test('a draft without picks sends no participant update', async () => {
  const channel = createdChannel();
  const settled = await applyDraftCatExecutionTargets(
    channel,
    new Map(),
    async () => assert.fail('no update expected'),
  );
  assert.equal(settled, channel);
});

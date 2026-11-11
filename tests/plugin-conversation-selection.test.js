import assert from 'node:assert/strict';
import test from 'node:test';
import { assignCatToChannel, buildChannelView, createCat, createChannel, updateCatSkillProfile } from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { buildCatTarget, resolveRuntimeEnvelopeForTarget } from '../build/server/products/chat/state/runtimeTargeting.js';
import { AGENCY_PLUGIN } from '../build/server/shared/managedPlugins.js';

for (const skill of AGENCY_PLUGIN.skills) {
  test(`new group dispatch carries the Cat's ${skill.title} selection only on that participant`, async () => {
    const now = new Date();
    let state = await new MemoryChatStore().read();
    state = createCat(state, { name: 'Selected Cat', provider: 'codex' }, now);
    const selectedId = state.cats.find(cat => cat.name === 'Selected Cat').id;
    state = updateCatSkillProfile(state, selectedId, skill.id, now);
    state = createCat(state, { name: 'Ordinary Cat', provider: 'claude' }, now);
    const ordinaryId = state.cats.find(cat => cat.name === 'Ordinary Cat').id;
    state = createChannel(state, { title: 'Agency group', topic: '', originSurface: 'chat' }, now);
    const channelId = state.selectedChannelId;
    for (const [catId, provider] of [[selectedId, 'codex'], [ordinaryId, 'claude']]) {
      state = assignCatToChannel(state, channelId, { catId, provider }, now);
    }
    const channel = buildChannelView(state, channelId);
    for (const catId of [selectedId, ordinaryId]) {
      const participant = channel.assignedCats.find(cat => cat.catId === catId);
      const envelope = await resolveRuntimeEnvelopeForTarget(state, channel, buildCatTarget(participant), undefined, undefined, now);
      const requested = envelope.skills?.requestedSkills ?? [];
      assert.deepEqual(requested, catId === selectedId ? [skill.id] : []);
      assert.equal(envelope.context.metadata.channelId, channelId);
    }
  });
}

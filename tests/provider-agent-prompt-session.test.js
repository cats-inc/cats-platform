import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderAgentPromptSession, MAX_PROVIDER_AGENT_SESSION_PROMPT_CHARACTERS }
  from '../build/server/platform/orchestration/providerAgentPromptSession.js';
import { knowledgeDigest } from '../build/server/platform/knowledge/productKnowledge.js';

function snapshot() {
  return { schema: 'cats.provider_agent.decision.v1', contractVersion: 1,
    decisionContract: { instructions: ['Return the complete decision shape.'], examples: [{ kind: 'semantic_plan' }] },
    observation: { observationId: 'turn-1', runId: 'run', goal: '修正 \\"錯誤\\"',
      policy: { toolScope: 'narrow_write' }, budget: { maxTokens: 80000 },
      availableTools: [{ manifest: { name: 'work.inspect', manifestVersion: '1.0', description: 'Read current work.' },
        inputHints: ['Input {} only.'] }] },
    productKnowledge: { status: 'ready', scope: { channelId: 'owner-room' }, contextDigest: 'assembled-1',
      entries: [{ id: 'procedure', revision: 1, digest: 'content-digest', sources: ['reviewed-source'],
        content: 'Read actual results before requesting dependent work.' }] }, toolResults: [],
  };
}
const prepare = (session, value, binding = 'target-and-run', id = 'coordinator') =>
  session.prepare(JSON.stringify(value), binding, id);

test('continuation retains fresh constraints, references exact delivered blocks and sends each receipt once', () => {
  const session = createProviderAgentPromptSession();
  const original = snapshot();
  const first = prepare(session, original, 'target-and-run', null);
  assert.equal(first.metadata.mode, 'bootstrap');
  assert.deepEqual(JSON.parse(first.content).productKnowledge.entries, original.productKnowledge.entries);
  assert.equal(first.metadata.wireDigest, knowledgeDigest(first.content));
  first.accept('coordinator');
  const current = structuredClone(original);
  current.observation.observationId = 'turn-2';
  current.observation.budget.maxTokens = 50000;
  current.productKnowledge.scope.channelId = 'verified-created-room';
  current.productKnowledge.contextDigest = 'assembled-2';
  current.toolResults = [{ toolName: 'work.inspect', decisionId: 'read-1', result: { status: 'applied', result: { revision: 'actual-head' } } }];
  const second = prepare(session, current);
  const wire = JSON.parse(second.content);
  const bootstrap = JSON.parse(first.content);
  assert.equal(wire.observation.availableTools[0].reference, bootstrap.contextDelivery.inlineTools[0].serializedDigest);
  assert.equal(wire.productKnowledge.entries[0].reference, bootstrap.contextDelivery.inlineEntries[0].serializedDigest);
  assert.equal(wire.contextDelivery.base.wireDigest, first.metadata.wireDigest);
  assert.equal(wire.contextDelivery.base.sessionId, 'coordinator');
  assert.deepEqual(wire.observation.budget, current.observation.budget);
  assert.deepEqual(wire.productKnowledge.scope, current.productKnowledge.scope);
  assert.deepEqual(wire.decisionContract, current.decisionContract);
  assert.equal(wire.productKnowledge.contextDigest, 'assembled-2');
  assert.equal(wire.observation.availableTools[0].reference, knowledgeDigest(JSON.stringify(original.observation.availableTools[0])));
  assert.equal(wire.productKnowledge.entries[0].reference, knowledgeDigest(JSON.stringify(original.productKnowledge.entries[0])));
  assert.equal(second.metadata.inlineEntries.length, 0);
  assert.equal(second.metadata.referencedEntries.length, 1);
  assert.deepEqual(wire.toolResults, current.toolResults);
  // Preparing alone does not claim receipt delivery.
  assert.deepEqual(JSON.parse(prepare(session, current).content).toolResults, current.toolResults);
  second.accept('coordinator');
  assert.deepEqual(JSON.parse(prepare(session, current).content).toolResults, []);
  assert.equal(current.toolResults.length, 1);
});

test('changed descriptor hints and knowledge provenance are resent even with unchanged names and revisions', () => {
  const session = createProviderAgentPromptSession();
  const current = snapshot();
  prepare(session, current).accept('coordinator');
  current.observation.availableTools[0].inputHints = ['A changed exact input restriction.'];
  current.productKnowledge.entries[0].sources = ['new-review-evidence'];
  const prepared = prepare(session, current);
  const wire = JSON.parse(prepared.content);
  assert.deepEqual(wire.observation.availableTools, current.observation.availableTools);
  assert.deepEqual(wire.productKnowledge.entries, current.productKnowledge.entries);
  assert.equal(prepared.metadata.inlineEntries.length, 1);
  assert.equal(prepared.metadata.referencedEntries.length, 0);
  prepared.accept('coordinator');
  const referenced = JSON.parse(prepare(session, current).content);
  assert.equal(referenced.observation.availableTools[0].reference, wire.contextDelivery.inlineTools[0].serializedDigest);
  assert.equal(referenced.productKnowledge.entries[0].reference, wire.contextDelivery.inlineEntries[0].serializedDigest);
});

test('terminal tools and unavailable knowledge remove selections; later reintroduction delivers full bytes', () => {
  const session = createProviderAgentPromptSession();
  const original = snapshot();
  prepare(session, original).accept('coordinator');
  const terminal = snapshot();
  terminal.observation.availableTools = [];
  terminal.productKnowledge.status = 'missing';
  terminal.productKnowledge.entries = [];
  const prepared = prepare(session, terminal);
  const wire = JSON.parse(prepared.content);
  assert.deepEqual(wire.observation.availableTools, []);
  assert.deepEqual(wire.productKnowledge.entries, []);
  assert.equal(wire.productKnowledge.status, 'missing');
  prepared.accept('coordinator');
  assert.deepEqual(JSON.parse(prepare(session, original).content).productKnowledge.entries, original.productKnowledge.entries);
});

test('unknown session, changed target/run and failed request reset all delivery references', () => {
  const session = createProviderAgentPromptSession();
  const current = snapshot();
  prepare(session, current).accept('coordinator');
  for (const [binding, id] of [['target-and-run', 'new-session'], ['changed-target', 'coordinator'], ['target-and-run', null]]) {
    const prepared = prepare(session, current, binding, id);
    assert.equal(prepared.metadata.mode, 'bootstrap');
    assert.equal(prepared.metadata.base, null);
    assert.deepEqual(JSON.parse(prepared.content).observation.availableTools, current.observation.availableTools);
  }
  session.reset();
  assert.equal(prepare(session, current).metadata.mode, 'bootstrap');
  assert.equal(prepare(createProviderAgentPromptSession(), current).metadata.mode, 'bootstrap');
});

test('wire limit covers escaped and CJK payloads and invalidates the previous base', () => {
  const session = createProviderAgentPromptSession();
  const current = snapshot();
  prepare(session, current).accept('coordinator');
  const oversized = snapshot();
  oversized.observation.goal = '\\"知識'.repeat(MAX_PROVIDER_AGENT_SESSION_PROMPT_CHARACTERS / 4);
  assert.throws(() => prepare(session, oversized), /provider_agent_prompt_limit/u);
  assert.equal(prepare(session, current).metadata.mode, 'bootstrap');
});

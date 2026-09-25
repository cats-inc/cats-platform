import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runPreparationAcceptance } from '../scripts/testing/orchestrator-preparation-acceptance.mjs';

const load = relative => import(new URL(`../build/server/${relative}`, import.meta.url));
const discover = 'chat.collaboration.discover_cats';
const inspect = 'chat.collaboration.inspect_context';
const prepare = 'chat.collaboration.prepare';
const respond = { contractVersion: 1, kind: 'semantic_plan', decisionId: 'response', planId: 'response',
  confidence: 'high', rationaleSummary: 'Only preparation is complete.',
  steps: [{ stepId: 'respond', summary: 'Report the real preparation result.', action: 'respond' }] };
const tool = (name, input) => ({ contractVersion: 1, kind: 'tool_request', decisionId: name, confidence: 'high',
  toolName: name, target: { kind: 'worker_tool', toolName: name }, input,
  expectedOutputSchemaRef: { id: `${name}.output`, version: '1.0', format: 'json_schema' },
  rationaleSummary: 'Use the actual current context.' });

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-k2-acceptance-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = { create: [], send: [], close: [], cancel: [] };
  const delivered = [];
  const runtime = {
    async getHealth() { return { reachable: true, status: 'ok', service: 'cats-runtime' }; },
    async getProviderConfig() { return {}; },
    async getProviderModels(provider) { return { provider, backend: 'cli', instance: 'native', models: [], warnings: [] }; },
    async getProviderDiagnostics() { return { probe: 'light', providers: ['native', 'coordinator'].map(instance => ({
      provider: 'codex', instance, defaultTarget: instance === 'native', availability: { status: 'ok', attentionCodes: [] } })) }; },
    async createSession(input) { calls.create.push(input); return { id: 'k2-decision', provider: 'codex', status: 'ready', cwd: null }; },
    async sendMessage(id, content) {
      const envelope = JSON.parse(content);
      calls.send.push(envelope);
      delivered.push(...envelope.toolResults);
      let decision;
      if (options.mode === 'ordinary') decision = respond;
      else if (calls.send.length === 1) decision = tool(discover, {});
      else if (calls.send.length === 2) decision = tool(inspect, {});
      else if (calls.send.length === 3) {
        const found = delivered.find(receipt => receipt.toolName === discover).result.result;
        decision = tool(prepare, { revision: found.revision,
          implementerId: found.candidates.find(cat => cat.name === 'Implementer').id,
          reviewerId: found.candidates.find(cat => cat.name === 'Reviewer').id,
          conversationIntent: 'create', expectedOutput: 'Fixed addition and independent revision review.',
          missingInformation: [], budget: { maxDurationMs: 120000, maxTokens: 4000 } });
      } else decision = respond;
      options.onSend?.();
      if (options.mode === 'pending') await new Promise(resolve => { runtime.release = resolve; });
      return { segments: [{ kind: 'text', text: options.mode === 'malformed' ? '{invalid' : JSON.stringify(decision),
        toolName: null, toolId: null }], tokensUsed: calls.send.length === 1 ? 10001 : 20 };
    },
    async closeSession(id) { calls.close.push(id); },
    async cancelSession(id) { calls.cancel.push(id); runtime.release?.(); },
  };
  const report = {};
  const run = () => runPreparationAcceptance({ load: options.load ?? load, root, workspace: path.join(root, 'fixture-repo'),
    target: { provider: 'codex', instance: 'native', model: 'fixture-model' },
    coordinatorTarget: { provider: 'codex', instance: 'cli/coordinator', model: 'fixture-model' },
    runtime, runtimeBaseUrl: 'http://127.0.0.1:1', runtimeApiKey: 'private-fixture',
    budget: { maxDurationMs: 60000, maxTokens: 20000 }, report,
    readinessOnly: options.readinessOnly, isCancelled: options.isCancelled });
  return { run, report, calls };
}

test('K2 acceptance drives authenticated production HTTP and reconciles real preparation receipts without admission', async t => {
  const h = await fixture(t);
  await h.run();
  assert.equal(h.report.status, 'prepared');
  assert.equal(h.report.acknowledged, true);
  assert.equal(h.report.noCollaborationAdmission, true);
  assert.equal(h.report.persistedReportMatches, true);
  assert.equal(h.report.platformServerClosed, true);
  assert.equal(h.report.collaboration.preparationUsage.measuredTokens, 10061);
  assert.equal(h.calls.create.length, 1);
  assert.equal(h.calls.send.length, 4);
  assert.deepEqual(h.calls.close, ['k2-decision']);
});

test('K2 readiness constructs authenticated fixture without creating sessions or submitting the goal', async t => {
  const h = await fixture(t, { readinessOnly: true });
  await h.run();
  assert.equal(h.report.status, 'ready');
  assert.equal(h.report.preparationReadiness.messageSubmitted, false);
  assert.equal(h.report.platformServerClosed, true);
  assert.equal(h.calls.create.length, 0);
  assert.equal(h.calls.send.length, 0);
});

test('private acceptance awaits the server startup-recovery promise before submitting model work', async t => {
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  let server;
  const h = await fixture(t, { load: async relative => {
    const module = await load(relative);
    return relative !== 'app/server/index.js' ? module : { createServer(dependencies) {
      dependencies.chat.telegramCommandSurfaceSync = { async reconcile() { entered(); await barrier; } };
      server = module.createServer(dependencies);
      return server;
    } };
  } });
  const pending = h.run();
  await started;
  let settled = false;
  server.startupRecovery.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(h.calls.create.length, 0);
  release();
  await pending;
  assert.equal(settled, true);
  assert.equal(h.report.status, 'prepared');
  assert.equal(h.report.platformServerClosed, true);
});

test('K2 acceptance retains rejected response usage and closes HTTP instead of claiming success', async t => {
  const h = await fixture(t, { mode: 'malformed' });
  await assert.rejects(h.run());
  assert.equal(h.report.collaboration.status, 'stopped');
  assert.equal(h.report.collaboration.preparationUsage.measuredTokens, 10001);
  assert.equal(h.report.platformServerClosed, true);
  assert.equal(h.calls.send.length, 1);
});

test('K2 acceptance fences ordinary fallback before forwarding any extra model session or inference', async t => {
  const h = await fixture(t, { mode: 'ordinary' });
  await assert.rejects(h.run());
  assert.equal(h.calls.create.length, 1);
  assert.equal(h.calls.send.length, 1);
  assert.equal(h.report.platformServerClosed, true);
});

test('K2 acceptance cancels its active Chat continuation before closing the private HTTP host', async t => {
  let cancelled = false;
  const h = await fixture(t, { mode: 'pending', onSend: () => { cancelled = true; }, isCancelled: () => cancelled });
  await assert.rejects(h.run(), /interrupted/);
  assert.equal(h.calls.create.length, 1);
  assert.equal(h.calls.send.length, 1);
  assert.ok(h.calls.cancel.includes('k2-decision'));
  assert.equal(h.report.platformServerClosed, true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createFixtureInputs } from '../tools/knowledge-practice/example.mjs';
import { createCandidate } from '../tools/knowledge-practice/candidate.mjs';
import { admitPractice, evaluatePractice } from '../tools/knowledge-practice/practice.mjs';
import { diagnosePractice, exportDevelopmentProposal } from '../tools/knowledge-practice/diagnosis.mjs';
import { readJson, readRecord } from '../tools/knowledge-practice/artifacts.mjs';
import { main } from '../tools/knowledge-practice/cli.mjs';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { importPracticeProposal } from '../build/server/products/work/state/practiceProposal.js';
import { routeWorkPracticeProposalApi } from '../build/server/products/work/api/practiceProposalRoutes.js';
import { upsertCoreTask } from '../build/server/core/model/index.js';

async function fixture(t, { heldOut = false, technical = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cats-practice-proposal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = await createFixtureInputs(root), runtimeRoot = join(root, 'runtime');
  await mkdir(join(runtimeRoot, 'build/runtime/core/skills'), { recursive: true });
  await writeFile(join(runtimeRoot, 'package.json'), '{"name":"@cats-inc/cats-runtime","type":"module"}');
  await writeFile(join(runtimeRoot, 'build/runtime/core/skills/contentPolicy.js'),
    'export const getRuntimeSkillContentPolicy = () => ({profile:"preview",fingerprint:"fixture-policy"});');
  const exercise = await readJson(paths.exerciseFile);
  exercise.budget.maxAttempts = 1; exercise.scenarios[0].heldOut = heldOut;
  exercise.scenarios[0].checks[2].equals = false;
  await writeFile(paths.exerciseFile, JSON.stringify(exercise));
  if (technical) await writeFile(paths.evaluatorFile, 'export async function attempt() { throw new Error("fixture outage"); }');
  await createCandidate({ draftFile: paths.draftFile, outputFile: paths.candidateFile });
  await admitPractice({ ...paths, runtimeRoot });
  await evaluatePractice({ runRoot: paths.runRoot, candidateFile: paths.candidateFile });
  const assessmentFile = join(root, 'assessment.json'), outputFile = join(root, 'proposal.json');
  const assessment = { category: 'product_defect', diagnosedBy: 'fixture-owner', title: 'Inspect the reported mismatch',
    summary: 'The selected observable check failed. Reproduce and verify the cause before making a change.' };
  await writeFile(assessmentFile, JSON.stringify(assessment));
  return { ...paths, root, assessment, assessmentFile, outputFile, attemptId: '0001' };
}

test('explicit diagnosis keeps failure evidence and exports only a bounded non-executable proposal', async t => {
  const f = await fixture(t);
  const before = await readFile(join(f.runRoot, 'evaluation.json'));
  const result = await main(['diagnose', '--run', f.runRoot, '--attempt', f.attemptId, '--assessment', f.assessmentFile]);
  assert.equal(result.category, 'product_defect');
  const diagnosis = await readRecord(f.runRoot, 'diagnosis-0001.json');
  assert.equal(diagnosis.technicalFailure, 'assertion_failed');
  assert.deepEqual(await diagnosePractice(f), diagnosis);
  await main(['propose-development', '--run', f.runRoot, '--attempt', f.attemptId, '--out', f.outputFile]);
  const proposal = await readJson(f.outputFile);
  assert.equal(proposal.evidenceMode, 'fixture'); assert.equal(proposal.category, 'product_defect');
  assert.equal(JSON.stringify(proposal).includes('catlas-new-code'), false);
  assert.equal(JSON.stringify(proposal).includes(f.root), false);
  assert.equal(Object.hasOwn(proposal, 'executionGrant'), false);
  assert.deepEqual(await readFile(join(f.runRoot, 'evaluation.json')), before);
  await assert.rejects(exportDevelopmentProposal(f), /EEXIST/u);
  await writeFile(f.assessmentFile, JSON.stringify({ ...f.assessment, summary: 'Changed diagnosis' }));
  await assert.rejects(diagnosePractice(f), /cannot be replaced/u);
});

test('knowledge, procedure and environment diagnoses do not become code proposals', async t => {
  for (const category of ['missing_knowledge', 'procedure_error', 'environment_failure']) {
    const f = await fixture(t);
    await writeFile(f.assessmentFile, JSON.stringify({ ...f.assessment, category }));
    assert.equal((await diagnosePractice(f)).category, category);
    await assert.rejects(exportDevelopmentProposal(f), /Only product defects/u);
  }
});

test('outage-only, held-out, unsanitized or changed evidence cannot export a code proposal', async t => {
  const outage = await fixture(t, { technical: true });
  await assert.rejects(diagnosePractice(outage), /technical outage/u);
  const held = await fixture(t, { heldOut: true });
  await diagnosePractice(held); await assert.rejects(exportDevelopmentProposal(held), /Held-out diagnoses/u);
  const f = await fixture(t);
  await writeFile(f.assessmentFile, JSON.stringify({ ...f.assessment, summary: 'Bearer super-secret' }));
  await assert.rejects(diagnosePractice(f), /sanitization/u);
  const file = join(f.runRoot, 'attempt-0001.json'), record = await readJson(file);
  record.payload.failureClass = 'fabricated'; await writeFile(file, JSON.stringify(record));
  await assert.rejects(diagnosePractice(f), /Unauthenticated/u);
});

test('owner import creates one pending task with source digests and no execution, preserving later state', async t => {
  const f = await fixture(t); await diagnosePractice(f); await exportDevelopmentProposal(f);
  const proposal = await readJson(f.outputFile), store = new MemoryChatStore();
  const before = await store.readCore();
  const imported = await importPracticeProposal(store, proposal);
  assert.equal(imported.created, true);
  let core = await store.readCore(), task = core.tasks.find(row => row.id === imported.taskId);
  assert.equal(task.status, 'pending_approval'); assert.equal(task.approval.status, 'pending');
  assert.match(task.title, /^\[fixture\]/u); assert.equal(task.metadata.verification, 'owner_supplied_unverified');
  assert.deepEqual(task.metadata.practiceProposal, proposal); assert.deepEqual(task.assignedActorIds, []);
  assert.deepEqual(core.runs, before.runs); assert.equal(Object.hasOwn(task.metadata, 'executionGrant'), false);
  await store.updateCore(state => upsertCoreTask(state, { ...task, status: 'cancelled' }).core);
  assert.equal((await importPracticeProposal(store, proposal)).created, false);
  assert.equal((await store.readCore()).tasks.find(row => row.id === task.id).status, 'cancelled');
  await assert.rejects(importPracticeProposal(store, { ...proposal, summary: 'A different proposal' }), /conflict/u);
  await assert.rejects(importPracticeProposal(store, { ...proposal, executionGrant: { approved: true } }), /invalid/u);
  for (const evidenceMode of [['fixture'], null, { value: 'fixture' }]) {
    await assert.rejects(importPracticeProposal(store, { ...proposal, evidenceMode }), /invalid/u);
  }
  const server = createServer((request, response) => { void routeWorkPracticeProposalApi({ request, response,
    url: new URL(request.url, 'http://localhost'), method: request.method,
    auth: { principal: { membership: { roles: [String(request.headers['x-role'] ?? 'member')] } } },
    dependencies: { coreStore: store } }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/work/practice-proposals`;
  const send = (role, body) => fetch(url, { method: 'POST', headers: { 'x-role': role }, body: JSON.stringify(body) });
  assert.equal((await send('member', { confirmed: true, proposal })).status, 403);
  assert.equal((await send('owner', { confirmed: false, proposal })).status, 409);
  assert.equal((await send('admin', { confirmed: true, proposal })).status, 200);
});

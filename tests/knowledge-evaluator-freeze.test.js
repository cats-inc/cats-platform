import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { loadCatlasKnowledge } from '../build/server/platform/catlas/knowledge.js';
import { assembleProductKnowledgeContext } from '../build/server/platform/knowledge/productKnowledge.js';
import { freezeEvaluator, verifyFrozenEvaluator } from '../tools/knowledge-practice/freezeEvaluator.mjs';
import { EVALUATOR_MAX_BYTES, canonical, digest, readJson, readRecord } from '../tools/knowledge-practice/artifacts.mjs';
import { admitPractice, evaluatePractice, frozenInputs } from '../tools/knowledge-practice/practice.mjs';
import { createFixtureInputs } from '../tools/knowledge-practice/example.mjs';
import { createPreservationFixture } from '../tools/knowledge-practice/preservationFixture.mjs';
import { createCandidate } from '../tools/knowledge-practice/candidate.mjs';
import { verifyEvaluation } from '../tools/knowledge-practice/promotion.mjs';
import { inspectCatlasEffects } from '../tools/knowledge-practice/inspectEffects.mjs';
import { main } from '../tools/knowledge-practice/cli.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const modulePath = relative => JSON.stringify(join(project, relative).replaceAll('\\', '/'));
async function setup(t, source = 'export async function attempt() { return "frozen"; }') {
  const root = await mkdtemp(join(tmpdir(), 'cats-evaluator-freeze-'));
  t.after(async () => {
    assert.ok(root.startsWith(join(tmpdir(), 'cats-evaluator-freeze-')));
    await rm(root, { recursive: true, force: true });
  });
  const sourceRoot = join(root, 'source'), authorRoot = join(root, 'author'), outputRoot = join(root, 'artifact');
  await mkdir(sourceRoot); await mkdir(authorRoot);
  const entryFile = join(sourceRoot, 'entry.mjs'); await writeFile(entryFile, source);
  const args = { entryFile, outputRoot, authorRoots: [authorRoot] };
  return { root, sourceRoot, authorRoot, entryFile, outputRoot, args, freeze: () => freezeEvaluator(args) };
}

test('freeze never executes entry code and records its exact static JS/JSON compiler inputs', async t => {
  const f = await setup(t);
  const marker = join(f.root, 'executed');
  await writeFile(f.entryFile, `import { writeFileSync } from 'node:fs';
    import { value } from './dependency.mjs'; import rubric from './rubric.json';
    writeFileSync(${JSON.stringify(marker)}, 'executed');
    export async function attempt() { return { value, criterion: rubric.criterion }; }`);
  await writeFile(join(f.sourceRoot, 'dependency.mjs'), 'export const value = "original";');
  await writeFile(join(f.sourceRoot, 'rubric.json'), '{"criterion":"public fixture"}');
  const frozen = await main(['freeze-evaluator', '--entry', f.entryFile, '--out', f.outputRoot, '--author-root', f.authorRoot]);
  assert.equal(frozen.providerCalls, 0); assert.equal(frozen.inputCount, 3);
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
  const { manifest, manifestDigest } = await verifyFrozenEvaluator(f.outputRoot);
  assert.equal(manifestDigest, frozen.manifestDigest); assert.equal(manifest.status, 'complete');
  assert.equal(manifest.compiler.nodeVersion, process.versions.node); assert.equal(manifest.compiler.recipe.packages, 'bundle');
  for (const input of manifest.inputs) {
    assert.equal(input.sha256, digest(await readFile(input.path)));
    assert.equal(input.compilerSha256, input.sha256);
  }
  await writeFile(join(f.sourceRoot, 'dependency.mjs'), 'export const value = "changed";');
  const relocated = join(f.root, 'relocated'); await mkdir(relocated);
  for (const file of ['evaluator.mjs', 'manifest.json']) await copyFile(join(f.outputRoot, file), join(relocated, file));
  assert.equal(f.sourceRoot, join(f.root, 'source'));
  await rm(f.sourceRoot, { recursive: true });
  const copy = await verifyFrozenEvaluator(relocated);
  assert.equal(copy.manifestDigest, frozen.manifestDigest);
  const evaluator = await import(pathToFileURL(copy.evaluatorFile));
  assert.deepEqual(await evaluator.attempt(), { value: 'original', criterion: 'public fixture' });
  assert.equal(await readFile(marker, 'utf8'), 'executed');
});

test('literal dynamic imports are bundled while retaining no source dependency', async t => {
  const f = await setup(t, 'export async function attempt() { return (await import("./literal.mjs")).value; }');
  await writeFile(join(f.sourceRoot, 'literal.mjs'), 'export const value = 9;');
  const frozen = await f.freeze(); assert.equal(frozen.inputCount, 2);
  await rm(join(f.sourceRoot, 'literal.mjs'));
  assert.equal(await (await import(pathToFileURL(frozen.evaluatorFile))).attempt(), 9);
});

for (const [name, code] of [
  ['computed-import', 'export async function attempt() { return import(globalThis.moduleName); }'],
  ['nested-require', 'export async function attempt() { function nested() { return require("node:fs"); } return nested(); }'],
  ['nested-eval', 'export async function attempt() { return (() => eval("1"))(); }'],
  ['function-constructor', 'export async function attempt() { return new Function("return 1")(); }'],
  ['module-loader', 'import { createRequire as loader } from "node:module"; export function attempt() { return loader(import.meta.url)("some-module"); }'],
  ['unresolved-import', 'import "unresolved-evaluator-dependency"; export function attempt() {}'],
  ['no-attempt-export', 'export function renamed() {}'],
]) test(`freeze rejects ${name} without executing the input or materializing an artifact`, async t => {
  const f = await setup(t, code);
  await assert.rejects(f.freeze());
  await assert.rejects(readFile(join(f.outputRoot, 'evaluator.mjs')), { code: 'ENOENT' });
});

for (const alias of [false, true]) test(`author-owned transitive inputs are rejected${alias ? ' through a directory alias' : ''}`, async t => {
  const f = await setup(t);
  await writeFile(join(f.authorRoot, 'answer.mjs'), 'export function attempt() { return true; }');
  let dependency = f.authorRoot;
  if (alias) {
    dependency = join(f.sourceRoot, 'alias');
    await symlink(f.authorRoot, dependency, process.platform === 'win32' ? 'junction' : 'dir');
  }
  await writeFile(f.entryFile, `export { attempt } from ${JSON.stringify(join(dependency, 'answer.mjs').replaceAll('\\', '/'))};`);
  await assert.rejects(f.freeze(), /disjoint/u);
});

test('exclusive output and complete-manifest verification prevent replacement or partial acceptance', async t => {
  const f = await setup(t), first = await f.freeze();
  await assert.rejects(f.freeze(), { code: 'EEXIST' });
  assert.equal((await verifyFrozenEvaluator(f.outputRoot)).manifest.evaluatorDigest, first.evaluatorDigest);
  await writeFile(first.evaluatorFile, 'export function attempt() { return "tampered"; }');
  await assert.rejects(verifyFrozenEvaluator(f.outputRoot));
  const partial = join(f.root, 'partial'); await mkdir(partial);
  await copyFile(first.evaluatorFile, join(partial, 'evaluator.mjs'));
  await assert.rejects(verifyFrozenEvaluator(partial), { code: 'ENOENT' });
  await writeFile(join(partial, 'manifest.json'), '{"status":');
  await assert.rejects(verifyFrozenEvaluator(partial), SyntaxError);
});

test('bundled production Catlas helper runs away from the checkout with frozen SDK version and JSON knowledge', async t => {
  const f = await setup(t);
  const baselineFile = join(f.sourceRoot, 'baseline.json');
  await copyFile(join(project, 'config/catlas-knowledge.json'), baselineFile);
  await writeFile(join(f.sourceRoot, 'sealed.json'), JSON.stringify({ text: await readFile(baselineFile, 'utf8') }));
  await writeFile(f.entryFile, `
    import { dirname, join } from 'node:path';
    import { writeFile } from 'node:fs/promises';
    import { createCatlasEvaluator } from ${modulePath('tools/knowledge-practice/catlasEvaluator.mjs')};
    import { loadProductKnowledge } from ${modulePath('build/server/platform/knowledge/productKnowledge.js')};
    import { PLATFORM_VERSION } from ${modulePath('packages/app-sdk/package.js')};
    import baseline from './sealed.json';
    export const version = PLATFORM_VERSION;
    export async function attempt(args) {
      const filePath = join(args.fixtureRoot, 'baseline.json');
      await writeFile(filePath, baseline.text);
      const knowledge = await loadProductKnowledge({ filePath, locale: args.context.locale, capabilities: ['code-entry-v1'] });
      const session = { id: 'public-session', provider: 'fixture', providerName: 'fixture', model: 'public-model',
        providerTarget: { resolved: true, provider: 'fixture', target: 'cli/public' },
        workspace: { kind: 'sandbox', access: 'read_only' }, permissionMode: 'default',
        skills: { strict: true, requestedSkills: [], appliedSkillIds: [] } };
      return createCatlasEvaluator({ evaluationRoot: dirname(dirname(args.fixtureRoot)),
        authorId: 'public-author', reviewerId: 'public-reviewer',
        guideCat: { id: 'guide-cat-primary', modelSelection: null,
          executionTarget: { provider: 'fixture', instance: 'cli/public', model: 'public-model' } },
        runtimeClient: { createSession: async () => session, observeSession: async () => ({ session }),
          sendMessage: async () => ({ tokensUsed: 5, segments: [{ kind: 'text', text: JSON.stringify({
            advice: 'Select a coding target.', knowledgeIds: ['code.entry'] }) }] }),
          closeSession: async () => {}, cancelSession: async () => {} },
        loadKnowledge: async () => knowledge,
        resolveRubric: async () => [{ id: 'public', criterion: 'Public plumbing fixture only.' }],
        judge: async ({ response, responseDigest }) => ({ responseDigest, reviewerId: 'public-reviewer', usageTokens: 0,
          decisions: [{ id: 'public', verdict: 'pass', rationale: 'Public fixture.', evidenceSpans: [{ start: 0, end: response.advice.length }] }] }),
        confirmCleanup: async () => ({ status: 'complete', evidenceRefs: ['fixture:cleanup'] })
      })(args);
    }`);
  const frozen = await f.freeze(), { manifest } = await verifyFrozenEvaluator(f.outputRoot);
  const packageVersion = (await readJson(join(project, 'package.json'))).version;
  assert.equal(frozen.platformVersion, packageVersion);
  const sdk = manifest.inputs.find(input => input.path.endsWith(join('packages', 'app-sdk', 'package.js')));
  assert.ok(sdk); assert.notEqual(sdk.compilerSha256, sdk.sha256);
  assert.ok(manifest.inputs.some(input => input.path === join(project, 'package.json')));
  assert.ok(!manifest.imports.includes('node:module'));
  assert.deepEqual(manifest.transforms, [{ id: 'app-sdk-platform-version', value: packageVersion }]);
  assert.ok(!await readFile(frozen.evaluatorFile, 'utf8').then(code => code.includes('createRequire')));
  const resetId = randomUUID(), fixtureRoot = join(f.root, 'resets', resetId); await mkdir(fixtureRoot, { recursive: true });
  const observation = { surface: 'code:new', observedAt: '2026-09-26T00:00:00Z', runtimeReachable: true,
    draftTarget: null, targetAvailability: 'unselected', effectiveSessionAccess: 'not_started',
    workspace: { selection: 'unselected', inspectionHost: 'platform', gitStatus: 'unknown' },
    requestedPolicy: { workspaceKind: 'sandbox', workspaceAccess: 'read_only', permissionMode: 'default' } };
  const knowledge = await loadCatlasKnowledge({ filePath: baselineFile, locale: 'en' });
  const context = assembleProductKnowledgeContext(knowledge, { role: 'catlas', surface: 'code-help', locale: 'en',
    goal: 'How do I begin?', scope: observation, topics: ['execution', 'workspace', 'permissions', 'recovery'], operations: [] });
  assert.equal(f.sourceRoot, join(f.root, 'source')); await rm(f.sourceRoot, { recursive: true });
  const evaluator = await import(pathToFileURL(frozen.evaluatorFile));
  assert.equal(evaluator.version, packageVersion);
  const result = await evaluator.attempt({ fixture: { question: context.goal, observation, rubricId: 'public' },
    fixtureRoot, resetId, context, signal: new AbortController().signal });
  assert.equal(result.observed.responseValid, true); assert.equal(result.observed.semantic.public, true);
  assert.equal(result.usageTokens, 5); assert.equal(result.cleanup, 'complete');
});

test('freeze, admission and verification share the exact bounded evaluator size limit', async t => {
  const f = await setup(t, `export function attempt() { return ${JSON.stringify('x'.repeat(EVALUATOR_MAX_BYTES))}; }`);
  await assert.rejects(f.freeze(), /artifact budget/u);
  const paths = await createFixtureInputs(join(f.root, 'practice'));
  const runtimeRoot = join(f.root, 'runtime'); await mkdir(join(runtimeRoot, 'build/runtime/core/skills'), { recursive: true });
  await writeFile(join(runtimeRoot, 'package.json'), '{"name":"@cats-inc/cats-runtime","type":"module"}');
  await writeFile(join(runtimeRoot, 'build/runtime/core/skills/contentPolicy.js'),
    'export const getRuntimeSkillContentPolicy = () => ({profile:"preview",fingerprint:"fixture"});');
  const code = 'export function attempt() {}\n';
  const exact = code + ' '.repeat(EVALUATOR_MAX_BYTES - Buffer.byteLength(code));
  await writeFile(paths.evaluatorFile, `${exact} `);
  await assert.rejects(admitPractice({ ...paths, runtimeRoot }), /bounded regular artifact/u);
  await writeFile(paths.evaluatorFile, exact);
  await admitPractice({ ...paths, runtimeRoot });
  assert.ok((await frozenInputs(paths.runRoot)).admission.evaluatorDigest);
  await writeFile(join(paths.runRoot, 'evaluator.mjs'), `${exact} `);
  await assert.rejects(frozenInputs(paths.runRoot), /bounded regular artifact/u);
});

test('container observer and read transport freeze without executing Docker or retaining checkout imports', async t => {
  const f = await setup(t, `
    export { createDockerExitObserver, createDockerReadClient } from ${modulePath('tools/knowledge-practice/dockerObserver.mjs')};
    export function attempt() { throw new Error('Not an evaluation fixture'); }
  `);
  await f.freeze();
  const { manifest } = await verifyFrozenEvaluator(f.outputRoot);
  assert.ok(manifest.inputs.some(input => input.path === join(project,'tools/knowledge-practice/dockerObserver.mjs')));
  assert.ok(manifest.imports.includes('node:child_process'));
  assert.ok(manifest.imports.every(name => name.startsWith('node:')));
});

test('one frozen closure supplies Runtime judge, parent and worker after their source tree is removed', { timeout: 30_000 }, async t => {
  const f = await setup(t), paths = await createPreservationFixture(join(f.root, 'practice'));
  const exercise = await readJson(paths.exerciseFile);
  const observation = { surface: 'code:new', observedAt: '2026-09-26T00:00:00Z', runtimeReachable: true,
    draftTarget: null, targetAvailability: 'unselected', effectiveSessionAccess: 'not_started',
    workspace: { selection: 'unselected', inspectionHost: 'platform', gitStatus: 'unknown' },
    requestedPolicy: { workspaceKind: 'sandbox', workspaceAccess: 'read_only', permissionMode: 'default' } };
  for (const scenario of exercise.scenarios) {
    scenario.fixture = { question: 'How do I begin?', observation, rubricId: 'public' };
    scenario.context.goal = scenario.fixture.question; scenario.context.scope = observation;
    scenario.context.topics = ['execution', 'workspace', 'permissions', 'recovery'];
    scenario.checks = [
      { id: 'valid', kind: 'correctness', critical: true, path: '/responseValid', equals: true },
      { id: 'useful', kind: 'correctness', critical: true, path: '/semantic/useful', equals: true },
    ];
  }
  exercise.budget.maxAttempts = 1; await writeFile(paths.exerciseFile, canonical(exercise));
  await writeFile(join(f.sourceRoot, 'binding.json'), JSON.stringify({
    target: { provider: 'fixture', instance: 'cli/public', model: 'public-model' },
    rubric: [{ id: 'useful', criterion: 'Public frozen plumbing fixture.' }],
    baselineText: await readFile(paths.baselineFile, 'utf8'),
  }));
  await writeFile(f.entryFile, `
    import { dirname, join } from 'node:path';
    import { writeFile } from 'node:fs/promises';
    import { createCatlasEvaluator } from ${modulePath('tools/knowledge-practice/catlasEvaluator.mjs')};
    import { createCatlasEffectClient } from ${modulePath('tools/knowledge-practice/catlasEffectClient.mjs')};
    import { createCatlasEffectSupervisor } from ${modulePath('tools/knowledge-practice/catlasEffects.mjs')};
    import { createRuntimeKnowledgeJudge } from ${modulePath('tools/knowledge-practice/runtimeJudge.mjs')};
    import { loadProductKnowledge } from ${modulePath('build/server/platform/knowledge/productKnowledge.js')};
    import binding from './binding.json';
    export function createSupervisor({ evaluationRoot }) {
      const session = { id: 'public-session', provider: binding.target.provider, providerName: binding.target.provider,
        model: binding.target.model, providerTarget: { resolved: true, provider: binding.target.provider, target: binding.target.instance },
        workspace: { kind: 'sandbox', access: 'read_only' }, permissionMode: 'default',
        skills: { strict: true, requestedSkills: [], appliedSkillIds: [] } };
      const reviewerSession = { ...session, id: 'public-reviewer-session' };
      const reviewer = createRuntimeKnowledgeJudge({ evaluationRoot, target: binding.target,
        authorId: 'public-author', reviewerId: 'public-reviewer',
        runtimeClient: { createSession: async () => reviewerSession, observeSession: async () => ({ session: reviewerSession }),
          sendMessage: async (_id, content) => {
            const { response, responseDigest, criteria } = JSON.parse(content);
            if (criteria[0].criterion !== binding.rubric[0].criterion) throw new Error('Rubric changed');
            return { tokensUsed: 7, segments: [{ kind: 'text', text: JSON.stringify({ responseDigest,
              decisions: [{ id: 'useful', verdict: 'pass', rationale: 'Public fixture.', evidenceQuotes: [response.advice] }] }) }] };
          }, closeSession: async () => {}, cancelSession: async () => {} },
        observeCleanup: async () => ({ status: 'complete', evidenceRefs: ['fixture:frozen-reviewer-cleanup'] }) });
      return createCatlasEffectSupervisor({ evaluationRoot, target: binding.target,
        runtimeClient: { createSession: async () => session, observeSession: async () => ({ session }),
          sendMessage: async () => ({ tokensUsed: 42, segments: [{ kind: 'text', text: JSON.stringify({
            advice: 'Select a coding target.', knowledgeIds: ['code.entry'] }) }] }),
          closeSession: async () => {}, cancelSession: async () => {} },
        judge: reviewer.judge,
        confirmCleanup: async input => input.stage === 'reviewer' ? reviewer.confirmCleanup(input)
          : { status: 'complete', evidenceRefs: ['fixture:frozen-cleanup'] },
        reconcile: async () => ({ status: 'complete', evidenceRefs: ['fixture:frozen-reconcile'] }) });
    }
    export async function attempt(args) {
      const effects = createCatlasEffectClient({ port: args.effectPort, resetId: args.resetId });
      const filePath = join(args.fixtureRoot, 'baseline.json'); await writeFile(filePath, binding.baselineText);
      const knowledge = await loadProductKnowledge({ filePath, locale: args.context.locale, capabilities: ['code-entry-v1'] });
      return createCatlasEvaluator({ evaluationRoot: dirname(dirname(args.fixtureRoot)), ...effects,
        authorId: 'public-author', reviewerId: 'public-reviewer',
        guideCat: { id: 'guide-cat-primary', modelSelection: null, executionTarget: binding.target },
        loadKnowledge: async () => knowledge, resolveRubric: async () => binding.rubric })(args);
    }`);
  const frozen = await f.freeze(), { manifest } = await verifyFrozenEvaluator(f.outputRoot);
  for (const name of ['catlasEffects.mjs', 'catlasEffectClient.mjs', 'catlasEvaluator.mjs', 'runtimeJudge.mjs']) {
    assert.ok(manifest.inputs.some(input => input.path === join(project, 'tools/knowledge-practice', name)));
  }
  assert.ok(manifest.inputs.some(input => input.path === join(f.sourceRoot, 'binding.json')));
  assert.ok(manifest.imports.every(name => name.startsWith('node:')));
  const runtimeRoot = join(f.root, 'runtime'); await mkdir(join(runtimeRoot, 'build/runtime/core/skills'), { recursive: true });
  await writeFile(join(runtimeRoot, 'package.json'), '{"name":"@cats-inc/cats-runtime","type":"module"}');
  await writeFile(join(runtimeRoot, 'build/runtime/core/skills/contentPolicy.js'),
    'export const getRuntimeSkillContentPolicy = () => ({profile:"preview",fingerprint:"fixture"});');
  await createCandidate({ draftFile: paths.draftFile, outputFile: paths.candidateFile });
  const admission = await admitPractice({ ...paths, evaluatorFile: frozen.evaluatorFile, runtimeRoot });
  assert.equal(admission.evaluatorDigest, frozen.evaluatorDigest);
  assert.equal(f.sourceRoot, join(f.root, 'source')); await rm(f.sourceRoot, { recursive: true });
  assert.equal((await verifyFrozenEvaluator(f.outputRoot)).manifest.evaluatorDigest, admission.evaluatorDigest);
  const { createSupervisor } = await import(pathToFileURL(frozen.evaluatorFile));
  const supervisor = createSupervisor({ evaluationRoot: paths.runRoot });
  const feedback = await evaluatePractice({ runRoot: paths.runRoot, candidateFile: paths.candidateFile, effectSupervisor: supervisor });
  await supervisor.drain();
  assert.equal(feedback.completedAttempts, 1); assert.equal(feedback.productionEligible, false);
  assert.equal(feedback.stopReason, 'budget_exhausted');
  const result = await verifyEvaluation(paths.runRoot), row = await readRecord(paths.runRoot, 'attempt-0001.json');
  assert.equal(row.phase, 'baseline');
  assert.deepEqual(result.evaluation.usage, { measuredTokens: 49, tokensComplete: true });
  assert.equal(row.failureClass, null); assert.ok(row.checks.every(check => check.passed));
  const retained = await inspectCatlasEffects({ evaluationRoot: paths.runRoot, resetId: row.resetId });
  assert.equal(retained.structuralStatus, 'consistent'); assert.equal(retained.recordedKnownTokens, 49);
  assert.equal(retained.usageUncertain, false); assert.equal(retained.currentCleanup, 'unobserved');
  assert.equal(retained.replayAllowed, false);
  const judge = await readJson(join(paths.runRoot, 'resets', row.resetId, 'judge/result.json'));
  assert.equal(judge.sessionId, 'public-reviewer-session'); assert.equal(judge.usageTokens, 7);
  assert.equal(judge.result.decisions[0].verdict, 'pass'); assert.equal(judge.cleanup, 'complete');
  assert.equal(judge.failure, null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { catlasFixture, catlas } from './fixtures/catlasAssist.js';
import { createCatlasAssistEvaluator, validateCatlasAssistFixture } from '../tools/knowledge-practice/catlasEvaluator.mjs';
import { catlasAttentionFixtures, catlasAttentionRubric } from '../tools/knowledge-practice/catlasAssistFixtures.mjs';

test('manual attention fixtures cover Chat, Code and Work and reject transcript data', () => {
  assert.equal(catlasAttentionFixtures.length, 6);
  for (const fixture of catlasAttentionFixtures) assert.equal(validateCatlasAssistFixture(fixture), fixture);
  const invalid = structuredClone(catlasAttentionFixtures[0]);
  invalid.snapshot.activeProjects[0].body = 'must not enter attention input';
  assert.throws(() => validateCatlasAssistFixture(invalid));
});

test('attention evaluator checks structural validity and retains an independent semantic judgment', async t => {
  const fixture = catlasAttentionFixtures[0];
  const f = await catlasFixture(t, () => ({ surfaces: [{ scopeKey: fixture.scopeKey, operations: [],
    recommendations: [{ action: 'prefill', basis: ['approval-release'], surface: 'work', label: 'Release plan', prompt: 'Review the release plan awaiting approval.' }] }] }));
  f.runtimeClient.observeSession = async id => ({ session: { id, providerName: 'claude', model: 'fixture',
    workspace: { kind: 'sandbox', access: 'read_only' }, permissionMode: 'default', hydration: {}, inspection: {} } });
  const resetId = randomUUID(), fixtureRoot = join(f.root, 'resets', resetId);
  await mkdir(fixtureRoot, { recursive: true });
  const evaluate = createCatlasAssistEvaluator({ evaluationRoot: f.root, runtimeClient: f.runtimeClient,
    guideCat: catlas, authorId: 'author', reviewerId: 'reviewer',
    resolveRubric: async () => catlasAttentionRubric,
    judge: async input => ({ reviewerId: input.reviewerId, responseDigest: input.responseDigest, usageTokens: 1,
      decisions: input.criteria.map(criterion => ({ id: criterion.id, verdict: 'pass', rationale: 'Public fixture only.', evidenceSpans: [{ start: 0, end: 1 }] })) }),
    confirmCleanup: async () => ({ status: 'complete', evidenceRefs: ['fixture-cleanup'] }),
  });
  const result = await evaluate({ fixture, fixtureRoot, resetId, signal: new AbortController().signal });
  assert.equal(result.passed, true);
  assert.equal(f.calls.close.length, 1);
  assert.equal(JSON.parse(await readFile(join(fixtureRoot, 'catlas-assist-assessment.json'), 'utf8')).passed, true);
});

test('attention evaluator closure freezes within the unchanged 256 KiB limit without UI catalogs', async t => {
  const { freezeEvaluator } = await import('../tools/knowledge-practice/freezeEvaluator.mjs');
  const { writeFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const f = await catlasFixture(t);
  const entry = join(f.root, 'entry.mjs');
  const library = fileURLToPath(new URL('../tools/knowledge-practice/catlasEvaluator.mjs', import.meta.url)).replaceAll('\\', '/');
  const fixtures = fileURLToPath(new URL('../tools/knowledge-practice/catlasAssistFixtures.mjs', import.meta.url)).replaceAll('\\', '/');
  await writeFile(entry, `import { createCatlasAssistEvaluator } from ${JSON.stringify(library)};
    import { catlasAttentionFixtures } from ${JSON.stringify(fixtures)};
    export async function attempt(input) {
      return createCatlasAssistEvaluator(input.harness)({ ...input, fixture: input.fixture ?? catlasAttentionFixtures[0] });
    }`);
  const frozen = await freezeEvaluator({ entryFile: entry, outputRoot: join(f.root, 'frozen'), authorRoots: [join(f.root, 'author')] });
  assert.equal(frozen.providerCalls, 0);
  assert.ok((await readFile(frozen.evaluatorFile)).length <= 256 * 1024);
  const manifest = JSON.parse(await readFile(frozen.manifestFile, 'utf8'));
  assert.ok(!manifest.inputs.some(input => /i18n[\\/]catalogs/u.test(input.path)));
  assert.equal(f.calls.create.length, 0);
});

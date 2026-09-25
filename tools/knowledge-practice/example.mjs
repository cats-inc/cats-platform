// A deterministic transport/selection fixture. Public cases are not a production holdout.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { writeNew } from './artifacts.mjs';

export const FIXTURE_EVALUATOR = `export async function attempt({ fixture, context, signal }) {
  signal.throwIfAborted();
  return {
    observed: {
      bounded: JSON.stringify(context).length <= 16000,
      scoped: context.entries.every(entry => entry.roles.includes(context.role)
        && entry.surfaces.includes(context.surface)
        && entry.requiredOperations.every(required => context.operations.some(op => op.id === required.id && op.version === required.version))),
      knowledgeAvailable: context.entries.some(entry => entry.id === fixture.entryId),
    },
    usageTokens: 0, interventions: 0, cleanup: 'complete', evidenceRefs: ['fixture:knowledge-selection'],
  };
}
`;

export async function createFixtureInputs(root, { consumer } = {}) {
  assert.ok(consumer === undefined || ['catlas', 'orchestrator'].includes(consumer), 'Select catlas or orchestrator.');
  const owner = join(root, 'evaluator-inputs'), author = join(root, 'author');
  await mkdir(owner, { recursive: true }); await mkdir(author, { recursive: true });
  const guide = { id: 'practice.guide', revision: 1, roles: ['catlas'], kind: 'concept',
    surfaces: ['code-help'], topics: ['code'], requiredOperations: [],
    content: { en: 'Fixture: identify the requested Code workspace and explain what is still unknown.',
      'zh-TW': '測試用知識：辨認使用者要求的 Code 工作區，說明哪些狀態尚未確認。' } };
  const procedure = { id: 'practice.coordination', revision: 1, roles: ['orchestrator'], kind: 'procedure',
    surfaces: ['chat-visible', 'chat-decision'], topics: ['collaboration'],
    requiredOperations: [{ id: 'chat.collaboration.inspect_context', version: '1.0' }],
    content: { en: 'Fixture: inspect the current conversation before proposing collaborators. Report observed results separately from proposed work.',
      'zh-TW': '測試用知識：先檢查目前對話，再提議合作成員。分別陳述觀察結果與工作提案。' } };
  if (consumer === 'catlas') {
    Object.assign(procedure, { roles: ['catlas'], kind: 'concept', surfaces: ['code-help'], requiredOperations: [],
      content: { en: 'Fixture: explain the next collaboration step from current observations and identify missing information.',
        'zh-TW': '測試用知識：根據目前觀察解釋下一個合作步驟，並指出尚缺的資訊。' } });
  } else if (consumer === 'orchestrator') {
    Object.assign(guide, { roles: ['orchestrator'], surfaces: ['chat-visible', 'chat-decision'], topics: ['collaboration'],
      content: { en: 'Fixture: state the current conversation goal and distinguish observations from proposals.',
        'zh-TW': '測試用知識：陳述目前對話目標，區分觀察結果與提案。' } });
  }
  const requiredCapabilities = consumer === 'catlas' ? ['code-entry-v1']
    : consumer === 'orchestrator' ? ['orchestrator-context-v1'] : ['code-entry-v1', 'orchestrator-context-v1'];
  const knowledge = { revision: 'fixture.practice.v1', platformRange: '0.4.x', requiredCapabilities, entries: [guide, procedure] };
  const baseline = { schemaVersion: 2, ...knowledge, entries: [{ ...guide, verifiedAt: '2026-09-25', sources: ['fixture:baseline'] }] };
  const draft = { schemaVersion: 1, id: 'fixture-lesson', authorId: 'fixture-author',
    evidenceRefs: ['fixture:selection-observation'], counterexamples: ['Knowledge must match the current role, surface, topic and available operations.'], knowledge };
  const surface = consumer === 'catlas' ? 'code-help' : 'chat-decision';
  const otherRole = consumer === 'catlas' ? 'orchestrator' : 'catlas';
  const wrongSurface = consumer === 'catlas' ? 'chat-visible' : 'code-help';
  const definitions = consumer ? [
    ['new-goal', consumer, surface, guide.topics[0], [], guide.id, true],
    ['offline', consumer, surface, guide.topics[0], [], guide.id, true],
    ['unknown-workspace', consumer, surface, guide.topics[0], [], guide.id, true],
    ['collaboration', consumer, surface, 'collaboration', procedure.requiredOperations, procedure.id, true],
    ['unavailable-context', consumer, surface, consumer === 'catlas' ? 'unrelated' : 'collaboration', [], procedure.id, false],
    ['wrong-surface', consumer, wrongSurface, 'collaboration', procedure.requiredOperations, procedure.id, false],
    ['held-collaboration', consumer, consumer === 'catlas' ? surface : 'chat-visible', 'collaboration', procedure.requiredOperations, procedure.id, true],
    ['held-role-boundary', otherRole, surface, 'collaboration', procedure.requiredOperations, procedure.id, false],
    ['held-unrelated-topic', consumer, surface, 'unrelated', procedure.requiredOperations, procedure.id, false],
    ['held-goal-truncation', consumer, surface, guide.topics[0], [], guide.id, true],
  ] : [
    ['catlas-new-code', 'catlas', 'code-help', 'code', [], 'practice.guide', true],
    ['catlas-offline', 'catlas', 'code-help', 'code', [], 'practice.guide', true],
    ['catlas-unknown-workspace', 'catlas', 'code-help', 'code', [], 'practice.guide', true],
    ['orchestrator-inspect', 'orchestrator', 'chat-decision', 'collaboration', procedure.requiredOperations, 'practice.coordination', true],
    ['orchestrator-missing-tool', 'orchestrator', 'chat-decision', 'collaboration', [], 'practice.coordination', false],
    ['wrong-surface', 'orchestrator', 'code-help', 'collaboration', procedure.requiredOperations, 'practice.coordination', false],
    ['held-visible-coordination', 'orchestrator', 'chat-visible', 'collaboration', procedure.requiredOperations, 'practice.coordination', true],
    ['held-role-boundary', 'catlas', 'chat-decision', 'collaboration', procedure.requiredOperations, 'practice.coordination', false],
    ['held-unrelated-topic', 'orchestrator', 'chat-decision', 'unrelated', procedure.requiredOperations, 'practice.coordination', false],
    ['held-goal-truncation', 'catlas', 'code-help', 'code', [], 'practice.guide', true],
  ];
  const exercise = { schemaVersion: 1, id: 'fixture-curriculum', revision: 'v1', evidenceMode: 'fixture',
    platformVersion: '0.4.5', capabilities: knowledge.requiredCapabilities, repeats: 3,
    budget: { maxAttempts: 60, maxElapsedMs: 180_000, attemptTimeoutMs: 10_000, maxTokens: 10_000 },
    metric: { name: 'passedChecks', minimumImprovement: 1 },
    scenarios: definitions.map(([scenarioId, role, surface, topic, operations, entryId, expected], index) => ({
      id: scenarioId, heldOut: index >= 6, fixture: { entryId },
      context: { role, surface, locale: index % 2 ? 'zh-TW' : 'en', goal: index === 9 ? '"'.repeat(4_000) : 'Explain the next supported step.',
        scope: { runtime: index === 1 ? 'offline' : 'fixture', workspace: 'unknown' }, topics: [topic], operations },
      checks: [
        { id: 'bounded-input', kind: 'policy', critical: true, path: '/bounded', equals: true },
        { id: 'role-and-tools', kind: 'policy', critical: true, path: '/scoped', equals: true },
        { id: 'relevant-knowledge', kind: 'correctness', critical: !expected, path: '/knowledgeAvailable', equals: expected },
      ],
    })) };
  const paths = { authorRoots: [author], exerciseFile: join(owner, 'exercise.json'), baselineFile: join(owner, 'baseline.json'),
    evaluatorFile: join(owner, 'evaluator.mjs'), draftFile: join(author, 'draft.json'), candidateFile: join(author, 'candidate.json'),
    runRoot: join(root, 'private-run'), evaluatorId: 'fixture-evaluator' };
  await writeNew(paths.exerciseFile, exercise); await writeNew(paths.baselineFile, baseline);
  await writeNew(paths.evaluatorFile, FIXTURE_EVALUATOR); await writeNew(paths.draftFile, draft);
  return paths;
}

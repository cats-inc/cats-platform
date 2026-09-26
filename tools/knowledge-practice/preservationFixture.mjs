// Public deterministic regression examples, never protected holdout or model-quality evidence.
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PLATFORM_VERSION } from '#cats-app-package';
import { baselineKnowledge } from './changes.mjs';
import { writeNew } from './artifacts.mjs';

export const FIXTURE_LESSON = {
  en: ' Fixture lesson: cancellation requests a stop; confirm session and process cleanup before claiming it completed.',
  'zh-TW': ' 測試心得：取消是要求停止；宣告清理完成前，仍須確認工作階段與程序已停止。',
};

export const PRESERVATION_EVALUATOR = `export async function attempt({ fixture, context, signal }) {
  signal.throwIfAborted();
  return {
    observed: {
      guidanceRetained: fixture.guidance.every(prior =>
        context.entries.some(entry => entry.id === prior.id && entry.content.includes(prior.content))),
      lessonPresent: context.entries.some(entry => entry.content.includes(fixture.lesson)),
    },
    usageTokens: 0, interventions: 0, cleanup: 'complete', evidenceRefs: ['fixture:delivered-guidance'],
  };
}
`;

/** Prepare ten bilingual baseline/candidate cases for the existing admit/evaluate workflow. */
export async function createPreservationFixture(root) {
  const owner = join(root, 'evaluator-inputs'), author = join(root, 'author');
  await mkdir(owner, { recursive: true }); await mkdir(author, { recursive: true });
  const baseline = JSON.parse(await readFile(new URL('../../config/catlas-knowledge.json', import.meta.url), 'utf8'));
  const knowledge = baselineKnowledge(baseline);
  knowledge.revision = 'fixture.preservation.v1';
  const recovery = knowledge.entries.find(entry => entry.id === 'code.recovery');
  recovery.revision++;
  for (const locale of ['en', 'zh-TW']) recovery.content = { ...recovery.content,
    [locale]: recovery.content[locale] + FIXTURE_LESSON[locale] };
  const draft = { schemaVersion: 1, id: 'fixture-preservation', authorId: 'fixture-author',
    evidenceRefs: ['fixture:cancellation'], counterexamples: ['A stop request is not confirmation of cleanup.'], knowledge };
  const exercise = { schemaVersion: 1, id: 'fixture-preservation', revision: 'v1', evidenceMode: 'fixture',
    platformVersion: PLATFORM_VERSION, capabilities: baseline.requiredCapabilities, repeats: 3,
    changeScope: [{ entryId: 'code.recovery', evidenceRefs: ['fixture:cancellation'] }],
    budget: { maxAttempts: 60, maxElapsedMs: 180_000, attemptTimeoutMs: 10_000, maxTokens: 1_000 },
    metric: { name: 'passedChecks', minimumImprovement: 1 },
    scenarios: ['workspace', 'permissions', 'recovery', 'execution', 'always'].flatMap((topic, index) =>
      ['en', 'zh-TW'].map(locale => ({ id: `${topic}-${locale === 'en' ? 'en' : 'zh'}`, heldOut: index >= 3,
        fixture: { lesson: FIXTURE_LESSON[locale],
          guidance: baseline.entries.filter(entry => entry.topics.includes('always') || entry.topics.includes(topic))
            .map(entry => ({ id: entry.id, content: entry.content[locale] })) },
        context: { role: 'catlas', surface: 'code-help', locale, goal: 'Explain the observed Code state.',
          scope: { source: 'public-fixture' }, topics: [topic], operations: [] },
        checks: [
          { id: 'retained-guidance', kind: 'correctness', critical: true, path: '/guidanceRetained', equals: true },
          { id: 'scoped-lesson', kind: 'correctness', critical: true, path: '/lessonPresent', equals: topic === 'recovery' },
        ],
      }))),
  };
  const paths = { authorRoots: [author], exerciseFile: join(owner, 'exercise.json'), baselineFile: join(owner, 'baseline.json'),
    evaluatorFile: join(owner, 'evaluator.mjs'), draftFile: join(author, 'draft.json'), candidateFile: join(author, 'candidate.json'),
    runRoot: join(root, 'private-run'), evaluatorId: 'fixture-evaluator' };
  await writeNew(paths.exerciseFile, exercise); await writeNew(paths.baselineFile, baseline);
  await writeNew(paths.evaluatorFile, PRESERVATION_EVALUATOR); await writeNew(paths.draftFile, draft);
  return paths;
}

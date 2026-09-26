#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCandidate } from './candidate.mjs';
import { admitPractice, evaluatePractice, inspectPractice } from './practice.mjs';
import { createFixtureInputs } from './example.mjs';
import { createPreservationFixture } from './preservationFixture.mjs';
import { exportKnowledge, reviewCandidate, revokeKnowledge } from './promotion.mjs';
import { readJson } from './artifacts.mjs';
import { freezeEvaluator } from './freezeEvaluator.mjs';
import { inspectCatlasEffects } from './inspectEffects.mjs';

export async function main(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index], value = rest[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--') || key in flags) throw new Error('Expected unique --name value options.');
    flags[key] = value;
  }
  function options(required, optional = []) {
    if (Object.keys(flags).some((key) => ![...required, ...optional].includes(key))
      || required.some((key) => !flags[key])) throw new Error(`Expected options: ${required.join(', ')}.`);
  }
  if (command === 'candidate') {
    options(['--draft', '--out']);
    const candidate = await createCandidate({ draftFile: flags['--draft'], outputFile: flags['--out'] });
    return { state: candidate.state, digest: candidate.digest };
  }
  if (command === 'freeze-evaluator') {
    options(['--entry', '--out', '--author-root']);
    return freezeEvaluator({ entryFile: flags['--entry'], outputRoot: flags['--out'], authorRoots: [flags['--author-root']] });
  }
  if (command === 'admit') {
    options(['--out', '--author-root', '--exercise', '--baseline', '--evaluator', '--evaluator-id', '--runtime-root']);
    const admission = await admitPractice({ runRoot: flags['--out'], authorRoots: [flags['--author-root']],
      exerciseFile: flags['--exercise'], baselineFile: flags['--baseline'], evaluatorFile: flags['--evaluator'],
      evaluatorId: flags['--evaluator-id'], runtimeRoot: flags['--runtime-root'] });
    return { runId: admission.runId, status: 'admitted', evidenceMode: admission.evidenceMode };
  }
  if (command === 'evaluate') {
    options(['--run', '--candidate']);
    const controller = new AbortController();
    const abort = () => controller.abort(); process.once('SIGINT', abort);
    try { return await evaluatePractice({ runRoot: flags['--run'], candidateFile: flags['--candidate'], signal: controller.signal }); }
    finally { process.removeListener('SIGINT', abort); }
  }
  if (command === 'inspect') {
    options(['--run']); return inspectPractice(flags['--run']);
  }
  if (command === 'inspect-effects') {
    options(['--run', '--reset']);
    return inspectCatlasEffects({ evaluationRoot: flags['--run'], resetId: flags['--reset'] });
  }
  if (command === 'fixture-demo') {
    options(['--out', '--runtime-root'], ['--consumer', '--suite']);
    const suite = flags['--suite'] ?? 'selection';
    if (!['selection', 'preservation'].includes(suite)) throw new Error('Unknown fixture suite.');
    if (suite === 'preservation' && flags['--consumer'] && flags['--consumer'] !== 'catlas') {
      throw new Error('The preservation fixture covers Catlas only.');
    }
    const root = resolve(flags['--out']); await mkdir(root, { recursive: false });
    const input = suite === 'preservation' ? await createPreservationFixture(root)
      : await createFixtureInputs(root, { consumer: flags['--consumer'] });
    await createCandidate({ draftFile: input.draftFile, outputFile: input.candidateFile });
    await admitPractice({ ...input, runtimeRoot: flags['--runtime-root'] });
    const feedback = await evaluatePractice({ runRoot: input.runRoot, candidateFile: input.candidateFile });
    return { evidenceMode: 'fixture', providerCalls: 0, runRoot: input.runRoot, feedback };
  }
  if (command === 'review') {
    options(['--run', '--candidate', '--reviewer', '--decision', '--attestations'], ['--audience']);
    return reviewCandidate({ runRoot: flags['--run'], candidateFile: flags['--candidate'], reviewerId: flags['--reviewer'],
      decision: flags['--decision'], attestations: await readJson(flags['--attestations']), audience: flags['--audience'] });
  }
  if (command === 'export') {
    options(['--run', '--out', '--consumer'], ['--audience', '--platform-version']);
    return exportKnowledge({ runRoot: flags['--run'], outputRoot: flags['--out'], consumer: flags['--consumer'],
      audience: flags['--audience'], platformVersion: flags['--platform-version'] });
  }
  if (command === 'revoke') {
    options(['--run', '--actor', '--reason']);
    return revokeKnowledge({ runRoot: flags['--run'], actorId: flags['--actor'], reason: flags['--reason'] });
  }
  throw new Error('Commands: candidate, freeze-evaluator, admit, evaluate, inspect, inspect-effects, fixture-demo, review, export, revoke. See the practice guide before admission.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Practice failed.'}\n`); process.exitCode = 1;
  });
}

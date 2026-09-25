#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCandidate } from './candidate.mjs';
import { admitPractice, evaluatePractice, inspectPractice } from './practice.mjs';
import { createFixtureInputs } from './example.mjs';

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
  if (command === 'fixture-demo') {
    options(['--out', '--runtime-root']);
    const root = resolve(flags['--out']); await mkdir(root, { recursive: false });
    const input = await createFixtureInputs(root);
    await createCandidate({ draftFile: input.draftFile, outputFile: input.candidateFile });
    await admitPractice({ ...input, runtimeRoot: flags['--runtime-root'] });
    const feedback = await evaluatePractice({ runRoot: input.runRoot, candidateFile: input.candidateFile });
    return { evidenceMode: 'fixture', providerCalls: 0, runRoot: input.runRoot, feedback };
  }
  throw new Error('Commands: candidate, admit, evaluate, inspect, fixture-demo. See the practice guide before admission.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Practice failed.'}\n`); process.exitCode = 1;
  });
}

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { load } from 'js-yaml';

// CI skips the suite for documentation-only changes and for code that already
// passed. These tests run the workflow's own shell steps against local git
// fixtures, with a local origin and a stubbed gh for the merge lookups.
const workflow = load(readFileSync('.github/workflows/ci.yaml', 'utf8'));
const step = (id) => workflow.jobs.changes.steps.find((item) => item.id === id);
const bash = process.platform === 'win32'
  ? resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), '../../../bin/bash.exe')
  : 'bash';

function runStep(script, { cwd, env }) {
  const output = join(mkdtempSync(join(tmpdir(), 'cats-ci-output-')), 'output');
  writeFileSync(output, '');
  try {
    const result = spawnSync(bash, ['-e', '-o', 'pipefail', '-c', script], {
      cwd, encoding: 'utf8', env: { ...process.env, ...env, GITHUB_OUTPUT: output.replaceAll('\\', '/') },
    });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    return readFileSync(output, 'utf8').trim();
  } finally {
    rmSync(dirname(output), { recursive: true, force: true });
  }
}

function gitFixture(t, prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const work = join(root, 'work');
  const git = (cwd, ...args) => execFileSync('git', [
    '-c', 'user.name=CI Test', '-c', 'user.email=ci@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args,
  ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (path, content) => {
    mkdirSync(dirname(join(work, path)), { recursive: true });
    writeFileSync(join(work, path), content);
  };
  const remove = (path) => rmSync(join(work, path));
  const commit = (message, { stage = true } = {}) => {
    if (stage) git(work, 'add', '.');
    git(work, 'commit', '--quiet', '--allow-empty', '-m', message);
    return git(work, 'rev-parse', 'HEAD');
  };
  mkdirSync(work);
  git(work, 'init', '--initial-branch=main');
  return { root, work, git, write, remove, commit };
}

// Paths inside the temporary fixture repositories, not files of this checkout.
const guide = 'docs/guide.md'; // docs-boundary-ignore: fixture path
const codeInDocs = 'docs/code.ts'; // docs-boundary-ignore: fixture path
const agents = 'AGENTS.md'; // docs-boundary-ignore: fixture path
const claude = 'CLAUDE.md'; // docs-boundary-ignore: fixture path
const codex = 'CODEX.md'; // docs-boundary-ignore: fixture path
const gemini = 'GEMINI.md'; // docs-boundary-ignore: fixture path
const unicodeGuide = 'docs/使用說明.md'; // docs-boundary-ignore: fixture path
const nestedAgents = 'sub/AGENTS.md';

// Each case commits one change on top of base and runs a step against it.
function seedAgentFixture(fixture) {
  fixture.write('src/code.ts', 'base\n');
  fixture.write(guide, 'guide\n');
  fixture.write(agents, '# Agents\n');
  fixture.write(claude, '# Claude\n');
  fixture.write(nestedAgents, '# Nested agents\n');
  const base = fixture.commit('base');
  // stage: false commits only what the change put in the index itself.
  return (change, { stage = true } = {}) => {
    fixture.git(fixture.work, 'checkout', '--quiet', '--force', '--detach', base);
    change();
    fixture.commit('change', { stage });
    return base;
  };
}

// Turns the root AGENTS.md into a symlink in the index, keeping the working tree.
function retypeAgents({ git, work }) {
  const blob = git(work, 'rev-parse', `HEAD:${claude}`);
  git(work, 'update-index', '--cacheinfo', `120000,${blob},${agents}`);
}

test('documentation is docs/ plus root agent instructions that still exist', (t) => {
  const fixture = gitFixture(t, 'cats-ci-paths-');
  const { git, work, write, remove } = fixture;
  const change = seedAgentFixture(fixture);
  const detect = (edit, { event = 'push', before, stage } = {}) => {
    const base = change(edit, { stage });
    return runStep(step('paths').run, { cwd: work, env: { EVENT: event, BEFORE: before ?? base } });
  };
  const editAgents = () => write(agents, '# Edited\n');
  assert.equal(detect(() => write(guide, 'edited\n')), 'code=false');
  assert.equal(detect(() => write(unicodeGuide, '# 使用說明\n')), 'code=false', 'a non-ASCII docs path is documentation');
  assert.equal(detect(editAgents), 'code=false', 'a root AGENTS.md-only edit is documentation');
  assert.equal(detect(editAgents, { event: 'pull_request', before: '' }), 'code=false',
    'a pull request compares against its base parent');
  assert.equal(detect(() => { write(gemini, '# Gemini\n'); write(guide, 'edited\n'); }), 'code=false',
    'adding a root agent file is documentation');
  assert.equal(detect(() => remove(claude)), 'code=true', 'a deleted root CLAUDE.md is code');
  assert.equal(detect(() => git(work, 'mv', agents, codex)), 'code=true', 'renaming a root agent file is code');
  assert.equal(detect(() => retypeAgents(fixture), { stage: false }), 'code=true', 'a retyped root AGENTS.md is code');
  assert.equal(detect(() => git(work, 'mv', 'src/code.ts', codeInDocs)), 'code=true', 'moving code into docs/ is code');
  assert.equal(detect(() => write(nestedAgents, '# Edited\n')), 'code=true', 'a nested sub/AGENTS.md is code');
  assert.equal(detect(() => { editAgents(); write('src/code.ts', 'edited\n'); }), 'code=true');
  assert.equal(detect(() => {}), 'code=true', 'an empty diff runs every check');
  assert.equal(detect(editAgents, { before: '0'.repeat(40) }), 'code=true', 'an unknown base runs every check');
  assert.equal(detect(editAgents, { event: 'workflow_dispatch' }), 'code=true', 'a manual run runs every check');
});

test('the fingerprint keeps root agent instructions by path and mode, not content', (t) => {
  const fixture = gitFixture(t, 'cats-ci-fingerprint-');
  const { work, write, remove } = fixture;
  const change = seedAgentFixture(fixture);
  const fingerprint = (edit, options) => {
    change(edit, options);
    return runStep(step('fingerprint').run, { cwd: work, env: {} });
  };
  const original = fingerprint(() => {});
  assert.match(original, /^fingerprint=[0-9a-f]{64}$/);
  assert.equal(fingerprint(() => write(agents, '# Edited\n')), original,
    'an AGENTS.md content edit leaves the fingerprint unchanged');
  assert.equal(fingerprint(() => { write(claude, '# Edited\n'); write(guide, 'edited\n'); }), original);
  assert.equal(fingerprint(() => write(unicodeGuide, '# 使用說明\n')), original, 'a non-ASCII docs path stays out of it');
  assert.notEqual(fingerprint(() => remove(claude)), original, 'removing a root agent file changes it');
  assert.notEqual(fingerprint(() => write(gemini, '# Gemini\n')), original, 'adding a root agent file changes it');
  assert.notEqual(fingerprint(() => retypeAgents(fixture), { stage: false }), original, 'retyping one changes it');
  assert.notEqual(fingerprint(() => write(nestedAgents, '# Edited\n')), original, 'a nested copy is code');
  assert.notEqual(fingerprint(() => write('src/code.ts', 'edited\n')), original);
  // The format changed with the agent-file placeholder, so markers saved under
  // the v1 format can never be looked up for it.
  const save = workflow.jobs.nodejs.steps.find((item) => item.name === 'Save the tested marker');
  assert.equal(step('green').with.key, 'ci-green-v2-${{ steps.fingerprint.outputs.fingerprint }}');
  assert.equal(save.with.key, 'ci-green-v2-${{ needs.changes.outputs.fingerprint }}');
});

test('the nodejs job takes its skip only from a successful changes job', () => {
  const job = workflow.jobs.nodejs;
  assert.equal(job.if, '${{ !cancelled() }}');
  assert.equal(job.env.CHANGES_SKIP, "${{ needs.changes.result == 'success' && needs.changes.outputs.skip || '' }}");
  const conditions = job.steps.map((item) => item.if);
  assert.ok(conditions.every((condition) => !condition.includes('outputs.skip')), 'every step reads the guarded skip');
  // npm-publish.yml and scripts/shared/source-selection.mjs look these steps up by name.
  assert.equal(job.steps.find((item) => item.name === 'Documentation-only change')?.if, "env.CHANGES_SKIP == 'docs'");
  assert.equal(job.steps.find((item) => item.name === 'Test')?.if, "env.CHANGES_SKIP == ''");
});

test('the plan skips docs-only changes first, then code that already passed', () => {
  const decide = (code, green, merged) => runStep(step('plan').run, {
    cwd: process.cwd(), env: { CODE: code, GREEN: green, MERGED: merged },
  });
  assert.equal(decide('false', '', ''), 'skip=docs');
  assert.equal(decide('false', 'true', 'true'), 'skip=docs');
  assert.equal(decide('true', 'true', ''), 'skip=tested');
  assert.equal(decide('true', '', 'true'), 'skip=tested');
  assert.equal(decide('true', 'false', 'false'), 'skip=');
  assert.equal(decide('true', '', ''), 'skip=', 'skipped lookups run every check');
});

test('a main push reuses its merged pull request\'s green run only for that exact tree on the previous main', (t) => {
  const merged = step('merged');
  assert.equal(merged.if, "github.event_name == 'push' && steps.paths.outputs.code == 'true'");
  assert.deepEqual(workflow.jobs.changes.permissions, { contents: 'read', 'pull-requests': 'read', actions: 'read' });
  const { root, work, git, write, commit } = gitFixture(t, 'cats-ci-merged-');
  const origin = join(root, 'origin.git');
  const bin = join(root, 'bin');
  git(root, 'init', '--bare', '--initial-branch=main', origin);
  git(work, 'remote', 'add', 'origin', origin);
  write('src/code.ts', 'base\n');
  const base = commit('base');
  // Pull request #7 is up to date with main, so its squash lands the same tree.
  git(work, 'switch', '-c', 'pr-7');
  write('src/code.ts', 'pull request seven\n');
  const head7 = commit('pr 7');
  git(work, 'push', '--quiet', 'origin', `${head7}:refs/pull/7/head`);
  git(work, 'switch', 'main');
  git(work, 'merge', '--squash', 'pr-7');
  const squash7 = commit('squash #7');
  // Pull request #8 branched from the old main, and main moved before its squash.
  git(work, 'switch', '-c', 'pr-8', base);
  write('src/other.ts', 'pull request eight\n');
  const head8 = commit('pr 8');
  git(work, 'push', '--quiet', 'origin', `${head8}:refs/pull/8/head`);
  git(work, 'switch', 'main');
  git(work, 'merge', '--squash', 'pr-8');
  const squash8 = commit('squash #8');
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), [
    '#!/usr/bin/env bash',
    'case "$2" in',
    '  */pulls) [ -n "${STUB_PULLS:-}" ] || exit 1; printf \'%s\\n\' "$STUB_PULLS" ;;',
    '  */actions/workflows/*) printf \'%s\\n\' "${STUB_PASSED:-0}" ;;',
    '  *) exit 1 ;;',
    'esac',
  ].join('\n') + '\n', { mode: 0o755 });
  const reuse = (head, before, pulls, passed) => {
    git(work, 'checkout', '--quiet', head);
    return runStep(merged.run, {
      cwd: work,
      env: {
        PATH: `${bin}${delimiter}${process.env.PATH}`, REPO: 'cats-inc/cats-platform',
        BEFORE: before, STUB_PULLS: pulls, STUB_PASSED: passed,
      },
    });
  };
  assert.equal(reuse(squash7, base, `7 ${head7}`, '1'), 'tested=true');
  assert.equal(reuse(squash7, base, `7 ${head7}`, '0'), 'tested=false', 'the pull request must have passed CI');
  assert.equal(reuse(squash7, base, '', '1'), 'tested=false', 'a failed lookup runs every check');
  assert.equal(reuse(squash7, base, `7 ${head8}`, '1'), 'tested=false', 'the reported head must be the pull request ref');
  assert.equal(reuse(squash7, base, `9 ${head7}`, '1'), 'tested=false', 'an unknown pull request ref runs every check');
  assert.equal(reuse(squash7, '', `7 ${head7}`, '1'), 'tested=false');
  assert.equal(reuse(squash8, base, `8 ${head8}`, '1'), 'tested=false', 'a push of several commits runs every check');
  assert.equal(reuse(squash8, squash7, `8 ${head8}`, '1'), 'tested=false',
    'a head without the previous main was tested on other code');
});

test('npm publication skips its test gate only after CI ran the tests on the commit on main', (t) => {
  const publish = load(readFileSync('.github/workflows/npm-publish.yml', 'utf8'));
  assert.equal(publish.permissions.actions, 'read');
  const steps = publish.jobs.publish.steps;
  assert.equal(steps.find((item) => item.name === 'Run test gate')?.if, "steps.ci.outputs.tested != 'true'");
  for (const name of ['Install dependencies', 'Install mobile dependencies']) {
    assert.equal(steps.find((item) => item.name === name)?.if, undefined, `${name} still feeds the prepack build`);
  }
  const check = steps.find((item) => item.id === 'ci');
  assert.equal(check.if, undefined, 'the lookup itself always runs');
  const root = mkdtempSync(join(tmpdir(), 'cats-publish-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  // gh applies --jq itself, so the stub prints what each filter would: the
  // passing runs' ids, then per run the number of Test steps that succeeded.
  writeFileSync(join(bin, 'gh'), [
    '#!/usr/bin/env bash',
    'printf \'%s\\n\' "$2" >> "$STUB_LOG"',
    'case "$2" in',
    '  */actions/workflows/*) [ -n "${STUB_RUNS+set}" ] || exit 1; printf \'%s\\n\' "$STUB_RUNS" ;;',
    '  */actions/runs/*/jobs*) [ -n "${STUB_TESTED:-}" ] || exit 1; printf \'%s\\n\' "$STUB_TESTED" ;;',
    '  *) exit 1 ;;',
    'esac',
  ].join('\n') + '\n', { mode: 0o755 });
  assert.match(check.run, /select\(\.name \| startswith\("nodejs"\)\)/);
  assert.match(check.run, /select\(\.name == "Test" and \.conclusion == "success"\)/);
  const ciSteps = workflow.jobs.nodejs.steps;
  assert.equal(ciSteps.find((item) => item.name === 'Test')?.run, 'npm test', 'the step the lookup names runs the suite');
  const sha = 'a'.repeat(40);
  const log = join(root, 'gh.log');
  const lookup = (runs, tested) => {
    rmSync(log, { force: true });
    const env = {
      PATH: `${bin}${delimiter}${process.env.PATH}`, GITHUB_REPOSITORY: 'cats-inc/cats-platform', GITHUB_SHA: sha,
      STUB_LOG: log,
    };
    if (runs !== undefined) env.STUB_RUNS = runs;
    if (tested !== undefined) env.STUB_TESTED = tested;
    return runStep(check.run, { cwd: root, env });
  };
  assert.equal(lookup('42', '1'), 'tested=true');
  assert.match(readFileSync(log, 'utf8'),
    new RegExp(`actions/workflows/ci\\.yaml/runs\\?head_sha=${sha}&event=push&branch=main&status=success`));
  assert.match(readFileSync(log, 'utf8'), /actions\/runs\/42\/jobs/);
  assert.equal(lookup('42', '0'), 'tested=false', 'a passing run that skipped its Test step runs the gate');
  assert.equal(lookup('', '1'), 'tested=false', 'without a passing main run the gate runs as before');
  assert.equal(lookup(undefined, '1'), 'tested=false', 'a failed run lookup runs the gate');
  assert.equal(lookup('42'), 'tested=false', 'a failed jobs lookup runs the gate');
  assert.equal(lookup('not-a-run', '1'), 'tested=false');
  assert.doesNotMatch(readFileSync(log, 'utf8'), /actions\/runs\/not-a-run/);
});

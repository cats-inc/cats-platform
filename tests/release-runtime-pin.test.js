import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { load } from 'js-yaml';
import { assertFrozenSource, assertSelectedSource, frozenSourceSelection, leftOutStatements, missingSourceChanges, requireTestedReleaseSource } from '../scripts/shared/source-selection.mjs';
import { releaseNotesSection, validateRuntimePin } from '../scripts/validate-runtime-pin.mjs';

const exec = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/validate-runtime-pin.mjs', import.meta.url));

async function sourceRepository(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-runtime-pin-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = async (...args) => (await exec('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd: root })).stdout.trim();
  await git('init', '-q', '-b', 'main');
  const commit = async (subject, ...files) => {
    for (const file of files) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), `${subject}\n`, { flag: 'a' });
    }
    await git('add', '.');
    await git('commit', '-q', '-m', subject);
    return git('rev-parse', 'HEAD');
  };
  const publish = () => git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  return { root, git, commit, publish };
}

test('a selected source with nothing shipped after it passes', async (t) => {
  const source = await sourceRepository(t);
  const pin = await source.commit('feat: base (#1)', 'src/a.ts');
  await source.commit('docs: only docs (#2)', 'docs/a.md'); // docs-boundary-ignore: a path in a temporary Git fixture.
  await source.commit('ci: only workflows (#3)', '.github/workflows/a.yml');
  await source.publish();
  assert.deepEqual(await missingSourceChanges(source.root, pin), []);
  assert.deepEqual(await assertSelectedSource({ root: source.root, commit: pin, notes: '', repository: 'cats-runtime' }), []);
});

test('a change the notes do not list is refused, and the refusal names it', async (t) => {
  const source = await sourceRepository(t);
  const pin = await source.commit('feat: base (#1)', 'src/a.ts');
  await source.commit('fix: preserve Grok provenance (#212)', 'src/b.ts', 'docs/b.md'); // docs-boundary-ignore: a path in a temporary Git fixture.
  await source.commit('fix: no pull request', 'src/c.ts');
  await source.publish();
  await assert.rejects(assertSelectedSource({ root: source.root, commit: pin, notes: 'Nothing here.', repository: 'cats-runtime' }), (error) => {
    assert.match(error.message, /cats-runtime#212 fix: preserve Grok provenance \(#212\)/u);
    assert.match(error.message, /[a-f0-9]{8} fix: no pull request/u);
    return true;
  });
});

test('a README change counts, because the package ships it', async (t) => {
  const source = await sourceRepository(t);
  const pin = await source.commit('feat: base (#1)', 'src/a.ts');
  await source.commit('docs: readme (#2)', 'README.md');
  await source.publish();
  assert.equal((await missingSourceChanges(source.root, pin)).length, 1);
});

test('a statement lists a change by qualified pull request or SHA prefix, never a bare, longer or embedded one', async (t) => {
  const source = await sourceRepository(t);
  const pin = await source.commit('feat: base (#1)', 'src/a.ts');
  const unnumbered = await source.commit('fix: no pull request', 'src/c.ts');
  await source.commit('fix: Grok (#212)', 'src/b.ts');
  await source.publish();
  const check = notes => assertSelectedSource({ root: source.root, commit: pin, notes: `Left out of this release: ${notes}`, repository: 'cats-runtime' });
  const prefix = unnumbered.slice(0, 8);
  assert.equal((await check(`cats-runtime#212 and ${prefix}.`)).length, 2);
  assert.equal((await check(`cats-inc/cats-runtime#212 and ${prefix}.`)).length, 2);
  assert.equal((await check(`cats-runtime#212 and ${unnumbered}.`)).length, 2);
  await assert.rejects(check(`#212 and ${prefix}.`), /cats-runtime#212/u);
  await assert.rejects(check(`cats-runtime#2120 and ${prefix}.`), /cats-runtime#212/u);
  await assert.rejects(check(`not-cats-runtime#212 and ${prefix}.`), /cats-runtime#212/u);
  await assert.rejects(check(`cats-runtime#212 and abc${prefix}.`), /fix: no pull request/u);
  await assert.rejects(check('cats-runtime#212.'), /fix: no pull request/u);
});

test('a mention outside a statement does not count, even when it names the commit', async (t) => {
  const source = await sourceRepository(t);
  const pin = await source.commit('feat: base (#1)', 'src/a.ts');
  const later = await source.commit('fix: Grok (#212)', 'src/b.ts');
  await source.publish();
  const check = notes => assertSelectedSource({ root: source.root, commit: pin, notes, repository: 'cats-runtime' });
  await assert.rejects(check('This release carries cats-runtime#212.'), /cats-runtime#212/u);
  await assert.rejects(check(`- Runtime source ${later}, the commit this release needs.`), /cats-runtime#212/u);
  await assert.rejects(check('- Left out of this release: nothing.\n- Carries cats-runtime#212.'), /cats-runtime#212/u);
  assert.equal((await check('- **Left out of this release:** cats-runtime#212, because it needs more testing.')).length, 1);
});

test('a statement runs through its wrapped lines and nested list, and stops at its own level', () => {
  assert.equal(leftOutStatements('Before.\n\nAfter.'), '');
  assert.equal(leftOutStatements('- First.\n- Left out of this release: a\n  b\n- Next: c'), '- Left out of this release: a\n  b');
  assert.equal(leftOutStatements('- Left out of this release:\n  - a\n  - b\n\nAfter: c'), '- Left out of this release:\n  - a\n  - b');
  assert.equal(leftOutStatements('Left out of this release: a\n## Next heading\nb'), 'Left out of this release: a');
  assert.equal(leftOutStatements('Left out of this release: a\r\n\r\nb'), 'Left out of this release: a');
  assert.equal(leftOutStatements('Left out of this release: a\n\nLeft out of this release: b\nc'), 'Left out of this release: a\nLeft out of this release: b\nc');
});

test('moving a packaged file into docs or .github still counts', async (t) => {
  const source = await sourceRepository(t);
  const pin = await source.commit('feat: base (#1)', 'runtime-skills/old/SKILL.md', 'README.md', 'docs/seed.md', '.github/seed.yml'); // docs-boundary-ignore: paths in a temporary Git fixture.
  await source.git('mv', 'runtime-skills/old/SKILL.md', 'docs/old-skill.md'); // docs-boundary-ignore: a path in a temporary Git fixture.
  await source.git('commit', '-q', '-m', 'docs: move a skill (#2)');
  await source.git('mv', 'README.md', '.github/README.md');
  await source.git('commit', '-q', '-m', 'docs: move the readme (#3)');
  await source.publish();
  assert.deepEqual((await missingSourceChanges(source.root, pin)).map(change => change.pull), ['3', '2']);
});

test('a merge counts only for what it changes itself', async (t) => {
  const source = await sourceRepository(t);
  const pin = await source.commit('feat: base (#1)', 'src/a.ts');
  await source.git('switch', '-q', '-c', 'side');
  await source.commit('docs: side (#2)', 'docs/side.md'); // docs-boundary-ignore: a path in a temporary Git fixture.
  await source.git('switch', '-q', 'main');
  await source.commit('docs: main (#3)', 'docs/main.md'); // docs-boundary-ignore: a path in a temporary Git fixture.
  await source.git('merge', '-q', '--no-ff', '-m', 'Merge side cleanly', 'side');
  await source.publish();
  assert.deepEqual(await missingSourceChanges(source.root, pin), []);

  await source.git('switch', '-q', '-c', 'side2');
  await source.commit('docs: side two (#4)', 'docs/side2.md'); // docs-boundary-ignore: a path in a temporary Git fixture.
  await source.git('switch', '-q', 'main');
  await source.commit('docs: main two (#5)', 'docs/main2.md'); // docs-boundary-ignore: a path in a temporary Git fixture.
  await source.git('merge', '-q', '--no-ff', '--no-commit', 'side2');
  await writeFile(path.join(source.root, 'src', 'added-in-merge.ts'), 'export {};\n');
  await source.git('add', '.');
  await source.git('commit', '-q', '-m', 'Merge with its own change');
  await source.publish();
  assert.deepEqual((await missingSourceChanges(source.root, pin)).map(change => change.subject), ['Merge with its own change']);
});

test('a tag named like the branch does not stand in for it', async (t) => {
  const source = await sourceRepository(t);
  const pin = await source.commit('feat: base (#1)', 'src/a.ts');
  await source.commit('fix: later (#2)', 'src/b.ts');
  await source.publish();
  await source.git('tag', 'origin/main', pin);
  assert.deepEqual((await missingSourceChanges(source.root, pin)).map(change => change.pull), ['2']);
});

test('a commit off main, an unknown commit and an abbreviated SHA are refused', async (t) => {
  const source = await sourceRepository(t);
  const base = await source.commit('feat: base (#1)', 'src/a.ts');
  await source.publish();
  await source.git('switch', '-q', '-c', 'fix/branch');
  const branchHead = await source.commit('fix: only on a branch', 'src/b.ts');
  await assert.rejects(missingSourceChanges(source.root, branchHead), /is not on origin\/main/u);
  await assert.rejects(missingSourceChanges(source.root, 'a'.repeat(40)), /is not on origin\/main/u);
  await assert.rejects(missingSourceChanges(source.root, base.slice(0, 8)), /full source commit/u);
});

test('a checkout that cannot answer says so instead of calling the commit off main', async (t) => {
  const source = await sourceRepository(t);
  const pin = await source.commit('feat: base (#1)', 'src/a.ts');
  await assert.rejects(missingSourceChanges(source.root, pin), /has no origin\/main/u);
  const shallow = await mkdtemp(path.join(tmpdir(), 'cats-runtime-pin-shallow-'));
  t.after(() => rm(shallow, { recursive: true, force: true }));
  await source.commit('feat: second (#2)', 'src/b.ts');
  await exec('git', ['clone', '-q', '--depth', '1', `file://${source.root.replaceAll('\\', '/')}`, shallow]);
  await assert.rejects(missingSourceChanges(shallow, pin), /shallow/u);
});

test('only the notes for this Desktop version count', () => {
  const markdown = ['# Release Notes', '', '## 2026-11-02 — Desktop 0.13.3 standard preview: a', 'three', '',
    '## 2026-10-31 — Platform npm and Desktop 0.13.30 standard preview: b', 'thirty', '', '## 2026-10-30 — Desktop 0.13.2 standard preview: c', 'two', ''].join('\n');
  assert.match(releaseNotesSection(markdown, '0.13.3'), /three/u);
  assert.doesNotMatch(releaseNotesSection(markdown, '0.13.3'), /thirty|two/u);
  assert.match(releaseNotesSection(markdown, '0.13.30'), /thirty/u);
  assert.equal(releaseNotesSection(markdown, '0.13.9'), '');
});

test('the Desktop guard reads this version only, and its command line exits 1 with the reason', async (t) => {
  const source = await sourceRepository(t);
  const pin = await source.commit('feat: base (#1)', 'src/a.ts');
  const baseline = await source.commit('fix: Grok (#212)', 'src/b.ts');
  await source.publish();
  const notes = path.join(source.root, 'notes.md');
  const selection = `- **Source selection:** cats-runtime@${pin}; main@${baseline}.`;
  await writeFile(notes, `## 2026-11-03 — Desktop 0.14.0 standard preview: a\n${selection}\nNothing left out.\n\n## 2026-11-02 — Desktop 0.13.3 standard preview: b\n${selection}\nLeft out of this release: cats-runtime#212, for now.\n`);
  const options = { runtimeRoot: source.root, commit: pin, notes };
  assert.equal((await validateRuntimePin({ ...options, tag: 'v0.13.3' })).length, 1);
  await assert.rejects(validateRuntimePin({ ...options, tag: 'v0.14.0' }), /cats-runtime#212/u);
  await assert.rejects(validateRuntimePin({ ...options, tag: 'v0.14.1' }), /no section headed "Desktop 0\.14\.1"/u);
  const command = ['--runtime-root', source.root, '--commit', pin, '--notes', notes];
  await assert.rejects(exec(process.execPath, [script, '--tag', 'v0.14.0', ...command]), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /cats-runtime#212 fix: Grok/u);
    return true;
  });
  const passed = await exec(process.execPath, [script, '--tag', 'v0.13.3', ...command]);
  assert.match(passed.stdout, /leaves out 1 change/u);
  const selected = await exec(process.execPath, [script, '--tag', 'v0.13.3', '--notes', notes, '--print-commit']);
  assert.equal(selected.stdout.trim(), pin);
});

test('the release workflow checks the Runtime commit with full history before any build', async () => {
  const workflow = await readFile(new URL('../.github/workflows/desktop-release.yml', import.meta.url), 'utf8');
  const pinIndex = workflow.indexOf('Read the frozen Runtime selection');
  const resolveIndex = workflow.indexOf('Checkout the frozen Runtime source');
  const guardIndex = workflow.indexOf('Check Runtime against the frozen selection baseline');
  const draftIndex = workflow.indexOf('name: Create draft release');
  assert.ok(pinIndex > 0 && resolveIndex > pinIndex && guardIndex > resolveIndex && draftIndex > guardIndex, 'the frozen selection must precede checkout, validation and the draft');
  assert.match(workflow.slice(resolveIndex, guardIndex), /fetch-depth: 0/u);
  assert.doesNotMatch(workflow, /inputs\.runtime_ref \|\| 'main'/u);
});

test('publication keeps the bump baseline when Runtime main advances, but still requires omissions at selection', async t => {
  const source = await sourceRepository(t);
  const pin = await source.commit('feat: base (#1)', 'src/a.ts');
  const baseline = await source.commit('fix: deliberately held back (#2)', 'src/b.ts');
  const selection = `- **Source selection:** cats-runtime@${pin}; main@${baseline}.`;
  await source.publish();
  const check = notes => assertFrozenSource({ root: source.root, commit: pin, notes, repository: 'cats-runtime' });
  await assert.rejects(check(selection), /cats-runtime#2/u);
  const notes = `${selection}\n- **Left out of this release:** cats-runtime#2, pending acceptance.`;
  assert.equal((await check(notes)).length, 1);
  await source.commit('feat: next release (#3)', 'src/c.ts');
  await source.publish();
  assert.deepEqual((await check(notes)).map(change => change.pull), ['2']);
  await assert.rejects(assertFrozenSource({ root: source.root, commit: baseline, notes, repository: 'cats-runtime' }), /differs from the frozen source/u);
  await assert.rejects(check(`- **Source selection:** cats-runtime@${baseline}; main@${pin}.`), /differs/u);
  await assert.rejects(assertFrozenSource({ root: source.root, commit: baseline, notes: `- **Source selection:** cats-runtime@${baseline}; main@${pin}.`, repository: 'cats-runtime' }), /is not on/u);
  await source.git('switch', '-q', '-c', 'unmerged');
  const unmerged = await source.commit('fix: not landed (#4)', 'src/d.ts');
  await assert.rejects(check(`- **Source selection:** cats-runtime@${pin}; main@${unmerged}.`), /baseline .* is not on origin\/main/u);
});

test('a frozen selection cannot be absent, ambiguous, abbreviated or floating', () => {
  const line = `- **Source selection:** cats-runtime@${'a'.repeat(40)}; main@${'b'.repeat(40)}.`;
  assert.deepEqual(frozenSourceSelection(line, 'cats-runtime'), { commit: 'a'.repeat(40), baseline: 'b'.repeat(40) });
  for (const notes of ['', `${line}\n${line}`, line.replace('a'.repeat(40), 'main'), line.replace('b'.repeat(40), 'b'.repeat(8)), line.replace('cats-runtime', 'cats-bot')]) {
    assert.throws(() => frozenSourceSelection(notes, 'cats-runtime'), /Record exactly one/u);
  }
});

test('release CI accepts only exact same-repository main push or manual release-branch evidence', async () => {
  const sourceCommit = 'a'.repeat(40), tag = 'v1.2.3';
  const options = { owner: 'cats-inc', repo: 'cats-platform', sourceCommit, tag, sourceRef: `refs/heads/release/${tag}` };
  const passed = { head_sha: sourceCommit, head_branch: `release/${tag}`, event: 'workflow_dispatch', status: 'completed', conclusion: 'success', head_repository: { full_name: 'cats-inc/cats-platform' } };
  let runs = [passed];
  const github = { rest: { actions: { listWorkflowRuns: async query => {
    assert.equal(query.workflow_id, 'ci.yaml'); assert.equal(query.head_sha, sourceCommit);
    return { data: { workflow_runs: runs } };
  } } } };
  const check = overrides => requireTestedReleaseSource({ github, ...options, ...overrides });
  await check();
  for (const override of [{ head_sha: 'b'.repeat(40) }, { head_branch: 'release/v9.9.9' }, { event: 'pull_request' }, { status: 'in_progress' }, { conclusion: 'failure' }, { head_repository: { full_name: 'fork/cats-platform' } }]) {
    runs = [{ ...passed, ...override }]; await assert.rejects(check(), /CI has not passed/u);
  }
  runs = [passed];
  await assert.rejects(check({ sourceRef: 'refs/heads/fix/feature' }), /ordinary feature branches/u);
  runs = [{ ...passed, event: 'push', head_branch: 'main' }];
  await check({ sourceRef: 'refs/heads/main' });
  await check({ sourceRef: `refs/tags/${tag}` });
});

test('Desktop preview rejects an existing tag even without a release and never treats lookup failures as absence', async () => {
  const workflow = load(await readFile(new URL('../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'));
  const step = workflow.jobs.guard.steps.find(item => item.name === 'Reject existing preview tags');
  assert.equal(step.if, "steps.resolve.outputs.preview == 'true'");
  const run = new (Object.getPrototypeOf(async () => {}).constructor)('github', 'context', 'process', step.with.script);
  const check = getRef => run({ rest: { git: { getRef } } }, { repo: { owner: 'cats-inc', repo: 'cats-platform' } }, { env: { RELEASE_TAG: 'v1.2.3' } });
  await check(async query => { assert.equal(query.ref, 'tags/v1.2.3'); throw Object.assign(new Error('missing'), { status: 404 }); });
  await assert.rejects(check(async () => ({ data: { object: { sha: 'a'.repeat(40) } } })), /already exists/u);
  await assert.rejects(check(async () => { throw Object.assign(new Error('forbidden'), { status: 403 }); }), /forbidden/u);
});

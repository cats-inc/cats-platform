import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assertSelectedSource, leftOutStatements, missingSourceChanges } from '../scripts/shared/source-selection.mjs';
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
  await source.commit('fix: Grok (#212)', 'src/b.ts');
  await source.publish();
  const notes = path.join(source.root, 'notes.md');
  await writeFile(notes, '## 2026-11-03 — Desktop 0.14.0 standard preview: a\nNothing left out.\n\n## 2026-11-02 — Desktop 0.13.3 standard preview: b\nLeft out of this release: cats-runtime#212, for now.\n');
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
});

test('the release workflow checks the Runtime commit with full history before any build', async () => {
  const workflow = await readFile(new URL('../.github/workflows/desktop-release.yml', import.meta.url), 'utf8');
  const resolveIndex = workflow.indexOf('Resolve one Runtime source for the whole release');
  const pinIndex = workflow.indexOf('Pin Runtime commit');
  const guardIndex = workflow.indexOf('validate-runtime-pin.mjs');
  const draftIndex = workflow.indexOf('name: Create draft release');
  assert.ok(resolveIndex > 0 && pinIndex > resolveIndex && guardIndex > pinIndex && draftIndex > guardIndex, 'the check must follow the pin and precede the draft');
  assert.match(workflow.slice(resolveIndex, pinIndex), /fetch-depth: 0/u);
});

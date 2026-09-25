#!/usr/bin/env node
// Developer-only paired-artifact check. No provider execution or installed state.
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectRuntimeSkillContent, writeRuntimeSkillContent } from '../build/desktop/skillContent.js';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--runtime-root') {
  throw new Error('Usage: node tools/check-skill-distribution.mjs --runtime-root <built Runtime checkout>');
}
const runtimeRoot = resolve(args[1]);
const manifest = JSON.parse(await readFile(join(runtimeRoot, 'package.json'), 'utf8'));
assert.equal(manifest.name, '@cats-inc/cats-runtime');
const expected = ['cats-inc-development', 'cats-platform-operation', 'cats-practice-and-distill'];
const root = await mkdtemp(join(tmpdir(), 'cats-paired-skill-distribution-'));
const priorOverride = process.env.CATS_RUNTIME_PACKAGE_ROOT;
const receipts = [];
try {
  for (const profile of ['preview', 'release']) {
    const artifact = join(root, profile, 'cats-runtime');
    const content = await collectRuntimeSkillContent(join(runtimeRoot, 'runtime-skills'), profile);
    await writeRuntimeSkillContent(content, join(artifact, 'runtime-skills'));
    await writeFile(join(artifact, 'package.json'), JSON.stringify(manifest));
    // These are the actual compiled catalog/policy modules used by the Runtime.
    const moduleDir = join('build', 'runtime', 'core', 'skills');
    await mkdir(join(artifact, moduleDir), { recursive: true });
    for (const name of ['catalog.js', 'contentPolicy.js', 'errors.js']) {
      await cp(join(runtimeRoot, moduleDir, name), join(artifact, moduleDir, name));
    }
    await cp(join(runtimeRoot, 'node_modules', 'yaml'), join(artifact, 'node_modules', 'yaml'), { recursive: true });
    delete process.env.CATS_RUNTIME_PACKAGE_ROOT;
    const catalog = await import(pathToFileURL(join(artifact, moduleDir, 'catalog.js')).href);
    const policy = await import(pathToFileURL(join(artifact, moduleDir, 'contentPolicy.js')).href);
    assert.equal(policy.getRuntimeSkillContentPolicy().profile, profile);
    const physicalSkills = [...content.keys()].filter((name) => /(?:^|[/\\])SKILL\.md$/u.test(name));
    const skills = catalog.listRuntimeSkillCatalog();
    assert.equal(skills.length, profile === 'preview' ? 36 : 33);
    assert.equal(physicalSkills.length, skills.length);
    assert.equal(skills.filter((skill) => expected.includes(skill.id)).length, profile === 'preview' ? 3 : 0);
    if (profile === 'release') {
      assert.equal((await readdir(join(artifact, 'runtime-skills'))).includes('preview'), false);
      // Even a source-preview override cannot elevate the executing release artifact.
      process.env.CATS_RUNTIME_PACKAGE_ROOT = runtimeRoot;
      const overridden = await import(`${pathToFileURL(join(artifact, moduleDir, 'catalog.js')).href}?override`);
      assert.equal(overridden.resolveRuntimeSkillsRoot(), join(runtimeRoot, 'runtime-skills'));
      assert.equal(overridden.listRuntimeSkillCatalog().length, 33);
      assert.ok(overridden.listRuntimeSkillCatalog().every((skill) =>
        skill.entryFile.startsWith(join(runtimeRoot, 'runtime-skills'))));
      const cwd = join(root, 'fresh-workspace');
      await mkdir(cwd);
      for (const id of expected) {
        assert.throws(() => overridden.resolveRuntimeSkillManifest({ requestedSkills: [id] }, {
          providerName: 'claude', providerBackend: 'cli', sessionId: 'release-check',
          cwd, sessionBaseDir: join(root, 'sessions'),
        }), /Unknown runtime skill/u);
        assert.throws(() => catalog.resolveRuntimeSkillManifest({ requestedSkills: [id] }, {
          providerName: 'claude', providerBackend: 'cli', sessionId: 'release-check',
          cwd, sessionBaseDir: join(root, 'sessions'), skillsRoot: join(runtimeRoot, 'runtime-skills'),
        }), /Unknown runtime skill/u);
      }
    }
    receipts.push({ profile, catalogSkills: skills.length, physicalSkills: physicalSkills.length,
      resourceFiles: content.size, previewSkills: skills.filter((skill) => expected.includes(skill.id)).length });
  }
} finally {
  if (priorOverride === undefined) delete process.env.CATS_RUNTIME_PACKAGE_ROOT;
  else process.env.CATS_RUNTIME_PACKAGE_ROOT = priorOverride;
  await rm(root, { recursive: true, force: true });
}
process.stdout.write(`${JSON.stringify({ status: 'passed', receipts, providerCalls: 0 }, null, 2)}\n`);

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { bundleServer } from '../scripts/bundle-server.mjs';

const runFile = promisify(execFile);
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const probeSource = new URL('./fixtures/orchestratorDistributionProbe.mjs', import.meta.url);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const supplementNames = ['cats-inc-development', 'cats-platform-operation', 'cats-practice-and-distill'];
const consumerExports = [
  ['loadCatlasKnowledge', 'platform/catlas/knowledge.js'],
  ['loadOrchestratorKnowledge', 'products/chat/state/orchestratorKnowledge.js'],
  ['createChatProviderAgentDecisionRequester', 'products/chat/state/providerAgentDecisionRequester.js'],
  ['createDefaultChatState', 'products/chat/state/defaults.js'],
  ['createChannel, buildChannelView', 'products/chat/state/model/index.js'],
  ['resolveProviderCapabilityProfile', 'platform/supervision/providerCapabilityProfiles.js'],
  ['resolvePlatformPackageRoot', 'shared/platformPaths.js'],
];

function childPath(parent, child) {
  const suffix = relative(resolve(parent), resolve(child));
  assert.ok(suffix && suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix), child);
  return child;
}

async function seedFile(file, contents) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, contents);
}

function npmCliPath() {
  const candidates = [process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
  const cli = candidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(cli, 'An installed npm CLI is required; this test never installs dependencies.');
  return cli;
}

async function packedPlatform(root) {
  const destination = join(root, 'pack');
  const extracted = join(root, 'npm-consumer');
  await mkdir(destination);
  await mkdir(extracted);
  const { stdout } = await runFile(process.execPath, [npmCliPath(), 'pack', '--json', '--ignore-scripts',
    '--pack-destination', destination], {
    cwd: repoRoot, windowsHide: true, timeout: 180_000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, npm_config_offline: 'true', npm_config_loglevel: 'silent',
      npm_config_cache: join(root, 'npm-cache') },
  });
  const payload = JSON.parse(stdout);
  const packed = Array.isArray(payload) ? payload[0] : Object.values(payload)[0];
  assert.equal(packed.name, '@cats-inc/cats-platform');
  const paths = packed.files.map(({ path }) => path);
  for (const name of ['catlas', 'orchestrator']) assert.ok(paths.includes(`config/${name}-knowledge.json`));
  assert.equal(paths.some((path) => /^(?:src|desktop|docs|skills|\.agents|\.codex)\//u.test(path)), false);
  // Inventory evidence only. PLAN-109 still owns profile/cache/hydration exclusion.
  for (const name of supplementNames) assert.equal(paths.some((path) => path.includes(name)), false);
  const tarball = childPath(destination, join(destination, packed.filename));
  await runFile('tar', ['-xzf', tarball, '-C', extracted], { windowsHide: true, timeout: 30_000 });
  const packageRoot = join(extracted, 'package');
  // Copy already installed production dependencies; no npm install or network access.
  for (const dependency of ['js-yaml', 'argparse']) {
    await cp(join(repoRoot, 'node_modules', dependency), join(packageRoot, 'node_modules', dependency), { recursive: true });
  }
  return packageRoot;
}

async function runtimePackagingFixture(root) {
  // Only fulfills staging's Runtime asset contract. No Runtime execution is claimed.
  const factory = 'schema_version: 2\ncatalogs: []\n';
  const files = {
    'package.json': JSON.stringify({ name: 'cats-runtime', version: '0.1.0', type: 'module',
      dependencies: { 'playwright-core': '^1.58.2', yaml: '^2.8.2' } }),
    'build/runtime/index.js': 'export {};',
    'build/runtime-bundle/index.js': 'export {};',
    'build/runtime-bundle/index.js.map': '{"version":3}',
    'build/runtime/catalogs/index.js': 'export {};',
    'build/runtime/bin/catalogs.js': 'export {};',
    'public/index.html': '<!doctype html>',
    'public/playground.html': '<!doctype html>',
    'public/provider-setup.html': '<!doctype html>',
    'runtime-skills/README.md': '# Runtime fixture has no native skills.\n',
    'config/management.yaml.example': 'version: 1\n',
    'config/providers.yaml.example': 'version: 1\n',
    'config/curated-model-catalogs.yaml.example': factory,
    'config/curated-model-catalogs.generated.json': JSON.stringify({ sourceDigest: digest(factory) }),
    'config/catalog-schema1-migration.json': '[]',
    'node_modules/playwright-core/package.json': '{"name":"playwright-core"}',
    'node_modules/yaml/package.json': '{"name":"yaml"}',
  };
  await Promise.all(Object.entries(files).map(([file, contents]) => seedFile(join(root, file), contents)));
}

async function stageDesktop(packageRoot, root, layout) {
  const { resolveDesktopHostConfig } = await import(pathToFileURL(join(packageRoot, 'build/desktop/config.js')).href);
  const { stageDesktopPackagingOutputs } = await import(pathToFileURL(join(packageRoot, 'build/desktop/packaging.js')).href);
  // Knowledge delivery needs only the renderer staging contract, not a Vite
  // build. Always replace extracted assets so local build output cannot affect
  // this fixture or hide a missing renderer in clean CI. The checkout is untouched.
  const rendererRoot = childPath(packageRoot, join(packageRoot, 'build/renderer'));
  await rm(rendererRoot, { recursive: true, force: true });
  await seedFile(join(rendererRoot, 'index.html'), '<!doctype html><title>Knowledge staging fixture</title>\n');
  const runtimeRoot = join(root, 'runtime-fixture');
  await runtimePackagingFixture(runtimeRoot);
  if (layout === 'bundle') {
    // Bundle the shipped production consumers with the production bundler into
    // this temporary package. Its exports let the probe observe actual requests.
    const entryPoint = join(packageRoot, 'build/server/distribution-probe-entry.js');
    await writeFile(entryPoint, consumerExports.map(([names, file]) =>
      `export { ${names} } from ${JSON.stringify(`./${file}`)};`).join('\n'));
    await bundleServer({ entryPoint, outfile: join(packageRoot, 'build/server-bundle/index.js') });
  }
  const stagingRoot = childPath(root, join(root, `stage-${layout}`));
  const config = resolveDesktopHostConfig({
    env: { CATS_DESKTOP_APP_ROOT: packageRoot, CATS_DESKTOP_RUNTIME_ROOT: runtimeRoot },
    userDataDir: join(root, 'profile/electron'), catsHomeDir: join(root, 'profile/cats'),
  });
  await stageDesktopPackagingOutputs(config, { outputRoot: stagingRoot, platforms: ['windows'], sidecarLayout: layout });
  const resources = join(root, `relocated-${layout}`, 'resources');
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  const mappings = manifest.build.extraResources.filter(({ to }) => to.startsWith('app-sidecar/'));
  for (const mapping of mappings) {
    const prefix = 'build/desktop-packaging/';
    assert.ok(mapping.from.startsWith(prefix), mapping.from);
    // Fail if electron-builder filtering evolves beyond these actual mappings.
    assert.ok(!mapping.filter || mapping.filter.every((filter) => ['**/*', '!.bin{,/**/*}'].includes(filter)));
    const from = childPath(stagingRoot, join(stagingRoot, mapping.from.slice(prefix.length)));
    const to = childPath(resources, join(resources, mapping.to));
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to, { recursive: true, filter: (file) => !mapping.filter?.includes('!.bin{,/**/*}')
      || !relative(from, file).split(sep).includes('.bin') });
  }
  return join(resources, 'app-sidecar');
}

async function runProbe(root, packageRoot, layout, locale) {
  const cwd = join(root, 'unrelated-cwd');
  const probe = join(cwd, 'probe.mjs');
  await mkdir(cwd, { recursive: true });
  await cp(probeSource, probe);
  // Decoy cwd assets catch accidental cwd lookup, including silent fallback.
  for (const name of ['catlas', 'orchestrator']) await seedFile(join(cwd, 'config', `${name}-knowledge.json`), '{}');
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^CATS_|^NODE_(?:PATH|OPTIONS)$/iu.test(key)) delete env[key];
  env.CATS_PLATFORM_DIR = join(root, 'profile/platform');
  env.CATS_RUNTIME_DIR = join(root, 'profile/runtime');
  env.CATS_DESKTOP_DIR = join(root, 'profile/desktop');
  const { stdout } = await runFile(process.execPath, [probe, packageRoot, layout, locale], {
    cwd, env, windowsHide: true, timeout: 30_000, maxBuffer: 512 * 1024,
  });
  const result = JSON.parse(stdout);
  assert.equal(resolve(result.packageRoot), resolve(packageRoot));
  assert.equal(result.rootOverride, null);
  assert.equal(resolve(result.cwd), resolve(cwd));
  assert.notEqual(resolve(result.cwd), resolve(packageRoot));
  return result;
}

function assertEntries(entries, raw, locale) {
  assert.ok(entries.length > 0);
  for (const entry of entries) {
    const expected = raw.entries.find(({ id }) => id === entry.id);
    assert.ok(expected, entry.id);
    assert.equal(entry.content, expected.content[locale]);
    assert.equal(entry.revision, expected.revision);
    assert.equal(entry.digest, digest(expected.content[locale]));
  }
}

async function assertDistribution(root, packageRoot, layout) {
  const catlasBytes = await readFile(join(packageRoot, 'config/catlas-knowledge.json'));
  const orchestratorBytes = await readFile(join(packageRoot, 'config/orchestrator-knowledge.json'));
  const catlasRaw = JSON.parse(catlasBytes);
  const orchestratorRaw = JSON.parse(orchestratorBytes);
  const paths = await readdir(packageRoot, { recursive: true });
  for (const name of supplementNames) assert.equal(paths.some((path) => path.includes(name)), false);
  assert.equal(existsSync(join(packageRoot, 'src')), false);
  assert.equal(existsSync(join(packageRoot, 'skills')), false);
  for (const locale of ['en', 'zh-TW']) {
    const result = await runProbe(root, packageRoot, layout, locale);
    assert.equal(result.catlas.status, 'ready');
    assert.equal(result.catlas.bundle.digest, digest(catlasBytes));
    assertEntries(result.catlas.bundle.entries, catlasRaw, locale);
    assertRequest(result, orchestratorRaw, digest(orchestratorBytes), locale);
  }
  // Optional Guide Cat and its knowledge are not prerequisites for Orchestrator.
  const catlasFile = join(packageRoot, 'config/catlas-knowledge.json');
  await rename(catlasFile, `${catlasFile}.unavailable`);
  try {
    const result = await runProbe(root, packageRoot, layout, 'en');
    assert.equal(result.catlas.status, 'missing');
    assertRequest(result, orchestratorRaw, digest(orchestratorBytes), 'en');
  } finally {
    await rename(`${catlasFile}.unavailable`, catlasFile);
  }
}

function assertRequest(result, raw, bundleDigest, locale) {
  assert.equal(result.orchestrator.status, 'ready');
  assert.equal(result.orchestrator.bundle.digest, bundleDigest);
  assertEntries(result.orchestrator.entries, raw, locale);
  assert.equal(result.calls.create.length, 1);
  assert.equal(result.calls.send.length, 1);
  const created = result.calls.create[0];
  assert.equal(created.provider, result.binding.provider);
  assert.equal(created.instance, result.binding.instance);
  assert.equal(created.model, result.binding.model);
  assert.equal(created.skills, undefined);
  const request = result.calls.send[0];
  const knowledge = JSON.parse(request.content).productKnowledge;
  assert.equal(knowledge.status, 'ready');
  assert.equal(knowledge.goal, result.body);
  assert.equal(knowledge.locale, locale);
  assert.equal(knowledge.bundle.digest, bundleDigest);
  assert.deepEqual(knowledge.entries.map(({ id }) => id),
    ['orchestrator.role', 'orchestrator.results', 'orchestrator.collaboration', 'orchestrator.recovery']);
  assertEntries(knowledge.entries, raw, locale);
  const { contextDigest, ...context } = knowledge;
  assert.equal(contextDigest, digest(JSON.stringify(context)));
  const receipt = request.input.context.metadata.productKnowledge;
  assert.equal(receipt.delivery, 'inline');
  assert.equal(receipt.contextDigest, contextDigest);
  assert.deepEqual(receipt.bundle, knowledge.bundle);
  assert.deepEqual(receipt.entries, knowledge.entries.map(({ id, revision, digest }) => ({ id, revision, digest })));
  assert.equal(result.decision.decisionId, 'distribution-decision');
}

test('source-free npm and staged Desktop deliver bundled Orchestrator knowledge without native skills or Catlas', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'cats-orchestrator-distribution-'));
  t.after(async () => {
    childPath(tmpdir(), root);
    assert.ok(root.startsWith(join(tmpdir(), 'cats-orchestrator-distribution-')));
    await rm(root, { recursive: true, force: true });
  });
  const packageRoot = await packedPlatform(root);
  await t.test('relocated npm package discovers both bilingual bundles and delivers selected bytes',
    () => assertDistribution(root, packageRoot, 'split'));
  await t.test('Desktop bundle staging and extraResources preserve production knowledge consumers', async () => {
    const appRoot = await stageDesktop(packageRoot, root, 'bundle');
    await assertDistribution(root, appRoot, 'bundle');
  });
});

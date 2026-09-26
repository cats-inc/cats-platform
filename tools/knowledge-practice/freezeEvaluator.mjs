import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVALUATOR_MAX_BYTES, assertSeparated, digest, physical, readJson, readPlain, writeNew } from './artifacts.mjs';

const PLATFORM_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SDK_FILE = join(PLATFORM_ROOT, 'packages/app-sdk/package.js');
const VERSION_INITIALIZER = "export const PLATFORM_VERSION = createRequire(import.meta.url)('../../package.json').version;";
const VERSION_IMPORT = "import { createRequire } from 'node:module';";

// This rejects ordinary accidental dynamic code loading, not hostile JavaScript.
// The operator must still review trusted callbacks and any runtime data/processes.
function staticCode(ts, contents, filename) {
  const source = ts.createSourceFile(filename, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(source.parseDiagnostics.length, 0, 'Evaluator input must be valid JavaScript.');
  function inspect(node) {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        assert.ok(node.arguments?.length === 1 && ts.isStringLiteral(node.arguments[0]), 'Dynamic evaluator imports must be literal.');
      }
      if (ts.isIdentifier(callee)) assert.ok(!['require', 'eval', 'Function', 'createRequire'].includes(callee.text),
        'Runtime code loading cannot be frozen; use static imports.');
    }
    ts.forEachChild(node, inspect);
  }
  inspect(source);
}

/** Compile trusted code without importing/executing it or starting a provider. */
export async function freezeEvaluator({ entryFile, outputRoot, authorRoots }) {
  entryFile = await physical(entryFile); outputRoot = await physical(outputRoot);
  assert.equal(extname(entryFile), '.mjs', 'Evaluator entry must be an ES module.');
  await assertSeparated(authorRoots, [entryFile, outputRoot, PLATFORM_ROOT]);
  const [{ build, version: compilerVersion }, ts] = await Promise.all([import('esbuild'), import('typescript')]);
  const inputs = new Map();
  async function capture(file) {
    const path = await physical(file);
    await assertSeparated(authorRoots, [path]);
    const bytes = await readPlain(path, 1024 * 1024), sha256 = digest(bytes);
    if (inputs.has(path)) assert.equal(inputs.get(path).sha256, sha256, 'Evaluator source changed during compilation.');
    else inputs.set(path, { path, sha256, bytes: bytes.length });
    return bytes.toString('utf8');
  }
  const sdkFile = await physical(SDK_FILE);
  let platformVersion = null;
  const recipe = { bundle: true, platform: 'node', format: 'esm', target: 'node22',
    sourcemap: false, minify: false, treeShaking: true, legalComments: 'none', charset: 'utf8',
    packages: 'bundle', mainFields: ['module', 'main'], conditions: ['node', 'import'],
    resolveExtensions: ['.mjs', '.js', '.json'], nodePaths: [], preserveSymlinks: false,
    tsconfigRaw: { compilerOptions: {} } };
  const result = await build({
    absWorkingDir: PLATFORM_ROOT, entryPoints: [entryFile], outfile: 'evaluator.mjs',
    ...recipe, write: false, metafile: true, logLevel: 'silent',
    plugins: [{ name: 'frozen-evaluator-inputs', setup(builder) {
      builder.onLoad({ filter: /.*/, namespace: 'file' }, async args => {
        const path = await physical(args.path), extension = extname(path);
        assert.ok(['.js', '.mjs', '.json'].includes(extension), 'Evaluator closure accepts compiled JavaScript and JSON only.');
        let contents = await capture(path);
        if (path === sdkFile) {
          assert.equal(contents.split(VERSION_INITIALIZER).length, 2, 'App SDK version initialization changed; review the freeze transform.');
          const manifest = JSON.parse(await capture(join(PLATFORM_ROOT, 'package.json')));
          assert.equal(manifest.name, '@cats-inc/cats-platform');
          assert.match(manifest.version, /^\d+\.\d+\.\d+$/u);
          platformVersion = manifest.version;
          contents = contents.replace(VERSION_INITIALIZER, `export const PLATFORM_VERSION = ${JSON.stringify(platformVersion)};`);
          assert.equal(contents.split(VERSION_IMPORT).length, 2, 'App SDK version import changed; review the freeze transform.');
          contents = contents.replace(VERSION_IMPORT, '');
        }
        if (extension !== '.json') staticCode(ts, contents, path);
        const loader = extension === '.json' ? 'json' : 'js';
        Object.assign(inputs.get(path), { compilerSha256: digest(contents), compilerBytes: Buffer.byteLength(contents), loader });
        return { contents, loader, resolveDir: dirname(path) };
      });
    } }],
  });
  assert.deepEqual(result.warnings, [], 'Evaluator compilation warnings require review.');
  assert.equal(result.outputFiles.length, 1);
  const output = Object.values(result.metafile.outputs);
  assert.equal(output.length, 1); assert.ok(output[0].exports.includes('attempt'), 'Evaluator must export attempt.');
  const imports = output[0].imports.map(item => item.path);
  assert.ok(imports.every(name => isBuiltin(name) && !['module', 'node:module'].includes(name)),
    'Evaluator has unresolved executable dependencies.');
  const code = result.outputFiles[0].text;
  staticCode(ts, code, 'evaluator.mjs');
  assert.ok(Buffer.byteLength(code) <= EVALUATOR_MAX_BYTES, 'Frozen evaluator exceeds its artifact budget.');
  // Hash the exact captured compiler inputs; reject concurrent source changes
  // before publishing the pair. Runtime data is a separate reviewed contract.
  for (const input of inputs.values()) assert.equal(digest(await readPlain(input.path, 1024 * 1024)), input.sha256,
    'Evaluator source changed during compilation.');
  const manifest = { schemaVersion: 1, kind: 'frozen-evaluator', status: 'complete', createdAt: new Date().toISOString(),
    entryFile, evaluatorDigest: digest(code), evaluatorBytes: Buffer.byteLength(code),
    compiler: { name: 'esbuild', version: compilerVersion, nodeVersion: process.versions.node,
      parser: { name: 'typescript', version: ts.version }, recipe, workingDirectory: PLATFORM_ROOT },
    platformVersion, imports: [...new Set(imports)].sort(),
    inputs: [...inputs.values()].sort((a, b) => a.path.localeCompare(b.path)),
    transforms: platformVersion === null ? [] : [{ id: 'app-sdk-platform-version', value: platformVersion }],
    boundary: 'Static executable imports and JSON only. Trusted callbacks must freeze or digest-check runtime data; external Runtime/judge ownership and cleanup require separate evidence.',
  };
  await mkdir(outputRoot, { recursive: false, mode: 0o700 });
  await writeNew(join(outputRoot, 'evaluator.mjs'), code);
  // The flushed manifest is the completion marker. Failed writes retain an
  // incomplete directory, which verifyFrozenEvaluator rejects; never overwrite it.
  await writeNew(join(outputRoot, 'manifest.json'), manifest);
  return { outputRoot, evaluatorFile: join(outputRoot, 'evaluator.mjs'), manifestFile: join(outputRoot, 'manifest.json'),
    evaluatorDigest: manifest.evaluatorDigest, manifestDigest: digest(manifest), inputCount: inputs.size,
    platformVersion, providerCalls: 0 };
}

/** Inspect integrity without importing code or consulting the original sources. */
export async function verifyFrozenEvaluator(outputRoot) {
  const manifest = await readJson(join(outputRoot, 'manifest.json'), 2 * 1024 * 1024);
  assert.equal(manifest.schemaVersion, 1); assert.equal(manifest.kind, 'frozen-evaluator');
  assert.equal(manifest.status, 'complete');
  const code = await readPlain(join(outputRoot, 'evaluator.mjs'), EVALUATOR_MAX_BYTES);
  assert.equal(code.length, manifest.evaluatorBytes); assert.equal(digest(code), manifest.evaluatorDigest, 'Frozen evaluator changed.');
  return { manifest, manifestDigest: digest(manifest), evaluatorFile: join(outputRoot, 'evaluator.mjs') };
}

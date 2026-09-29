import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { build } from 'vite';
import { verifyRendererNotices } from '../build/desktop/rendererLicenses.js';

async function put(root, file, text) {
  await mkdir(dirname(join(root, file)), { recursive: true });
  await writeFile(join(root, file), text);
}

test('actual multi-entry Vite inputs determine notices; stale resources and omitted licenses fail closed', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cats-renderer-notices-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const plugin = new URL('../scripts/renderer-license-plugin.ts', import.meta.url).pathname;
  // Vite compiles this config together with the production TypeScript plugin.
  await put(root, 'vite.config.mts', `import { rendererLicensePlugin } from ${JSON.stringify(decodeURIComponent(process.platform === 'win32' ? plugin.slice(1) : plugin))};
export default { plugins: [rendererLicensePlugin()], build: { rollupOptions: { input: { app: 'index.html', overlay: 'overlay.html' } } } };`);
  for (const name of ['used', 'overlay', 'unused', 'css-only', 'nested-css']) {
    await put(root, `node_modules/${name}/package.json`, JSON.stringify({ name, version: '1.0.0', main: 'index.js', type: 'module', license: 'MIT' }));
    await put(root, `node_modules/${name}/index.js`, `export const value = '${name}';`);
    await put(root, `node_modules/${name}/LICENSE`, `\uFEFFCopyright ${name}\r\nPermission fixture ${name}\r\n`);
  }
  await put(root, 'node_modules/used/NOTICE.txt', 'Additional upstream acknowledgement\n');
  await put(root, 'node_modules/css-only/style.css', '.fixture { color: red; }');
  await put(root, 'node_modules/nested-css/style.css', '.nested { color: blue; }');
  await put(root, 'local.css', '@import "nested-css/style.css";');
  for (const entry of ['index', 'overlay']) await put(root, `${entry}.html`, `<script type="module" src="/${entry}.js"></script>`);
  await put(root, 'index.js', 'import {value} from "used"; import "css-only/style.css"; import "./local.css"; console.log(value);');
  await put(root, 'overlay.js', 'import {value} from "overlay"; console.log(value);');
  const runBuild = () => build({ root, configFile: join(root, 'vite.config.mts'), logLevel: 'silent',
    build: { rollupOptions: { input: { app: join(root, 'index.html'), overlay: join(root, 'overlay.html') } } } });
  await runBuild();
  const output = join(root, 'dist');
  await verifyRendererNotices(output);
  const manifestPath = join(output, 'THIRD-PARTY-NOTICES.json');
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  assert.deepEqual(manifest.packages.map(pkg => pkg.name), ['css-only', 'nested-css', 'overlay', 'used', 'vite']);
  assert.deepEqual(manifest.packages.find(pkg => pkg.name === 'used').notices.map(row => row.file), ['LICENSE', 'NOTICE.txt']);
  const text = await readFile(join(output, 'THIRD-PARTY-NOTICES.txt'), 'utf8');
  assert.ok(text.includes(await readFile(join(root, 'node_modules/used/LICENSE'), 'utf8')));
  assert.ok(manifest.outputs.some(row => row.file === 'overlay.html'));
  assert.ok(manifest.outputs.some(row => row.file.endsWith('.css')));
  for (const filename of ['THIRD-PARTY-NOTICES.txt', 'THIRD-PARTY-NOTICES.json', manifest.outputs.find(row => row.file.endsWith('.js')).file]) {
    const file = join(output, filename);
    const original = await readFile(file);
    await rm(file);
    await assert.rejects(verifyRendererNotices(output));
    await writeFile(file, filename.endsWith('.json') ? '{}' : 'changed');
    await assert.rejects(verifyRendererNotices(output), /stale/);
    await writeFile(file, original);
  }
  await put(output, 'unlisted.js', 'console.log("injected");');
  await assert.rejects(verifyRendererNotices(output), /stale/);
  await rm(join(output, 'unlisted.js'));
  manifest.outputs[0].file = '../outside.js';
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(verifyRendererNotices(output), /stale/);
  await writeFile(manifestPath, manifestBytes);
  await runBuild();
  assert.deepEqual(await readFile(manifestPath), manifestBytes, 'identical inputs produce identical notice manifest');
  await rm(join(root, 'node_modules/overlay/LICENSE'));
  await assert.rejects(runBuild(), /overlay@1.0.0 has no license text/);
});

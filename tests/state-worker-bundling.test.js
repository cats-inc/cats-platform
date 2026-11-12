import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { bundleServer } from '../scripts/bundle-server.mjs';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';

test('bundled maintenance reaper/native entries run under Node and shipped Electron with attribution', { timeout: 60_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-bundled-db-worker-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10 }));
  const packageRoot = path.join(root, 'package');
  await mkdir(packageRoot);
  await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ type: 'module' }));
  const outfile = path.join(packageRoot, 'build/server/index.js');
  await bundleServer({ entryPoint: fileURLToPath(new URL('../build/server/platform/persistence/state-db/stateMaintenance.js', import.meta.url)), outfile });
  const notice = await readFile(path.join(path.dirname(outfile), 'stateMaintenanceNativeWorker.js'), 'utf8');
  assert.match(notice, /Copyright \(c\) 2026 sammykenny2 and contributors/);
  assert.match(notice, /Permission is hereby granted/);
  const probe = path.join(packageRoot, 'probe.mjs');
  await writeFile(probe, `import { runStateMaintenance } from ${JSON.stringify(pathToFileURL(outfile).href)};
    await runStateMaintenance({ kind: 'snapshot', file: process.argv[2], target: process.argv[3] });
    console.log(JSON.stringify({ ok: true, node: process.versions.node, electron: process.versions.electron ?? null }));`);
  const source = path.join(root, 'source.sqlite');
  const database = openStateDatabase({ file: source, mode: 'writer' });
  database.setMeta('bundle_fixture', 'preserved'); database.close();
  for (const [name, command] of [['node', process.execPath], ['electron', createRequire(import.meta.url)('electron')]]) {
    const target = path.join(root, `${name}.sqlite`);
    const result = await promisify(execFile)(command, [probe, source, target], {
      cwd: packageRoot, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 15_000,
    });
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    if (name === 'electron') assert.ok(output.electron);
    const saved = openStateDatabase({ file: target, mode: 'reader' });
    try { assert.equal(saved.meta('bundle_fixture'), 'preserved'); } finally { saved.close(); }
  }
});

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { verifyPackagedPlatformStartup } from '../scripts/verify-packaged-platform-startup.mjs';

const entry = `
import { zipSync } from 'fflate';
import { createServer } from 'node:http';
if (!zipSync({}).length) throw Error('Dependency could not run');
const server = createServer((_req, res) => {
  res.writeHead(200, {'content-type':'application/json'});
  res.end(JSON.stringify({service:'cats-platform',version:'0.0.1',
    startup:{pid:process.pid},readiness:{ready:true}}));
});
server.listen(Number(process.env.CATS_PORT), process.env.CATS_HOST, () => {
  console.log(JSON.stringify({event:'app.ready',service:'cats-platform',
    ready:true,pid:process.pid,version:'0.0.1'}));
});
process.stdin.resume();
process.stdin.on('end', () => server.close(() => process.exit(0)));
`;

test('packaged startup rejects missing dependencies even when the enclosing checkout supplies them', async () => {
  const buildRoot = path.resolve('build');
  await mkdir(buildRoot, { recursive: true });
  const root = await mkdtemp(path.join(buildRoot, 'packaged-startup-fixture-'));
  try {
    const app = path.join(root, 'app-sidecar');
    const script = path.join(app, 'build/server/index.js');
    await mkdir(path.dirname(script), { recursive: true });
    await writeFile(path.join(app, 'package.json'), JSON.stringify({ type: 'module', version: '0.0.1' }));
    await writeFile(script, entry);
    assert.ok(createRequire(script).resolve('fflate'), 'Fixture must be able to borrow the checkout dependency');
    await assert.rejects(verifyPackagedPlatformStartup(root), /Cannot find package 'fflate'/);
    const unsafeTemp = path.join(root, 'checkout-temp');
    await mkdir(unsafeTemp);
    await assert.rejects(promisify(execFile)(process.execPath,
      ['scripts/verify-packaged-platform-startup.mjs', '--resources', root],
      { env: { ...process.env, TEMP: unsafeTemp, TMP: unsafeTemp, TMPDIR: unsafeTemp }, timeout: 10_000 }),
    /Startup isolation requires a TEMP\/TMPDIR with no ancestor node_modules/);
    await cp(path.resolve('node_modules/fflate'), path.join(app, 'node_modules/fflate'), { recursive: true });
    assert.deepEqual(await verifyPackagedPlatformStartup(root), {
      platformStartup: true, version: '0.0.1', isolatedState: true, runtime: 'unavailable-fixture',
    });
    await writeFile(script, entry.replace(
      "process.stdin.on('end', () => server.close(() => process.exit(0)));",
      "process.stdin.on('end', () => {}); process.on('SIGTERM', () => {});",
    ));
    assert.equal((await verifyPackagedPlatformStartup(root, { shutdownTimeoutMs: 100 })).platformStartup, true,
      'A sidecar ignoring graceful shutdown and SIGTERM must still be reaped');
    await writeFile(script, 'process.exit(0);');
    await assert.rejects(verifyPackagedPlatformStartup(root), /exited before readiness/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

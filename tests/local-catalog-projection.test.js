import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readLocalCatalogInformation } from '../build/server/platform/runtime/localCatalogProjection.js';

test('local informational reads use the selected package contract and never read it for a remote connection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cats-local-catalog-'));
  try {
    const pkg = join(root, 'runtime-package'); await mkdir(pkg);
    await writeFile(join(pkg, 'package.json'), JSON.stringify({ type: 'module', exports: { './catalogs': './catalogs.js' } }));
    await writeFile(join(pkg, 'catalogs.js'), `
      export const catalogCapabilities = {schemaVersion:2,bindingVersion:1,localOverrides:true};
      export function readLocalCatalogProjection(paths) {
        if (!paths.configPath.endsWith('custom.yaml')) throw new Error('wrong config scope');
        return {source:'local_candidate',diagnostics:[],snapshot:{catalogRevision:'fixture-new',document:{catalogs:[
          {provider:'pi',backend:'cli',models:[{id:'Unknown.ID',label:'Unknown [subscription]'}]}
        ]}}};
      }
    `);
    const config = { runtimeBaseUrl: 'http://127.0.0.1:3110', runtimeDir: join(root, 'profile'),
      runtimeCatalogPackageRoot: pkg, runtimeCatalogConfigPath: join(root, 'custom.yaml') };
    const before = await readdir(root);
    const local = await readLocalCatalogInformation(config);
    assert.equal(local.source, 'local_candidate');
    assert.equal(local.catalogRevision, 'fixture-new');
    assert.equal(local.scopes[0].models[0].label, 'Unknown [subscription]');
    assert.deepEqual(await readdir(root), before, 'host reads must not create or activate a profile');
    assert.deepEqual(await readLocalCatalogInformation({ ...config, runtimeBaseUrl: 'https://remote.example.test',
      runtimeCatalogPackageRoot: join(root, 'missing-package') }), { source: 'remote', diagnostics: [], scopes: [] });
    const unsupported = await readLocalCatalogInformation({ ...config, runtimeCatalogPackageRoot: join(root, 'missing-package') });
    assert.equal(unsupported.source, 'unavailable');
    assert.deepEqual(unsupported.scopes, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

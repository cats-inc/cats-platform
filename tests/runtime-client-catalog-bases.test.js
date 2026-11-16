import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CatsRuntimeClient } from '../build/server/runtime/client.js';
import { readLocalCatalogInformation } from '../build/server/platform/runtime/localCatalogProjection.js';

// Runtime SPEC-045: catalog bases through the Runtime client.

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const REVISION = { catalogRevision: 'R', catalogActivationId: 'A' };
const BASES = [{ label: 'global', region: { id: 'global', label: 'global' }, detected: false },
  { id: 'mainland-cn', label: 'mainland-cn', region: { id: 'mainland-cn', label: 'mainland-cn' }, detected: true }];

function advanced(basisId) {
  const entries = basisId ? [{ id: 'cn-only', label: 'CN' }, { id: 'shared', label: 'Shared' }] : [{ id: 'k3', label: 'K3' }, { id: 'shared', label: 'Shared' }];
  return { provider: 'kimi', backend: 'cli', instance: 'cli/native', ...REVISION, source: 'config', cache: null,
    defaultModel: null, entries, presets: [], controls: [], support: { tier: 'entry_only', notes: [] },
    defaultSelection: { entryId: entries[0].id, entryMode: 'explicit', ...(basisId ? { basisId } : {}) },
    ...(basisId ? { basisId } : {}), bases: BASES, warnings: [] };
}

async function withRuntime({ catalogBases = true, sessionStatus = 201, sessionCode, known = ['mainland-cn'] } = {}, run) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ path: url.pathname, basis: url.searchParams.get('basis'), body: init.body ? JSON.parse(init.body) : null });
    if (url.pathname === '/providers/catalogs') return json({ schemaVersion: 2, bindingVersion: 1, localOverrides: true, ...(catalogBases ? { catalogBases: true } : {}) });
    if (url.pathname === '/providers/kimi/models') {
      return json({ provider: 'kimi', backend: 'cli', instance: 'cli/native', ...REVISION, source: 'config', cache: null,
        defaultModel: null, models: advanced(null).entries, warnings: [] });
    }
    if (url.pathname === '/providers/kimi/models/advanced') {
      const basis = url.searchParams.get('basis');
      if (basis && !known.includes(basis)) {
        return json({ error: `Catalog basis '${basis}' does not exist for kimi/cli; choose a listed basis.`, code: 'catalog_basis_unknown' }, 400);
      }
      return json(advanced(basis));
    }
    if (url.pathname === '/sessions') {
      const selection = JSON.parse(init.body).modelSelection;
      return sessionStatus === 201
        ? json({ id: 'session-1', providerName: 'kimi', status: 'ready', modelSelection: selection }, 201)
        : json({ error: `Catalog basis '${selection.basisId}' does not exist for kimi/cli; choose a listed basis.`,
          ...(sessionCode ? { code: sessionCode } : {}) }, sessionStatus);
    }
    throw new Error(`unexpected request ${url.pathname}`);
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const onMainland = { basisId: 'mainland-cn', entryId: 'cn-only', entryMode: 'explicit', catalogRevision: 'R' };

test('advanced reads name the basis and keep the bases list', async () => {
  await withRuntime({}, async (calls) => {
    const client = new CatsRuntimeClient('http://runtime.test');
    const catalog = await client.getAdvancedProviderModels('kimi', 'cli/native', { basisId: 'mainland-cn' });
    assert.equal(calls[0].basis, 'mainland-cn');
    assert.equal(catalog.basisId, 'mainland-cn');
    assert.equal(catalog.bases.length, 2);
    await client.getAdvancedProviderModels('kimi', 'cli/native');
    assert.equal(calls[1].basis, null);
    await assert.rejects(client.getAdvancedProviderModels('kimi', 'cli/native', { basisId: 'retired' }),
      { status: 400, code: 'catalog_basis_unknown' });
  });
});

test('a session carries its basisId to a Runtime that serves bases', async () => {
  await withRuntime({}, async (calls) => {
    const client = new CatsRuntimeClient('http://runtime.test');
    const session = await client.createSession({ provider: 'kimi', instance: 'cli/native', model: 'cn-only', modelSelection: onMainland });
    assert.deepEqual(calls.find((call) => call.path === '/sessions').body.modelSelection, onMainland);
    assert.equal(session.modelSelection.basisId, 'mainland-cn');
  });
});

test('a Runtime without catalog bases never gets a basisId: the saved choice needs attention', async () => {
  await withRuntime({ catalogBases: false }, async (calls) => {
    const client = new CatsRuntimeClient('http://runtime.test');
    await assert.rejects(
      client.createSession({ provider: 'kimi', instance: 'cli/native', model: 'cn-only', modelSelection: onMainland }),
      { status: 409, code: 'catalog_selection_unmappable', message: /saved list basis "mainland-cn" is no longer offered/ });
    assert.equal(calls.some((call) => call.path === '/sessions'), false);
    // A selection on the first basis does not depend on the capability.
    await client.createSession({ provider: 'kimi', instance: 'cli/native', model: 'k3',
      modelSelection: { entryId: 'k3', entryMode: 'explicit', catalogRevision: 'R' } });
    assert.equal(calls.filter((call) => call.path === '/sessions').length, 1);
  });
});

test('a session for a basis Runtime no longer has becomes the saved-choice attention', async () => {
  await withRuntime({ sessionStatus: 400, known: [] }, async (calls) => {
    const client = new CatsRuntimeClient('http://runtime.test');
    await assert.rejects(
      client.createSession({ provider: 'kimi', instance: 'cli/native', model: 'cn-only', modelSelection: onMainland }),
      { status: 409, code: 'catalog_selection_unmappable' });
    assert.equal(calls.filter((call) => call.path === '/sessions').length, 1, 'no retry with another basis');
    assert.equal(calls.find((call) => call.path === '/providers/kimi/models/advanced').basis, 'mainland-cn');
  });
  // A Runtime that names the error needs no read-back.
  await withRuntime({ sessionStatus: 400, sessionCode: 'catalog_basis_unknown' }, async (calls) => {
    const client = new CatsRuntimeClient('http://runtime.test');
    await assert.rejects(
      client.createSession({ provider: 'kimi', instance: 'cli/native', model: 'cn-only', modelSelection: onMainland }),
      { status: 409, code: 'catalog_selection_unmappable' });
    assert.equal(calls.some((call) => call.path === '/providers/kimi/models/advanced'), false);
  });
  // Any other 400 keeps its own error.
  await withRuntime({ sessionStatus: 400 }, async () => {
    const client = new CatsRuntimeClient('http://runtime.test');
    await assert.rejects(
      client.createSession({ provider: 'kimi', instance: 'cli/native', model: 'cn-only', modelSelection: onMainland }),
      (error) => error.status === 400);
  });
});

test('local informational scopes keep their basis id, so two bases do not overwrite each other', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cats-local-catalog-bases-'));
  try {
    const pkg = join(root, 'runtime-package'); await mkdir(pkg);
    await writeFile(join(pkg, 'package.json'), JSON.stringify({ type: 'module', exports: { './catalogs': './catalogs.js' } }));
    await writeFile(join(pkg, 'catalogs.js'), `
      export const catalogCapabilities = {schemaVersion:2,bindingVersion:1,localOverrides:true,catalogBases:true};
      export function readLocalCatalogProjection() {
        return {source:'local_candidate',diagnostics:[],snapshot:{catalogRevision:'R',document:{catalogs:[
          {provider:'kimi',backend:'cli',basis:{region:{id:'global',label:'global'}},models:[{id:'shared',label:'Shared (global)'}]},
          {provider:'kimi',backend:'cli',basis:{id:'mainland-cn',region:{id:'mainland-cn',label:'mainland-cn'}},models:[{id:'shared',label:'Shared (cn)'}]}
        ]}}};
      }
    `);
    const local = await readLocalCatalogInformation({ runtimeBaseUrl: 'http://127.0.0.1:3110', runtimeDir: join(root, 'profile'),
      runtimeCatalogPackageRoot: pkg });
    assert.deepEqual(local.scopes.map((scope) => [scope.provider, scope.basisId ?? null, scope.models[0].label]),
      [['kimi', null, 'Shared (global)'], ['kimi', 'mainland-cn', 'Shared (cn)']]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

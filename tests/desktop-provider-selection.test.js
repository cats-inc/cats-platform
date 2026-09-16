import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeSetupTarget, targetsForSetupHelper, withSelectedSetupTargets, retryPendingSetupOperationReleases, pauseSelectedSetupHelpers } from '../build/desktop/providerSelection.js';
import { resolveSelectedSetupAuditActions } from '../build/desktop/setupAudit.js';

function selection(providers = []) {
  const targets = providers.map(nativeSetupTarget);
  return { state: targets.length ? 'selected' : 'empty', revision: 'one', targets,
    nativeSetupTargets: targets, diskChanged: false, error: null };
}

for (const [platform, prefix] of [['win32', 'windows'], ['darwin', 'macos'], ['linux', 'linux']]) {
  test(`${platform} runs only setup checks needed by selected providers`, () => {
    assert.deepEqual(resolveSelectedSetupAuditActions(null, platform), []);
    assert.deepEqual(resolveSelectedSetupAuditActions(selection(), platform), []);
    assert.deepEqual(resolveSelectedSetupAuditActions(selection(['claude']), platform), []);
    assert.deepEqual(resolveSelectedSetupAuditActions(selection(['cline']), platform), [{ helperId: `${prefix}-node-host-installer` }]);
    assert.deepEqual(resolveSelectedSetupAuditActions(selection(['codex', 'ollama']), platform), [
      { helperId: `${prefix}-node-host-installer` }, { helperId: `${prefix}-ollama-local-model-installer` },
    ]);
    assert.deepEqual(targetsForSetupHelper(`${prefix}-codex-native-installer`, selection(['codex'])), [nativeSetupTarget('codex')]);
    assert.throws(() => targetsForSetupHelper(`${prefix}-claude-native-installer`, selection(['codex'])), /outside/);
    assert.throws(() => targetsForSetupHelper(`${prefix}-install-readiness-audit`, selection(['codex'])), /scope/);
  });
}

test('remote variants and a remote Ollama named local cannot admit local helpers', () => {
  const remote = { ...selection(['codex', 'ollama']), nativeSetupTargets: [] };
  assert.deepEqual(resolveSelectedSetupAuditActions(remote, 'linux'), []);
  assert.throws(() => targetsForSetupHelper('linux-node-host-installer', remote), /outside/);
  assert.throws(() => targetsForSetupHelper('linux-ollama-local-model-installer', remote), /outside/);
});

test('a setup helper holds its exact selected target through execution and releases on failure', async () => {
  const calls = [];
  let id;
  await assert.rejects(withSelectedSetupTargets({ baseUrl: 'http://runtime.test',
    helperId: 'windows-codex-native-installer',
    fetch: async (url, init) => {
      calls.push([new URL(url).pathname, init?.method ?? 'GET']);
      if (url.endsWith('/setup-state')) return Response.json({ selection: selection(['codex']) });
      if (init?.method === 'POST') {
        const { operationId, ...body } = JSON.parse(init.body);
        id = operationId;
        assert.match(id, /^[0-9a-f-]{36}$/);
        assert.deepEqual(body, { target: nativeSetupTarget('codex'), expectedRevision: 'one' });
        return Response.json({ operationId });
      }
      return new Response(null, { status: 204 });
    }, run: async () => { calls.push(['run']); throw new Error('installer failed'); },
  }), /installer failed/);
  assert.deepEqual(calls, [['/setup-state', 'GET'], ['/setup-operations', 'POST'], ['run'], [`/setup-operations/${id}`, 'DELETE']]);
});

test('a rejected revision never starts a setup helper', async () => {
  let ran = false;
  await assert.rejects(withSelectedSetupTargets({ baseUrl: 'http://runtime.test',
    helperId: 'linux-codex-native-installer',
    fetch: async (url, init) => url.endsWith('/setup-state')
      ? Response.json({ selection: selection(['codex']) }) : new Response(null, { status: init?.method === 'DELETE' ? 204 : 409 }),
    run: async () => { ran = true; },
  }), /changed/);
  assert.equal(ran, false);
});

test('keeps completed helper results and retries a lost release receipt', async () => {
  let deletes = 0;
  const result = await withSelectedSetupTargets({ baseUrl: 'http://runtime.test',
    helperId: 'linux-codex-native-installer', fetch: async (url, init) => {
      if (url.endsWith('/setup-state')) return Response.json({ selection: selection(['codex']) });
      if (init?.method === 'POST') return new Response('unreadable body', { status: 201 });
      if (++deletes === 1) throw new Error('connection dropped');
      return new Response(null, { status: 204 });
    }, run: async () => 'installed',
  });
  assert.equal(result, 'installed');
  await retryPendingSetupOperationReleases();
  assert.equal(deletes, 2);
});

test('host restart waits for active helpers and receipt release while rejecting new work', async () => {
  let finish;
  let started;
  const gate = new Promise((resolve) => { finish = resolve; });
  const ready = new Promise((resolve) => { started = resolve; });
  let released = false;
  const options = { baseUrl: 'http://runtime.test', helperId: 'linux-codex-native-installer',
    fetch: async (url, init) => {
      if (url.endsWith('/setup-state')) return Response.json({ selection: selection(['codex']) });
      if (init?.method === 'DELETE') released = true;
      return new Response(null, { status: 204 });
    }, run: async () => { started(); await gate; },
  };
  const running = withSelectedSetupTargets(options);
  await ready;
  const pause = pauseSelectedSetupHelpers();
  try {
    let drained = false;
    void pause.drained.then(() => { drained = true; });
    await assert.rejects(withSelectedSetupTargets(options), /restarting or stopping/);
    assert.equal(drained, false);
    finish();
    await running;
    await pause.drained;
    assert.equal(released, true);
    assert.equal(drained, true);
  } finally { finish(); pause.resume(); }
  await withSelectedSetupTargets({ ...options, run: async () => 'after recovery' });
});

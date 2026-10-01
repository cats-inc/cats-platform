import assert from 'node:assert/strict';
import test from 'node:test';

import { CatsRuntimeClient } from '../build/server/runtime/client.js';

const conflict = 'Catalog changed; choose the model again from the current catalog.';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function catalogs(revision = 'R2', activation = 'A2') {
  const models = [{ id: 'opus', label: 'Opus 5.5', default: true }, { id: 'sonnet', label: 'Sonnet 5.5' }];
  const base = {
    catalogRevision: revision, catalogActivationId: activation, provider: 'claude', backend: 'cli',
    instance: 'cli/native', defaultModel: 'opus', source: 'config', cache: null, warnings: [],
  };
  return {
    models: { ...base, models },
    advanced: {
      ...base,
      entries: models,
      presets: [],
      controls: [{
        key: 'claude.reasoning_effort', label: 'Reasoning effort', kind: 'enum', scope: 'session_default',
        values: [{ value: 'medium', label: 'Medium' }, { value: 'xhigh', label: 'xHigh' }],
      }],
      defaultSelection: { entryId: 'opus', entryMode: 'explicit', controls: { 'claude.reasoning_effort': 'medium' } },
      support: { tier: 'full', notes: [] },
    },
  };
}

// Answers like Runtime: a stale catalogRevision on session create is a 409.
async function withRuntime(current, run) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ path: url.pathname, body: init.body ? JSON.parse(init.body) : null });
    if (url.pathname === '/providers/claude/models') return json(current.models);
    if (url.pathname === '/providers/claude/models/advanced') return json(current.advanced);
    if (url.pathname === '/sessions') {
      const selection = JSON.parse(init.body).modelSelection;
      return selection?.catalogRevision && selection.catalogRevision !== current.models.catalogRevision
        ? json({ error: conflict }, 409)
        : json({ id: 'session-1', providerName: 'claude', status: 'ready', modelSelection: selection });
    }
    throw new Error(`unexpected request ${url.pathname}`);
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const savedOpus = {
  entryId: 'opus', entryMode: 'explicit', catalogRevision: 'R1', controls: { 'claude.reasoning_effort': 'medium' },
};

test('createSession re-stamps a saved selection that the new catalog still offers', async () => {
  await withRuntime(catalogs(), async (calls) => {
    const client = new CatsRuntimeClient('http://runtime.test');
    const session = await client.createSession({
      provider: 'claude', instance: 'cli/native', model: 'opus', modelSelection: savedOpus,
    });
    const creates = calls.filter((call) => call.path === '/sessions');
    assert.equal(creates.length, 2);
    assert.deepEqual(creates[1].body.modelSelection, { ...savedOpus, catalogRevision: 'R2' });
    assert.equal(session.modelSelection.catalogRevision, 'R2');
  });
});

test('createSession names a saved option the new catalog no longer offers instead of substituting one', async () => {
  await withRuntime(catalogs(), async (calls) => {
    const client = new CatsRuntimeClient('http://runtime.test');
    await assert.rejects(
      client.createSession({
        provider: 'claude', instance: 'cli/native', model: 'opus',
        modelSelection: { ...savedOpus, controls: { 'claude.reasoning_effort': 'ultracode' } },
      }),
      (error) => error.code === 'catalog_selection_unmappable'
        && /Reasoning effort "ultracode" is no longer offered for Opus 5\.5/.test(error.message),
    );
    assert.equal(calls.filter((call) => call.path === '/sessions').length, 1);
  });
});

test('createSession names a saved model the new catalog removed', async () => {
  await withRuntime(catalogs(), async () => {
    const client = new CatsRuntimeClient('http://runtime.test');
    await assert.rejects(
      client.createSession({
        provider: 'claude', instance: 'cli/native', model: 'claude-opus-4-5',
        modelSelection: { ...savedOpus, entryId: 'claude-opus-4-5' },
      }),
      (error) => error.code === 'catalog_selection_unmappable' && /"claude-opus-4-5" is no longer/.test(error.message),
    );
  });
});

test('createSession does not retry when the catalog cannot settle the conflict', async () => {
  // Base and advanced reads from different activations never form a selection.
  const split = catalogs();
  split.advanced = catalogs('R2', 'A3').advanced;
  await withRuntime(split, async (calls) => {
    const client = new CatsRuntimeClient('http://runtime.test');
    await assert.rejects(
      client.createSession({ provider: 'claude', instance: 'cli/native', model: 'opus', modelSelection: savedOpus }),
      (error) => error.status === 409 && error.message === conflict,
    );
    assert.equal(calls.filter((call) => call.path === '/sessions').length, 1);
  });
});

test('createSession leaves other failures alone', async () => {
  const originalFetch = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async (input) => {
    paths.push(new URL(String(input)).pathname);
    return json({ error: 'Provider not configured' }, 400);
  };
  try {
    const client = new CatsRuntimeClient('http://runtime.test');
    await assert.rejects(
      client.createSession({ provider: 'claude', model: 'opus', modelSelection: savedOpus }),
      (error) => error.status === 400 && error.message === 'Provider not configured',
    );
    assert.deepEqual(paths, ['/sessions']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

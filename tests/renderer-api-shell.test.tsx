import assert from 'node:assert/strict';
import test from 'node:test';

import {
  browseDirectories,
  inspectPath,
  openFolderInExplorer,
} from '../src/products/shared/renderer/api/shell.ts';

test('browseDirectories calls the shell browse endpoint with an encoded optional path', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        current: 'C:/repo',
        parent: 'C:/',
        entries: [{ name: 'src', path: 'C:/repo/src' }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const signal = new AbortController().signal;
    const payload = await browseDirectories('C:/repo/demo folder', signal);
    assert.deepEqual(payload, {
      current: 'C:/repo',
      parent: 'C:/',
      entries: [{ name: 'src', path: 'C:/repo/src' }],
    });
    assert.equal(calls[0]?.url, '/api/shell/browse?path=C%3A%2Frepo%2Fdemo%20folder');
    assert.equal(calls[0]?.init?.method, 'GET');
    assert.deepEqual(calls[0]?.init?.headers, {
      Accept: 'application/json',
    });
    assert.equal(calls[0]?.init?.signal, signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('inspectPath calls the inspect endpoint and surfaces fallback errors through expectJson', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        error: { message: 'inspect failed' },
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    };

    await assert.rejects(
      () => inspectPath('C:/repo/path with spaces'),
      /inspect failed/u,
    );
    assert.equal(
      calls[0]?.url,
      '/api/shell/inspect-path?path=C%3A%2Frepo%2Fpath%20with%20spaces',
    );
    assert.equal(calls[0]?.init?.method, 'GET');
    assert.deepEqual(calls[0]?.init?.headers, {
      Accept: 'application/json',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('openFolderInExplorer posts the selected folder path as json', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(null, { status: 204 });
    };

    await openFolderInExplorer('C:/repo/demo');
    assert.equal(calls[0]?.url, '/api/shell/open-folder');
    assert.equal(calls[0]?.init?.method, 'POST');
    assert.deepEqual(calls[0]?.init?.headers, {
      'content-type': 'application/json',
    });
    assert.equal(calls[0]?.init?.body, JSON.stringify({ path: 'C:/repo/demo' }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

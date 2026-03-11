import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createServer } from '../dist-server/server.js';
import { MemoryWorkspaceStore } from '../dist-server/workspace/store.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  workspaceStatePath: 'unused-for-tests',
};

async function withServer(runtimeClient, callback, workspaceStore = new MemoryWorkspaceStore()) {
  const server = createServer({
    config: baseConfig,
    runtimeClient,
    workspaceStore,
    now: () => new Date('2026-03-11T00:00:00.000Z'),
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address');
  }

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('GET /health reports runtime reachability', async () => {
  const runtimeClient = {
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
    },
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.service, 'cats-inc');
    assert.equal(payload.status, 'ok');
    assert.equal(payload.runtime.service, 'cats-runtime');
    assert.equal(payload.runtime.reachable, true);
  });
});

test('GET /api/app-shell exposes the planned workspace contract', async () => {
  const runtimeClient = {
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: false,
        status: 'error',
        error: 'connect ECONNREFUSED',
      };
    },
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.app.name, 'cats-inc');
    assert.equal(payload.app.runtimeBoundary, 'cats-runtime');
    assert.equal(payload.workspace.selectedChannelId, 'launchpad');
    assert.equal(payload.workspace.channels.length, 3);
    assert.equal(payload.workspace.channels[0].title, 'Launchpad');
    assert.equal(payload.workspace.capabilities.multiChannel, true);
    assert.equal(payload.workspace.capabilities.persistence, 'file-backed');
    assert.equal(payload.runtime.reachable, false);
  });
});

test('POST /api/workspace/selection persists selected channel state', async () => {
  const runtimeClient = {
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
    },
  };

  const workspaceStore = new MemoryWorkspaceStore();

  await withServer(runtimeClient, async (baseUrl) => {
    const updateResponse = await fetch(`${baseUrl}/api/workspace/selection`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ selectedChannelId: 'runtime-debug' }),
    });

    assert.equal(updateResponse.status, 200);

    const updatePayload = await updateResponse.json();
    assert.equal(updatePayload.workspace.selectedChannelId, 'runtime-debug');

    const fetchResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(fetchResponse.status, 200);

    const fetchPayload = await fetchResponse.json();
    assert.equal(fetchPayload.workspace.selectedChannelId, 'runtime-debug');
  }, workspaceStore);
});

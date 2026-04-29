import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCatsRuntimeAppToolCallRequest,
  executeCatsRuntimeBackedAppTool,
} from '../src/platform/apps/runtimeToolBridge.ts';
import {
  createCatsAppToolRegistrations,
} from '../src/platform/apps/toolRegistration.ts';
import type {
  CatsAgentToolContribution,
  CatsAppManifestV1,
  CatsInstalledAppRecord,
} from '../src/shared/catsAppManifest.ts';

function tool(
  overrides: Partial<CatsAgentToolContribution> = {},
): CatsAgentToolContribution {
  return {
    name: 'connector.calendar.search',
    title: 'Search calendar',
    description: 'Search calendar events.',
    inputSchema: {},
    outputSchema: {},
    runtimeBridge: 'cats-runtime',
    ...overrides,
  };
}

function record(
  declaration: CatsAgentToolContribution,
): CatsInstalledAppRecord {
  const manifest: CatsAppManifestV1 = {
    schemaVersion: 1,
    id: 'connector.calendar',
    displayName: 'Calendar Connector',
    version: '0.1.0',
    category: 'capability-connector',
    trustTier: 'local-user',
    publisher: {
      name: 'Local User',
    },
    compatibility: {
      catsPlatform: '^0.1.0',
      appSdk: '1.x',
    },
    contributions: {
      connectors: [
        {
          id: 'calendar',
          service: 'calendar',
          capabilities: ['calendar.read'],
        },
      ],
      tools: [declaration],
    },
    permissions: ['agent.tools.register'],
  };

  return {
    id: manifest.id,
    manifest,
    packagePath: '/tmp/connector.calendar',
    installState: 'enabled',
    enabled: true,
    installedAt: '2026-04-30T00:00:00.000Z',
    updatedAt: '2026-04-30T00:00:00.000Z',
  };
}

test('createCatsRuntimeAppToolCallRequest builds a cats-runtime MCP tools/call request', () => {
  const [registration] = createCatsAppToolRegistrations([record(tool())]);

  assert.ok(registration);
  assert.deepEqual(
    createCatsRuntimeAppToolCallRequest({
      registration,
      input: { query: 'today' },
      actionId: 'action-1',
      runId: 'run-1',
      actorRef: 'actor-owner',
    }),
    {
      jsonrpc: '2.0',
      id: 'run-1:action-1:connector.calendar.search',
      method: 'tools/call',
      params: {
        name: 'connector.calendar.search',
        arguments: { query: 'today' },
        _meta: {
          catsAppId: 'connector.calendar',
          catsPackagePath: '/tmp/connector.calendar',
          catsActionId: 'action-1',
          catsRunId: 'run-1',
          catsActorRef: 'actor-owner',
          catsRuntimeBridge: 'cats-runtime',
        },
      },
    },
  );
});

test('executeCatsRuntimeBackedAppTool invokes cats-runtime through RuntimeClient.callMcp', async () => {
  const [registration] = createCatsAppToolRegistrations([record(tool())]);
  const calls: unknown[] = [];
  const result = await executeCatsRuntimeBackedAppTool({
    runtimeClient: {
      async callMcp(request) {
        calls.push(request);
        return { ok: true };
      },
    },
    registration: registration!,
    input: { query: 'today' },
    actionId: 'action-1',
    runId: 'run-1',
    actorRef: 'actor-owner',
  });

  assert.equal(result.status, 'applied');
  if (result.status === 'applied') {
    assert.deepEqual(result.result, { ok: true });
  }
  assert.equal(calls.length, 1);
  assert.deepEqual((calls[0] as { params: { arguments: unknown } }).params.arguments, {
    query: 'today',
  });
});

test('executeCatsRuntimeBackedAppTool rejects non-runtime app tool declarations', async () => {
  const [registration] = createCatsAppToolRegistrations([
    record(tool({ runtimeBridge: 'platform' })),
  ]);
  let callCount = 0;
  const result = await executeCatsRuntimeBackedAppTool({
    runtimeClient: {
      async callMcp() {
        callCount += 1;
        return { ok: true };
      },
    },
    registration: registration!,
    input: {},
    actionId: 'action-1',
    runId: 'run-1',
    actorRef: 'actor-owner',
  });

  assert.equal(result.status, 'rejected');
  assert.equal(callCount, 0);
});

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreRun } from '../src/core/model/executionRecords.ts';
import { upsertCoreTask } from '../src/core/model/taskControls.ts';
import { upsertCoreConversation } from '../src/core/model/structuralRecords.ts';
import { MemoryCoreStore, type CoreStore } from '../src/core/store.ts';
import { routeCodeApi } from '../src/products/code/api/index.ts';
import { CODE_API_ARTIFACT_DECLARATIONS_PATH } from '../src/products/code/shared/apiPaths.ts';
import type {
  CodeArtifactDeclarationAnchors,
  CodeArtifactProducer,
  CodeArtifactToolInput,
} from '../src/products/code/shared/artifactDeclaration.ts';

const NOW = new Date('2026-04-30T11:00:00.000Z');

function createAnchoredStore(): MemoryCoreStore {
  let core = createDefaultCoreState();
  core = upsertCoreConversation(core, {
    id: 'conversation-code-route',
    title: 'Code route conversation',
    kind: 'code_thread',
    status: 'active',
  }).core;
  core = upsertCoreTask(core, {
    id: 'task-code-route',
    title: 'Route task',
    status: 'in_progress',
    conversationId: 'conversation-code-route',
  }).core;
  core = upsertCoreRun(core, {
    id: 'run-code-route',
    title: 'Route run',
    status: 'running',
    conversationId: 'conversation-code-route',
    taskId: 'task-code-route',
  }).core;
  return new MemoryCoreStore(core);
}

function createDeclarationInput(
  overrides: Partial<CodeArtifactToolInput> = {},
): CodeArtifactToolInput {
  return {
    declarationId: 'preview-route:preview_url',
    title: 'Route preview',
    label: 'preview_url',
    summary: 'Preview from route.',
    location: {
      kind: 'url',
      value: 'http://127.0.0.1:5173/',
    },
    ...overrides,
  };
}

function createProducer(overrides: Partial<CodeArtifactProducer> = {}): CodeArtifactProducer {
  return {
    kind: 'agent',
    actorId: 'actor-code-route',
    runtimeSessionId: 'session-code-route',
    ...overrides,
  };
}

function createAnchors(
  overrides: Partial<CodeArtifactDeclarationAnchors> = {},
): CodeArtifactDeclarationAnchors {
  return {
    conversationId: 'conversation-code-route',
    taskId: 'task-code-route',
    runId: 'run-code-route',
    workspacePath: 'C:/repo/cats-platform',
    ...overrides,
  };
}

function createSubmitBody(input: {
  declaration?: Partial<CodeArtifactToolInput> & Record<string, unknown>;
  producer?: Partial<CodeArtifactProducer>;
  anchors?: Partial<CodeArtifactDeclarationAnchors>;
} = {}) {
  return {
    declaration: createDeclarationInput(input.declaration),
    producer: createProducer(input.producer),
    anchors: createAnchors(input.anchors),
  };
}

function createTestServer(
  store: CoreStore,
  options: {
    logger?: { error(message: string, context?: Record<string, unknown>): void };
  } = {},
) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const handled = await routeCodeApi({
        request,
        response,
        url,
        method: request.method ?? 'GET',
        dependencies: {
          coreStore: store,
          runtimeClient: {} as never,
          config: {} as never,
          ...(options.logger ? { logger: options.logger } : {}),
          now: () => NOW,
        },
      });
      if (!handled) {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'not found' }));
      }
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  });
}

async function request(
  server: ReturnType<typeof createServer>,
  method: string,
  path: string,
  body?: unknown,
) {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server is not listening.');
  }
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    payload: text ? JSON.parse(text) as Record<string, unknown> : null,
  };
}

test('POST /api/code/artifacts/declarations materializes an artifact', async (t) => {
  const store = createAnchoredStore();
  const server = createTestServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const response = await request(server, 'POST', CODE_API_ARTIFACT_DECLARATIONS_PATH, {
    ...createSubmitBody(),
  });

  assert.equal(response.status, 201);
  const artifactProjection = response.payload?.artifact as
    | { artifact?: { id?: string; kind?: string; status?: string; path?: string | null } }
    | undefined;
  assert.equal(artifactProjection?.artifact?.kind, 'preview');
  assert.equal(artifactProjection?.artifact?.status, 'ready');
  assert.equal(artifactProjection?.artifact?.path, 'http://127.0.0.1:5173/');
  assert.equal((response.payload?.toolResult as { status?: string }).status, 'accepted');

  const core = await store.readCore();
  assert.equal(core.artifacts.length, 1);
  assert.equal(core.artifacts[0]?.id, artifactProjection?.artifact?.id);
});

test('POST /api/code/artifacts/declarations reuses idempotent artifacts', async (t) => {
  const store = createAnchoredStore();
  const server = createTestServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const first = await request(server, 'POST', CODE_API_ARTIFACT_DECLARATIONS_PATH, {
    ...createSubmitBody(),
  });
  const second = await request(server, 'POST', CODE_API_ARTIFACT_DECLARATIONS_PATH, {
    ...createSubmitBody({
      declaration: {
        summary: 'Updated preview summary.',
      },
    }),
  });

  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.payload?.created, false);
  const core = await store.readCore();
  assert.equal(core.artifacts.length, 1);
  assert.equal(core.artifacts[0]?.summary, 'Updated preview summary.');
});

test('POST /api/code/artifacts/declarations returns declaration errors', async (t) => {
  const store = createAnchoredStore();
  const server = createTestServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const invalidBody = await request(server, 'POST', CODE_API_ARTIFACT_DECLARATIONS_PATH, {});
  assert.equal(invalidBody.status, 400);
  assert.equal(
    (invalidBody.payload?.error as { code?: string }).code,
    'invalid_artifact_declaration',
  );

  const rawServerField = await request(server, 'POST', CODE_API_ARTIFACT_DECLARATIONS_PATH, {
    ...createSubmitBody({
      declaration: {
        requestedStatus: 'published',
      } as Partial<CodeArtifactToolInput> & Record<string, unknown>,
    }),
  });
  assert.equal(rawServerField.status, 400);
  assert.equal(
    (rawServerField.payload?.error as { code?: string }).code,
    'artifact_producer_field_not_allowed',
  );

  const missingAgentSession = await request(server, 'POST', CODE_API_ARTIFACT_DECLARATIONS_PATH, {
    ...createSubmitBody({ producer: { runtimeSessionId: null } }),
  });
  assert.equal(missingAgentSession.status, 400);
  assert.equal(
    (missingAgentSession.payload?.error as { code?: string }).code,
    'artifact_required_field_empty',
  );

  const unanchoredDeclaration = await request(server, 'POST', CODE_API_ARTIFACT_DECLARATIONS_PATH, {
    ...createSubmitBody({ producer: { kind: 'user', runtimeSessionId: null }, anchors: {} }),
    anchors: {},
  });
  assert.equal(unanchoredDeclaration.status, 422);
  assert.equal(
    (unanchoredDeclaration.payload?.error as { code?: string }).code,
    'artifact_anchor_required',
  );
});

test('POST /api/code/artifacts/declarations logs unexpected declaration failures', async (t) => {
  const baseStore = createAnchoredStore();
  const core = await baseStore.readCore();
  const failingStore: CoreStore = {
    async readCore() {
      return core;
    },
    async writeCore() {
      throw new Error('simulated write failure');
    },
    async updateCore() {
      return core;
    },
  };
  const logs: Array<{ message: string; context?: Record<string, unknown> }> = [];
  const server = createTestServer(failingStore, {
    logger: {
      error(message, context) {
        logs.push({ message, context });
      },
    },
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const response = await request(server, 'POST', CODE_API_ARTIFACT_DECLARATIONS_PATH, {
    ...createSubmitBody(),
  });

  assert.equal(response.status, 422);
  assert.deepEqual(response.payload?.error, {
    code: 'artifact_declaration_failed',
    message: 'Artifact declaration failed.',
  });
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.message, 'Code artifact declaration failed.');
  assert.equal(logs[0]?.context?.path, CODE_API_ARTIFACT_DECLARATIONS_PATH);
  assert.equal(
    (logs[0]?.context?.error as { message?: string } | undefined)?.message,
    'simulated write failure',
  );
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('platform orchestrator dispatch stays behind an injected channel router seam', async () => {
  const source = await readFile(
    new URL('../src/platform/orchestration/dispatch.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /\bchannelRouter\b/u);
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/model\.js/u,
  );
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/runtimeActions\.js/u,
  );
});

test('app server wires the chat orchestrator adapter into platform orchestration', async () => {
  const source = await readFile(
    new URL('../src/app/server/index.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /chatOrchestratorChannelRouter/u);
  assert.match(source, /orchestratorChannelRouter/u);
});

test('platform orchestrator planner stays behind an injected planner surface seam', async () => {
  const source = await readFile(
    new URL('../src/platform/orchestration/planner.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /\bplannerSurface\b/u);
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/model\.js/u,
  );
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/mentionRouter\.js/u,
  );
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/roomRouting\.js/u,
  );
  assert.doesNotMatch(
    source,
    /products\/chat\/shared\/operatorLoop\.js/u,
  );
});

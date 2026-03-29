import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  normalizeCodeBuilderTaskId,
  resolveCodeBuilderExecutionTaskId,
} from '../dist-server/products/code/shared/builderExecution.js';

test('normalizeCodeBuilderTaskId trims usable task ids', () => {
  assert.equal(normalizeCodeBuilderTaskId('  task-123  '), 'task-123');
  assert.equal(normalizeCodeBuilderTaskId('   '), null);
  assert.equal(normalizeCodeBuilderTaskId(null), null);
});

test('resolveCodeBuilderExecutionTaskId prefers an existing task over resume input', () => {
  assert.equal(
    resolveCodeBuilderExecutionTaskId('task-existing', 'task-resume'),
    'task-existing',
  );
  assert.equal(
    resolveCodeBuilderExecutionTaskId(null, ' task-resume '),
    'task-resume',
  );
  assert.equal(resolveCodeBuilderExecutionTaskId(null, '   '), null);
});

test('CodeBuilderView exposes a resume entry and reuses the resolved task id', () => {
  const source = readFileSync(
    new URL('../src/products/code/renderer/components/CodeBuilderView.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /Resume task/u);
  assert.match(source, /resolveCodeBuilderExecutionTaskId\(state\.taskId, resumeTaskId\)/u);
  assert.equal(
    source.includes('Task ${resumedTaskId} is ready to continue in this workspace.'),
    true,
  );
});

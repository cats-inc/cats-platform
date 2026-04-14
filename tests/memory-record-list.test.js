import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addDurableMemory,
  createDefaultCoreState,
  listDurableMemoryBySubject,
} from '../build/server/core/model/index.js';

test('listDurableMemoryBySubject filters scoped durable memories by category, sourceRef, confidence, and limit', () => {
  let core = createDefaultCoreState();

  core = addDurableMemory(core, {
    id: 'memory-1',
    subjectType: 'project',
    subjectId: 'project-1',
    category: 'policy',
    content: 'Primary project memory',
    confidence: 0.9,
    sourceRefs: ['source-1'],
    createdAt: '2026-04-15T05:40:00.000Z',
    updatedAt: '2026-04-15T05:40:00.000Z',
  });

  core = addDurableMemory(core, {
    id: 'memory-2',
    subjectType: 'project',
    subjectId: 'project-1',
    category: 'fact',
    content: 'Secondary project memory',
    confidence: 0.4,
    sourceRefs: ['source-2'],
    createdAt: '2026-04-15T05:41:00.000Z',
    updatedAt: '2026-04-15T05:41:00.000Z',
  });

  core = addDurableMemory(core, {
    id: 'memory-3',
    subjectType: 'relationship',
    subjectId: 'relationship-1',
    category: 'relationship',
    content: 'Relationship memory',
    confidence: 0.8,
    sourceRefs: ['source-1'],
    createdAt: '2026-04-15T05:42:00.000Z',
    updatedAt: '2026-04-15T05:42:00.000Z',
  });

  const records = listDurableMemoryBySubject(core, 'project', 'project-1', {
    categories: ['policy'],
    sourceRefs: ['source-1'],
    minConfidence: 0.8,
    maxConfidence: 1,
    limit: 1,
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].id, 'memory-1');
});

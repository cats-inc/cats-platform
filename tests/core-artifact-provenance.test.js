import assert from 'node:assert/strict';
import test from 'node:test';

import { withCoreArtifactProducer } from '../build/server/core/artifactProvenance.js';
import { createDefaultCoreState } from '../build/server/core/model/index.js';
import { upsertCoreArtifact } from '../build/server/core/model/planningRecords.js';

const NOW = new Date('2026-10-20T00:00:00.000Z');

test('a new artifact belongs to the owner and names the agent its writer names', () => {
  const unnamed = upsertCoreArtifact(createDefaultCoreState(), {
    id: 'artifact-1', title: 'Report', metadata: { source: 'test' },
  }, NOW);
  assert.deepEqual(unnamed.artifact.metadata, {
    source: 'test',
    provenance: { ownerActorId: 'actor-owner', producerActorId: null },
  });

  const named = upsertCoreArtifact(createDefaultCoreState(), {
    id: 'artifact-2', title: 'Report', metadata: withCoreArtifactProducer({}, 'actor-cat-milo'),
  }, NOW);
  assert.deepEqual(named.artifact.metadata.provenance, {
    ownerActorId: 'actor-owner', producerActorId: 'actor-cat-milo',
  });
});

test('an update keeps the provenance its metadata no longer carries', () => {
  const created = upsertCoreArtifact(createDefaultCoreState(), {
    id: 'artifact-1', title: 'Report', metadata: withCoreArtifactProducer({}, 'actor-cat-milo'),
  }, NOW);
  // An owner edit replaces the metadata, as `ownerActions` does.
  const edited = upsertCoreArtifact(created.core, {
    id: 'artifact-1', title: 'Report v2', metadata: { reviewed: true },
  }, NOW);
  assert.deepEqual(edited.artifact.metadata, {
    reviewed: true,
    provenance: { ownerActorId: 'actor-owner', producerActorId: 'actor-cat-milo' },
  });

  const reproduced = upsertCoreArtifact(edited.core, {
    id: 'artifact-1', title: 'Report v3', metadata: withCoreArtifactProducer({}, 'actor-cat-nova'),
  }, NOW);
  assert.deepEqual(reproduced.artifact.metadata.provenance, {
    ownerActorId: 'actor-owner', producerActorId: 'actor-cat-nova',
  });
});

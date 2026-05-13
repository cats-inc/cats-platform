import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreProject,
  upsertCoreWorkItem,
} from '../src/core/model/index.js';
import { buildWorkGraphProjection } from '../src/products/work/api/workGraphProjection.js';
import {
  EXTERNAL_WORK_BINDING_METADATA_KEY,
  buildExternalWorkBinding,
  createExternalWorkBindingsMetadata,
} from '../src/products/work/shared/externalWorkBinding.js';

test('Work Graph projects external issue bindings for Projects and Work Items', () => {
  const now = new Date('2026-05-13T10:00:00.000Z');
  let core = createDefaultCoreState();
  core = upsertCoreProject(core, {
    id: 'project-cats-platform',
    title: 'Cats Platform',
    status: 'active',
    ownerActorId: core.ownerProfile.actorId,
    summary: 'Platform project management surface',
    metadata: {
      [EXTERNAL_WORK_BINDING_METADATA_KEY]: createExternalWorkBindingsMetadata([
        buildExternalWorkBinding({
          localKind: 'project',
          localId: 'project-cats-platform',
          provider: 'redmine',
          externalType: 'project',
          externalId: 'cats-platform',
          externalUrl: 'https://redmine.example.test/projects/cats-platform',
          syncDirection: 'pull',
          linkedAt: '2026-05-13T10:05:00.000Z',
          linkedByActorRef: 'cat:boss',
        }),
      ]),
    },
  }, now).core;
  core = upsertCoreWorkItem(core, {
    id: 'work-item-intake',
    title: 'Implement external issue projection',
    status: 'planned',
    projectId: 'project-cats-platform',
    ownerActorId: core.ownerProfile.actorId,
    metadata: {
      [EXTERNAL_WORK_BINDING_METADATA_KEY]: createExternalWorkBindingsMetadata([
        buildExternalWorkBinding({
          localKind: 'work_item',
          localId: 'work-item-intake',
          provider: 'github',
          externalType: 'issue',
          externalId: '123',
          externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
          syncDirection: 'bidirectional',
          lastSyncedAt: '2026-05-13T10:10:00.000Z',
          externalUpdatedAt: '2026-05-13T10:09:00.000Z',
          linkedAt: '2026-05-13T10:06:00.000Z',
          linkedByActorRef: 'cat:boss',
        }),
      ]),
      workIntake: {
        phase: 'intake',
      },
    },
  }, now).core;

  const projection = buildWorkGraphProjection(core);
  const byId = new Map(projection.objects.map((object) => [object.id, object]));

  assert.deepEqual(byId.get('project-cats-platform')?.externalBindings, [
    {
      provider: 'redmine',
      externalType: 'project',
      externalId: 'cats-platform',
      externalUrl: 'https://redmine.example.test/projects/cats-platform',
      syncDirection: 'pull',
      lastSyncedAt: null,
      externalUpdatedAt: null,
      linkedAt: '2026-05-13T10:05:00.000Z',
      linkedByActorRef: 'cat:boss',
    },
  ]);
  assert.deepEqual(byId.get('work-item-intake')?.externalBindings, [
    {
      provider: 'github',
      externalType: 'issue',
      externalId: '123',
      externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
      syncDirection: 'bidirectional',
      lastSyncedAt: '2026-05-13T10:10:00.000Z',
      externalUpdatedAt: '2026-05-13T10:09:00.000Z',
      linkedAt: '2026-05-13T10:06:00.000Z',
      linkedByActorRef: 'cat:boss',
    },
  ]);
});

test('Work Graph ignores malformed external binding metadata', () => {
  const now = new Date('2026-05-13T10:00:00.000Z');
  let core = createDefaultCoreState();
  core = upsertCoreWorkItem(core, {
    id: 'work-item-bad-external-binding',
    title: 'Malformed binding should not break graph',
    status: 'planned',
    ownerActorId: core.ownerProfile.actorId,
    metadata: {
      [EXTERNAL_WORK_BINDING_METADATA_KEY]: {
        schemaVersion: 1,
        bindings: [
          {
            schemaVersion: 1,
            provider: 'github',
            externalType: 'issue',
          },
        ],
      },
    },
  }, now).core;

  const projection = buildWorkGraphProjection(core);
  const workItem = projection.objects.find(
    (object) => object.id === 'work-item-bad-external-binding',
  );

  assert.equal(workItem?.externalBindings, undefined);
});

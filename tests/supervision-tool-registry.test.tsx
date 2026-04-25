import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  classifySideEffectToolScope,
  createSupervisedToolRegistry,
  evaluateToolSurface,
  filterToolSurface,
  intersectToolScopes,
  type SupervisedToolManifest,
} from '../src/platform/supervision/index.ts';

function manifest(
  name: string,
  sideEffect: SupervisedToolManifest['sideEffect'],
  options: Partial<SupervisedToolManifest> = {},
): SupervisedToolManifest {
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    name,
    manifestVersion: '1.0',
    description: `${name} fixture`,
    sideEffect,
    preflight: sideEffect === 'none' ? 'available' : 'required',
    blocking: 'blocking',
    cancellation: 'cooperative',
    approval: sideEffect === 'none' ? 'never' : 'policy',
    evidence: 'summary',
    failureCodes: sideEffect === 'none' ? [] : ['E_PRECHECK_FAILED'],
    maxBudgetHint: undefined,
    inputSchema: {
      id: `${name}.input`,
      version: '1.0',
      format: 'json_schema',
      uri: `schema://${name}/input/1.0`,
    },
    outputSchema: {
      id: `${name}.output`,
      version: '1.0',
      format: 'json_schema',
      uri: `schema://${name}/output/1.0`,
    },
    ...options,
  };
}

test('registry registers and lists manifests by name', () => {
  const registry = createSupervisedToolRegistry();

  registry.register(manifest('work.local_note.apply', 'local_state'));
  registry.register(manifest('work.context.lookup', 'none'));

  assert.equal(registry.get('work.context.lookup')?.sideEffect, 'none');
  assert.deepEqual(
    registry.list().map((tool) => tool.name),
    ['work.context.lookup', 'work.local_note.apply'],
  );
});

test('registry rejects duplicate manifests', () => {
  const registry = createSupervisedToolRegistry();
  const lookup = manifest('work.context.lookup', 'none');

  registry.register(lookup);

  assert.throws(
    () => registry.register(lookup),
    /Duplicate supervised tool manifest: work\.context\.lookup/,
  );
});

test('registry validates schema references through default and custom hooks', () => {
  const registry = createSupervisedToolRegistry({
    validateSchemaRef: ({ schemaRef }) =>
      schemaRef.id.startsWith('registered.') ? [] : [`unknown schema ${schemaRef.id}`],
  });

  assert.throws(
    () => registry.register(manifest('work.context.lookup', 'none')),
    /unknown schema work\.context\.lookup\.input/,
  );

  const defaultRegistry = createSupervisedToolRegistry();
  assert.throws(
    () =>
      defaultRegistry.register(
        manifest('work.bad_schema.lookup', 'none', {
          inputSchema: {
            id: 'work.bad_schema.lookup.input',
            version: '1.0',
            format: 'json_schema',
            uri: '.local/schema.json',
          },
        }),
      ),
    /schema uri must not be a local-only path/,
  );
});

test('mutating tools without preflight must declare failure codes', () => {
  const registry = createSupervisedToolRegistry();

  assert.throws(
    () =>
      registry.register(
        manifest('work.try_and_see.apply', 'local_state', {
          preflight: 'not_supported',
          failureCodes: [],
        }),
      ),
    /mutating tools without preflight must declare expected failure codes/,
  );
});

test('side-effect classification maps manifests to minimum required scope', () => {
  assert.equal(classifySideEffectToolScope('none'), 'read_only');
  assert.equal(classifySideEffectToolScope('local_state'), 'narrow_write');
  assert.equal(classifySideEffectToolScope('external_visible'), 'broad_write');
  assert.equal(classifySideEffectToolScope('destructive'), 'broad_write');
  assert.equal(classifySideEffectToolScope('expensive'), 'broad_write');
});

test('tool-surface filtering uses parent and policy intersection', () => {
  const tools = [
    manifest('work.context.lookup', 'none'),
    manifest('work.local_note.apply', 'local_state'),
    manifest('work.approval_gated.apply', 'external_visible'),
  ];

  assert.equal(intersectToolScopes('broad_write', 'narrow_write'), 'narrow_write');
  assert.deepEqual(
    filterToolSurface(tools, {
      parentToolScope: 'broad_write',
      policyToolScope: 'narrow_write',
    }).map((tool) => tool.name),
    ['work.context.lookup', 'work.local_note.apply'],
  );
  assert.deepEqual(
    filterToolSurface(tools, {
      parentToolScope: 'read_only',
      policyToolScope: 'broad_write',
    }).map((tool) => tool.name),
    ['work.context.lookup'],
  );
});

test('registry authorization rejects tools outside the effective surface', () => {
  const registry = createSupervisedToolRegistry();
  registry.register(manifest('work.context.lookup', 'none'));
  registry.register(manifest('work.local_note.apply', 'local_state'));

  const allowed = registry.authorize('work.context.lookup', {
    parentToolScope: 'read_only',
    policyToolScope: 'broad_write',
  });
  const rejected = registry.authorize('work.local_note.apply', {
    parentToolScope: 'read_only',
    policyToolScope: 'broad_write',
  });

  assert.equal(allowed.status, 'applied');
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.error.code, 'E_TOOL_SCOPE_DENIED');
  assert.match(rejected.error.message, /requires narrow_write, but effective grant is read_only/);
});

test('surface decisions expose required and effective scopes', () => {
  const decision = evaluateToolSurface(manifest('work.approval_gated.apply', 'external_visible'), {
    parentToolScope: 'narrow_write',
    policyToolScope: 'broad_write',
  });

  assert.equal(decision.requiredToolScope, 'broad_write');
  assert.equal(decision.effectiveToolScope, 'narrow_write');
  assert.equal(decision.allowed, false);
});

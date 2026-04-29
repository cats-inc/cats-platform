import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CODE_ARTIFACT_CLAIM_WITHOUT_DECLARATION,
  CodeArtifactFinalizationGate,
  acceptedDeclarationRefFromToolResult,
} from '../build/server/products/code/state/sessionFinalization.js';

test('artifact finalization gate accepts claims with same-turn accepted declarations', () => {
  const gate = new CodeArtifactFinalizationGate();
  const decision = gate.evaluate({
    finalization: {
      assistantTurnId: 'turn-1',
      bodyText: 'Preview recorded.',
      artifactClaims: [
        {
          declarationId: 'preview-localhost:preview_url',
          label: ' preview_url ',
          title: ' Local preview ',
        },
      ],
    },
    acceptedDeclarations: [
      {
        assistantTurnId: 'turn-1',
        declarationId: 'preview-localhost:preview_url',
        artifactId: 'artifact-1',
      },
    ],
  });

  assert.equal(decision.status, 'accepted');
  assert.deepEqual(decision.claims, [
    {
      declarationId: 'preview-localhost:preview_url',
      label: 'preview_url',
      title: 'Local preview',
    },
  ]);
});

test('artifact finalization gate rejects claims without same-turn declarations', () => {
  const gate = new CodeArtifactFinalizationGate();
  const decision = gate.evaluate({
    finalization: {
      assistantTurnId: 'turn-2',
      bodyText: 'Preview recorded.',
      artifactClaims: [{ declarationId: 'preview-localhost:preview_url' }],
    },
    acceptedDeclarations: [
      {
        assistantTurnId: 'turn-1',
        declarationId: 'preview-localhost:preview_url',
        artifactId: 'artifact-1',
      },
    ],
  });

  assert.equal(decision.status, 'rejected');
  assert.equal(decision.code, CODE_ARTIFACT_CLAIM_WITHOUT_DECLARATION);
  assert.deepEqual(decision.unmatchedClaims, [
    { declarationId: 'preview-localhost:preview_url', label: null, title: null },
  ]);
});

test('acceptedDeclarationRefFromToolResult ignores rejected tool results', () => {
  assert.deepEqual(
    acceptedDeclarationRefFromToolResult({
      assistantTurnId: 'turn-1',
      result: {
        status: 'accepted',
        declarationId: 'preview-localhost:preview_url',
        artifactId: 'artifact-1',
      },
    }),
    {
      assistantTurnId: 'turn-1',
      declarationId: 'preview-localhost:preview_url',
      artifactId: 'artifact-1',
    },
  );

  assert.equal(
    acceptedDeclarationRefFromToolResult({
      assistantTurnId: 'turn-1',
      result: {
        status: 'rejected',
        error: {
          code: 'artifact_required_field_empty',
          message: 'Missing declarationId.',
        },
      },
    }),
    null,
  );
});

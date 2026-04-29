import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import {
  applyRuntimeAssistantFinalizationGates,
  clearRuntimeAssistantFinalizationGates,
} from '../src/platform/runtime/assistantFinalization.ts';
import {
  CODE_ARTIFACT_RUNTIME_HOOK_ID,
} from '../src/products/code/state/runtimeArtifactTooling.ts';
import {
  CODE_ARTIFACT_CLAIM_WITHOUT_DECLARATION,
  CodeArtifactFinalizationGate,
  acceptedDeclarationRefFromToolResult,
  registerCodeArtifactRuntimeFinalizationGate,
} from '../src/products/code/state/sessionFinalization.ts';

beforeEach(() => {
  clearRuntimeAssistantFinalizationGates();
});

afterEach(() => {
  clearRuntimeAssistantFinalizationGates();
});

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

test('acceptedDeclarationRefFromToolResult ignores non-accepted tool results', () => {
  assert.deepEqual(
    acceptedDeclarationRefFromToolResult({
      assistantTurnId: 'turn-1',
      result: {
        status: 'accepted',
        declarationId: 'preview-localhost:preview_url',
        disposition: 'record',
        artifactId: 'artifact-1',
        artifactStatus: 'ready',
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

test('Code runtime finalization gate rejects unmatched structured artifact claims', () => {
  registerCodeArtifactRuntimeFinalizationGate();
  const decision = applyRuntimeAssistantFinalizationGates(
    { originSurface: 'code', id: 'channel-code' },
    {
      assistantTurnId: 'turn-1',
      bodyText: 'I recorded the preview.',
      runtimeAssistantMetadata: {
        [CODE_ARTIFACT_RUNTIME_HOOK_ID]: {
          codeArtifactFinalization: {
            artifactClaims: [{ declarationId: 'preview-localhost:preview_url' }],
          },
        },
      },
    },
  );

  assert.equal(decision.status, 'rejected');
  assert.equal(decision.code, CODE_ARTIFACT_CLAIM_WITHOUT_DECLARATION);
  assert.equal(decision.gateId, CODE_ARTIFACT_RUNTIME_HOOK_ID);
});

test('Code runtime finalization gate reads runtime finalization envelopes', () => {
  registerCodeArtifactRuntimeFinalizationGate();
  const decision = applyRuntimeAssistantFinalizationGates(
    { originSurface: 'code', id: 'channel-code' },
    {
      assistantTurnId: 'turn-1',
      bodyText: 'I recorded the preview.',
      runtimeFinalization: {
        codeArtifactFinalization: {
          artifactClaims: [{ declarationId: 'preview-localhost:preview_url' }],
        },
      },
      runtimeAssistantMetadata: {
        [CODE_ARTIFACT_RUNTIME_HOOK_ID]: {
          codeArtifactToolResults: [
            {
              result: {
                status: 'accepted',
                declarationId: 'preview-localhost:preview_url',
                artifactId: 'artifact-1',
              },
            },
          ],
        },
      },
    },
  );

  assert.equal(decision.status, 'accepted');
});

test('Code runtime finalization gate accepts same-turn artifact claims', () => {
  registerCodeArtifactRuntimeFinalizationGate();
  const decision = applyRuntimeAssistantFinalizationGates(
    { originSurface: 'code', id: 'channel-code' },
    {
      assistantTurnId: 'turn-1',
      bodyText: 'I recorded the preview.',
      runtimeAssistantMetadata: {
        [CODE_ARTIFACT_RUNTIME_HOOK_ID]: {
          codeArtifactFinalization: {
            artifactClaims: [{ declarationId: 'preview-localhost:preview_url' }],
          },
          codeArtifactToolResults: [
            {
              result: {
                status: 'accepted',
                declarationId: 'preview-localhost:preview_url',
                artifactId: 'artifact-1',
              },
            },
          ],
        },
      },
    },
  );

  assert.equal(decision.status, 'accepted');
  assert.deepEqual(decision.metadata, {
    [CODE_ARTIFACT_RUNTIME_HOOK_ID]: {
      codeArtifactFinalization: {
        status: 'accepted',
        artifactClaims: [
          { declarationId: 'preview-localhost:preview_url', label: null, title: null },
        ],
      },
    },
  });
});

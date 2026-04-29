import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CODE_ARTIFACT_RUNTIME_CONTEXT_METADATA_KEY,
  collectCodeArtifactRuntimeToolCalls,
  shouldAttachCodeArtifactRuntimeTooling,
  withCodeArtifactRuntimeTooling,
} from '../src/products/code/state/runtimeArtifactTooling.ts';

test('Code artifact runtime tooling attaches only to Code-origin active sessions', () => {
  const codeInvocation = withCodeArtifactRuntimeTooling(
    {
      instructions: 'Keep the answer concise.',
      context: {
        labels: ['existing'],
        metadata: { channelId: 'channel-code' },
      },
    },
    {
      originSurface: 'code',
      id: 'channel-code',
      title: 'Implement export flow',
      chatCwd: 'C:/repo/cats-platform',
    },
  );

  assert.equal(shouldAttachCodeArtifactRuntimeTooling({ originSurface: 'code' }), true);
  assert.equal(shouldAttachCodeArtifactRuntimeTooling({ originSurface: 'chat' }), false);
  assert.match(codeInvocation.instructions ?? '', /declare_artifact/u);
  assert.match(
    codeInvocation.instructions ?? '',
    /codeArtifactDeclaration\.onboardingBlockVersion=v1/u,
  );
  assert.deepEqual(
    codeInvocation.context?.labels?.filter((label) => label.includes('declare_artifact')),
    ['runtime-tool:declare_artifact'],
  );

  const metadata = codeInvocation.context?.metadata?.[
    CODE_ARTIFACT_RUNTIME_CONTEXT_METADATA_KEY
  ] as Record<string, unknown> | undefined;
  assert.equal(metadata?.toolName, 'declare_artifact');
  assert.equal(metadata?.sourceChannelId, 'channel-code');
  assert.equal(metadata?.workspacePath, 'C:/repo/cats-platform');

  const chatInvocation = { instructions: 'No Code tooling.', context: { metadata: {} } };
  assert.strictEqual(
    withCodeArtifactRuntimeTooling(chatInvocation, { originSurface: 'chat' }),
    chatInvocation,
  );
});

test('Code artifact runtime tooling observes declare_artifact tool_use payloads', () => {
  const summaries = collectCodeArtifactRuntimeToolCalls(
    { originSurface: 'code' },
    [
      {
        kind: 'tool_use',
        toolName: 'declare_artifact',
        toolId: 'tool-1',
        text: '',
        toolArgs: {
          declarationId: 'preview-1',
          label: 'preview_url',
          title: 'Preview URL',
          location: {
            kind: 'url',
            value: 'http://127.0.0.1:5173',
          },
        },
      },
      {
        kind: 'tool_use',
        toolName: 'declare_artifact',
        toolId: 'tool-2',
        text: JSON.stringify({
          declarationId: 'bad-1',
          label: 'preview_url',
          title: '',
          location: { kind: 'url', value: 'https://example.test/preview' },
        }),
      },
    ],
  );

  assert.deepEqual(summaries, [
    {
      toolName: 'declare_artifact',
      toolId: 'tool-1',
      declarationId: 'preview-1',
      status: 'shape_ok',
    },
    {
      toolName: 'declare_artifact',
      toolId: 'tool-2',
      declarationId: 'bad-1',
      status: 'rejected',
      errorCode: 'artifact_required_field_empty',
      message: 'declare_artifact title is required.',
    },
  ]);
  assert.deepEqual(
    collectCodeArtifactRuntimeToolCalls(
      { originSurface: 'work' },
      [
        {
          kind: 'tool_use',
          toolName: 'declare_artifact',
          toolId: 'tool-ignored',
          text: '{}',
        },
      ],
    ),
    [],
  );
});

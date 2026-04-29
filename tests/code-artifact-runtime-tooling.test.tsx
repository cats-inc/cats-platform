import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearRuntimeInvocationEnrichers,
  collectRuntimeInvocationAssistantMetadata,
  enrichRuntimeInvocation,
  registerRuntimeInvocationEnricher,
} from '../src/platform/runtime/invocationEnrichment.ts';
import {
  CODE_ARTIFACT_RUNTIME_CONTEXT_METADATA_KEY,
  CODE_ARTIFACT_RUNTIME_ENRICHER_ID,
  collectCodeArtifactRuntimeToolCalls,
  createCodeArtifactRuntimeInvocationEnricher,
  enrichCodeArtifactRuntimeInvocation,
  shouldAttachCodeArtifactRuntimeTooling,
} from '../src/products/code/state/runtimeArtifactTooling.ts';

test('Code artifact runtime tooling attaches only to Code-origin active sessions', () => {
  const codeInvocation = enrichCodeArtifactRuntimeInvocation(
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
    { phase: 'session_create' },
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

  const chatInvocation = enrichCodeArtifactRuntimeInvocation(
    { instructions: 'No Code tooling.', context: { labels: ['existing'] } },
    { originSurface: 'chat', id: 'channel-chat' },
    { phase: 'session_create' },
  );

  assert.equal(chatInvocation.instructions, 'No Code tooling.');
  assert.deepEqual(chatInvocation.context?.metadata, undefined);
});

test('Code artifact runtime tooling does not repeat onboarding on message sends', () => {
  const codeInvocation = enrichCodeArtifactRuntimeInvocation(
    {
      instructions: 'Keep the answer concise.',
      context: { metadata: { channelId: 'channel-code' } },
    },
    { originSurface: 'code', id: 'channel-code' },
    { phase: 'message_send' },
  );

  assert.equal(codeInvocation.instructions, 'Keep the answer concise.');
  assert.equal(
    Boolean(codeInvocation.context?.metadata?.[CODE_ARTIFACT_RUNTIME_CONTEXT_METADATA_KEY]),
    true,
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
      {
        kind: 'tool_use',
        toolName: 'declare_artifact',
        toolId: 'tool-3',
        text: 'not json',
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
    {
      toolName: 'declare_artifact',
      toolId: 'tool-3',
      declarationId: null,
      status: 'rejected',
      errorCode: 'artifact_metadata_invalid',
      message: 'declare_artifact tool arguments must be valid JSON.',
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

test('Code artifact runtime enricher returns assistant metadata without Chat coupling', () => {
  const enricher = createCodeArtifactRuntimeInvocationEnricher();
  const metadata = enricher.collectAssistantMetadata?.(
    { originSurface: 'code' },
    [
      {
        kind: 'tool_use',
        toolName: 'declare_artifact',
        toolId: 'tool-1',
        text: '',
        toolArgs: {
          declarationId: 'report-1',
          label: 'test_report',
          title: 'Test report',
          location: { kind: 'inline_summary', value: 'All tests passed.' },
        },
      },
    ],
  );

  assert.deepEqual(metadata, {
    codeArtifactToolCalls: [
      {
        toolName: 'declare_artifact',
        toolId: 'tool-1',
        declarationId: 'report-1',
        status: 'shape_ok',
      },
    ],
  });
});

test('runtime invocation registry namespaces assistant metadata and can be reset', () => {
  clearRuntimeInvocationEnrichers();
  try {
    registerRuntimeInvocationEnricher(createCodeArtifactRuntimeInvocationEnricher());
    const metadata = collectRuntimeInvocationAssistantMetadata(
      { originSurface: 'code' },
      [
        {
          kind: 'tool_use',
          toolName: 'declare_artifact',
          toolId: 'tool-1',
          text: '',
          toolArgs: {
            declarationId: 'report-1',
            label: 'test_report',
            title: 'Test report',
            location: { kind: 'inline_summary', value: 'All tests passed.' },
          },
        },
      ],
    );

    assert.deepEqual(metadata, {
      [CODE_ARTIFACT_RUNTIME_ENRICHER_ID]: {
        codeArtifactToolCalls: [
          {
            toolName: 'declare_artifact',
            toolId: 'tool-1',
            declarationId: 'report-1',
            status: 'shape_ok',
          },
        ],
      },
    });

    clearRuntimeInvocationEnrichers();
    assert.deepEqual(
      collectRuntimeInvocationAssistantMetadata({ originSurface: 'code' }, []),
      {},
    );
  } finally {
    clearRuntimeInvocationEnrichers();
  }
});

test('runtime invocation registry applies deterministic priority order', () => {
  clearRuntimeInvocationEnrichers();
  try {
    registerRuntimeInvocationEnricher({
      id: 'z-enricher',
      priority: 10,
      enrich(_channel, input) {
        return { ...input, instructions: `${input.instructions ?? ''}Z` };
      },
    });
    registerRuntimeInvocationEnricher({
      id: 'a-enricher',
      priority: 10,
      enrich(_channel, input) {
        return { ...input, instructions: `${input.instructions ?? ''}A` };
      },
    });
    registerRuntimeInvocationEnricher({
      id: 'first-enricher',
      priority: -1,
      enrich(_channel, input) {
        return { ...input, instructions: `${input.instructions ?? ''}F` };
      },
    });

    const enriched = enrichRuntimeInvocation(
      { originSurface: 'code' },
      { instructions: '' },
      { phase: 'message_send' },
    );

    assert.equal(enriched.instructions, 'FAZ');
  } finally {
    clearRuntimeInvocationEnrichers();
  }
});

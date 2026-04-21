import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildParallelChatDraftCreateInput,
} from '../src/products/shared/renderer/composerParallelDispatch.ts';

test('buildParallelChatDraftCreateInput preserves non-chat originSurface and branch audience keys', () => {
  const input = buildParallelChatDraftCreateInput({
    body: 'Fan out the implementation review',
    existingCount: 3,
    originSurface: 'work',
    draftCwd: 'C:/repo/cats-platform',
    draftParallelChatTargets: [
      {
        provider: 'claude',
        instance: 'native',
        model: 'claude-opus-4-6',
        modelSelection: null,
        audienceKeys: ['cat-planner', 'participant-inline'],
        workflowShape: 'sequential',
      },
      {
        provider: 'codex',
        instance: null,
        model: 'gpt-5.4',
        modelSelection: null,
        audienceKeys: [],
        workflowShape: 'concurrent',
      },
    ],
    draftParticipantCatIds: ['cat-planner'],
    draftTemporaryParticipants: [
      {
        participantId: 'participant-inline',
        name: 'Inline Reviewer',
        provider: 'gemini',
        instance: 'native',
        model: 'gemini-3.1-pro',
        modelSelection: null,
        roleHint: 'Counterpoint',
      },
    ],
  });

  assert.equal(input.title, 'Fan out the implementation review');
  assert.equal(input.originSurface, 'work');
  assert.equal(input.repoPath, 'C:/repo/cats-platform');
  assert.deepEqual(input.participantCatIds, ['cat-planner']);
  assert.equal(input.targets.length, 2);
  assert.deepEqual(input.targets[0], {
    provider: 'claude',
    instance: 'native',
    model: 'claude-opus-4-6',
    modelSelection: null,
    audienceKeys: ['cat-planner', 'participant-inline'],
  });
  assert.deepEqual(input.targets[1], {
    provider: 'codex',
    instance: null,
    model: 'gpt-5.4',
    modelSelection: null,
    audienceKeys: [],
  });
  assert.deepEqual(input.temporaryParticipants, [
    {
      participantId: 'participant-inline',
      name: 'Inline Reviewer',
      provider: 'gemini',
      instance: 'native',
      model: 'gemini-3.1-pro',
      modelSelection: null,
      roleHint: 'Counterpoint',
    },
  ]);
});

test('buildParallelChatDraftCreateInput normalizes nullable fields for code-owned drafts', () => {
  const input = buildParallelChatDraftCreateInput({
    body: 'Check the failing code path',
    existingCount: 0,
    originSurface: 'code',
    draftCwd: null,
    draftParallelChatTargets: [
      {
        provider: 'claude',
        instance: null,
        model: null,
        modelSelection: null,
      },
      {
        provider: 'gemini',
        instance: 'native',
        model: null,
        modelSelection: null,
      },
    ],
  });

  assert.equal(input.originSurface, 'code');
  assert.equal(input.repoPath, undefined);
  assert.deepEqual(input.participantCatIds, []);
  assert.deepEqual(input.temporaryParticipants, []);
  assert.deepEqual(input.targets, [
    {
      provider: 'claude',
      instance: null,
      model: null,
      modelSelection: null,
      audienceKeys: [],
    },
    {
      provider: 'gemini',
      instance: 'native',
      model: null,
      modelSelection: null,
      audienceKeys: [],
    },
  ]);
});

test('buildParallelChatDraftCreateInput resolves branch audience from lead defaults', () => {
  const input = buildParallelChatDraftCreateInput({
    body: 'Review the same lead audience on every branch',
    existingCount: 1,
    originSurface: 'code',
    draftCwd: 'C:/repo/cats-platform',
    draftAudienceKeys: ['cat-lead', 'cat-lead', '', 'cat-reviewer'],
    draftParallelChatTargets: [
      {
        provider: 'claude',
        instance: null,
        model: 'claude-opus-4-6',
        modelSelection: null,
        audienceKeys: null,
      },
      {
        provider: 'codex',
        instance: null,
        model: 'gpt-5.4',
        modelSelection: null,
      },
    ],
  });

  assert.deepEqual(input.targets.map((target) => target.audienceKeys), [
    ['cat-lead', 'cat-reviewer'],
    ['cat-lead', 'cat-reviewer'],
  ]);
});

test('buildParallelChatDraftCreateInput rejects reserved per-branch attachment overrides', () => {
  assert.throws(
    () => buildParallelChatDraftCreateInput({
      body: 'Reserved attachments should not dispatch',
      existingCount: 0,
      originSurface: 'code',
      draftCwd: null,
      draftParallelChatTargets: [
        {
          provider: 'claude',
          instance: null,
          model: 'claude-opus-4-6',
          modelSelection: null,
          audienceKeys: [],
          workflowShape: 'sequential',
        },
        {
          provider: 'codex',
          instance: null,
          model: 'gpt-5.4',
          modelSelection: null,
          audienceKeys: [],
          workflowShape: 'sequential',
          attachmentsOverride: [{ relativePath: 'branch-only.txt' }],
        },
      ],
    }),
    /Branch 2: attachments are not yet per-branch; remove the override\./u,
  );
});

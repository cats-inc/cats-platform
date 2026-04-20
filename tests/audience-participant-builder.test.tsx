import assert from 'node:assert/strict';
import test from 'node:test';

import { clearRememberedExecutionLabels } from '../src/shared/executionLabel.ts';
import {
  buildAudienceParticipantFromCat,
  buildAudienceParticipantFromExecutionTarget,
  buildAudienceParticipantFromRecipient,
  buildAudienceParticipantFromStackParticipant,
  buildAudienceParticipantFromTemporaryParticipant,
} from '../src/products/shared/renderer/audienceParticipantBuilder.ts';

test('audience participant builder maps chat cats into stack participants with cat execution labels', () => {
  clearRememberedExecutionLabels();

  const participant = buildAudienceParticipantFromCat({
    id: 'cat-1',
    name: 'Planner Cat',
    avatarColor: '#ff9900',
    avatarUrl: 'https://example.com/cat.png',
    defaultExecutionTarget: {
      provider: 'claude',
      instance: 'native',
      model: 'opus',
    },
    defaultModelSelection: null,
  } as never);

  assert.deepEqual(participant, {
    key: 'cat:cat-1',
    name: 'Planner Cat',
    executionLabel: 'Claude-CLI · Opus 4.7 with 1M context',
    avatarColor: '#ff9900',
    avatarUrl: 'https://example.com/cat.png',
    isCat: true,
    catId: 'cat-1',
    participantId: null,
  });
});

test('audience participant builder maps temporary participants and implicit execution targets into neutral stack entries', () => {
  clearRememberedExecutionLabels();

  const temporaryParticipant = buildAudienceParticipantFromTemporaryParticipant({
    participantId: 'temp-1',
    name: 'Code Reviewer',
    provider: 'codex',
    instance: 'native',
    model: 'gpt-5.4',
    modelSelection: {
      entryId: 'gpt-5.4',
      entryMode: 'explicit',
    },
  } as never);
  assert.deepEqual(temporaryParticipant, {
    key: 'temp:temp-1',
    name: 'Code Reviewer',
    executionLabel: 'Codex-CLI · gpt-5.4',
    avatarColor: null,
    avatarUrl: null,
    isCat: false,
    catId: null,
    participantId: 'temp-1',
  });

  const implicitExecutionTarget = buildAudienceParticipantFromExecutionTarget({
    provider: 'codex',
    instance: 'native',
    model: 'gpt-5.4',
    modelSelection: null,
    executionLabel: null,
  });
  assert.deepEqual(implicitExecutionTarget, {
    key: 'implicit:execution_target',
    name: 'Codex-CLI · gpt-5.4',
    executionLabel: 'Codex-CLI · gpt-5.4',
    avatarColor: null,
    avatarUrl: null,
    isCat: false,
    catId: null,
    participantId: null,
  });
});

test('audience participant builder preserves recipient metadata and explicit execution labels', () => {
  clearRememberedExecutionLabels();

  const recipientParticipant = buildAudienceParticipantFromRecipient({
    kind: 'named',
    participantId: 'participant-1',
    catId: 'cat-2',
    name: 'Ops Cat',
    executionLabel: 'Pinned Label',
    avatarColor: '#336699',
    avatarUrl: null,
    provider: 'claude',
    instance: 'native',
    model: 'opus',
    modelSelection: null,
    isBoss: false,
  });
  assert.deepEqual(recipientParticipant, {
    key: 'cat-2',
    name: 'Ops Cat',
    executionLabel: 'Pinned Label',
    avatarColor: '#336699',
    avatarUrl: null,
    isCat: true,
    catId: 'cat-2',
    participantId: 'participant-1',
  });

  const stackParticipant = buildAudienceParticipantFromStackParticipant({
    participantId: 'participant-2',
    label: 'Neutral Worker',
    executionLabel: 'Worker Label',
    avatarColor: '#663399',
    avatarUrl: null,
    useNeutralAvatar: true,
  });
  assert.deepEqual(stackParticipant, {
    key: 'participant:participant-2',
    name: 'Neutral Worker',
    executionLabel: 'Worker Label',
    avatarColor: '#663399',
    avatarUrl: null,
    isCat: false,
    catId: null,
    participantId: 'participant-2',
  });
});

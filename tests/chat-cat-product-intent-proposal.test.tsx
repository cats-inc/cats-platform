import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAT_PRODUCT_INTENT_PROPOSAL_COMMAND_TOKEN,
  CAT_PRODUCT_INTENT_PROPOSAL_METADATA_KEY,
  CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME,
  CAT_PRODUCT_INTENT_PROPOSAL_TRANSITION_METADATA_KEY,
  buildCatProductIntentProposalCooldownResponse,
  buildCatProductIntentProposalDuplicateResponse,
  buildCatProductIntentProposalMetadata,
  buildCatProductIntentProposalTransitionMetadata,
  createCatProductIntentProposalToolManifest,
  hasRecentCatProductIntentProposalDecline,
  listExpiredCatProductIntentProposals,
  listOpenCatProductIntentProposals,
  readCatProductIntentProposalMetadata,
  readCatProductIntentProposalTransitionMetadata,
  shouldAppendCatProductIntentProposal,
  validateCatProductIntentProposalToolCall,
} from '../src/products/chat/shared/catProductIntentProposal.ts';

const now = new Date('2026-05-06T08:00:00.000Z');

function proposal() {
  return buildCatProductIntentProposalMetadata({
    messageId: 'message-owner-1',
    channelId: 'channel-direct-1',
    conversationId: 'conversation-direct-1',
    transport: 'web',
    catId: 'cat-strong',
    actorId: 'actor-cat-strong',
    targetProduct: 'work',
    title: '  Scope onboarding  ',
    summary: '  Plan onboarding requirements  ',
    rationale: '  The owner is asking for requirements planning  ',
    suggestedNextQuestion: '  Which audience should this onboarding target?  ',
    now,
  });
}

test('cat product-intent proposal metadata builders normalize the v2 contract', () => {
  const metadata = proposal();

  assert.equal(CAT_PRODUCT_INTENT_PROPOSAL_METADATA_KEY, 'catProductIntentProposal');
  assert.equal(
    CAT_PRODUCT_INTENT_PROPOSAL_TRANSITION_METADATA_KEY,
    'catProductIntentProposalTransition',
  );
  assert.equal(CAT_PRODUCT_INTENT_PROPOSAL_COMMAND_TOKEN, '(cat-proposal-confirmation)');
  assert.equal(
    metadata.proposalId,
    'cat-product-intent:v2:message-owner-1:cat-strong:work',
  );
  assert.equal(metadata.event, 'proposed');
  assert.equal(metadata.source.messageId, 'message-owner-1');
  assert.equal(metadata.proposedBy.capabilityProfileKind, 'strong_agent');
  assert.equal(metadata.proposal.title, 'Scope onboarding');
  assert.equal(metadata.proposal.summary, 'Plan onboarding requirements');
  assert.equal(
    metadata.proposal.suggestedNextQuestion,
    'Which audience should this onboarding target?',
  );
  assert.equal(metadata.expiresAt, '2026-05-06T08:15:00.000Z');
  assert.deepEqual(readCatProductIntentProposalMetadata(metadata), metadata);
});

test('cat product-intent proposal transition builder creates confirmed command metadata', () => {
  const metadata = proposal();
  const transition = buildCatProductIntentProposalTransitionMetadata({
    proposal: metadata,
    event: 'confirmed',
    originalMessageBody: 'Please plan onboarding requirements',
  });

  assert.equal(transition.version, 2);
  assert.equal(transition.event, 'confirmed');
  assert.equal(transition.proposalId, metadata.proposalId);
  assert.equal(transition.proposedByCatId, 'cat-strong');
  assert.equal(
    transition.idempotencyKey,
    `cat-product-intent-transition:v2:${metadata.proposalId}:confirmed`,
  );
  assert.equal(transition.confirmedCommand?.sourceKind, 'cat_product_intent_proposal');
  assert.equal(transition.confirmedCommand?.command, 'work');
  assert.equal(transition.confirmedCommand?.argumentText, 'Plan onboarding requirements');
  assert.equal(transition.confirmedCommand?.proposedByCatId, 'cat-strong');
  assert.equal(
    transition.confirmedCommand?.rawCommandToken,
    CAT_PRODUCT_INTENT_PROPOSAL_COMMAND_TOKEN,
  );
  assert.deepEqual(readCatProductIntentProposalTransitionMetadata(transition), transition);
});

test('cat product-intent proposal tool manifest is a narrow local-state grant', () => {
  const manifest = createCatProductIntentProposalToolManifest();

  assert.equal(manifest.name, CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME);
  assert.equal(manifest.sideEffect, 'local_state');
  assert.equal(manifest.approval, 'never');
  assert.equal(manifest.inputSchema.id, `${CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME}.input`);
  assert.deepEqual(manifest.failureCodes, ['E_TOOL_SCOPE_DENIED', 'E_SCHEMA_INVALID']);
});

test('cat product-intent proposal validation accepts only enabled strong direct owner turns', () => {
  const accepted = validateCatProductIntentProposalToolCall({
    toolInput: {
      targetProduct: 'work',
      sourceMessageId: 'message-owner-1',
      title: '  Draft onboarding plan  ',
      summary: '  Plan onboarding requirements  ',
      rationale: '  The owner is asking for a planning artifact  ',
    },
    effectiveMode: 'cat_tool',
    capabilityProfileKind: 'strong_agent',
    sourceMessage: {
      id: 'message-owner-1',
      channelId: 'channel-direct-1',
      senderKind: 'user',
    },
    channelId: 'channel-direct-1',
    cooldownActive: false,
  });

  assert.equal(accepted.accepted, true);
  assert.equal(accepted.accepted ? accepted.toolInput.title : null, 'Draft onboarding plan');
  assert.equal(accepted.accepted ? accepted.toolInput.summary : null, 'Plan onboarding requirements');
});

test('cat product-intent proposal validation rejects disabled or unsafe contexts', () => {
  const base = {
    toolInput: {
      targetProduct: 'work',
      summary: 'Plan onboarding requirements',
      rationale: 'The owner is asking for planning.',
    },
    effectiveMode: 'cat_tool' as const,
    capabilityProfileKind: 'strong_agent' as const,
    sourceMessage: {
      id: 'message-owner-1',
      channelId: 'channel-direct-1',
      senderKind: 'user',
    },
    channelId: 'channel-direct-1',
    cooldownActive: false,
  };

  assert.equal(
    validateCatProductIntentProposalToolCall({
      ...base,
      effectiveMode: 'off',
    }).accepted,
    false,
  );
  assert.equal(
    validateCatProductIntentProposalToolCall({
      ...base,
      effectiveMode: 'heuristic_prefilter',
    }).accepted,
    false,
  );
  assert.equal(
    validateCatProductIntentProposalToolCall({
      ...base,
      capabilityProfileKind: 'weak_worker',
    }).accepted,
    false,
  );
  assert.equal(
    validateCatProductIntentProposalToolCall({
      ...base,
      cooldownActive: true,
    }).accepted,
    false,
  );
  assert.equal(
    validateCatProductIntentProposalToolCall({
      ...base,
      sourceMessage: {
        id: 'message-agent-1',
        channelId: 'channel-direct-1',
        senderKind: 'agent',
      },
    }).accepted,
    false,
  );
  assert.equal(
    validateCatProductIntentProposalToolCall({
      ...base,
      toolInput: {
        targetProduct: 'work',
        summary: '',
        rationale: '',
      },
    }).accepted,
    false,
  );
});

test('cat product-intent proposal suppression helpers track open, expired, and duplicate proposals', () => {
  const metadata = proposal();
  const proposalMessage = {
    id: 'message-proposal-1',
    createdAt: '2026-05-06T08:00:01.000Z',
    metadata: {
      catProductIntentProposal: metadata,
    },
  };
  const declinedTransition = buildCatProductIntentProposalTransitionMetadata({
    proposal: metadata,
    event: 'declined',
  });

  assert.equal(
    shouldAppendCatProductIntentProposal({
      messages: [proposalMessage],
      proposalId: metadata.proposalId,
    }),
    false,
  );
  assert.deepEqual(listOpenCatProductIntentProposals([proposalMessage]), [metadata]);
  assert.deepEqual(
    listExpiredCatProductIntentProposals({
      messages: [proposalMessage],
      now: new Date('2026-05-06T08:16:00.000Z'),
    }),
    [metadata],
  );
  assert.deepEqual(
    listExpiredCatProductIntentProposals({
      messages: [proposalMessage],
      now: new Date('2026-05-06T08:01:00.000Z'),
      expireAll: true,
    }),
    [metadata],
  );
  assert.equal(
    hasRecentCatProductIntentProposalDecline({
      messages: [
        proposalMessage,
        {
          id: 'message-transition-1',
          createdAt: '2026-05-06T08:02:00.000Z',
          metadata: {
            catProductIntentProposalTransition: declinedTransition,
          },
        },
      ],
      now: new Date('2026-05-06T08:04:00.000Z'),
    }),
    true,
  );
  assert.deepEqual(
    buildCatProductIntentProposalDuplicateResponse(metadata.proposalId),
    {
      accepted: true,
      idempotent: true,
      proposalId: metadata.proposalId,
    },
  );
  assert.deepEqual(buildCatProductIntentProposalCooldownResponse(), {
    rejected: true,
    reason: 'cooldown_active',
  });
});

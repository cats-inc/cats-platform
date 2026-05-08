import type {
  ProductPresetIntentContext,
  ProductPresetIntentPresetId,
  ProductPresetIntentSourceProduct,
} from './productPresetIntentContext.js';

export type ProductIntentIntakeTargetProduct = 'work' | 'code';
export type ProductIntentIntakeProposedNextAction = 'clarify' | 'create_task' | 'create_run';

export interface ProductIntentIntakeExplicitCommandMetadata {
  sourceKind: 'explicit_command';
  name: ProductIntentIntakeTargetProduct;
  argumentText: string;
  rawCommandToken: '/work' | '/code';
}

export interface ProductIntentIntakeProposalCommandMetadata {
  sourceKind: 'cat_product_intent_proposal';
  name: ProductIntentIntakeTargetProduct;
  argumentText: string;
  rawCommandToken: '(cat-proposal-confirmation)';
  proposalId: string;
  originalMessageId: string;
}

export type ProductIntentIntakeCommandMetadata =
  | ProductIntentIntakeExplicitCommandMetadata
  | ProductIntentIntakeProposalCommandMetadata;

export interface ProductIntentIntakeDraftMetadata {
  goal: string;
  successCriteria: string[];
  outOfScope: string[];
  openQuestions: string[];
  proposedNextAction: ProductIntentIntakeProposedNextAction;
}

export interface ProductIntentIntakeMetadata {
  version: 1;
  targetProduct: ProductIntentIntakeTargetProduct;
  sourceContext: ProductPresetIntentContext;
  command: ProductIntentIntakeCommandMetadata;
  draft: ProductIntentIntakeDraftMetadata;
}

export interface ProductIntentActiveAnchorSourceContextRef {
  sourceProduct: ProductPresetIntentSourceProduct;
  presetId: ProductPresetIntentPresetId;
  channelId?: string;
  conversationId?: string;
  containerId?: string;
  laneId?: string;
  branchId?: string;
}

export interface ProductIntentActiveAnchorMetadata {
  version: 1;
  workItemId: string;
  targetProduct: ProductIntentIntakeTargetProduct;
  sourceContextRef: ProductIntentActiveAnchorSourceContextRef;
  establishedBySegmentId: string;
  establishedAt: string;
}

export interface ProductIntentIntakeMetadataInput {
  targetProduct: ProductIntentIntakeTargetProduct;
  sourceContext: ProductPresetIntentContext;
  command: ProductIntentIntakeCommandMetadata;
  draft: ProductIntentIntakeDraftMetadata;
}

export interface ProductIntentActiveAnchorMetadataInput {
  workItemId: string;
  targetProduct: ProductIntentIntakeTargetProduct;
  sourceContext: ProductPresetIntentContext;
  establishedBySegmentId?: string;
  establishedAt: string;
}

export function buildProductIntentIntakeMetadata(
  input: ProductIntentIntakeMetadataInput,
): ProductIntentIntakeMetadata {
  return {
    version: 1,
    targetProduct: input.targetProduct,
    sourceContext: input.sourceContext,
    command: normalizeProductIntentIntakeCommandMetadata(input.command),
    draft: {
      goal: input.draft.goal.trim(),
      successCriteria: input.draft.successCriteria.map((item) => item.trim()).filter(Boolean),
      outOfScope: input.draft.outOfScope.map((item) => item.trim()).filter(Boolean),
      openQuestions: input.draft.openQuestions.map((item) => item.trim()).filter(Boolean),
      proposedNextAction: input.draft.proposedNextAction,
    },
  };
}

export function buildProductIntentActiveAnchorMetadata(
  input: ProductIntentActiveAnchorMetadataInput,
): ProductIntentActiveAnchorMetadata {
  return {
    version: 1,
    workItemId: input.workItemId.trim(),
    targetProduct: input.targetProduct,
    sourceContextRef: buildProductIntentActiveAnchorSourceContextRef(input.sourceContext),
    establishedBySegmentId:
      input.establishedBySegmentId?.trim() || input.sourceContext.source.segmentId,
    establishedAt: input.establishedAt,
  };
}

export function buildProductIntentActiveAnchorSourceContextRef(
  sourceContext: ProductPresetIntentContext,
): ProductIntentActiveAnchorSourceContextRef {
  const { source } = sourceContext;
  return {
    sourceProduct: sourceContext.sourceProduct,
    presetId: sourceContext.presetId,
    ...(source.channelId ? { channelId: source.channelId } : {}),
    ...(source.conversationId ? { conversationId: source.conversationId } : {}),
    ...(source.containerId ? { containerId: source.containerId } : {}),
    ...(source.laneId ? { laneId: source.laneId } : {}),
    ...(source.branchId ? { branchId: source.branchId } : {}),
  };
}

export function doesProductIntentActiveAnchorMatchSourceContext(
  anchor: ProductIntentActiveAnchorMetadata,
  sourceContext: ProductPresetIntentContext,
): boolean {
  const expectedRef = buildProductIntentActiveAnchorSourceContextRef(sourceContext);
  return doesProductIntentSourceContextRefMatch(anchor.sourceContextRef, expectedRef);
}

export function doesProductIntentActiveAnchorMatchIntake(
  anchor: ProductIntentActiveAnchorMetadata,
  intake: ProductIntentIntakeMetadata,
): boolean {
  return (
    anchor.targetProduct === intake.targetProduct
    && doesProductIntentActiveAnchorMatchSourceContext(anchor, intake.sourceContext)
  );
}

function doesProductIntentSourceContextRefMatch(
  left: ProductIntentActiveAnchorSourceContextRef,
  right: ProductIntentActiveAnchorSourceContextRef,
): boolean {
  return (
    left.sourceProduct === right.sourceProduct
    && left.presetId === right.presetId
    && optionalIdMatches(left.channelId, right.channelId)
    && optionalIdMatches(left.conversationId, right.conversationId)
    && optionalIdMatches(left.containerId, right.containerId)
    && optionalIdMatches(left.laneId, right.laneId)
    && optionalIdMatches(left.branchId, right.branchId)
  );
}

function normalizeProductIntentIntakeCommandMetadata(
  command: ProductIntentIntakeCommandMetadata,
): ProductIntentIntakeCommandMetadata {
  if (command.sourceKind === 'explicit_command') {
    return {
      ...command,
      argumentText: command.argumentText.trim(),
    };
  }

  return {
    ...command,
    argumentText: command.argumentText.trim(),
    proposalId: command.proposalId.trim(),
    originalMessageId: command.originalMessageId.trim(),
  };
}

function optionalIdMatches(left: string | undefined, right: string | undefined): boolean {
  return (left ?? null) === (right ?? null);
}

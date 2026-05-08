export type ProductPresetIntentSourceProduct = 'chat' | 'code' | 'work';

export type ProductPresetIntentPresetId =
  | 'direct'
  | 'new_chat'
  | 'group_chat'
  | 'parallel_chat'
  | 'new_code'
  | 'team_code'
  | 'peer_code'
  | 'new_work'
  | 'team_work'
  | 'parallel_work';

export type ProductPresetIntentOriginSurface = 'desktop' | 'mobile' | 'telegram' | 'api';
export type ProductPresetIntentTransport = 'web' | 'telegram' | 'mobile' | null;
export type ProductPresetIntentCapabilityProfileKind =
  | 'strong_agent'
  | 'weak_worker'
  | 'unknown';

export type ProductPresetIntentSourceField =
  | 'channelId'
  | 'conversationId'
  | 'containerId'
  | 'laneId'
  | 'branchId';

export interface ProductPresetIntentSource {
  channelId?: string;
  conversationId?: string;
  containerId?: string;
  laneId?: string;
  branchId?: string;
  turnId: string;
  segmentId: string;
}

export interface ProductPresetIntentEligibleCat {
  catId: string;
  actorId: string;
  capabilityProfileKind: ProductPresetIntentCapabilityProfileKind;
}

export interface ProductPresetIntentContext {
  version: 1;
  sourceProduct: ProductPresetIntentSourceProduct;
  presetId: ProductPresetIntentPresetId;
  source: ProductPresetIntentSource;
  originSurface: ProductPresetIntentOriginSurface;
  transport: ProductPresetIntentTransport;
  eligibleCats: ProductPresetIntentEligibleCat[];
}

export interface ProductPresetIntentContextInput {
  sourceProduct: ProductPresetIntentSourceProduct;
  presetId: ProductPresetIntentPresetId;
  source: ProductPresetIntentSource;
  originSurface: ProductPresetIntentOriginSurface;
  transport: ProductPresetIntentTransport;
  eligibleCats?: ProductPresetIntentEligibleCat[];
}

export interface DirectProductPresetIntentContextInput {
  channelId: string;
  conversationId: string;
  turnId: string;
  segmentId: string;
  originSurface: ProductPresetIntentOriginSurface;
  transport: ProductPresetIntentTransport;
  eligibleCats?: ProductPresetIntentEligibleCat[];
}

export interface ProductPresetIntentContextValidationOptions {
  materializedLane?: boolean;
}

export interface ProductPresetIntentContextValidationIssue {
  field: string;
  code: 'missing_required_field' | 'unsupported_lane_field';
}

export interface ProductPresetIntentContextValidationResult {
  valid: boolean;
  issues: ProductPresetIntentContextValidationIssue[];
}

export const PRODUCT_PRESET_INTENT_PRESET_IDS = [
  'direct',
  'new_chat',
  'group_chat',
  'parallel_chat',
  'new_code',
  'team_code',
  'peer_code',
  'new_work',
  'team_work',
  'parallel_work',
] as const satisfies readonly ProductPresetIntentPresetId[];

const REQUIRED_SOURCE_FIELDS_BY_PRESET: Readonly<Record<
  ProductPresetIntentPresetId,
  readonly ProductPresetIntentSourceField[]
>> = {
  direct: ['channelId', 'conversationId'],
  new_chat: ['channelId', 'conversationId'],
  group_chat: ['channelId', 'conversationId'],
  parallel_chat: ['containerId', 'branchId', 'conversationId'],
  new_code: ['channelId', 'conversationId'],
  team_code: ['channelId', 'conversationId'],
  peer_code: ['containerId', 'branchId', 'conversationId'],
  new_work: ['channelId', 'conversationId'],
  team_work: ['channelId', 'conversationId'],
  parallel_work: ['containerId', 'branchId', 'conversationId'],
};

const LANE_CONDITIONAL_PRESETS: ReadonlySet<ProductPresetIntentPresetId> = new Set([
  'group_chat',
  'team_code',
  'team_work',
]);

export function listRequiredProductPresetIntentSourceFields(
  presetId: ProductPresetIntentPresetId,
  options: ProductPresetIntentContextValidationOptions = {},
): ProductPresetIntentSourceField[] {
  const required = [...REQUIRED_SOURCE_FIELDS_BY_PRESET[presetId]];
  if (options.materializedLane && LANE_CONDITIONAL_PRESETS.has(presetId)) {
    required.push('laneId');
  }
  return required;
}

export function isContainerBackedProductPresetIntentPreset(
  presetId: ProductPresetIntentPresetId,
): boolean {
  return presetId === 'parallel_chat' || presetId === 'peer_code' || presetId === 'parallel_work';
}

export function normalizeProductPresetIntentContext(
  input: ProductPresetIntentContextInput,
): ProductPresetIntentContext {
  return {
    version: 1,
    sourceProduct: input.sourceProduct,
    presetId: input.presetId,
    source: {
      ...normalizeOptionalSourceIdentifiers(input.source),
      turnId: input.source.turnId.trim(),
      segmentId: input.source.segmentId.trim(),
    },
    originSurface: input.originSurface,
    transport: input.transport,
    eligibleCats: (input.eligibleCats ?? []).map((cat) => ({
      catId: cat.catId.trim(),
      actorId: cat.actorId.trim(),
      capabilityProfileKind: cat.capabilityProfileKind,
    })),
  };
}

export function validateProductPresetIntentContext(
  context: ProductPresetIntentContext,
  options: ProductPresetIntentContextValidationOptions = {},
): ProductPresetIntentContextValidationResult {
  const issues: ProductPresetIntentContextValidationIssue[] = [];
  for (const field of ['turnId', 'segmentId'] as const) {
    if (!hasText(context.source[field])) {
      issues.push({ field: `source.${field}`, code: 'missing_required_field' });
    }
  }
  for (const field of listRequiredProductPresetIntentSourceFields(context.presetId, options)) {
    if (!hasText(context.source[field])) {
      issues.push({ field: `source.${field}`, code: 'missing_required_field' });
    }
  }
  if (
    !isContainerBackedProductPresetIntentPreset(context.presetId)
    && hasText(context.source.branchId)
  ) {
    issues.push({ field: 'source.branchId', code: 'unsupported_lane_field' });
  }
  return {
    valid: issues.length === 0,
    issues,
  };
}

export function buildProductPresetIntentContext(
  input: ProductPresetIntentContextInput,
  options: ProductPresetIntentContextValidationOptions = {},
): ProductPresetIntentContext {
  const context = normalizeProductPresetIntentContext(input);
  const validation = validateProductPresetIntentContext(context, options);
  if (!validation.valid) {
    throw new Error(formatProductPresetIntentContextValidationError(validation.issues));
  }
  return context;
}

export function buildDirectProductPresetIntentContext(
  input: DirectProductPresetIntentContextInput,
): ProductPresetIntentContext {
  return buildProductPresetIntentContext({
    sourceProduct: 'chat',
    presetId: 'direct',
    source: {
      channelId: input.channelId,
      conversationId: input.conversationId,
      turnId: input.turnId,
      segmentId: input.segmentId,
    },
    originSurface: input.originSurface,
    transport: input.transport,
    eligibleCats: input.eligibleCats,
  });
}

function normalizeOptionalSourceIdentifiers(
  source: ProductPresetIntentSource,
): Omit<ProductPresetIntentSource, 'turnId' | 'segmentId'> {
  const channelId = normalizeOptionalIdentifier(source.channelId);
  const conversationId = normalizeOptionalIdentifier(source.conversationId);
  const containerId = normalizeOptionalIdentifier(source.containerId);
  const laneId = normalizeOptionalIdentifier(source.laneId);
  const branchId = normalizeOptionalIdentifier(source.branchId);

  return {
    ...(channelId ? { channelId } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(containerId ? { containerId } : {}),
    ...(laneId ? { laneId } : {}),
    ...(branchId ? { branchId } : {}),
  };
}

function normalizeOptionalIdentifier(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function formatProductPresetIntentContextValidationError(
  issues: ProductPresetIntentContextValidationIssue[],
): string {
  return `Invalid product preset intent context: ${issues
    .map((issue) => `${issue.field}:${issue.code}`)
    .join(', ')}`;
}

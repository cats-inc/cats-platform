import {
  CAPABILITY_AGGREGATE_METHOD,
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  type CapabilityAssessment,
  type CapabilityBootstrapTreatment,
  type CapabilityClaim,
  type CapabilityConfidenceLevel,
  type CapabilityConflict,
  type CapabilityDimension,
  type CapabilitySourceEvidence,
  type CapabilitySource,
  type SupervisionSchemaVersion,
} from './contracts.js';

const CONFIDENCE_ORDER: Record<CapabilityConfidenceLevel, number> = {
  unknown: 0,
  catalog_only: 1,
  evaluated: 2,
  observed: 3,
};

export interface ProviderCatalogEvidenceInput {
  providerId: string;
  modelId: string;
  catalogVersion: string;
  observedAt: string;
  claims?: Partial<Record<CapabilityDimension, Omit<CapabilityClaim, 'level'> & {
    level?: CapabilityConfidenceLevel;
  }>>;
}

export interface ProductProviderEventCapabilities {
  streaming?: boolean;
  tokenUsage?: boolean;
  toolCallDeltas?: boolean;
  toolResultEvents?: boolean;
  stopReason?: boolean;
}

export interface BuildCapabilityAssessmentInput {
  assessedAt: string;
  confidenceSources: CapabilitySourceEvidence[];
  bootstrapTreatment?: CapabilityBootstrapTreatment;
  schemaVersion?: SupervisionSchemaVersion;
  deliveryCapabilities?: ProductProviderEventCapabilities;
}

export function compareCapabilityConfidence(
  left: CapabilityConfidenceLevel,
  right: CapabilityConfidenceLevel,
): number {
  return CONFIDENCE_ORDER[left] - CONFIDENCE_ORDER[right];
}

export function createProviderCatalogEvidence(
  input: ProviderCatalogEvidenceInput,
): CapabilitySourceEvidence {
  const claims = input.claims ?? {
    tool_use_accuracy: { summary: 'Provider catalog advertises tool support.' },
    json_fidelity: { summary: 'Provider catalog advertises structured output support.' },
  };

  return {
    evidenceId: `provider_catalog:${input.providerId}:${input.modelId}:${input.catalogVersion}`,
    source: 'provider_catalog',
    observedAt: input.observedAt,
    claims: normalizeClaimsForSource('provider_catalog', claims),
    metadata: {
      catalogVersion: input.catalogVersion,
    },
  };
}

export function buildCapabilityAssessment(
  input: BuildCapabilityAssessmentInput,
): CapabilityAssessment {
  const confidenceSources = sortEvidenceById(assertUniqueEvidenceIds(input.confidenceSources));
  const normalizedSources = confidenceSources.map((source) => ({
    ...source,
    claims: normalizeClaimsForSource(source.source, source.claims),
  }));
  const conflicts = collectCapabilityConflicts(normalizedSources);

  return {
    schemaVersion: input.schemaVersion ?? DEFAULT_SUPERVISION_SCHEMA_VERSION,
    assessedAt: input.assessedAt,
    bootstrapTreatment: input.bootstrapTreatment ?? 'default',
    confidenceLevel: selectAssessmentConfidence(normalizedSources),
    confidenceSources: normalizedSources,
    aggregateMethod: CAPABILITY_AGGREGATE_METHOD,
    conflicts,
  };
}

export function upsertCapabilityEvidence(input: {
  previous: CapabilityAssessment;
  evidence: CapabilitySourceEvidence[];
  assessedAt: string;
}): CapabilityAssessment {
  const byId = new Map<string, CapabilitySourceEvidence>();

  for (const source of input.previous.confidenceSources) {
    byId.set(source.evidenceId, source);
  }
  for (const source of input.evidence) {
    byId.set(source.evidenceId, source);
  }

  return buildCapabilityAssessment({
    schemaVersion: input.previous.schemaVersion,
    assessedAt: input.assessedAt,
    bootstrapTreatment: input.previous.bootstrapTreatment,
    confidenceSources: Array.from(byId.values()),
  });
}

export function getStrongestNonOverrideConfidence(
  confidenceSources: CapabilitySourceEvidence[],
): CapabilityConfidenceLevel {
  return selectStrongestLevel(
    confidenceSources
      .filter((source) => source.source !== 'operator_override')
      .flatMap((source) => Object.values(normalizeClaimsForSource(source.source, source.claims))),
  );
}

function assertUniqueEvidenceIds(
  confidenceSources: CapabilitySourceEvidence[],
): CapabilitySourceEvidence[] {
  const seen = new Set<string>();

  for (const source of confidenceSources) {
    if (seen.has(source.evidenceId)) {
      throw new Error(`Duplicate capability evidenceId: ${source.evidenceId}`);
    }
    seen.add(source.evidenceId);
  }

  return confidenceSources;
}

function sortEvidenceById(confidenceSources: CapabilitySourceEvidence[]): CapabilitySourceEvidence[] {
  return [...confidenceSources].sort((left, right) =>
    left.evidenceId.localeCompare(right.evidenceId),
  );
}

function normalizeClaimsForSource(
  source: CapabilitySource,
  claims: Partial<Record<CapabilityDimension, Omit<CapabilityClaim, 'level'> & {
    level?: CapabilityConfidenceLevel;
  }>>,
): Partial<Record<CapabilityDimension, CapabilityClaim>> {
  const normalized: Partial<Record<CapabilityDimension, CapabilityClaim>> = {};

  for (const [dimension, claim] of Object.entries(claims) as Array<[
    CapabilityDimension,
    Omit<CapabilityClaim, 'level'> & { level?: CapabilityConfidenceLevel },
  ]>) {
    const requestedLevel = claim.level ?? 'catalog_only';
    const level =
      source === 'provider_catalog' && compareCapabilityConfidence(requestedLevel, 'catalog_only') > 0
        ? 'catalog_only'
        : requestedLevel;

    normalized[dimension] = {
      level,
      summary: claim.summary,
    };
  }

  return normalized;
}

function collectCapabilityConflicts(
  confidenceSources: CapabilitySourceEvidence[],
): CapabilityConflict[] {
  const byDimension = new Map<CapabilityDimension, Array<{
    evidenceId: string;
    level: CapabilityConfidenceLevel;
  }>>();

  for (const source of confidenceSources) {
    for (const [dimension, claim] of Object.entries(source.claims) as Array<[
      CapabilityDimension,
      CapabilityClaim,
    ]>) {
      const claims = byDimension.get(dimension) ?? [];
      claims.push({ evidenceId: source.evidenceId, level: claim.level });
      byDimension.set(dimension, claims);
    }
  }

  return Array.from(byDimension.entries())
    .filter(([, claims]) => new Set(claims.map((claim) => claim.level)).size > 1)
    .map(([dimension, claims]) => {
      const selectedLevel = selectWeakestLevel(claims.map((claim) => claim.level));

      return {
        dimension,
        evidenceIds: claims.map((claim) => claim.evidenceId).sort(),
        selectedLevel,
        reason:
          `Conflicting ${dimension} confidence levels preserved; ` +
          `selected ${selectedLevel} by ${CAPABILITY_AGGREGATE_METHOD}.`,
      };
    })
    .sort((left, right) => left.dimension.localeCompare(right.dimension));
}

function selectAssessmentConfidence(
  confidenceSources: CapabilitySourceEvidence[],
): CapabilityConfidenceLevel {
  const selectedByDimension = new Map<CapabilityDimension, CapabilityConfidenceLevel>();

  for (const source of confidenceSources) {
    for (const [dimension, claim] of Object.entries(source.claims) as Array<[
      CapabilityDimension,
      CapabilityClaim,
    ]>) {
      const existing = selectedByDimension.get(dimension);
      selectedByDimension.set(
        dimension,
        existing === undefined ? claim.level : selectWeakestLevel([existing, claim.level]),
      );
    }
  }

  const selectedLevel = selectWeakestLevel(Array.from(selectedByDimension.values()));
  const strongestNonOverride = getStrongestNonOverrideConfidence(confidenceSources);

  return selectWeakestLevel([selectedLevel, strongestNonOverride]);
}

function selectWeakestLevel(levels: CapabilityConfidenceLevel[]): CapabilityConfidenceLevel {
  if (levels.length === 0) {
    return 'unknown';
  }

  return levels.reduce((weakest, level) =>
    compareCapabilityConfidence(level, weakest) < 0 ? level : weakest,
  );
}

function selectStrongestLevel(claims: CapabilityClaim[]): CapabilityConfidenceLevel {
  if (claims.length === 0) {
    return 'unknown';
  }

  return claims.reduce<CapabilityConfidenceLevel>((strongest, claim) =>
    compareCapabilityConfidence(claim.level, strongest) > 0 ? claim.level : strongest,
  'unknown');
}

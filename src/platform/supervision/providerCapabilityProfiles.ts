import {
  getDefaultModel,
  normalizeProductProviderModelId,
} from '../../shared/providerCatalog.js';
import type { ProviderModelSelection } from '../../shared/providerSelection.js';
import {
  buildCapabilityAssessment,
  createProviderCatalogEvidence,
} from './capabilityAssessment.js';
import type {
  CapabilityAssessment,
  CapabilityClaim,
  CapabilityDimension,
  CapabilitySource,
} from './contracts.js';

export const PROVIDER_CAPABILITY_CATALOG_VERSION =
  'provider-capability-bootstrap@2026-04-28';

export type ProviderCapabilityProfileKind = 'strong_agent' | 'weak_worker' | 'unknown';

export interface ProviderCapabilityTarget {
  provider: string;
  instance?: string | null;
  model?: string | null;
  control?: string | null;
  modelSelection?: ProviderModelSelection | null;
}

export interface CapabilityEvidenceSourceFixture {
  source: Extract<CapabilitySource, 'eval_suite' | 'session_history'>;
  evidenceId: string;
  description: string;
  requiredMetadata: string[];
}

export interface ProviderCapabilityProfile {
  profileId: string;
  provider: string;
  instance: string | null;
  model: string;
  control: string | null;
  kind: ProviderCapabilityProfileKind;
  assessment: CapabilityAssessment;
  sourceFixtures: CapabilityEvidenceSourceFixture[];
  notes: string[];
}

const BOOTSTRAP_PROVIDER_IDS = ['claude', 'codex', 'ollama', 'unknown'] as const;

export function buildBootstrapProviderCapabilityProfiles(input: {
  assessedAt: string;
}): ProviderCapabilityProfile[] {
  return BOOTSTRAP_PROVIDER_IDS.map((provider) =>
    resolveProviderCapabilityProfile({ provider }, { assessedAt: input.assessedAt }),
  );
}

export function resolveProviderCapabilityProfile(
  target: ProviderCapabilityTarget,
  options: {
    assessedAt: string;
  },
): ProviderCapabilityProfile {
  const provider = normalizeProviderId(target.provider);
  const model = normalizeCapabilityModel(provider, target.model);
  const kind = classifyProviderCapability(provider);
  const sourceFixtures = createSourceFixtures(provider, model);
  const profileId = createProviderCapabilityProfileId({
    provider,
    instance: target.instance ?? null,
    model,
    control: target.control ?? null,
  });

  if (kind === 'unknown') {
    return {
      profileId,
      provider,
      instance: target.instance ?? null,
      model,
      control: target.control ?? null,
      kind,
      assessment: buildCapabilityAssessment({
        assessedAt: options.assessedAt,
        confidenceSources: [],
      }),
      sourceFixtures,
      notes: [
        'No provider catalog evidence exists yet; policy must use conservative unknown dials.',
      ],
    };
  }

  const catalogEvidence = createProviderCatalogEvidence({
    providerId: provider,
    modelId: model,
    catalogVersion: PROVIDER_CAPABILITY_CATALOG_VERSION,
    observedAt: options.assessedAt,
    claims: kind === 'weak_worker'
      ? createWeakProviderCatalogClaims(provider)
      : createStrongProviderCatalogClaims(provider),
  });

  return {
    profileId,
    provider,
    instance: target.instance ?? null,
    model,
    control: target.control ?? null,
    kind,
    assessment: buildCapabilityAssessment({
      assessedAt: options.assessedAt,
      confidenceSources: [catalogEvidence],
    }),
    sourceFixtures,
    notes: kind === 'weak_worker'
      ? [
          'Local/weak provider starts as SOP/worker-capable only; policy should clamp dials.',
        ]
      : [
          'Strong provider starts from catalog evidence only; eval/history evidence is ' +
            'still required for broad autonomy.',
        ],
  };
}

function normalizeProviderId(provider: string): string {
  const trimmed = provider.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : 'unknown';
}

function normalizeCapabilityModel(provider: string, model: string | null | undefined): string {
  const normalized = normalizeProductProviderModelId(provider, model);
  if (normalized) {
    return normalized;
  }

  return getDefaultModel(provider) || 'unknown-model';
}

function classifyProviderCapability(provider: string): ProviderCapabilityProfileKind {
  if (provider === 'claude' || provider === 'codex') {
    return 'strong_agent';
  }
  if (provider === 'ollama') {
    return 'weak_worker';
  }
  return 'unknown';
}

function createStrongProviderCatalogClaims(
  provider: string,
): Partial<Record<CapabilityDimension, CapabilityClaim>> {
  return {
    tool_use_accuracy: {
      level: 'catalog_only',
      summary: `${provider} catalog profile advertises agent tool-use support; eval pending.`,
    },
    json_fidelity: {
      level: 'catalog_only',
      summary: `${provider} catalog profile advertises structured output support; eval pending.`,
    },
    reasoning_depth: {
      level: 'catalog_only',
      summary: `${provider} catalog profile is treated as a strong reasoning candidate; eval pending.`,
    },
    recovery_reliability: {
      level: 'catalog_only',
      summary: `${provider} catalog profile can attempt recovery, but history is not observed yet.`,
    },
  };
}

function createWeakProviderCatalogClaims(
  provider: string,
): Partial<Record<CapabilityDimension, CapabilityClaim>> {
  return {
    tool_use_accuracy: {
      level: 'unknown',
      summary: `${provider} local/weak profile has no autonomous tool-use evidence.`,
    },
    json_fidelity: {
      level: 'unknown',
      summary: `${provider} local/weak profile requires schema validation before use.`,
    },
    reasoning_depth: {
      level: 'unknown',
      summary: `${provider} local/weak profile is limited to tiny SOP-shaped tasks.`,
    },
    recovery_reliability: {
      level: 'unknown',
      summary: `${provider} local/weak profile escalates recovery by default.`,
    },
  };
}

function createSourceFixtures(provider: string, model: string): CapabilityEvidenceSourceFixture[] {
  const target = `${sanitizeProfilePart(provider)}:${sanitizeProfilePart(model)}`;

  return [
    {
      source: 'eval_suite',
      evidenceId: `eval_suite:${target}:pending`,
      description: 'Schema fixture for future eval-suite capability evidence; no eval run ingested.',
      requiredMetadata: ['evalSuiteId', 'evalRunId'],
    },
    {
      source: 'session_history',
      evidenceId: `session_history:${target}:pending`,
      description:
        'Schema fixture for future bounded session-history summaries; raw transcript is not ingested.',
      requiredMetadata: ['historyWindow'],
    },
  ];
}

function createProviderCapabilityProfileId(input: {
  provider: string;
  instance: string | null;
  model: string;
  control: string | null;
}): string {
  return [
    'provider-capability',
    sanitizeProfilePart(input.provider),
    sanitizeProfilePart(input.instance ?? 'default'),
    sanitizeProfilePart(input.model),
    sanitizeProfilePart(input.control ?? 'default'),
  ].join(':');
}

function sanitizeProfilePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown';
}

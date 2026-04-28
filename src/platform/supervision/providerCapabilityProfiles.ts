import {
  getDefaultModel,
  normalizeProductProviderModelId,
} from '../../shared/providerCatalog.js';
import type { ProviderModelSelection } from '../../shared/providerSelection.js';
import {
  buildCapabilityAssessment,
} from './capabilityAssessment.js';
import {
  resolveProviderCapabilityBootstrapRule,
  type ProviderCapabilityBootstrapConfig,
  type ProviderCapabilityBootstrapTreatment,
} from './providerCapabilityBootstrapConfig.js';
import {
  DEFAULT_PROVIDER_CAPABILITY_CONTROL_KEY,
  createProviderCapabilityControlKey,
} from './providerCapabilityControlKey.js';
import type {
  CapabilityAssessment,
  CapabilityClaim,
  CapabilityDimension,
  CapabilitySource,
  CapabilitySourceEvidence,
  SupervisionDiagnosticRecord,
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
  bootstrapTreatment: 'default' | ProviderCapabilityBootstrapTreatment;
  assessment: CapabilityAssessment;
  sourceFixtures: CapabilityEvidenceSourceFixture[];
  diagnostics: SupervisionDiagnosticRecord[];
  notes: string[];
}

const BOOTSTRAP_PROVIDER_IDS = ['claude', 'codex', 'ollama', 'unknown'] as const;

export function buildBootstrapProviderCapabilityProfiles(input: {
  assessedAt: string;
  bootstrapConfig?: ProviderCapabilityBootstrapConfig | null;
}): ProviderCapabilityProfile[] {
  return BOOTSTRAP_PROVIDER_IDS.map((provider) =>
    resolveProviderCapabilityProfile(
      { provider },
      { assessedAt: input.assessedAt, bootstrapConfig: input.bootstrapConfig },
    ),
  );
}

export function resolveProviderCapabilityProfile(
  target: ProviderCapabilityTarget,
  options: {
    assessedAt: string;
    bootstrapConfig?: ProviderCapabilityBootstrapConfig | null;
  },
): ProviderCapabilityProfile {
  const provider = normalizeProviderId(target.provider);
  const model = normalizeCapabilityModel(provider, target.model);
  const controlKey = createProviderCapabilityControlKey({
    control: target.control,
    modelSelection: target.modelSelection,
  });
  const profileControl = controlKey === DEFAULT_PROVIDER_CAPABILITY_CONTROL_KEY ? null : controlKey;
  const bootstrapResolution = resolveProviderCapabilityBootstrapRule(
    options.bootstrapConfig,
    {
      provider,
      instance: target.instance ?? null,
      model,
      control: controlKey,
    },
    {
      observedAt: options.assessedAt,
      configPath: options.bootstrapConfig?.configPath ?? null,
    },
  );
  const kind = bootstrapResolution.treatment === 'default'
    ? 'unknown'
    : bootstrapResolution.treatment;
  const sourceFixtures = createSourceFixtures(provider, model);
  const profileId = createProviderCapabilityProfileId({
    provider,
    instance: target.instance ?? null,
    model,
    control: profileControl,
  });

  if (kind === 'unknown') {
    return {
      profileId,
      provider,
      instance: target.instance ?? null,
      model,
      control: profileControl,
      kind,
      bootstrapTreatment: 'default',
      assessment: buildCapabilityAssessment({
        assessedAt: options.assessedAt,
        confidenceSources: [],
      }),
      sourceFixtures,
      diagnostics: bootstrapResolution.diagnostics,
      notes: [
        'No provider capability bootstrap rule matched; policy must use conservative unknown dials.',
      ],
    };
  }

  const bootstrapEvidence = createBootstrapConfigEvidence({
    providerId: provider,
    modelId: model,
    ruleId: bootstrapResolution.rule?.id ?? 'unknown-rule',
    configVersion: String(options.bootstrapConfig?.version ?? 1),
    configPath: options.bootstrapConfig?.configPath ?? null,
    reason: bootstrapResolution.rule?.reason ?? 'Provider capability bootstrap rule matched.',
    observedAt: options.assessedAt,
    claims: kind === 'weak_worker'
      ? createWeakProviderBootstrapClaims(provider)
      : createStrongProviderBootstrapClaims(provider),
  });

  return {
    profileId,
    provider,
    instance: target.instance ?? null,
    model,
    control: profileControl,
    kind,
    bootstrapTreatment: kind,
    assessment: buildCapabilityAssessment({
      assessedAt: options.assessedAt,
      confidenceSources: [bootstrapEvidence],
    }),
    sourceFixtures,
    diagnostics: bootstrapResolution.diagnostics,
    notes: kind === 'weak_worker'
      ? [
          'Configured weak provider starts as SOP/worker-capable only; policy should clamp dials.',
        ]
      : [
          'Configured strong provider starts from bootstrap config evidence only; eval/history evidence is ' +
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

function createBootstrapConfigEvidence(input: {
  providerId: string;
  modelId: string;
  ruleId: string;
  configVersion: string;
  configPath: string | null;
  reason: string;
  observedAt: string;
  claims: Partial<Record<CapabilityDimension, CapabilityClaim>>;
}): CapabilitySourceEvidence {
  return {
    evidenceId:
      `bootstrap_config:${sanitizeProfilePart(input.ruleId)}:` +
      `${sanitizeProfilePart(input.providerId)}:${sanitizeProfilePart(input.modelId)}`,
    source: 'bootstrap_config',
    observedAt: input.observedAt,
    claims: input.claims,
    metadata: {
      bootstrapConfigRuleId: input.ruleId,
      bootstrapConfigVersion: input.configVersion,
      bootstrapConfigPath: input.configPath ?? undefined,
      bootstrapConfigReason: input.reason,
    },
  };
}

function createStrongProviderBootstrapClaims(
  provider: string,
): Partial<Record<CapabilityDimension, CapabilityClaim>> {
  return {
    tool_use_accuracy: {
      level: 'catalog_only',
      summary: `${provider} catalog profile advertises agent tool-use support; eval pending.`,
    },
    json_fidelity: {
      level: 'catalog_only',
      summary: `${provider} bootstrap config attests structured output candidacy; eval pending.`,
    },
    reasoning_depth: {
      level: 'catalog_only',
      summary: `${provider} bootstrap config marks a strong reasoning candidate; eval pending.`,
    },
    recovery_reliability: {
      level: 'catalog_only',
      summary: `${provider} bootstrap config allows recovery attempts, but history is not observed yet.`,
    },
  };
}

function createWeakProviderBootstrapClaims(
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

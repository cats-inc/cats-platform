import {
  normalizeProductProviderModelId,
} from '../../shared/providerCatalog.js';
import type {
  CapabilityConfidenceLevel,
  SupervisionDiagnosticCode,
  SupervisionDiagnosticRecord,
  SupervisionDiagnosticSeverity,
} from './contracts.js';
import {
  createProviderCapabilityControlKey,
} from './providerCapabilityControlKey.js';

export type ProviderCapabilityBootstrapTreatment = 'strong_agent' | 'weak_worker';
export type ProviderCapabilityBootstrapResolutionTreatment =
  | 'default'
  | ProviderCapabilityBootstrapTreatment;

export interface ProviderCapabilityBootstrapSelector {
  provider: string;
  instance?: string | null;
  model?: string | null;
  control?: string | null;
}

export interface ProviderCapabilityBootstrapRule {
  id: string;
  selector: ProviderCapabilityBootstrapSelector;
  initialTreatment: ProviderCapabilityBootstrapTreatment;
  confidenceLevel: Extract<CapabilityConfidenceLevel, 'catalog_only'>;
  reason: string;
}

export interface ProviderCapabilityBootstrapConfig {
  version: 1;
  configPath?: string | null;
  profiles: ProviderCapabilityBootstrapRule[];
}

export interface ProviderCapabilityBootstrapTarget {
  provider: string;
  instance?: string | null;
  model?: string | null;
  control?: string | null;
}

export interface ProviderCapabilityBootstrapConfigResult {
  config: ProviderCapabilityBootstrapConfig | null;
  diagnostics: SupervisionDiagnosticRecord[];
}

export interface ProviderCapabilityBootstrapRuleResolution {
  treatment: ProviderCapabilityBootstrapResolutionTreatment;
  rule: ProviderCapabilityBootstrapRule | null;
  diagnostics: SupervisionDiagnosticRecord[];
}

interface RuleWithIndex {
  rule: ProviderCapabilityBootstrapRule;
  index: number;
  specificity: number;
}

export function parseProviderCapabilityBootstrapConfigDocument(
  document: unknown,
  options: {
    observedAt: string;
    configPath?: string | null;
  },
): ProviderCapabilityBootstrapConfigResult {
  const errors: SupervisionDiagnosticRecord[] = [];
  const record = asRecord(document);
  if (!record) {
    return {
      config: null,
      diagnostics: [
        createBootstrapDiagnostic({
          code: 'parse_failed',
          severity: 'error',
          observedAt: options.observedAt,
          configPath: options.configPath,
          message: 'Provider capability bootstrap config must be a YAML object.',
        }),
      ],
    };
  }

  if (record.version !== 1) {
    errors.push(createBootstrapDiagnostic({
      code: 'parse_failed',
      severity: 'error',
      observedAt: options.observedAt,
      configPath: options.configPath,
      message: 'Provider capability bootstrap config version must be 1.',
    }));
  }

  const rawProfiles = Array.isArray(record.profiles) ? record.profiles : null;
  if (!rawProfiles) {
    errors.push(createBootstrapDiagnostic({
      code: 'parse_failed',
      severity: 'error',
      observedAt: options.observedAt,
      configPath: options.configPath,
      message: 'Provider capability bootstrap config profiles must be an array.',
    }));
  }

  if (errors.length > 0 || !rawProfiles) {
    return { config: null, diagnostics: errors };
  }

  const profiles: ProviderCapabilityBootstrapRule[] = [];
  const seenIds = new Set<string>();

  rawProfiles.forEach((rawProfile, index) => {
    const profile = parseProfile(rawProfile, {
      index,
      observedAt: options.observedAt,
      configPath: options.configPath,
    });
    errors.push(...profile.diagnostics);

    if (!profile.rule) {
      return;
    }

    if (seenIds.has(profile.rule.id)) {
      errors.push(createBootstrapDiagnostic({
        code: 'duplicate_rule_id',
        severity: 'error',
        observedAt: options.observedAt,
        configPath: options.configPath,
        ruleIds: [profile.rule.id],
        message: `Duplicate provider capability bootstrap rule id: ${profile.rule.id}.`,
      }));
      return;
    }

    seenIds.add(profile.rule.id);
    profiles.push(profile.rule);
  });

  if (errors.length > 0) {
    return { config: null, diagnostics: errors };
  }

  return {
    config: {
      version: 1,
      configPath: options.configPath ?? null,
      profiles,
    },
    diagnostics: [],
  };
}

export function createMissingProviderCapabilityBootstrapDiagnostic(input: {
  observedAt: string;
  configPath?: string | null;
}): SupervisionDiagnosticRecord {
  return createBootstrapDiagnostic({
    code: 'missing_config',
    severity: 'warning',
    observedAt: input.observedAt,
    configPath: input.configPath,
    message:
      'No provider capability bootstrap config was found; all providers start default/unknown.',
  });
}

export function resolveProviderCapabilityBootstrapRule(
  config: ProviderCapabilityBootstrapConfig | null | undefined,
  target: ProviderCapabilityBootstrapTarget,
  options: {
    observedAt: string;
    configPath?: string | null;
  },
): ProviderCapabilityBootstrapRuleResolution {
  if (!config) {
    return {
      treatment: 'default',
      rule: null,
      diagnostics: [],
    };
  }

  const normalizedTarget = normalizeBootstrapTarget(target);
  const matches = config.profiles
    .map((rule, index): RuleWithIndex | null => {
      if (!matchesSelector(rule.selector, normalizedTarget)) {
        return null;
      }

      return {
        rule,
        index,
        specificity: calculateSelectorSpecificity(rule.selector),
      };
    })
    .filter((match): match is RuleWithIndex => match !== null);

  if (matches.length === 0) {
    return {
      treatment: 'default',
      rule: null,
      diagnostics: [],
    };
  }

  const best = matches.reduce((winner, candidate) => {
    if (candidate.specificity > winner.specificity) {
      return candidate;
    }
    if (candidate.specificity === winner.specificity && candidate.index > winner.index) {
      return candidate;
    }
    return winner;
  });
  const losingTies = matches.filter((candidate) =>
    candidate !== best && candidate.specificity === best.specificity);
  const diagnostics: SupervisionDiagnosticRecord[] = [
    createBootstrapDiagnostic({
      code: 'matched_rule',
      severity: 'info',
      observedAt: options.observedAt,
      configPath: config.configPath ?? options.configPath,
      ruleIds: [best.rule.id],
      target: normalizedTarget,
      message:
        `Matched provider capability bootstrap rule ${best.rule.id} ` +
        `as ${best.rule.initialTreatment}.`,
    }),
  ];

  diagnostics.push(...losingTies.map((candidate) => createBootstrapDiagnostic({
    code: 'losing_tie_rule',
    severity: 'warning',
    observedAt: options.observedAt,
    configPath: config.configPath ?? options.configPath,
    ruleIds: [candidate.rule.id, best.rule.id],
    target: normalizedTarget,
    message:
      `Rule ${candidate.rule.id} tied specificity with ${best.rule.id} but lost by file order.`,
  })));

  return {
    treatment: best.rule.initialTreatment,
    rule: best.rule,
    diagnostics,
  };
}

export function normalizeBootstrapTarget(
  target: ProviderCapabilityBootstrapTarget,
): Required<ProviderCapabilityBootstrapTarget> {
  const provider = normalizeProviderId(target.provider);

  return {
    provider,
    instance: normalizeOptionalSelectorValue(target.instance),
    model: normalizeModelSelector(provider, target.model),
    control: createProviderCapabilityControlKey({ control: target.control }),
  };
}

function parseProfile(
  rawProfile: unknown,
  options: {
    index: number;
    observedAt: string;
    configPath?: string | null;
  },
): { rule: ProviderCapabilityBootstrapRule | null; diagnostics: SupervisionDiagnosticRecord[] } {
  const diagnostics: SupervisionDiagnosticRecord[] = [];
  const profile = asRecord(rawProfile);
  const profileLabel = `profiles[${options.index}]`;
  if (!profile) {
    return {
      rule: null,
      diagnostics: [
        createBootstrapDiagnostic({
          code: 'parse_failed',
          severity: 'error',
          observedAt: options.observedAt,
          configPath: options.configPath,
          message: `${profileLabel} must be an object.`,
        }),
      ],
    };
  }

  const id = readTrimmedString(profile.id);
  if (!id) {
    diagnostics.push(createBootstrapDiagnostic({
      code: 'parse_failed',
      severity: 'error',
      observedAt: options.observedAt,
      configPath: options.configPath,
      message: `${profileLabel}.id must be a non-empty string.`,
    }));
  }

  const selectorResult = parseSelector(profile.selector, {
    ...options,
    profileLabel,
    ruleId: id,
  });
  diagnostics.push(...selectorResult.diagnostics);

  const treatment = readTrimmedString(profile.initialTreatment);
  if (treatment !== 'strong_agent' && treatment !== 'weak_worker') {
    diagnostics.push(createBootstrapDiagnostic({
      code: 'invalid_treatment',
      severity: 'error',
      observedAt: options.observedAt,
      configPath: options.configPath,
      ruleIds: id ? [id] : undefined,
      message:
        `${profileLabel}.initialTreatment must be strong_agent or weak_worker; ` +
        'default is not a valid YAML grant.',
    }));
  }

  const confidenceLevel = readTrimmedString(profile.confidenceLevel);
  if (confidenceLevel !== 'catalog_only') {
    diagnostics.push(createBootstrapDiagnostic({
      code: 'invalid_confidence',
      severity: 'error',
      observedAt: options.observedAt,
      configPath: options.configPath,
      ruleIds: id ? [id] : undefined,
      message: `${profileLabel}.confidenceLevel must be catalog_only.`,
    }));
  }

  const reason = readTrimmedString(profile.reason);
  if (!reason) {
    diagnostics.push(createBootstrapDiagnostic({
      code: 'parse_failed',
      severity: 'error',
      observedAt: options.observedAt,
      configPath: options.configPath,
      ruleIds: id ? [id] : undefined,
      message: `${profileLabel}.reason must be a non-empty string.`,
    }));
  }

  if (
    diagnostics.length > 0 ||
    !id ||
    !selectorResult.selector ||
    (treatment !== 'strong_agent' && treatment !== 'weak_worker') ||
    confidenceLevel !== 'catalog_only' ||
    !reason
  ) {
    return { rule: null, diagnostics };
  }

  return {
    rule: {
      id,
      selector: selectorResult.selector,
      initialTreatment: treatment,
      confidenceLevel,
      reason,
    },
    diagnostics,
  };
}

function parseSelector(
  rawSelector: unknown,
  options: {
    profileLabel: string;
    ruleId: string | null;
    observedAt: string;
    configPath?: string | null;
  },
): { selector: ProviderCapabilityBootstrapSelector | null; diagnostics: SupervisionDiagnosticRecord[] } {
  const diagnostics: SupervisionDiagnosticRecord[] = [];
  const selector = asRecord(rawSelector);
  if (!selector) {
    return {
      selector: null,
      diagnostics: [
        createBootstrapDiagnostic({
          code: 'parse_failed',
          severity: 'error',
          observedAt: options.observedAt,
          configPath: options.configPath,
          ruleIds: options.ruleId ? [options.ruleId] : undefined,
          message: `${options.profileLabel}.selector must be an object.`,
        }),
      ],
    };
  }

  const provider = normalizeProviderId(readTrimmedString(selector.provider) ?? '');
  if (provider === 'unknown') {
    diagnostics.push(createBootstrapDiagnostic({
      code: 'parse_failed',
      severity: 'error',
      observedAt: options.observedAt,
      configPath: options.configPath,
      ruleIds: options.ruleId ? [options.ruleId] : undefined,
      message: `${options.profileLabel}.selector.provider must be a non-empty string.`,
    }));
  }

  const instance = normalizeOptionalSelectorValue(readTrimmedString(selector.instance));
  const model = normalizeModelSelector(provider, readTrimmedString(selector.model));
  const control = selector.control === undefined || selector.control === null
    ? null
    : createProviderCapabilityControlKey({ control: readTrimmedString(selector.control) });

  if (diagnostics.length > 0) {
    return { selector: null, diagnostics };
  }

  return {
    selector: {
      provider,
      ...(instance ? { instance } : {}),
      ...(model ? { model } : {}),
      ...(control ? { control } : {}),
    },
    diagnostics,
  };
}

function matchesSelector(
  selector: ProviderCapabilityBootstrapSelector,
  target: Required<ProviderCapabilityBootstrapTarget>,
): boolean {
  return selector.provider === target.provider
    && (selector.instance === undefined || selector.instance === target.instance)
    && (selector.model === undefined || selector.model === target.model)
    && (selector.control === undefined || selector.control === target.control);
}

function calculateSelectorSpecificity(selector: ProviderCapabilityBootstrapSelector): number {
  return Number(selector.instance !== undefined)
    + Number(selector.model !== undefined)
    + Number(selector.control !== undefined);
}

function createBootstrapDiagnostic(input: {
  code: SupervisionDiagnosticCode;
  severity: SupervisionDiagnosticSeverity;
  observedAt: string;
  configPath?: string | null;
  ruleIds?: string[];
  target?: SupervisionDiagnosticRecord['target'];
  message: string;
}): SupervisionDiagnosticRecord {
  const rulePart = input.ruleIds?.join('-') ?? 'config';

  return {
    id: [
      'provider-capability-bootstrap',
      input.code,
      sanitizeDiagnosticIdPart(rulePart),
      sanitizeDiagnosticIdPart(input.observedAt),
    ].join(':'),
    kind: 'provider_capability_bootstrap_config',
    severity: input.severity,
    code: input.code,
    observedAt: input.observedAt,
    configPath: input.configPath ?? undefined,
    ruleIds: input.ruleIds,
    target: input.target,
    message: input.message,
  };
}

function normalizeProviderId(provider: string): string {
  const trimmed = provider.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : 'unknown';
}

function normalizeOptionalSelectorValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeModelSelector(provider: string, model: string | null | undefined): string | null {
  if (!model) {
    return null;
  }

  return normalizeProductProviderModelId(provider, model) ?? model.trim().toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function sanitizeDiagnosticIdPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown';
}

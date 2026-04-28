import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';

import {
  parseProviderCapabilityBootstrapConfigDocument,
  type ProviderCapabilityBootstrapConfigResult,
} from './providerCapabilityBootstrapConfig.js';
import type { SupervisionDiagnosticRecord } from './contracts.js';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml') as {
  load(input: string): unknown;
};

export function parseProviderCapabilityBootstrapConfigYaml(
  yamlText: string,
  options: {
    observedAt: string;
    configPath?: string | null;
  },
): ProviderCapabilityBootstrapConfigResult {
  try {
    return parseProviderCapabilityBootstrapConfigDocument(
      yaml.load(yamlText),
      options,
    );
  } catch (error) {
    return {
      config: null,
      diagnostics: [
        createParseFailureDiagnostic({
          observedAt: options.observedAt,
          configPath: options.configPath,
          error,
        }),
      ],
    };
  }
}

export function loadProviderCapabilityBootstrapConfigFromFile(input: {
  configPath: string;
  observedAt: string;
}): ProviderCapabilityBootstrapConfigResult {
  if (!existsSync(input.configPath)) {
    return {
      config: null,
      diagnostics: [
        {
          id:
            'provider-capability-bootstrap:missing-config:' +
            sanitizeDiagnosticIdPart(input.observedAt),
          kind: 'provider_capability_bootstrap_config',
          severity: 'warning',
          code: 'missing_config',
          observedAt: input.observedAt,
          configPath: input.configPath,
          message:
            'No provider capability bootstrap config was found; all providers start default/unknown.',
        },
      ],
    };
  }

  return parseProviderCapabilityBootstrapConfigYaml(
    readFileSync(input.configPath, 'utf8'),
    {
      observedAt: input.observedAt,
      configPath: input.configPath,
    },
  );
}

function createParseFailureDiagnostic(input: {
  observedAt: string;
  configPath?: string | null;
  error: unknown;
}): SupervisionDiagnosticRecord {
  return {
    id: `provider-capability-bootstrap:parse-failed:${sanitizeDiagnosticIdPart(input.observedAt)}`,
    kind: 'provider_capability_bootstrap_config',
    severity: 'error',
    code: 'parse_failed',
    observedAt: input.observedAt,
    configPath: input.configPath ?? undefined,
    message:
      'Provider capability bootstrap YAML failed to parse: ' +
      (input.error instanceof Error ? input.error.message : String(input.error)),
  };
}

function sanitizeDiagnosticIdPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown';
}

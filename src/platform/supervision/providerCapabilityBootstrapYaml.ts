import { createRequire } from 'node:module';

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

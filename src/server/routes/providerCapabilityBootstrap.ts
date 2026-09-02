/**
 * Provider capability bootstrap, over HTTP (PLAN-105 Phase 1, gate G1).
 *
 * The bootstrap config is a YAML file, and until now the only way to get one was
 * to read a diagnostic that said "copy the bundled example to this path" and do
 * it by hand. That is a poor answer when readiness has just told the owner their
 * capability profile is missing.
 *
 * What this exposes is deliberately narrow:
 *
 *  - read the current state — where the file is looked for, whether it parsed,
 *    the diagnostics (which were collected into a sink and surfaced nowhere), and
 *    the rules in effect; and
 *  - install the bundled example at the configured path, once, refusing to
 *    overwrite an existing file; and
 *  - validate and save the complete rule document with an optimistic revision
 *    check, so Settings cannot overwrite a simultaneous file edit.
 *
 * One thing is deliberately *not* here.
 *
 * A live reload: the loaded config is passed by value into the chat dispatch
 * adapters when the host is composed, so nothing here can make a new file take
 * effect in the running process. Rather than pretend otherwise, the view reports
 * `restartRequired` when what is on disk no longer matches what the host booted
 * with.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import type { ServerResponse } from 'node:http';
import { dirname } from 'node:path';

import {
  loadProviderCapabilityBootstrapConfigFromFile,
  serializeProviderCapabilityBootstrapConfigYaml,
} from '../../platform/supervision/providerCapabilityBootstrapYaml.js';
import type { SupervisionDiagnosticRecord } from '../../platform/supervision/contracts.js';
import type {
  ProviderCapabilityBootstrapConfig,
} from '../../platform/supervision/providerCapabilityBootstrapConfig.js';
import {
  parseProviderCapabilityBootstrapConfigDocument,
} from '../../platform/supervision/providerCapabilityBootstrapConfig.js';
import { sendJson } from '../../shared/http.js';

function sendRestError(
  response: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
): void {
  sendJson(response, statusCode, { error: { code, message } });
}

export interface ProviderCapabilityBootstrapDependencies {
  configPath: string;
  bundledExamplePath: string | null;
  now: () => Date;
  /** The parsed config captured when the running host was composed. */
  bootedConfig: ProviderCapabilityBootstrapConfig | null;
}

export interface ProviderCapabilityBootstrapView {
  configPath: string;
  bundledExamplePath: string | null;
  /** A file exists at `configPath`. Absent config with no file is the default. */
  configPresent: boolean;
  /** SHA-256 of the file bytes, used to reject stale Settings writes. */
  revision: string | null;
  /** The bundled example can be installed — it exists and nothing is there yet. */
  canInstallExample: boolean;
  parsed: boolean;
  /**
   * On-disk state has diverged from what the process is running. The install
   * action sets this; it is the honest alternative to a reload that cannot work.
   */
  restartRequired: boolean;
  ruleCount: number;
  rules: Array<{
    id: string;
    initialTreatment: string;
    confidenceLevel: string;
    reason: string;
    selector: unknown;
  }>;
  diagnostics: SupervisionDiagnosticRecord[];
}

export interface ProviderCapabilityBootstrapWriteInput {
  expectedRevision: string | null;
  config: unknown;
}

function fingerprintFile(configPath: string): string | null {
  if (!existsSync(configPath)) {
    return null;
  }
  return createHash('sha256').update(readFileSync(configPath)).digest('hex');
}

function comparableConfig(config: ProviderCapabilityBootstrapConfig | null): unknown {
  return config === null
    ? null
    : { version: config.version, profiles: config.profiles };
}

function configsMatch(
  left: ProviderCapabilityBootstrapConfig | null,
  right: ProviderCapabilityBootstrapConfig | null,
): boolean {
  return JSON.stringify(comparableConfig(left)) === JSON.stringify(comparableConfig(right));
}

function readView(
  dependencies: ProviderCapabilityBootstrapDependencies,
): ProviderCapabilityBootstrapView {
  const configPresent = existsSync(dependencies.configPath);
  const loaded = loadProviderCapabilityBootstrapConfigFromFile({
    configPath: dependencies.configPath,
    observedAt: dependencies.now().toISOString(),
    bundledExamplePath: dependencies.bundledExamplePath,
  });
  const rules = loaded.config?.profiles ?? [];
  return {
    configPath: dependencies.configPath,
    bundledExamplePath: dependencies.bundledExamplePath,
    configPresent,
    revision: fingerprintFile(dependencies.configPath),
    canInstallExample:
      !configPresent
      && dependencies.bundledExamplePath !== null
      && existsSync(dependencies.bundledExamplePath),
    parsed: loaded.config !== null,
    restartRequired: !configsMatch(loaded.config, dependencies.bootedConfig),
    ruleCount: rules.length,
    rules: rules.map((rule) => ({
      id: rule.id,
      initialTreatment: rule.initialTreatment,
      confidenceLevel: rule.confidenceLevel,
      reason: rule.reason,
      selector: rule.selector,
    })),
    diagnostics: loaded.diagnostics,
  };
}

export function handleProviderCapabilityBootstrapRead(
  response: ServerResponse,
  dependencies: ProviderCapabilityBootstrapDependencies,
): void {
  sendJson(response, 200, readView(dependencies));
}

export function handleProviderCapabilityBootstrapAction(
  response: ServerResponse,
  dependencies: ProviderCapabilityBootstrapDependencies,
  action: unknown,
): void {
  if (action !== 'install-example') {
    sendRestError(response, 400, 'invalid_action', 'action must be "install-example".');
    return;
  }

  if (existsSync(dependencies.configPath)) {
    // Never overwrite: the file may hold rules an operator wrote by hand.
    sendRestError(
      response,
      409,
      'capability_bootstrap_config_exists',
      `A capability bootstrap config already exists at ${dependencies.configPath}.`,
    );
    return;
  }
  if (
    dependencies.bundledExamplePath === null
    || !existsSync(dependencies.bundledExamplePath)
  ) {
    sendRestError(
      response,
      409,
      'capability_bootstrap_example_missing',
      'This build ships no bundled capability bootstrap example to install.',
    );
    return;
  }
  try {
    mkdirSync(dirname(dependencies.configPath), { recursive: true });
    copyFileSync(
      dependencies.bundledExamplePath,
      dependencies.configPath,
      constants.COPYFILE_EXCL,
    );
  } catch (error) {
    sendRestError(
      response,
      500,
      'capability_bootstrap_install_failed',
      error instanceof Error ? error.message : 'Could not install the bundled example.',
    );
    return;
  }

  // The file now exists, so the view comes back with `restartRequired` set.
  sendJson(response, 200, readView(dependencies));
}

function isWriteInput(input: unknown): input is ProviderCapabilityBootstrapWriteInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false;
  }
  const record = input as Record<string, unknown>;
  return (record.expectedRevision === null || typeof record.expectedRevision === 'string')
    && Object.hasOwn(record, 'config');
}

export function handleProviderCapabilityBootstrapWrite(
  response: ServerResponse,
  dependencies: ProviderCapabilityBootstrapDependencies,
  input: unknown,
): void {
  if (!isWriteInput(input)) {
    sendRestError(
      response,
      400,
      'invalid_capability_bootstrap_write',
      'expectedRevision and config are required.',
    );
    return;
  }

  let currentRevision: string | null;
  try {
    currentRevision = fingerprintFile(dependencies.configPath);
  } catch {
    sendRestError(
      response,
      500,
      'capability_bootstrap_read_failed',
      'The current capability bootstrap config could not be read.',
    );
    return;
  }
  if (input.expectedRevision !== currentRevision) {
    sendRestError(
      response,
      409,
      'capability_bootstrap_revision_conflict',
      'The capability bootstrap config changed after Settings loaded it.',
    );
    return;
  }

  const parsed = parseProviderCapabilityBootstrapConfigDocument(input.config, {
    observedAt: dependencies.now().toISOString(),
    configPath: dependencies.configPath,
  });
  if (parsed.config === null) {
    sendJson(response, 400, {
      error: {
        code: 'invalid_capability_bootstrap_config',
        message: 'The capability bootstrap config is invalid.',
        diagnostics: parsed.diagnostics,
      },
    });
    return;
  }

  const temporaryPath = `${dependencies.configPath}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(dependencies.configPath), { recursive: true });
    writeFileSync(
      temporaryPath,
      serializeProviderCapabilityBootstrapConfigYaml(parsed.config),
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    renameSync(temporaryPath, dependencies.configPath);
  } catch {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // The temporary file was never created or has already been renamed.
    }
    sendRestError(
      response,
      500,
      'capability_bootstrap_save_failed',
      'The capability bootstrap config could not be saved.',
    );
    return;
  }

  sendJson(response, 200, readView(dependencies));
}

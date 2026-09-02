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
 *    overwrite an existing file.
 *
 * Two things are deliberately *not* here.
 *
 * Authoring individual rules from the UI: these are supervision policy rules
 * about how far a provider may be trusted before it has been observed, and a
 * half-expressive form editor would be a worse authoring surface than the file
 * with its comments.
 *
 * A live reload: the loaded config is passed by value into the chat dispatch
 * adapters when the host is composed, so nothing here can make a new file take
 * effect in the running process. Rather than pretend otherwise, the view reports
 * `restartRequired` when what is on disk no longer matches what the host booted
 * with.
 */

import { copyFileSync, existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';

import {
  loadProviderCapabilityBootstrapConfigFromFile,
} from '../../platform/supervision/providerCapabilityBootstrapYaml.js';
import type { SupervisionDiagnosticRecord } from '../../platform/supervision/contracts.js';
import type {
  ProviderCapabilityBootstrapConfig,
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
  /** Whether the running host booted with a parsed config. */
  bootedWithConfig: boolean;
}

export interface ProviderCapabilityBootstrapView {
  configPath: string;
  bundledExamplePath: string | null;
  /** A file exists at `configPath`. Absent config with no file is the default. */
  configPresent: boolean;
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
    canInstallExample:
      !configPresent
      && dependencies.bundledExamplePath !== null
      && existsSync(dependencies.bundledExamplePath),
    parsed: loaded.config !== null,
    restartRequired: (loaded.config !== null) !== dependencies.bootedWithConfig,
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
    copyFileSync(dependencies.bundledExamplePath, dependencies.configPath);
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

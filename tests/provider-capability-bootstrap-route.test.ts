/**
 * Provider capability bootstrap over HTTP (PLAN-105 Phase 1, gate G1).
 *
 * The config was file-only: a diagnostic told the operator to copy a bundled
 * example by hand, and the diagnostics themselves were collected into a sink no
 * surface rendered — so a malformed file failed silently.
 *
 * Install never overwrites an operator file. Settings writes validate the full
 * rule document and reject a stale revision before replacing it.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  parseProviderCapabilityBootstrapConfigYaml,
} from '../src/platform/supervision/providerCapabilityBootstrapYaml.js';
import {
  handleProviderCapabilityBootstrapAction,
  handleProviderCapabilityBootstrapRead,
  handleProviderCapabilityBootstrapWrite,
  type ProviderCapabilityBootstrapDependencies,
} from '../src/server/routes/providerCapabilityBootstrap.js';

const EXAMPLE = `version: 1
profiles:
  - id: ollama-local-worker
    selector:
      provider: ollama
    initialTreatment: weak_worker
    confidenceLevel: catalog_only
    reason: Local Ollama targets start as SOP workers unless evals say otherwise.
`;

interface Captured {
  status: number;
  body: any;
}

function captureResponse(): { response: ServerResponse; captured: Captured } {
  const captured: Captured = { status: 0, body: null };
  const response = {
    writeHead(status: number) {
      captured.status = status;
      return this;
    },
    end(payload?: string) {
      captured.body = payload ? JSON.parse(payload) : null;
      return this;
    },
    setHeader() {
      return this;
    },
  } as unknown as ServerResponse;
  return { response, captured };
}

function createWorkspace(options: {
  withConfig?: string;
  withExample?: string | null;
  bootedWithConfig?: boolean;
}): { dependencies: ProviderCapabilityBootstrapDependencies; root: string } {
  // Real temp dirs: this code copies files, and a Windows-style absolute path
  // would be a *relative* path on this host.
  const root = mkdtempSync(join(tmpdir(), 'cats-capability-bootstrap-'));
  const configPath = join(root, 'provider-capability-bootstrap.yaml');
  const examplePath = options.withExample === null ? null : join(root, 'example.yaml');

  if (options.withConfig !== undefined) {
    writeFileSync(configPath, options.withConfig, 'utf8');
  }
  if (examplePath !== null) {
    writeFileSync(examplePath, options.withExample ?? EXAMPLE, 'utf8');
  }

  return {
    root,
    dependencies: {
      configPath,
      bundledExamplePath: examplePath,
      now: () => new Date('2026-09-02T00:00:00.000Z'),
      bootedConfig: options.bootedWithConfig
        ? parseProviderCapabilityBootstrapConfigYaml(EXAMPLE, {
            observedAt: '2026-09-02T00:00:00.000Z',
            configPath,
          }).config
        : null,
    },
  };
}

// --- Reading -------------------------------------------------------------------

test('a host with no config reports what is missing and offers the example', () => {
  const { dependencies, root } = createWorkspace({});
  try {
    const { response, captured } = captureResponse();
    handleProviderCapabilityBootstrapRead(response, dependencies);

    assert.equal(captured.status, 200);
    assert.equal(captured.body.configPresent, false);
    assert.equal(captured.body.revision, null);
    assert.equal(captured.body.parsed, false);
    assert.equal(captured.body.canInstallExample, true);
    assert.equal(captured.body.configPath, dependencies.configPath);
    assert.ok(
      captured.body.diagnostics.length > 0,
      'the missing-config diagnostic reaches a surface instead of only a sink',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a parsed config reports its rules', () => {
  const { dependencies, root } = createWorkspace({ withConfig: EXAMPLE, bootedWithConfig: true });
  try {
    const { response, captured } = captureResponse();
    handleProviderCapabilityBootstrapRead(response, dependencies);

    assert.equal(captured.body.configPresent, true);
    assert.equal(captured.body.parsed, true);
    assert.equal(captured.body.ruleCount, 1);
    assert.match(captured.body.revision, /^[a-f0-9]{64}$/u);
    assert.equal(captured.body.rules[0].id, 'ollama-local-worker');
    assert.equal(captured.body.canInstallExample, false, 'nothing to install over');
    assert.equal(captured.body.restartRequired, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a malformed config is reported as unparsed rather than silently ignored', () => {
  const { dependencies, root } = createWorkspace({ withConfig: 'version: 1\nprofiles: "nope"\n' });
  try {
    const { response, captured } = captureResponse();
    handleProviderCapabilityBootstrapRead(response, dependencies);

    assert.equal(captured.body.configPresent, true);
    assert.equal(captured.body.parsed, false);
    assert.ok(captured.body.diagnostics.length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a changed parsed config asks for restart even when both versions are valid', () => {
  const { dependencies, root } = createWorkspace({
    withConfig: EXAMPLE,
    bootedWithConfig: true,
  });
  try {
    writeFileSync(dependencies.configPath, 'version: 1\nprofiles: []\n', 'utf8');
    const { response, captured } = captureResponse();
    handleProviderCapabilityBootstrapRead(response, dependencies);

    assert.equal(captured.body.parsed, true);
    assert.equal(captured.body.restartRequired, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- Installing ----------------------------------------------------------------

test('installing the example creates the file and asks for a restart', () => {
  const { dependencies, root } = createWorkspace({});
  try {
    const { response, captured } = captureResponse();
    handleProviderCapabilityBootstrapAction(response, dependencies, 'install-example');

    assert.equal(captured.status, 200);
    assert.equal(captured.body.configPresent, true);
    assert.equal(captured.body.parsed, true);
    assert.equal(
      captured.body.restartRequired,
      true,
      'the host booted without a config, so the new one is not live yet',
    );
    assert.equal(readFileSync(dependencies.configPath, 'utf8'), EXAMPLE);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('installing never overwrites an existing config', () => {
  const handWritten = '# rules someone wrote by hand\nversion: 1\nprofiles: []\n';
  const { dependencies, root } = createWorkspace({ withConfig: handWritten });
  try {
    const { response, captured } = captureResponse();
    handleProviderCapabilityBootstrapAction(response, dependencies, 'install-example');

    assert.equal(captured.status, 409);
    assert.equal(captured.body.error.code, 'capability_bootstrap_config_exists');
    assert.equal(
      readFileSync(dependencies.configPath, 'utf8'),
      handWritten,
      'the operator file is untouched',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a build with no bundled example refuses rather than writing nothing useful', () => {
  const { dependencies, root } = createWorkspace({ withExample: null });
  try {
    const { response, captured } = captureResponse();
    handleProviderCapabilityBootstrapAction(response, dependencies, 'install-example');

    assert.equal(captured.status, 409);
    assert.equal(captured.body.error.code, 'capability_bootstrap_example_missing');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an unknown action is refused', () => {
  const { dependencies, root } = createWorkspace({});
  try {
    const { response, captured } = captureResponse();
    handleProviderCapabilityBootstrapAction(response, dependencies, 'reload');

    assert.equal(captured.status, 400);
    assert.equal(captured.body.error.code, 'invalid_action');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- Saving --------------------------------------------------------------------

test('Settings can save a validated complete rule document', () => {
  const { dependencies, root } = createWorkspace({ withConfig: EXAMPLE });
  try {
    const initial = captureResponse();
    handleProviderCapabilityBootstrapRead(initial.response, dependencies);

    const saved = captureResponse();
    handleProviderCapabilityBootstrapWrite(saved.response, dependencies, {
      expectedRevision: initial.captured.body.revision,
      config: {
        version: 1,
        profiles: [{
          id: 'claude-native-agent',
          selector: { provider: 'claude', instance: 'native', model: 'opus' },
          initialTreatment: 'strong_agent',
          confidenceLevel: 'catalog_only',
          reason: 'The owner selected this bounded provider target.',
        }],
      },
    });

    assert.equal(saved.captured.status, 200);
    assert.equal(saved.captured.body.parsed, true);
    assert.equal(saved.captured.body.rules[0].id, 'claude-native-agent');
    assert.equal(saved.captured.body.restartRequired, true);
    assert.notEqual(saved.captured.body.revision, initial.captured.body.revision);
    assert.match(readFileSync(dependencies.configPath, 'utf8'), /claude-native-agent/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Settings refuses invalid rules without modifying the current config', () => {
  const { dependencies, root } = createWorkspace({ withConfig: EXAMPLE });
  try {
    const initial = captureResponse();
    handleProviderCapabilityBootstrapRead(initial.response, dependencies);
    const before = readFileSync(dependencies.configPath, 'utf8');

    const saved = captureResponse();
    handleProviderCapabilityBootstrapWrite(saved.response, dependencies, {
      expectedRevision: initial.captured.body.revision,
      config: {
        version: 1,
        profiles: [{
          id: 'invalid-default',
          selector: { provider: 'claude' },
          initialTreatment: 'default',
          confidenceLevel: 'catalog_only',
          reason: 'Default cannot be granted explicitly.',
        }],
      },
    });

    assert.equal(saved.captured.status, 400);
    assert.equal(saved.captured.body.error.code, 'invalid_capability_bootstrap_config');
    assert.ok(saved.captured.body.error.diagnostics.length > 0);
    assert.equal(readFileSync(dependencies.configPath, 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Settings refuses a stale revision without overwriting an outside edit', () => {
  const { dependencies, root } = createWorkspace({ withConfig: EXAMPLE });
  try {
    const initial = captureResponse();
    handleProviderCapabilityBootstrapRead(initial.response, dependencies);
    const outsideEdit = 'version: 1\nprofiles: []\n';
    writeFileSync(dependencies.configPath, outsideEdit, 'utf8');

    const saved = captureResponse();
    handleProviderCapabilityBootstrapWrite(saved.response, dependencies, {
      expectedRevision: initial.captured.body.revision,
      config: { version: 1, profiles: [] },
    });

    assert.equal(saved.captured.status, 409);
    assert.equal(saved.captured.body.error.code, 'capability_bootstrap_revision_conflict');
    assert.equal(readFileSync(dependencies.configPath, 'utf8'), outsideEdit);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

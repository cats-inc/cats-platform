#!/usr/bin/env node
/**
 * Preview the desktop bootstrap page in the default browser.
 *
 * Usage:
 *   node scripts/preview-bootstrap.mjs            # opens both modes
 *   node scripts/preview-bootstrap.mjs loading     # loading mode only
 *   node scripts/preview-bootstrap.mjs recovery    # recovery mode only
 *
 * The script always reads the latest build output, so run `npm run build:host`
 * first if you've changed bootstrapPage.ts.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const { buildDesktopBootstrapPage } = await import('../build/desktop/bootstrapPage.js');

/* ------------------------------------------------------------------ */
/*  Mock snapshots                                                     */
/* ------------------------------------------------------------------ */

function now(offsetMs = 0) {
  return `new Date(Date.now() - ${-offsetMs}).toISOString()`;
}

const LOADING_BRIDGE = `
window.catsDesktopHost = {
  getSnapshot() {
    return Promise.resolve({
      service: 'cats-electron-host',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      phase: 'starting_services',
      status: 'degraded',
      summary: 'Waiting for cats-runtime to become healthy.',
      services: [
        { name: 'cats-runtime', status: 'starting', ready: false, pid: 1234, startedAt: null, healthUrl: 'http://127.0.0.1:8150/health', error: null, exitCode: null, logPath: '/tmp/cats-runtime.log', lastOutput: null, lastOutputAt: null },
        { name: 'cats', status: 'ready', ready: true, pid: 5678, startedAt: new Date().toISOString(), healthUrl: 'http://127.0.0.1:8181/health', error: null, exitCode: null, logPath: '/tmp/cats.log', lastOutput: null, lastOutputAt: null }
      ],
      runtime: {
        baseUrl: 'http://127.0.0.1:8150',
        diagnosticsUrl: 'http://127.0.0.1:8150/diagnostics',
        status: 'degraded',
        summary: 'Runtime starting',
        providerSummary: { status: 'ok', summary: '3 providers configured', configuredProviders: 3, targets: 4, defaultTargets: 2, ok: 2, degraded: 1, unavailable: 0 },
        issues: []
      },
      app: { baseUrl: 'http://127.0.0.1:8181', setupCompleteAt: null, entryPath: '/setup', status: 'ok', summary: 'App ready' },
      issues: [],
      actions: [
        { id: 'retry', label: 'Retry', primary: false, disabled: false },
        { id: 'open_setup', label: 'Open Setup', primary: true, disabled: false },
        { id: 'quit', label: 'Quit', primary: false, disabled: false }
      ],
      lastError: null,
      progress: { currentStepId: null, steps: [] },
      background: { trayEnabled: false, keepServicesRunning: false, mode: 'foreground', closeBehavior: 'quit', windowVisible: true, lastHiddenAt: null },
      updates: { channel: 'stable', status: 'idle', currentVersion: '0.1.0', latestVersion: null, summary: '', lastCheckedAt: null, manifestUrl: null, downloadUrl: null, error: null },
      packaging: { strategy: 'electron-sidecar-bundle', generatedAt: '', outputRoot: '', selfHostedNpmCompatible: true, targets: [], installer: { prerequisiteChecks: [], providerSetup: { baselineMode: 'api_baseline', modes: [], capabilityPacks: [], localProviders: [], knowledgeSources: [], executionDefaults: { hostOwned: true, rendererShellAccess: false, nonInteractiveDefault: true, structuredResultsRequired: true }, helperCatalog: [], prioritizedAssets: [] }, remediationActions: [], requiresBundledRuntimeSidecar: false }, updates: { channel: 'stable', autoCheckOnStartup: true, autoDownload: false, manifestUrl: null } },
      setup: { lastAction: null, updatedAt: null },
      diagnostics: null,
      hostStatePath: '/tmp/cats-host-state.json'
    });
  },
  getSetupSnapshot() { return Promise.resolve(null); },
  runAction(id) { console.log('runAction:', id); return Promise.resolve({}); },
  resumeSetup() { return Promise.resolve(null); },
  onSnapshot(fn) { return function() {}; }
};`;

const RECOVERY_BRIDGE = `
window.catsDesktopHost = {
  getSnapshot() {
    return Promise.resolve({
      service: 'cats-electron-host',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      phase: 'failed',
      status: 'unavailable',
      summary: 'cats-runtime failed to start. Check prerequisites and retry.',
      services: [
        { name: 'cats-runtime', status: 'failed', ready: false, pid: null, startedAt: null, healthUrl: 'http://127.0.0.1:8150/health', error: 'ECONNREFUSED: Connection refused at 127.0.0.1:8150', exitCode: 1, logPath: '/Users/you/.cats/logs/cats-runtime.log', lastOutput: 'RuntimeError: Failed to bind port 8150', lastOutputAt: new Date().toISOString() },
        { name: 'cats', status: 'ready', ready: true, pid: 5678, startedAt: new Date().toISOString(), healthUrl: 'http://127.0.0.1:8181/health', error: null, exitCode: null, logPath: '/Users/you/.cats/logs/cats.log', lastOutput: null, lastOutputAt: null }
      ],
      runtime: {
        baseUrl: 'http://127.0.0.1:8150',
        diagnosticsUrl: 'http://127.0.0.1:8150/diagnostics',
        status: 'unavailable',
        summary: 'Runtime is unreachable',
        providerSummary: { status: 'degraded', summary: '3 providers configured, 1 unavailable', configuredProviders: 3, targets: 4, defaultTargets: 2, ok: 1, degraded: 1, unavailable: 1 },
        issues: []
      },
      app: { baseUrl: 'http://127.0.0.1:8181', setupCompleteAt: null, entryPath: '/setup', status: 'ok', summary: 'App server ready' },
      issues: [
        { id: 'runtime-port', severity: 'error', title: 'cats-runtime failed to start', detail: 'Port 8150 is already in use by another process. Kill the conflicting process or change the runtime port.', target: 'tcp://127.0.0.1:8150', category: 'service' },
        { id: 'node-version', severity: 'warning', title: 'Node.js version outdated', detail: 'Detected Node.js v16.20.0. Cats requires >= 18.0.0 for full compatibility.', target: 'node --version', category: 'install' },
        { id: 'ollama-missing', severity: 'info', title: 'Ollama not installed', detail: 'Local model inference requires Ollama. This is optional if you only use cloud providers.', category: 'provider' }
      ],
      actions: [
        { id: 'retry', label: 'Retry startup', primary: true, disabled: false },
        { id: 'open_runtime_diagnostics', label: 'Runtime diagnostics', primary: false, disabled: false },
        { id: 'resume_setup', label: 'Resume setup', primary: false, disabled: false },
        { id: 'quit', label: 'Quit', primary: false, disabled: false }
      ],
      lastError: 'cats-runtime exited with code 1',
      progress: { currentStepId: null, steps: [] },
      background: { trayEnabled: false, keepServicesRunning: false, mode: 'foreground', closeBehavior: 'quit', windowVisible: true, lastHiddenAt: null },
      updates: { channel: 'stable', status: 'idle', currentVersion: '0.1.0', latestVersion: null, summary: '', lastCheckedAt: null, manifestUrl: null, downloadUrl: null, error: null },
      packaging: {
        strategy: 'electron-sidecar-bundle', generatedAt: '', outputRoot: '', selfHostedNpmCompatible: true, targets: [],
        installer: {
          prerequisiteChecks: [],
          providerSetup: {
            baselineMode: 'api_baseline', modes: [],
            capabilityPacks: [
              { id: 'api_baseline', label: 'API Baseline', recommended: true, requiresLocalInstall: false, notes: [] },
              { id: 'native_cli_pack', label: 'Native CLI Pack', recommended: false, requiresLocalInstall: true, notes: [] },
              { id: 'local_model_pack', label: 'Local Model Pack', recommended: false, requiresLocalInstall: true, notes: [] }
            ],
            localProviders: [
              { id: 'claude_code', label: 'Claude Code', pack: 'native_cli_pack', platform: 'cross_platform', deliveryPhase: 'initial_packaged_path', bundledInCurrentInstaller: true, helperIds: [], currentHome: '', targetHome: '', notes: [] },
              { id: 'ollama', label: 'Ollama', pack: 'local_model_pack', platform: 'cross_platform', deliveryPhase: 'later_packaged_path', bundledInCurrentInstaller: false, helperIds: [], currentHome: '', targetHome: '', notes: [] },
              { id: 'goose', label: 'Goose', pack: 'native_cli_pack', platform: 'cross_platform', deliveryPhase: 'later_packaged_path', bundledInCurrentInstaller: false, helperIds: [], currentHome: '', targetHome: '', notes: [] }
            ],
            knowledgeSources: [],
            executionDefaults: { hostOwned: true, rendererShellAccess: false, nonInteractiveDefault: true, structuredResultsRequired: true },
            helperCatalog: [],
            prioritizedAssets: []
          },
          remediationActions: [],
          requiresBundledRuntimeSidecar: false
        },
        updates: { channel: 'stable', autoCheckOnStartup: true, autoDownload: false, manifestUrl: null }
      },
      setup: {
        lastAction: {
          helperId: 'windows-environment-bootstrap',
          assetId: 'env-bootstrap',
          label: 'Environment Bootstrap',
          pack: 'api_baseline',
          mode: 'apply',
          runState: 'completed',
          status: 'changes_required',
          summary: 'Environment Bootstrap apply finished with changes_required.',
          packagedRelativePath: 'setup-assets/env-bootstrap.ps1',
          scriptPath: '/opt/cats/setup-assets/env-bootstrap.ps1',
          requiresElevation: false,
          resumable: true,
          restartRequired: true,
          startedAt: new Date(Date.now() - 120000).toISOString(),
          completedAt: new Date(Date.now() - 60000).toISOString(),
          warnings: ['PATH changes require a new terminal session'],
          plannedActions: ['install_node', 'configure_path'],
          appliedChanges: ['installed_node_22'],
          optionalFollowThroughPack: null,
          manualSteps: ['Restart your terminal or Windows session to pick up PATH changes.'],
          interruptions: [
            { kind: 'restart_required', summary: 'Restart required to apply PATH changes.', resumable: true, requiresRestart: true, requiresElevation: false }
          ],
          error: null
        },
        updatedAt: new Date(Date.now() - 60000).toISOString()
      },
      diagnostics: {
        activeAttemptId: 'attempt-abc-123',
        hostEvents: [],
        runtimeEvents: [],
        product: { generatedAt: new Date().toISOString(), attemptId: 'attempt-abc-123', status: 'degraded', summary: 'Setup opened but not completed', historyPath: '/Users/you/.cats/state/platform-onboarding-history.json', latestReference: null, events: [] },
        aggregation: {
          generatedAt: new Date().toISOString(),
          attemptId: 'attempt-abc-123',
          layers: {
            runtime: { status: 'unavailable', summary: 'Runtime failed to start on port 8150', latestTimestamp: new Date().toISOString(), latestReference: null },
            product: { status: 'degraded', summary: 'Setup opened, awaiting completion', latestTimestamp: new Date().toISOString(), latestReference: null },
            host: { status: 'degraded', summary: 'Host detected prerequisite issues', latestTimestamp: new Date().toISOString(), latestReference: null }
          },
          chronology: [
            { layer: 'host', kind: 'service_start', timestamp: new Date(Date.now() - 300000).toISOString(), attemptId: 'attempt-abc-123', summary: 'Desktop host started electron main process', status: 'ok', context: null, error: null, reference: null },
            { layer: 'host', kind: 'service_spawn', timestamp: new Date(Date.now() - 280000).toISOString(), attemptId: 'attempt-abc-123', summary: 'Spawned cats-runtime sidecar process', status: 'ok', context: null, error: null, reference: null },
            { layer: 'runtime', kind: 'health_check', timestamp: new Date(Date.now() - 240000).toISOString(), attemptId: 'attempt-abc-123', summary: 'Runtime health check failed: ECONNREFUSED', status: 'unavailable', context: null, error: { message: 'ECONNREFUSED 127.0.0.1:8150', code: 'ECONNREFUSED' }, reference: null },
            { layer: 'host', kind: 'prerequisite_check', timestamp: new Date(Date.now() - 200000).toISOString(), attemptId: 'attempt-abc-123', summary: 'Detected port conflict on 8150', status: 'unavailable', context: null, error: { message: 'Port 8150 already in use by PID 9921' }, reference: null },
            { layer: 'product', kind: 'setup_opened', timestamp: new Date(Date.now() - 180000).toISOString(), attemptId: 'attempt-abc-123', summary: 'Platform setup wizard opened', status: 'info', context: null, error: null, reference: null },
            { layer: 'host', kind: 'setup_action', timestamp: new Date(Date.now() - 60000).toISOString(), attemptId: 'attempt-abc-123', summary: 'Environment Bootstrap apply completed with changes_required', status: 'degraded', context: null, error: null, reference: null }
          ]
        },
        serviceLogs: [
          { service: 'cats-runtime', logPath: '/Users/you/.cats/logs/cats-runtime.log', lastOutput: 'RuntimeError: Failed to bind port 8150', lastOutputAt: new Date().toISOString() },
          { service: 'cats', logPath: '/Users/you/.cats/logs/cats.log', lastOutput: null, lastOutputAt: null }
        ],
        updatedAt: new Date().toISOString()
      },
      hostStatePath: '/Users/you/.cats/state/host-state.json'
    });
  },
  getSetupSnapshot() {
    return Promise.resolve({
      helpers: [
        { id: 'env-bootstrap', assetId: 'env-bootstrap', label: 'Environment Bootstrap', kind: 'prerequisite_helper', pack: 'api_baseline', platform: 'cross_platform', packagedRelativePath: 'setup-assets/env-bootstrap.ps1', supportsCheckOnly: true, supportsApply: true, supportsUpgrade: false, supportsForce: false, requiresElevation: false, resumable: true, notes: [], available: true, supported: true, unsupportedReason: null },
        { id: 'ollama-installer', assetId: 'ollama-install', label: 'Ollama Installer', kind: 'provider_installer', pack: 'local_model_pack', platform: 'cross_platform', packagedRelativePath: 'setup-assets/ollama-install.ps1', supportsCheckOnly: true, supportsApply: true, supportsUpgrade: true, supportsForce: false, requiresElevation: false, resumable: true, notes: [], available: true, supported: true, unsupportedReason: null },
        { id: 'wsl-installer', assetId: 'wsl-install', label: 'WSL Environment', kind: 'prerequisite_helper', pack: 'wsl_power_user_pack', platform: 'windows_wsl', packagedRelativePath: 'setup-assets/wsl-install.ps1', supportsCheckOnly: true, supportsApply: true, supportsUpgrade: false, supportsForce: false, requiresElevation: true, resumable: true, notes: [], available: false, supported: false, unsupportedReason: 'WSL Environment is currently only supported on Windows hosts.' }
      ],
      state: { lastAction: null, updatedAt: null },
      resumeAction: {
        helperId: 'env-bootstrap',
        label: 'Environment Bootstrap',
        mode: 'check',
        reason: 'restart_required',
        summary: 'Restart the host or Windows session, then rerun Environment Bootstrap in check mode.',
        manualSteps: ['Restart your terminal or Windows session to pick up PATH changes.'],
        interruptions: [{ kind: 'restart_required', summary: 'Restart required to apply PATH changes.', resumable: true, requiresRestart: true, requiresElevation: false }],
        requiresElevation: false,
        restartRequired: true
      }
    });
  },
  runAction(id) { console.log('runAction:', id); return Promise.resolve({}); },
  resumeSetup() { console.log('resumeSetup'); return Promise.resolve(null); },
  onSnapshot(fn) { return function() {}; }
};`;

/* ------------------------------------------------------------------ */
/*  Generate & open                                                    */
/* ------------------------------------------------------------------ */

function inject(bridgeScript) {
  const html = buildDesktopBootstrapPage();
  return html.replace('<script>', `<script>${bridgeScript}</script><script>`);
}

const mode = (process.argv[2] || '').toLowerCase();
const outDir = tmpdir();
const opened = [];

if (!mode || mode === 'loading') {
  const path = join(outDir, 'cats-bootstrap-loading.html');
  writeFileSync(path, inject(LOADING_BRIDGE));
  opened.push(path);
}

if (!mode || mode === 'recovery') {
  const path = join(outDir, 'cats-bootstrap-recovery.html');
  writeFileSync(path, inject(RECOVERY_BRIDGE));
  opened.push(path);
}

for (const path of opened) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  try {
    execSync(`${cmd} "${path}"`);
  } catch {
    // fall through — print path instead
  }
  console.log(path);
}

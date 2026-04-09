#!/usr/bin/env node
/**
 * Preview the desktop bootstrap page in the default browser.
 *
 * Usage:
 *   node scripts/preview-bootstrap.mjs
 *
 * Opens a single page that starts in loading mode, shows slow-launch hints
 * at 20 / 40 / 60 s, then transitions to recovery mode at 80 s.
 *
 * The script always reads the latest build output, so run `npm run build:host`
 * first if you've changed bootstrapPage.ts.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

/* ------------------------------------------------------------------ */
/*  Mock snapshots                                                     */
/* ------------------------------------------------------------------ */

const UNIFIED_BRIDGE = `
(function () {
  var listeners = [];
  var transitioned = false;

  var loadingSnapshot = {
      service: 'cats-electron-host',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      phase: 'starting_services',
      status: 'degraded',
      summary: 'Waiting for cats-runtime to become healthy.',
      services: [
        { name: 'cats-runtime', status: 'starting', ready: false, pid: 1234, startedAt: null, healthUrl: 'http://127.0.0.1:8150/health', error: null, exitCode: null, logPath: '/tmp/cats-runtime.log', lastOutput: null, lastOutputAt: null },
        { name: 'cats-platform', status: 'ready', ready: true, pid: 5678, startedAt: new Date().toISOString(), healthUrl: 'http://127.0.0.1:8181/health', error: null, exitCode: null, logPath: '/tmp/cats.log', lastOutput: null, lastOutputAt: null }
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
  };

  var recoverySnapshot = {
      service: 'cats-electron-host',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      phase: 'failed',
      status: 'unavailable',
      summary: 'cats-runtime failed to start. Check prerequisites and retry.',
      services: [
        { name: 'cats-runtime', status: 'failed', ready: false, pid: null, startedAt: null, healthUrl: 'http://127.0.0.1:8150/health', error: 'ECONNREFUSED: Connection refused at 127.0.0.1:8150', exitCode: 1, logPath: '/Users/you/.cats/logs/cats-runtime.log', lastOutput: 'RuntimeError: Failed to bind port 8150', lastOutputAt: new Date().toISOString() },
        { name: 'cats-platform', status: 'ready', ready: true, pid: 5678, startedAt: new Date().toISOString(), healthUrl: 'http://127.0.0.1:8181/health', error: null, exitCode: null, logPath: '/Users/you/.cats/logs/cats.log', lastOutput: null, lastOutputAt: null }
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
          { service: 'cats-platform', logPath: '/Users/you/.cats/logs/cats.log', lastOutput: null, lastOutputAt: null }
        ],
        updatedAt: new Date().toISOString()
      },
      hostStatePath: '/Users/you/.cats/state/host-state.json'
  };

  var recoverySetupSnapshot = {
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
  };

  window.setTimeout(function () {
    transitioned = true;
    recoverySnapshot.timestamp = new Date().toISOString();
    for (var i = 0; i < listeners.length; i++) { listeners[i](recoverySnapshot); }
  }, 80000);

  window.catsDesktopHost = {
    getSnapshot: function () { return Promise.resolve(transitioned ? recoverySnapshot : loadingSnapshot); },
    getSetupSnapshot: function () { return Promise.resolve(transitioned ? recoverySetupSnapshot : null); },
    runAction: function (id) { console.log('runAction:', id); return Promise.resolve({}); },
    resumeSetup: function () { console.log('resumeSetup'); return Promise.resolve(null); },
    onSnapshot: function (fn) { listeners.push(fn); return function () {}; }
  };
})();`;

/* ------------------------------------------------------------------ */
/*  Generate & open                                                    */
/* ------------------------------------------------------------------ */

async function loadBootstrapPageHtml() {
  const { buildDesktopBootstrapPage } = await import('../build/desktop/bootstrapPage.js');
  return buildDesktopBootstrapPage();
}

export function injectPreviewBridge(html, bridgeScript) {
  const marker = '<script>';
  if (!html.includes(marker)) {
    throw new Error('Bootstrap page script tag not found.');
  }
  return html.replace(marker, `<script>${bridgeScript}</script><script>`);
}

export function resolvePreviewOpenCommand(platform, filePath) {
  if (platform === 'darwin') {
    return { command: 'open', args: [filePath] };
  }
  if (platform === 'win32') {
    // `start` is a cmd builtin; the empty string is the required window title placeholder.
    return { command: 'cmd', args: ['/c', 'start', '', filePath] };
  }
  return { command: 'xdg-open', args: [filePath] };
}

export function tryOpenPreviewFile(filePath, options = {}) {
  const platform = options.platform ?? process.platform;
  const spawn = options.spawnSync ?? spawnSync;
  const descriptor = resolvePreviewOpenCommand(platform, filePath);
  const result = spawn(descriptor.command, descriptor.args, {
    stdio: 'ignore',
    windowsHide: true,
  });
  return {
    ...descriptor,
    status: result.status ?? null,
    error: result.error ?? null,
    opened: !result.error && (result.status === 0 || result.status === null),
  };
}

export async function runPreviewBootstrap() {
  const html = await loadBootstrapPageHtml();
  const outPath = join(tmpdir(), 'cats-bootstrap-preview.html');
  writeFileSync(outPath, injectPreviewBridge(html, UNIFIED_BRIDGE));

  try {
    tryOpenPreviewFile(outPath);
  } catch {
    // fall through — print path instead
  }
  console.log(outPath);

  return [outPath];
}

function isDirectExecution(metaUrl) {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return pathToFileURL(resolve(entry)).href === metaUrl;
}

if (isDirectExecution(import.meta.url)) {
  try {
    await runPreviewBootstrap();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

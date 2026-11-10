#!/usr/bin/env node
/**
 * Drives the real first-run pages (SPEC-136) in headless Chrome with a fake Desktop host. The page
 * is what the host would load; only `window.catsDesktopHost` is fake, so no script, install or
 * terminal runs and no user state is touched.
 *
 * Usage: npm run build:host && node scripts/test-first-run-wizard-renderer.mjs [screenshot-dir]
 *   ONLY=<regex>   run only the checks whose name matches
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);

function loadPlaywright() {
  for (const candidate of ['playwright-core', join(root, '..', 'cats-runtime', 'node_modules', 'playwright-core'),
    join(root, '..', '..', '..', '..', 'cats-runtime', 'node_modules', 'playwright-core')]) {
    try { return require(candidate); } catch { /* Try the next place. */ }
  }
  throw new Error('playwright-core is not installed here or in a sibling cats-runtime checkout.');
}

const { chromium } = loadPlaywright();
const { buildDesktopBootstrapPage } = await import(pathToFileURL(join(root, 'build', 'desktop', 'bootstrapPage.js')).href);
const { SETUP_PROVIDER_ORDER } = await import(pathToFileURL(join(root, 'packages', 'provider-setup', 'setupFacts.js')).href);

const shotDir = process.argv[2] || null;
if (shotDir) mkdirSync(shotDir, { recursive: true });

const HTML = buildDesktopBootstrapPage();
const pageFile = join(process.env.TEMP || process.env.TMPDIR || '/tmp', `cats-first-run-${process.pid}.html`);
writeFileSync(pageFile, HTML);

/*
 * SPEC-137: Settings > Runtime mounts the same module in its own layout, inside a scrolling canvas
 * with other sections around it. The modules import nothing, so they are inlined as they are.
 */
const moduleSource = (name) => readFileSync(join(root, 'packages', 'provider-setup', `${name}.js`), 'utf8').replace(/^export /gm, '');
const SETTINGS_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Settings</title>
<style>html,body{margin:0;height:100%;font:14px system-ui;background:#F6F4EF}.canvas{height:100%;overflow-y:auto;padding:0 28px;box-sizing:border-box}
.canvas h1{font-size:22px;margin:20px 0 12px}.other{height:420px;margin-top:16px;padding:16px;border:1px solid #ddd;border-radius:12px;background:#fff}</style></head>
<body><main class="canvas"><h1>Runtime</h1><div class="other" style="height:80px">Runtime status</div><div id="tools" style="margin-top:16px"></div><div class="other">Claude in Chrome</div></main>
<script>${['setupWizardStyles', 'setupFacts', 'setupChrome', 'setupWizard'].map(moduleSource).join('\n')}
window.__toasts = [];
window.__settingsState = null;
window.__mount = () => {
  if (window.__view) window.__view.destroy();
  window.__view = mountSetupWizard(document.getElementById('tools'), window.catsDesktopHost, {
    mode: 'settings', locale: navigator.language, css: SETUP_WIZARD_CSS, catHead: SETUP_CAT_HEAD,
    createChrome: mountSetupChrome, facts: setupRowFacts, settingsState: window.__settingsState,
    onSettingsState: (state) => { window.__settingsState = state; }, onFeedback: (message) => window.__toasts.push(message),
  });
};
window.__mount();
</script></body></html>`;
const settingsFile = join(process.env.TEMP || process.env.TMPDIR || '/tmp', `cats-settings-tools-${process.pid}.html`);
writeFileSync(settingsFile, SETTINGS_HTML);

/* ------------------------------ The fake host, inside the page ------------------------------ */

function installFakeHost(spec) {
  const NPM = ['codex', 'copilot', 'opencode', 'kilo', 'auggie', 'pi', 'cline'];
  const LABELS = { codex: 'Codex', claude: 'Claude', antigravity: 'Antigravity', grok: 'Grok', muse: 'Meta Muse', cursor: 'Cursor', copilot: 'GitHub Copilot', opencode: 'OpenCode', kilo: 'Kilo', cline: 'Cline', auggie: 'Auggie', pi: 'Pi', kiro: 'Kiro', junie: 'Junie', devin: 'Devin', goose: 'Goose', ollama: 'Ollama', openclaw: 'OpenClaw' };
  const targetOf = (id) => id === 'ollama' ? { provider: id, backend: 'local', instance: 'local' }
    : id === 'openclaw' ? { provider: id, backend: 'agent', instance: 'gateway' }
      : id === 'devin' ? { provider: id, backend: 'agent', instance: 'acp' }
        : { provider: id, backend: 'cli', instance: 'native' };
  const universe = Object.keys(LABELS).map((id) => ({
    ...targetOf(id), familyLabel: LABELS[id], binaryName: id,
    install: {
      install: { command: NPM.includes(id) ? `npm install -g @fake/${id}` : `irm https://${id}.example/install.ps1 | iex`, docsUrl: `https://${id}.example/docs` },
      auth: { hint: `Run the ${id} sign-in.`, docsUrl: `https://${id}.example/auth` },
      npm: NPM.includes(id) ? { packageName: `@fake/${id}` } : null,
    },
  }));
  const state = {
    calls: [],
    machine: { node: 'ready', npm: 'ready', vc: 'ready', gh: 'missing', git: 'ready', shell: 'ready', installed: [], ollama: { installed: false, running: false, models: [] }, signedIn: [], versions: {}, latest: {}, nothingToRemove: [], ...(spec.machine || {}) },
    selection: { state: 'missing', revision: 'missing', targets: [], nativeSetupTargets: [], diskChanged: false, error: null, ...(spec.selection || {}) },
    observations: spec.observations || [],
    connections: spec.connections || [],
    runs: [],
    listeners: [],
    progress: [],
    faults: { ...(spec.faults || {}) },
    tries: {},
    runId: 0,
    wizardState: spec.wizardState || null,
  };
  window.__host = state;
  const record = (name, ...args) => state.calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const emit = (run) => { for (const listener of state.listeners) listener(clone(run)); };
  const runStart = (kind, label, command) => {
    const run = { id: ++state.runId, kind, label, command, startedAt: new Date().toISOString(), endedAt: null, status: null, version: null, planned: [], applied: [], warnings: [], manual: [], error: null, tookMs: null };
    state.runs.push(run);
    emit(run);
    return run;
  };
  const runEnd = (run, fields) => {
    Object.assign(run, fields, { endedAt: new Date().toISOString(), tookMs: 40 });
    emit(run);
  };
  const faulted = (key) => {
    const fault = state.faults[key];
    if (!fault) return null;
    state.tries[key] = (state.tries[key] || 0) + 1;
    return fault.always || state.tries[key] === 1 ? fault : null;
  };
  const snapshot = () => clone({
    runtime: { selection: state.selection, universe, observations: state.observations, connections: state.connections, state: { status: 'ready', error: null } },
    helpers: [], platform: spec.platform || 'windows', operations: [], outcomes: {}, prerequisites: spec.prerequisites || [],
  });
  const helperName = (id) => id.replace(/^(windows|macos|linux)-/, '');
  const rowOf = (helperId) => {
    const name = helperName(helperId);
    if (name === 'node-host-installer') return 'node';
    if (name === 'npm-prefix-helper') return 'npm';
    if (name === 'vcredist-installer') return 'vc';
    if (name === 'github-cli-installer') return 'gh';
    if (name === 'git-installer') return 'git';
    if (name === 'cli-readiness-helper') return 'shell';
    if (name === 'ollama-local-model-installer') return 'ollama';
    return name.replace('-native-installer', '');
  };
  const reportFor = (row, mode) => {
    const m = state.machine;
    const base = { helperId: row, mode, runState: 'completed', summary: `${row} ${mode}`, warnings: [], manualSteps: [], appliedChanges: [], plannedActions: [], interruptions: [], error: null, restartRequired: false, detectedVersion: null, installed: null, apiReady: null };
    if (['node', 'npm', 'vc', 'gh', 'git', 'shell'].includes(row)) {
      return m[row] === 'ready' ? { ...base, status: 'ready', detectedVersion: row === 'node' ? '22.12.0' : null } : { ...base, status: 'changes_required', plannedActions: [`install_${row}`] };
    }
    if (row === 'ollama') {
      return m.ollama.running ? { ...base, status: 'ready', installed: true, apiReady: true, detectedVersion: '0.13.0' }
        : { ...base, status: m.ollama.installed ? 'changes_required' : 'not_installed', installed: m.ollama.installed, apiReady: false, plannedActions: [m.ollama.installed ? 'start_ollama_local_model' : 'install_ollama_local_model'] };
    }
    if (m.installed.includes(row)) {
      if (row === 'claude' && !m.signedIn.includes('claude')) return { ...base, status: 'auth_required', installed: true, detectedVersion: '2.1.0' };
      return { ...base, status: 'ready', installed: true, detectedVersion: m.versions[row] || '1.2.3' };
    }
    return { ...base, status: 'not_installed', installed: false, plannedActions: [`install_${row}`] };
  };
  const applyEffect = (row) => {
    const m = state.machine;
    if (['node', 'npm', 'vc', 'gh', 'git', 'shell'].includes(row)) m[row] = 'ready';
    else if (row === 'ollama') m.ollama = { ...m.ollama, installed: true, running: true };
    else m.installed.push(row);
  };
  const helperFacts = {};
  const os = spec.platform || 'windows';
  for (const row of ['node-host-installer', 'npm-prefix-helper', 'github-cli-installer', 'git-installer']) helperFacts[`${os}-${row}`] = null;
  if (os === 'windows') { helperFacts['windows-vcredist-installer'] = null; helperFacts['windows-cli-readiness-helper'] = null; helperFacts['windows-ollama-local-model-installer'] = null; }
  for (const id of Object.keys(LABELS)) if (id !== 'ollama' && id !== 'openclaw') helperFacts[`${os}-${id}-native-installer`] = null;
  for (const key of Object.keys(helperFacts)) {
    helperFacts[key] = {
      id: key, file: `${key}.ps1`, sha256: 'ab'.repeat(32),
      commands: { check: `powershell.exe -File "C:\\Cats\\${key}.ps1" -CheckOnly -Json`, apply: `powershell.exe -File "C:\\Cats\\${key}.ps1" -Apply -Json`,
        upgrade: `powershell.exe -File "C:\\Cats\\${key}.ps1" -Upgrade -Json`, force: `powershell.exe -File "C:\\Cats\\${key}.ps1" -Force -Json`,
        uninstall: `powershell.exe -File "C:\\Cats\\${key}.ps1" -Uninstall -Json` },
      available: true, supported: true, unsupportedReason: null, supportsCheckOnly: true, supportsApply: true,
      supportsUpgrade: !key.endsWith('cli-readiness-helper'), supportsForce: !key.endsWith('cli-readiness-helper'), supportsUninstall: key.endsWith('-native-installer'),
      requiresElevation: ['node-host-installer', 'git-installer', 'vcredist-installer', 'github-cli-installer'].some((part) => key.endsWith(part)),
    };
  }
  // A helper this OS has no script for, so its row can only be set up by hand.
  for (const key of spec.unsupported || []) if (helperFacts[key]) helperFacts[key].supported = false;
  const services = spec.services || [
    { name: 'cats-runtime', status: 'ready', healthUrl: 'http://127.0.0.1:3110/health', error: null, lastOutput: null },
    { name: 'cats-platform', status: 'ready', healthUrl: 'http://127.0.0.1:8181/health', error: null, lastOutput: null },
  ];
  const bootstrap = () => clone({
    phase: spec.phase || 'ready_for_setup', status: 'ok', summary: 'Ready', lastError: spec.lastError || null,
    app: { onboardingMode: 'setup_status', setupCompleted: Boolean(spec.setupComplete), setupCompleteAt: spec.setupComplete ? '2026-01-01T00:00:00Z' : null, entryPath: '/' },
    prerequisites: { providerSelection: state.selection, cliInventory: null },
    services, issues: spec.issues || [], actions: spec.actions || [],
    hostStatePath: 'C:\\Users\\cat\\.cats\\desktop\\state.json',
    diagnostics: {
      activeAttemptId: 'desktop-bootstrap-test',
      serviceLogs: [{ service: 'cats-runtime', logPath: 'C:\\Users\\cat\\.cats\\desktop\\logs\\cats-runtime.log' }],
      product: { historyPath: 'C:\\Users\\cat\\.cats\\desktop\\bootstrap-history.json' },
      aggregation: {
        attemptId: 'desktop-bootstrap-test',
        layers: { runtime: { summary: 'Runtime is ready.' }, product: { summary: 'No product-owned onboarding events have been recorded yet.' }, host: { summary: 'Desktop services are ready.' } },
        chronology: [{ layer: 'host', kind: 'selection_saved', status: 'ok', summary: 'Saved a selection of 2 tool(s).', timestamp: '2026-11-04T00:00:00.000Z', error: null }],
      },
    },
  });
  window.catsDesktopHost = {
    getSnapshot: async () => bootstrap(),
    onSnapshot: () => () => {},
    getSetupSnapshot: async () => ({ helpers: [], resumeAction: null, state: { lastAction: null, updatedAt: null } }),
    getProviderSetup: async (context) => {
      record('getProviderSetup', context);
      if (faulted('read')) throw new Error('connect ECONNREFUSED 127.0.0.1:3110');
      return snapshot();
    },
    applyProviderSetup: async (input) => {
      record('applyProviderSetup', input);
      if (state.operation) throw new Error('A provider operation is running. Wait for it to finish.');
      const run = runStart('change', 'Cats Runtime', `PUT http://127.0.0.1:3110/setup-selection ${JSON.stringify({ targets: input.targets.map((t) => t.provider) })}`);
      await wait(20);
      const save = faulted('save');
      if (save) {
        if (save.saved) state.selection.revision = 'saved-but-not-active';
        if (save.disk) state.selection = { ...state.selection, diskChanged: true };
        runEnd(run, { status: 'failed', error: save.message });
        throw new Error(save.message);
      }
      const native = input.targets.filter((target) => !(target.endpoint && !/127\.0\.0\.1|localhost/.test(target.endpoint)) && target.provider !== 'openclaw');
      state.selection = { ...state.selection, state: input.targets.length ? 'selected' : 'empty', revision: `r${state.calls.length}`, targets: input.targets.map(({ provider, backend, instance }) => ({ provider, backend, instance })), nativeSetupTargets: native.map(({ provider, backend, instance }) => ({ provider, backend, instance })), diskChanged: false, error: null };
      for (const target of input.targets) {
        if (!target.endpoint) continue;
        state.connections = [...state.connections.filter((entry) => entry.provider !== target.provider), { provider: target.provider, backend: target.backend, instance: target.instance, endpoint: target.endpoint, editable: true }];
      }
      runEnd(run, { status: 'ready', applied: ['saved your selection'] });
      return snapshot();
    },
    runProviderSetup: async (input) => {
      record('runProviderSetup', input);
      if (state.operation) throw new Error('A provider operation is running. Wait for it to finish.');
      state.operation = true;
      setTimeout(() => { state.operation = false; }, spec.scanDelay || 20);
      const run = runStart('check', 'Cats Runtime', `POST http://127.0.0.1:3110/setup-scan ${JSON.stringify({ targets: input.targets.map((t) => t.provider) })}`);
      await wait(spec.scanDelay || 20);
      const scan = faulted('scan');
      if (scan) { runEnd(run, { status: 'failed', error: scan.message }); throw new Error(scan.message); }
      for (const target of input.targets) {
        state.observations = state.observations.filter((entry) => entry.provider !== target.provider);
        const connection = state.faults[`conn:${target.provider}`];
        const isConnection = target.provider === 'openclaw' || state.connections.some((entry) => entry.provider === target.provider && !/127\.0\.0\.1|localhost/.test(entry.endpoint));
        state.observations.push({ ...target, commandStatus: state.machine.installed.includes(target.provider) ? 'ready' : 'missing_install', authStatus: spec.auth && spec.auth[target.provider] ? spec.auth[target.provider] : 'unknown', observedAt: new Date().toISOString(), ...(isConnection ? { connectionStatus: connection ? 'failed' : 'connected', detail: connection ? connection.message : null } : {}) });
      }
      runEnd(run, { status: 'ready' });
      return snapshot();
    },
    runAction: async (id) => {
      record('runAction', id);
      if (id === 'open_setup' || id === 'open_chat') {
        const run = runStart('service', 'Cats Platform', 'GET http://127.0.0.1:8181/setup');
        await wait(10);
        const handoff = faulted('handoff');
        if (handoff) { runEnd(run, { status: 'failed', error: handoff.message }); throw new Error(handoff.message); }
        runEnd(run, { status: 'ready' });
      }
      return bootstrap();
    },
    setupWizard: {
      facts: async () => clone({ platform: os, helpers: helperFacts, signIn: { claude: 'claude', codex: 'codex login', grok: 'grok login' }, order: spec.order, npmProviders: NPM, vcRuntimeFree: ['codex', 'claude', 'grok', 'antigravity', 'muse', 'devin', 'junie'], ollamaSuggestions: ['qwen2.5-coder:7b'], state: state.wizardState, systemRestartHelpers: spec.systemRestartHelpers || [], setupComplete: Boolean(spec.setupComplete) }),
      runHelper: async (helperId, mode, options) => {
        record('runHelper', helperId, mode, options || null);
        const row = rowOf(helperId);
        const dryRun = Boolean(options && options.dryRun);
        const run = runStart(mode === 'check' || dryRun ? 'check' : 'change', `${helperId}.ps1`, helperFacts[helperId].commands[mode]);
        await wait(spec.helperDelay || 30);
        // SPEC-137: an update, a reinstall and a removal, with an uninstall's dry run.
        if (['upgrade', 'force', 'uninstall'].includes(mode) && !state.faults[`${mode}:${row}`]) {
          const m = state.machine;
          const base = { helperId, mode, runState: 'completed', summary: `${row} ${mode}`, warnings: [], manualSteps: [], appliedChanges: [], plannedActions: [], interruptions: [], error: null, restartRequired: false };
          if (mode === 'uninstall' && dryRun) {
            const planned = m.nothingToRemove.includes(row) ? [] : [`remove_${row}`];
            runEnd(run, { status: 'preview', planned });
            return { ...base, status: 'preview', plannedActions: planned };
          }
          if (mode === 'uninstall') {
            m.installed = m.installed.filter((entry) => entry !== row);
            runEnd(run, { status: 'ready', applied: [`remove_${row}`] });
            return { ...base, status: 'ready', appliedChanges: [`remove_${row}`] };
          }
          const from = m.versions[row] || '1.2.3';
          const to = mode === 'upgrade' ? (m.latest[row] || from) : from;
          m.versions[row] = to;
          const applied = to !== from || mode === 'force' ? [`${mode}_${row}`] : [];
          runEnd(run, { status: 'ready', version: to, applied });
          return { ...base, status: 'ready', detectedVersion: to, appliedChanges: applied };
        }
        const fault = faulted(`${mode}:${row}`);
        if (fault && fault.throw) { runEnd(run, { status: 'failed', error: fault.message }); throw new Error(fault.message); }
        if (fault && fault.systemRestart) {
          if (fault.ready) applyEffect(row);
          const report = { ...reportFor(row, mode), status: 'restart_required', restartRequired: true,
            interruptions: [{ kind: 'restart_required', requiresRestart: true }], appliedChanges: [`install_${row}`] };
          runEnd(run, { status: report.status, applied: report.appliedChanges });
          return report;
        }
        if (fault) {
          const report = { helperId, mode, runState: fault.status === 'elevation_required' || fault.restart ? 'completed' : 'failed', status: fault.status || 'failed', summary: fault.message, plannedActions: [`install_${row}`], appliedChanges: [], warnings: [], manualSteps: fault.manual || [], interruptions: fault.restart ? [{ kind: 'relaunch_required' }] : fault.status === 'elevation_required' ? [{ kind: 'elevation_required' }] : [], error: fault.restart ? null : fault.message, restartRequired: Boolean(fault.restart), timedOut: Boolean(fault.timedOut) };
          runEnd(run, { status: report.status, error: report.error, manual: report.manualSteps });
          return report;
        }
        if (mode === 'apply') applyEffect(row);
        const report = reportFor(row, mode);
        if (mode === 'apply') report.appliedChanges = [`install_${row}`];
        runEnd(run, { status: report.status, version: report.detectedVersion, planned: report.plannedActions, applied: report.appliedChanges });
        return report;
      },
      cancelChecks: async () => { record('cancelChecks'); },
      runs: async () => clone(state.runs),
      onRun: (listener) => { state.listeners.push(listener); return () => { state.listeners = state.listeners.filter((entry) => entry !== listener); }; },
      startRun: async (input) => runStart(input.kind, input.label, input.command).id,
      finishRun: async (id, result) => { const run = state.runs.find((entry) => entry.id === id); if (run) runEnd(run, result); },
      openTerminal: async (provider) => {
        record('openTerminal', provider);
        const run = runStart('terminal', provider, 'claude');
        if (state.faults.terminal) { runEnd(run, { status: 'failed', error: 'No terminal could be opened.' }); return { opened: false, command: 'claude' }; }
        runEnd(run, { status: 'ready' });
        return { opened: true, command: 'claude' };
      },
      checkCodexInitialization: async () => {
        record('checkCodexInitialization');
        return { status: state.machine.codexInitialization || 'ready' };
      },
      openCodexInitialization: async () => {
        record('openCodexInitialization');
        return { opened: true, command: 'codex' };
      },
      ollamaModels: async () => { record('ollamaModels'); return clone(state.machine.ollama.models); },
      pullOllamaModel: async (name) => {
        record('pullOllamaModel', name);
        const run = runStart('change', 'Ollama API', `POST http://127.0.0.1:11434/api/pull ${JSON.stringify({ model: name })}`);
        for (const percent of [10, 40, 80]) {
          await wait(20);
          for (const listener of state.progress) listener({ name, status: 'pulling', percent });
        }
        const pull = faulted('pull');
        if (pull) { runEnd(run, { status: 'failed', error: pull.message }); throw new Error(pull.message); }
        state.machine.ollama.models = [name];
        runEnd(run, { status: 'ready', applied: [`pull ${name}`] });
        return { stopped: false };
      },
      cancelOllamaPull: async () => { record('cancelOllamaPull'); },
      onOllamaProgress: (listener) => { state.progress.push(listener); return () => {}; },
      saveState: async (value) => { record('saveState'); state.wizardState = clone(value); },
      returnToPage: async () => {},
      relaunch: async (value) => { record('relaunch'); state.wizardState = clone(value); },
    },
  };
}

/* ------------------------------ The harness ------------------------------ */

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = { passed: 0, failed: [] };
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const pageErrors = [];

async function open(spec = {}, { size = [1280, 800], locale = 'zh-TW' } = {}) {
  const context = await browser.newContext({ viewport: { width: size[0], height: size[1] }, locale });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(installFakeHost, { order: SETUP_PROVIDER_ORDER, ...spec });
  await page.goto(pathToFileURL(pageFile).href);
  await page.waitForSelector('.cats-setup [data-pane] h1, #splash:not(.hidden)', { timeout: 8000 });
  await page.waitForFunction(() => !document.querySelector('.cats-setup [aria-busy="true"]') || window.catsDesktopHost, null, { timeout: 8000 });
  await page.waitForTimeout(40);
  return { page, close: () => context.close() };
}
async function openSettings(spec = {}, { size = [1280, 800], locale = 'zh-TW' } = {}) {
  const context = await browser.newContext({ viewport: { width: size[0], height: size[1] }, locale });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(installFakeHost, { order: SETUP_PROVIDER_ORDER, setupComplete: true, ...spec });
  await page.goto(pathToFileURL(settingsFile).href);
  await page.waitForFunction(() => document.querySelector('#setup-h') && !document.querySelector('.cats-setup .skeleton'), null, { timeout: 8000 });
  await page.waitForTimeout(60);
  return { page, close: () => context.close() };
}
const SELECTED = (...ids) => {
  const targets = ids.map((provider) => (provider === 'ollama' ? { provider, backend: 'local', instance: 'local' } : { provider, backend: 'cli', instance: 'native' }));
  return { state: 'selected', revision: 'r1', targets, nativeSetupTargets: targets, diskChanged: false, error: null };
};
const settled = (page) => page.waitForFunction(() => {
  const button = document.querySelector('#recheck');
  return button && !button.disabled && !document.querySelector('.cats-setup .spinner');
}, null, { timeout: 10000 });
const calls = (page, name) => page.evaluate((key) => window.__host.calls.filter((call) => call.name === key), name);
const shown = (page) => page.evaluate(() => [...document.querySelectorAll('.cats-setup .pick input')].map((node) => node.id.replace('pick-', '')));
const rowIds = (page) => page.evaluate(() => [...document.querySelectorAll('.cats-setup [data-row]')].map((node) => node.dataset.row));
const textOf = (page, selector) => page.locator(selector).first().innerText();
const pickAndCheck = async (page, ...ids) => {
  if (ids.some((id) => !['codex', 'claude', 'antigravity', 'ollama', 'openclaw'].includes(id))) await page.click('#pick-more');
  for (const id of ids) await page.check(`#pick-${id}`);
  await page.click('#go-check');
  await page.waitForFunction(() => {
    const heading = document.querySelector('#setup-h');
    return heading && !/Checking this computer|正在檢查/.test(heading.textContent) && document.querySelector('#recheck, #next, #skip-next');
  }, null, { timeout: 8000 });
};
const logOpen = (page) => page.evaluate(() => document.querySelector('.cats-setup [data-log]').classList.contains('open'));

async function check(name, run) {
  if (only && !only.test(name)) return;
  try {
    await run();
    results.passed += 1;
  } catch (error) {
    results.failed.push(`${name}: ${error.message}`);
  }
}
function equal(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label} expected ${b}, got ${a}`);
}
function truthy(value, label) {
  if (!value) throw new Error(label);
}

/* ------------------------------ Checks ------------------------------ */

await check('page 1 runs nothing and preselects nothing', async () => {
  const { page, close } = await open();
  await page.waitForTimeout(150);
  equal((await calls(page, 'runHelper')).length, 0, 'helpers');
  equal((await calls(page, 'runProviderSetup')).length, 0, 'scans');
  equal((await calls(page, 'applyProviderSetup')).length, 0, 'saves');
  equal(await page.evaluate(() => document.querySelectorAll('.cats-setup .pick input:checked').length), 0, 'ticks');
  await close();
});

await check('tiles follow the selector order, native and npm mixed', async () => {
  const { page, close } = await open();
  equal(await shown(page), ['codex', 'claude', 'antigravity', 'ollama', 'openclaw'], 'collapsed');
  await page.click('#pick-more');
  equal(await shown(page), SETUP_PROVIDER_ORDER, 'expanded');
  await close();
});

await check('a chosen tool stays visible after show fewer', async () => {
  const { page, close } = await open();
  await page.click('#pick-more');
  await page.check('#pick-pi');
  await page.click('#pick-more');
  truthy((await shown(page)).includes('pi'), 'pi hidden');
  await close();
});

await check('an empty selection saves and goes to account setup without any check', async () => {
  const { page, close } = await open();
  await page.click('#go-check');
  await page.waitForFunction(() => window.__host.calls.some((call) => call.name === 'runAction'));
  equal((await calls(page, 'applyProviderSetup'))[0].args[0].targets, [], 'targets');
  equal((await calls(page, 'runAction'))[0].args[0], 'open_setup', 'action');
  equal((await calls(page, 'runHelper')).length, 0, 'helpers');
  await close();
});

await check('the button saves first, then only checks, and rows group by dependency in selector order', async () => {
  const { page, close } = await open({ machine: { installed: [] } });
  await pickAndCheck(page, 'claude', 'codex', 'ollama');
  equal((await calls(page, 'applyProviderSetup')).length, 1, 'saves');
  const modes = (await calls(page, 'runHelper')).map((call) => call.args[1]);
  truthy(modes.length > 0 && modes.every((mode) => mode === 'check'), 'only checks');
  equal(await rowIds(page), ['node', 'npm', 'codex', 'claude', 'ollama', 'git', 'shell'], 'rows');
  await close();
});

await check('Node.js missing: its dependants wait unread and have no tick box', async () => {
  const { page, close } = await open({ machine: { node: 'missing' } });
  await pickAndCheck(page, 'codex');
  const read = (await calls(page, 'runHelper')).map((call) => call.args[0]);
  truthy(!read.some((id) => id.includes('codex') || id.includes('npm-prefix')), 'read a waiting row');
  equal(await page.locator('#tick-codex').count(), 0, 'tick box');
  equal(await page.locator('[data-row="codex"].is-waiting').count(), 1, 'waiting');
  equal(await page.locator('#tick-node').isChecked(), false, 'node unticked');
  await close();
});

await check('a tick is what runs a script, top down, and each row is read again after', async () => {
  const { page, close } = await open({ machine: { node: 'missing', npm: 'missing' } });
  await pickAndCheck(page, 'codex', 'claude');
  equal((await calls(page, 'runHelper')).filter((call) => call.args[1] === 'apply').length, 0, 'before ticking');
  await page.check('#tick-claude');
  await page.check('#tick-node');
  await page.click('#apply');
  await page.waitForFunction(() => document.querySelector('[data-row="node"].is-ready') && document.querySelector('[data-row="claude"].is-ready'), null, { timeout: 8000 });
  const applied = (await calls(page, 'runHelper')).filter((call) => call.args[1] === 'apply').map((call) => call.args[0]);
  equal(applied, ['windows-node-host-installer', 'windows-claude-native-installer'], 'order');
  equal(await page.locator('#tick-npm').count(), 1, 'npm can now be ticked');
  equal(await page.locator('#tick-npm').isChecked(), false, 'npm still unticked');
  await close();
});

await check('tick all ticks required rows only and undoes itself', async () => {
  const { page, close } = await open({ machine: { node: 'missing', git: 'missing' } });
  await pickAndCheck(page, 'claude', 'codex');
  await page.waitForSelector('#tick-all');
  await page.click('#tick-all');
  equal(await page.locator('#tick-node').isChecked(), true, 'node');
  equal(await page.locator('#tick-claude').isChecked(), true, 'claude');
  equal(await page.locator('#tick-git').isChecked(), false, 'optional');
  await page.click('#tick-all');
  equal(await page.locator('#tick-node').isChecked(), false, 'undo');
  await close();
});

await check('a failure stops the queue, keeps the rest ticked, and offers retry, skip and details', async () => {
  const { page, close } = await open({ machine: { node: 'missing', npm: 'missing' }, faults: { 'apply:node': { message: 'winget failed' } } });
  await pickAndCheck(page, 'codex', 'claude');
  await page.check('#tick-node');
  await page.check('#tick-claude');
  await page.click('#apply');
  await page.waitForSelector('[data-row="node"].is-failed');
  equal((await calls(page, 'runHelper')).filter((call) => call.args[1] === 'apply').length, 1, 'stopped');
  equal(await page.locator('#tick-claude').isChecked(), true, 'kept');
  truthy(await page.locator('#retry').isVisible(), 'retry');
  truthy(await page.locator('#next').isEnabled(), 'skip');
  truthy(await page.locator('#details-row-node').isVisible(), 'details');
  truthy(await logOpen(page), 'log open');
  await page.click('#retry');
  await page.waitForFunction(() => document.querySelector('[data-row="claude"].is-ready'), null, { timeout: 8000 });
  await close();
});

await check('a declined prompt says nothing changed', async () => {
  const { page, close } = await open({ machine: { node: 'missing' }, faults: { 'apply:node': { message: 'declined', status: 'elevation_required' } } });
  await pickAndCheck(page, 'codex');
  await page.check('#tick-node');
  await page.click('#apply');
  await page.waitForSelector('[data-row="node"].is-failed');
  truthy(/否|No/.test(await textOf(page, '[data-row="node"]')), 'wording');
  await close();
});

await check('installed but not found offers check again first, then restart, which keeps the wizard', async () => {
  const { page, close } = await open({ machine: { git: 'missing' }, faults: { 'apply:git': { message: 'relaunch', restart: true, status: 'changes_required' } } });
  await page.check('#pick-claude');
  await page.click('#go-check');
  await page.waitForSelector('#tick-git');
  await page.evaluate(() => { window.__host.faults['check:git'] = { message: 'not found yet', status: 'changes_required', restart: false }; });
  await page.check('#tick-git');
  await page.click('#apply');
  await page.waitForSelector('#restart-app');
  await page.click('#restart-app');
  await page.waitForFunction(() => window.__host.calls.some((call) => call.name === 'relaunch'));
  equal(await page.evaluate(() => window.__host.wizardState.page), 2, 'page kept');
  await close();
});

await check('Windows system restart advice returns from the current host session when the wizard mounts', async () => {
  const { page, close } = await open({ systemRestartHelpers: ['windows-node-host-installer'] }, { locale: 'en' });
  await pickAndCheck(page, 'codex');
  await page.waitForSelector('[data-row="node"].is-ready');
  truthy((await textOf(page, '[data-row="node"]')).includes('Restart Windows'), 'host advice restored');
  await close();
});

for (const row of ['node', 'gh', 'vc']) for (const ready of [false, true]) {
await check(`Windows system restart for ${row} survives a ${ready ? 'ready' : 'missing'} fresh check`, async () => {
  const { page, close } = await open({ machine: { [row]: 'missing' }, faults: { [`apply:${row}`]: { systemRestart: true, ready } } }, { locale: 'en' });
  await pickAndCheck(page, row === 'node' ? 'codex' : 'copilot');
  await page.check(`#tick-${row}`);
  await page.click('#apply');
  await page.waitForFunction((id) => document.querySelector(`[data-row="${id}"]`)?.textContent.includes('Restart Windows to finish installation.'), row);
  equal(await page.locator('#restart-app').count(), 0, 'no app restart action');
  equal(await page.locator(`#tick-${row}`).count(), 0, 'no repeated install');
  truthy(!/restart Cats/.test(await textOf(page, '.cats-setup')), 'Windows wording');
  if (shotDir && row === 'node') await page.screenshot({ path: join(shotDir, `windows-restart-${ready ? 'ready' : 'missing'}.png`) });
  await page.click('#recheck');
  await page.waitForFunction((id) => !document.querySelector('.cats-setup [aria-busy="true"]') && document.querySelector(`[data-row="${id}"]`)?.textContent.includes('Restart Windows to finish installation.'), row);
  equal(await page.locator(`#tick-${row}`).count(), 0, 'no install after recheck');
  await page.evaluate((id) => { window.__host.machine[id] = 'ready'; }, row);
  await page.click('#recheck');
  await page.waitForSelector(`[data-row="${row}"].is-ready`);
  truthy((await textOf(page, `[data-row="${row}"]`)).includes('Restart Windows'), 'ready retains advice');
  if (row === 'node') {
    await page.evaluate(() => { window.__host.faults['check:node'] = { throw: true, message: 'probe failed' }; });
    await page.click('#recheck');
    await page.waitForSelector('#recheck-node');
    truthy((await textOf(page, '[data-row="node"]')).includes('Restart Windows'), 'check failure retains advice');
  }
  await close();
});
}

await check('a check that fails stays on its row and leaves the others alone', async () => {
  const { page, close } = await open({ faults: { 'check:claude': { message: 'powershell.exe not found', throw: true } } });
  await pickAndCheck(page, 'claude', 'codex');
  await page.waitForSelector('[data-row="claude"].is-failed');
  truthy(await page.locator('#recheck-claude').isVisible(), 'recheck');
  truthy(await page.locator('#tick-codex').isVisible(), 'codex read');
  truthy(await logOpen(page), 'log open');
  await page.click('#recheck-claude');
  await page.waitForSelector('#tick-claude');
  await close();
});

await check('a scan failure does not claim tools are missing, and skip still works', async () => {
  const { page, close } = await open({ faults: { scan: { message: 'fetch failed' } } });
  await pickAndCheck(page, 'claude');
  await page.waitForSelector('#details-scan');
  truthy(!/尚未安裝|Not installed/.test(await textOf(page, '#setup-h')), 'wording');
  truthy(await page.locator('#skip-next').isEnabled(), 'skip');
  await page.click('#scan-retry');
  await page.waitForSelector('#tick-claude');
  await close();
});

await check('the details page: summary, at most three actions with Quit, four closed sections, and back keeps state', async () => {
  const { page, close } = await open({ machine: { node: 'missing' }, faults: { 'apply:node': { message: 'winget failed' } } });
  await pickAndCheck(page, 'codex', 'claude');
  await page.check('#tick-claude');
  await page.check('#tick-node');
  await page.click('#apply');
  await page.waitForSelector('#details-row-node');
  await page.click('#details-row-node');
  await page.waitForSelector('[data-diag]');
  const buttons = await page.locator('.diag-actions button').count();
  truthy(buttons >= 1 && buttons <= 3, `${buttons} actions`);
  truthy(/結束 Cats|Quit Cats/.test(await page.locator('.diag-actions').innerText()), 'quit');
  truthy(!/進階診斷|advanced/i.test(await page.locator('.diag-actions').innerText()), 'advanced not in the row');
  equal(await page.locator('.diag-section').count(), 4, 'sections');
  equal(await page.locator('.diag-body:not([hidden])').count(), 0, 'closed');
  await page.click('[data-diag-section="why"]');
  truthy(/winget failed/.test(await page.locator('.diag-body:not([hidden])').innerText()), 'raw error');
  await page.click('[data-diag-section="paths"]');
  truthy(/state\.json/.test(await page.locator('.diag-section:last-child .diag-body').innerText()), 'paths');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-diag]', { state: 'detached' });
  equal(await page.locator('#tick-claude').isChecked(), true, 'ticks kept');
  equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'details-row-node', 'focus returned');
  await close();
});

await check('advanced diagnostics is disabled with a reason when Runtime is down', async () => {
  const { page, close } = await open({
    services: [{ name: 'cats-runtime', status: 'failed', healthUrl: 'http://127.0.0.1:3110/health', error: 'EADDRINUSE', lastOutput: 'listen EADDRINUSE' }],
    faults: { 'check:claude': { message: 'x', throw: true } },
  });
  await pickAndCheck(page, 'claude');
  await page.click('#details-row-claude');
  await page.waitForSelector('[data-diag]');
  await page.waitForTimeout(40);
  await page.click('[data-diag-section="diagnostics"]');
  equal(await page.locator('[data-diag-advanced]').isDisabled(), true, 'disabled');
  await close();
});

await check('the log opens on a run, closes after success, stays open after a failure, and waits under the pointer', async () => {
  const { page, close } = await open();
  await page.mouse.move(2, 2);
  await page.check('#pick-claude');
  await page.click('#go-check');
  await page.waitForFunction(() => document.querySelector('.cats-setup [data-log]').classList.contains('open'), null, { timeout: 4000 });
  await page.waitForSelector('#next');
  await page.mouse.move(2, 2);
  await page.waitForFunction(() => !document.querySelector('.cats-setup [data-log]').classList.contains('open'), null, { timeout: 5000 });
  await page.evaluate(() => { window.__host.faults['check:claude'] = { message: 'x', throw: true }; window.__host.tries = {}; });
  await page.click('#recheck');
  await page.waitForSelector('[data-row="claude"].is-failed');
  await page.waitForTimeout(1700);
  truthy(await logOpen(page), 'stays open after failure');
  await close();
});

await check('the log stays closed once closed, except a failure opens it', async () => {
  const { page, close } = await open();
  await page.locator('[data-log-toggle]').click();
  await page.locator('[data-log-toggle]').click();
  equal(await logOpen(page), false, 'closed by hand');
  await page.check('#pick-claude');
  await page.click('#go-check');
  await page.waitForSelector('#next');
  equal(await logOpen(page), false, 'kept closed');
  await page.evaluate(() => { window.__host.faults['check:claude'] = { message: 'x', throw: true }; window.__host.tries = {}; });
  await page.click('#recheck');
  await page.waitForSelector('[data-row="claude"].is-failed');
  equal(await logOpen(page), true, 'failure opens');
  await close();
});

await check('Codex initialization follows login and only a fresh check marks it ready', async () => {
  const { page, close } = await open({ machine: { installed: ['codex'], codexInitialization: 'required' } });
  await pickAndCheck(page, 'codex');
  await page.click('#next');
  await page.waitForSelector('#codex-initialize');
  truthy(await page.locator('[data-row="signin-codex"] + [data-row="codex-initialization"]').count(), 'after login');
  truthy(!(await page.locator('#go-account').isDisabled()), 'unfinished Codex can continue to account');
  truthy(await page.locator('[data-row="codex-initialization"]').textContent().then(text => /You can continue and create Catlas now|現在可以繼續並建立 Catlas/u.test(text)), 'initialization is advisory');
  await page.click('#codex-initialize');
  await page.waitForFunction(() => /Terminal opened|已開啟終端/.test(document.querySelector('[data-row="codex-initialization"]').textContent));
  truthy(!await page.locator('[data-row="codex-initialization"]').evaluate(row => row.classList.contains('is-ready')), 'opened is not ready');
  await page.evaluate(() => { window.__host.machine.codexInitialization = 'unavailable'; });
  await page.click('#codex-initialization-recheck');
  await page.waitForFunction(() => /Could not verify|無法確認/.test(document.querySelector('[data-row="codex-initialization"]').textContent));
  truthy(!(await page.locator('#go-account').isDisabled()), 'unverified Codex can continue to account');
  await page.evaluate(() => { window.__host.machine.codexInitialization = 'ready'; });
  await page.click('#codex-initialization-recheck');
  await page.waitForSelector('[data-row="codex-initialization"].is-ready');
  equal(await page.locator('[data-row="codex-initialization"] .hint-inline').count(), 0, 'ready state clears stale terminal instructions');
  equal((await calls(page, 'checkCodexInitialization')).length, 3, 'new checks after each user action');
  if (shotDir) await page.screenshot({ path: join(shotDir, 'codex-initialization-ready.png') });
  await close();
});

await check('sign-in: states come from reports, the terminal gets only a provider name', async () => {
  const { page, close } = await open({ machine: { installed: ['claude', 'grok', 'cursor'] } });
  await pickAndCheck(page, 'claude', 'grok', 'cursor');
  await page.click('#next');
  await page.waitForSelector('[data-row="signin-claude"]');
  equal(await rowIds(page), ['signin-grok', 'signin-claude', 'signin-cursor'].sort((a, b) => SETUP_PROVIDER_ORDER.indexOf(a.slice(7)) - SETUP_PROVIDER_ORDER.indexOf(b.slice(7))), 'selector order');
  truthy(/尚未登入|Not signed in/.test(await textOf(page, '[data-row="signin-claude"]')), 'claude');
  truthy(/無法得知|Cannot tell/.test(await textOf(page, '[data-row="signin-grok"]')), 'grok');
  equal(await page.locator('#terminal-cursor').count(), 0, 'no guessed command');
  await page.click('#terminal-claude');
  await page.waitForSelector('[data-row="signin-claude"] .hint-inline');
  equal((await calls(page, 'openTerminal'))[0].args, ['claude'], 'provider only');
  await close();
});

await check('no terminal: the row says so, the command can be copied, details exist', async () => {
  const { page, close } = await open({ machine: { installed: ['claude'] }, faults: { terminal: true } });
  await pickAndCheck(page, 'claude');
  await page.click('#next');
  await page.click('#terminal-claude');
  await page.waitForSelector('#details-terminal-claude');
  truthy(await page.locator('#copy-signin-claude').isVisible(), 'copy');
  await close();
});

await check('connections never say installed, and testing saves the address through Runtime', async () => {
  const { page, close } = await open();
  await pickAndCheck(page, 'openclaw');
  const row = () => textOf(page, '[data-row="openclaw"]');
  truthy(!/安裝完成|Installed|已安裝/.test(await row()), 'wording');
  equal((await calls(page, 'runHelper')).filter((call) => /openclaw/.test(call.args[0])).length, 0, 'no helper');
  await page.fill('#addr-openclaw', 'http://bad');
  await page.click('#test-openclaw');
  await page.waitForSelector('[data-row="openclaw"] .addr-error');
  equal((await calls(page, 'runProviderSetup')).filter((call) => call.args[0].targets[0]?.provider === 'openclaw').length, 0, 'bad address not sent');
  await page.fill('#addr-openclaw', 'ws://10.0.0.2:18789');
  await page.click('#test-openclaw');
  await page.waitForSelector('[data-row="openclaw"] .row-state.ok');
  const saves = await calls(page, 'applyProviderSetup');
  equal(saves.at(-1).args[0].targets.find((target) => target.provider === 'openclaw').endpoint, 'ws://10.0.0.2:18789', 'saved');
  await close();
});

await check('a failed connection test is on its row, with details; editing asks for a new test', async () => {
  const { page, close } = await open({ faults: { 'conn:openclaw': { message: 'ECONNREFUSED', always: true } } });
  await pickAndCheck(page, 'openclaw');
  await page.fill('#addr-openclaw', 'ws://10.0.0.2:18789');
  await page.click('#test-openclaw');
  await page.waitForSelector('[data-row="openclaw"].is-failed');
  truthy(await page.locator('#details-conn-openclaw').isVisible(), 'details');
  await page.fill('#addr-openclaw', 'ws://10.0.0.3:18789');
  await page.waitForFunction(() => /位址改了|Address changed/.test(document.querySelector('[data-row="openclaw"]').textContent));
  await close();
});

await check('Ollama: stages, remote switch installs nothing, and a first model downloads with progress', async () => {
  const { page, close } = await open({ machine: { ollama: { installed: true, running: true, models: [] } } });
  await pickAndCheck(page, 'ollama');
  truthy(await page.locator('[data-row="ollama"] .stages').isVisible(), 'stages');
  await page.click('#next');
  await page.waitForSelector('[data-row="ollama-model"]');
  equal(await page.locator('.chips .chip').allInnerTexts(), ['qwen2.5-coder:7b'], 'only catalog names');
  await page.fill('#pull-name', 'bad name!');
  await page.click('#pull-start');
  await page.waitForSelector('[data-row="ollama-model"] .addr-error');
  equal((await calls(page, 'pullOllamaModel')).length, 0, 'bad name not sent');
  await page.click('.chips .chip');
  await page.click('#pull-start');
  await page.waitForSelector('[data-row="ollama-model"].is-ready');
  equal((await calls(page, 'pullOllamaModel'))[0].args[0], 'qwen2.5-coder:7b', 'name');
  await close();
});

await check('a failed pull offers retry and details', async () => {
  const { page, close } = await open({ machine: { ollama: { installed: true, running: true, models: [] } }, faults: { pull: { message: 'disk full' } } });
  await pickAndCheck(page, 'ollama');
  await page.click('#next');
  await page.fill('#pull-name', 'qwen2.5-coder:7b');
  await page.click('#pull-start');
  await page.waitForSelector('[data-row="ollama-model"].is-failed');
  truthy(await page.locator('#details-pull').isVisible(), 'details');
  await page.click('#pull-start');
  await page.waitForSelector('[data-row="ollama-model"].is-ready');
  await close();
});

await check('moving on past unfinished work is worded as skipping, and never blocked', async () => {
  const { page, close } = await open();
  await pickAndCheck(page, 'claude');
  truthy(/先跳過|Skip/.test(await page.locator('#next').innerText()), 'wording');
  truthy(!(await page.locator('#next').getAttribute('class')).includes('primary'), 'not primary');
  truthy(await page.locator('#next').isEnabled(), 'enabled');
  await close();
});

await check('nothing to sign in to skips page 3', async () => {
  const { page, close } = await open();
  await pickAndCheck(page, 'openclaw');
  await page.click('#next');
  await page.waitForFunction(() => window.__host.calls.some((call) => call.name === 'runAction' && call.args[0] === 'open_setup'));
  await close();
});

await check('the hand-off failing keeps the page and offers retry and details', async () => {
  const { page, close } = await open({ machine: { installed: ['claude'] }, faults: { handoff: { message: 'connect ECONNREFUSED 127.0.0.1:8181' } } });
  await pickAndCheck(page, 'claude');
  await page.click('#next');
  await page.click('#go-account');
  await page.waitForSelector('#handoff-retry');
  truthy(await page.locator('#details-handoff').isVisible(), 'details');
  await page.click('#handoff-retry');
  await page.waitForFunction(() => window.__host.calls.filter((call) => call.name === 'runAction' && call.args[0] === 'open_setup').length === 2);
  await close();
});

await check('Back during the scan does not turn the next save into a failure', async () => {
  const { page, close } = await open({ scanDelay: 700 });
  await page.check('#pick-claude');
  await page.click('#go-check');
  await page.waitForFunction(() => window.__host.calls.some((call) => call.name === 'runProviderSetup'));
  await page.click('#back');
  await page.waitForSelector('#pick-codex');
  await page.check('#pick-codex');
  await page.click('#go-check');
  await page.waitForSelector('#next, #recheck', { timeout: 8000 });
  equal(await page.locator('#save-retry').count(), 0, 'no failed save');
  equal((await calls(page, 'applyProviderSetup')).length, 2, 'both saved');
  await close();
});

await check('after a failed save the main button works too', async () => {
  const { page, close } = await open({ faults: { save: { message: 'disk is full' } } });
  await page.check('#pick-claude');
  await page.click('#go-check');
  await page.waitForSelector('#save-retry');
  await page.click('#go-check');
  await page.waitForSelector('#next, #recheck', { timeout: 8000 });
  await close();
});

await check('a connection test holds the page, so Check again cannot collide with it', async () => {
  const { page, close } = await open({ scanDelay: 300 });
  await pickAndCheck(page, 'openclaw');
  await page.fill('#addr-openclaw', 'ws://10.0.0.2:18789');
  await page.click('#test-openclaw');
  equal(await page.locator('#recheck').isDisabled(), true, 'check again');
  equal(await page.locator('#next').isDisabled(), true, 'next');
  await page.waitForSelector('[data-row="openclaw"] .row-state.ok');
  equal(await page.locator('#recheck').isEnabled(), true, 'released');
  await close();
});

await check('a restored page with no answer from Runtime says so on page 1', async () => {
  const { page, close } = await open({ faults: { read: { message: 'down', always: true } }, wizardState: { page: 2, checked: true, rows: {}, ticked: [] } });
  await page.waitForSelector('#catalog-retry');
  await close();
});

await check('wizard memory with no saved selection starts over, as after a data reset', async () => {
  const { page, close } = await open({ wizardState: { page: 3, checked: true, rows: { claude: { kind: 'ready', status: 'ready' } }, ticked: [] } });
  await page.waitForSelector('#pick-claude');
  equal(await page.locator('[data-row]').count(), 0, 'old rows gone');
  await close();
});

await check('a page cannot start a second thing while one runs', async () => {
  const { page, close } = await open({ helperDelay: 300, machine: { ollama: { installed: false, running: false, models: [] } } });
  await pickAndCheck(page, 'ollama');
  await page.check('#tick-ollama');
  await page.click('#apply');
  await page.waitForFunction(() => window.__host.calls.some((call) => call.name === 'runHelper' && call.args[1] === 'apply'));
  equal(await page.locator('#tick-ollama').count(), 0, 'row is running');
  await page.waitForSelector('[data-row="ollama"].is-ready', { timeout: 8000 });
  equal((await calls(page, 'runHelper')).filter((call) => call.args[1] === 'apply').length, 1, 'one apply');
  await close();
});

await check('a failed hand-off from page 2 says so on page 2', async () => {
  const { page, close } = await open({ faults: { handoff: { message: 'connect ECONNREFUSED 127.0.0.1:8181' } } });
  await pickAndCheck(page, 'openclaw');
  await page.click('#next');
  await page.waitForSelector('#handoff-retry');
  truthy(await page.locator('#details-handoff').isVisible(), 'details');
  await close();
});

await check('startup keeps its short copy and shows each service only after Show more', async () => {
  const { page, close } = await open({
    phase: 'starting_services',
    services: [
      { name: 'cats-runtime', status: 'ready', healthUrl: 'http://127.0.0.1:3110/health', error: null, lastOutput: null },
      { name: 'cats-platform', status: 'starting', healthUrl: 'http://127.0.0.1:8181/health', error: null, lastOutput: null },
    ],
  });
  await page.waitForSelector('#splash:not(.hidden)');
  equal(await page.locator('#splash-title').innerText(), 'Cats', 'title');
  equal(await page.locator('#splash-text').innerText(), '正在啟動…', 'status line');
  truthy(!(await page.locator('#splash-services').isVisible()), 'service states start hidden');
  equal(await page.locator('#btn-splash-more').innerText(), '顯示更多', 'toggle label');
  await page.click('#btn-splash-more');
  truthy(await page.locator('#splash-services').isVisible(), 'shown after Show more');
  equal(await page.locator('#splash-services .row').count(), 2, 'one row per service');
  equal(await page.locator('#btn-splash-more').getAttribute('aria-expanded'), 'true', 'expanded state');
  equal(await page.locator('#btn-splash-more').innerText(), '顯示較少', 'toggle label after opening');
  if (shotDir) await page.screenshot({ path: join(shotDir, 'startup-more.png') });
  await page.click('#btn-splash-more');
  truthy(!(await page.locator('#splash-services').isVisible()), 'hidden again');
  await close();
});

await check('startup failure: short copy with Retry, Show details and Quit Cats; the failed service behind Show more', async () => {
  const { page, close } = await open({
    phase: 'failed', lastError: 'listen EADDRINUSE', actions: [{ id: 'retry', label: 'Retry' }, { id: 'quit', label: 'Quit Cats' }],
    services: [
      { name: 'cats-runtime', status: 'failed', healthUrl: 'http://127.0.0.1:3110/health', error: 'listen EADDRINUSE', lastOutput: 'Error: listen EADDRINUSE' },
      { name: 'cats-platform', status: 'stopped', healthUrl: 'http://127.0.0.1:8181/health', error: null, lastOutput: null },
    ],
  });
  await page.waitForSelector('#error-area.visible');
  equal(await page.locator('#splash-title').innerText(), 'Cats', 'title');
  equal(await page.locator('#startup-error-copy').innerText(), '喵…啟動時有地方出錯了。', 'error copy');
  truthy(!(await page.locator('#splash-services').isVisible()), 'service states start hidden');
  await page.click('#btn-splash-more');
  equal(await page.locator('#splash-services .row').count(), 2, 'service rows');
  truthy(/沒有啟動/.test(await page.locator('[data-row="service-cats-runtime"]').innerText()), 'the failed service says so');
  equal(await page.locator('#btn-retry').innerText(), '重試', 'retry label');
  truthy(await page.locator('#btn-retry').isVisible(), 'retry');
  truthy(await page.locator('#btn-quit').isVisible(), 'quit');
  if (shotDir) await page.screenshot({ path: join(shotDir, 'recovery.png') });
  await page.click('#btn-details');
  await page.waitForSelector('.recovery-summary');
  truthy(await page.locator('#recovery .btn').first().isVisible(), 'details open');
  await page.click('.recovery-back');
  await page.waitForSelector('#error-area.visible');
  await page.click('#btn-quit');
  await page.waitForFunction(() => window.__host.calls.some((call) => call.name === 'runAction' && call.args[0] === 'quit'));
  await close();
});

await check('no bridge: says what is missing and offers reload', async () => {
  const context = await browser.newContext({ viewport: { width: 960, height: 600 }, locale: 'en-US' });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(pathToFileURL(pageFile).href);
  await page.waitForSelector('#error-area.visible');
  truthy(/missing part of Cats/.test(await page.locator('#splash-title').innerText()), 'title');
  truthy(!(await page.locator('#btn-details').isVisible()), 'no details without a host');
  await context.close();
});

await check('page 1 states: unreadable file, changed elsewhere, not saved, lost, unreadable list', async () => {
  let view = await open({ selection: { state: 'invalid', revision: 'bad', error: 'Provider configuration is invalid.' } });
  truthy(/備份|backup/.test(await textOf(view.page, '.alert')), 'invalid');
  truthy(await view.page.locator('#go-check').isEnabled(), 'can still save');
  await view.close();

  view = await open({ selection: { state: 'selected', revision: 'one', diskChanged: true, targets: [{ provider: 'claude', backend: 'cli', instance: 'native' }], nativeSetupTargets: [] } });
  await view.page.waitForSelector('#catalog-reload');
  truthy(await view.page.locator('#go-check').isDisabled(), 'blocked');
  await view.close();

  view = await open({ faults: { save: { message: 'disk is full' } } });
  await view.page.check('#pick-claude');
  await view.page.click('#go-check');
  await view.page.waitForSelector('#save-retry');
  equal(await view.page.locator('#pick-claude').isChecked(), true, 'ticks kept');
  truthy(await view.page.locator('#details-save-failed').isVisible(), 'details');
  await view.page.click('#save-retry');
  await view.page.waitForSelector('#next, #recheck');
  await view.close();

  view = await open({ faults: { save: { message: 'reload answered 500', saved: true } } });
  await view.page.check('#pick-claude');
  await view.page.click('#go-check');
  await view.page.waitForFunction(() => /存好|saved/.test((document.querySelector('.alert') || {}).textContent || ''));
  await view.close();

  view = await open({ faults: { read: { message: 'down', always: true } } });
  await view.page.waitForSelector('#catalog-retry');
  truthy(await view.page.locator('#go-check').isDisabled(), 'blocked');
  await view.close();
});

await check('returning from Platform shows the saved results and runs nothing', async () => {
  const { page, close } = await open({
    selection: { state: 'selected', revision: 'one', targets: [{ provider: 'claude', backend: 'cli', instance: 'native' }], nativeSetupTargets: [] },
    wizardState: { page: 2, lang: 'en', checked: true, lastChecked: '2026-11-04T00:00:00.000Z', rows: { claude: { kind: 'needs', status: 'not_installed', planned: ['install_claude'] }, git: { kind: 'ready', status: 'ready' }, shell: { kind: 'ready', status: 'ready' } }, ticked: ['claude'], skipped: [], applied: [], attempted: [] },
  });
  await page.waitForSelector('#tick-claude');
  equal(await page.locator('#tick-claude').isChecked(), true, 'tick kept');
  equal((await calls(page, 'runHelper')).length, 0, 'nothing ran');
  truthy(/last check/.test(await page.locator('.stored').innerText()), 'says so');
  equal(await page.evaluate(() => document.documentElement.lang), 'en', 'language kept');
  await close();
});

await check('macOS: Ollama has no helper, so it says install it yourself, with the remote option', async () => {
  const { page, close } = await open({ platform: 'macos' });
  await pickAndCheck(page, 'ollama');
  truthy(/要自己安裝|Install it yourself/.test(await textOf(page, '[data-row="ollama"]')), 'wording');
  await page.click('#ollama-remote');
  await page.waitForSelector('#addr-ollama');
  await close();
});

await check('a finished setup with a lost selection ends at Cats, with three steps', async () => {
  const { page, close } = await open({ setupComplete: true, machine: { installed: ['claude'] } });
  equal(await page.locator('.cats-setup .step').count(), 3, 'steps');
  await pickAndCheck(page, 'claude');
  await page.click('#next');
  truthy(/開啟 Cats|Open Cats/.test(await page.locator('#go-account').innerText()), 'label');
  await close();
});

for (const locale of ['zh-TW', 'en-US']) {
  for (const size of [[960, 600], [1280, 800]]) {
    await check(`layout ${locale} ${size.join('x')}: no sideways scroll, and all tools fit page 1 at any size`, async () => {
      const { page, close } = await open({ machine: { node: 'missing', npm: 'missing', ollama: { installed: false, running: false, models: [] }, installed: ['claude'] } }, { size, locale });
      await page.click('#pick-more');
      const overflow = () => page.evaluate(() => {
        const pane = document.querySelector('.cats-setup [data-pane]');
        return { sideways: pane.scrollWidth > pane.clientWidth + 1, down: pane.scrollHeight > pane.clientHeight + 1, body: document.documentElement.scrollWidth > window.innerWidth + 1 };
      });
      const first = await overflow();
      truthy(!first.sideways && !first.body, `sideways ${JSON.stringify(first)}`);
      truthy(!first.down, `page 1 scrolls: ${JSON.stringify(first)}`);
      if (shotDir) await page.screenshot({ path: join(shotDir, `p1-${locale}-${size[0]}.png`) });
      for (const id of SETUP_PROVIDER_ORDER) await page.check(`#pick-${id}`);
      await page.click('#go-check');
      await page.waitForSelector('#recheck:not([disabled])', { timeout: 15000 });
      const second = await overflow();
      truthy(!second.sideways && !second.body, `page 2 sideways ${JSON.stringify(second)}`);
      if (shotDir) await page.screenshot({ path: join(shotDir, `p2-${locale}-${size[0]}.png`) });
      await close();
    });
  }
}

await check('English and Traditional Chinese switch in place, without losing ticks', async () => {
  const { page, close } = await open({}, { locale: 'zh-TW' });
  await page.check('#pick-claude');
  await page.selectOption('#setup-lang', 'en');
  await page.waitForFunction(() => /Which AI tools/.test(document.querySelector('#setup-h').textContent));
  equal(await page.locator('#pick-claude').isChecked(), true, 'tick');
  truthy(/Choose tools/.test(await page.locator('.cats-setup .steps').innerText()), 'rail');
  await close();
});

/* ------------------------------ Settings > Runtime (SPEC-137) ------------------------------ */

await check('settings: opening runs nothing, reads in the settings context and shows the last scan without ticks', async () => {
  const { page, close } = await openSettings({
    selection: SELECTED('codex', 'claude'), machine: { installed: ['claude'] },
    observations: [{ provider: 'claude', backend: 'cli', instance: 'native', commandStatus: 'ready', version: '2.1.0', authStatus: 'unknown', observedAt: '2026-11-11T00:00:00Z', configurationStatus: 'unchanged' }],
    prerequisites: [{ helperId: 'windows-node-host-installer', checking: false, result: { status: 'ready', summary: 'ok', manualSteps: [], warnings: [], plannedActions: [], runState: 'completed' } }],
  });
  await page.waitForTimeout(150);
  equal((await calls(page, 'runHelper')).length, 0, 'helpers');
  equal((await calls(page, 'runProviderSetup')).length, 0, 'scans');
  equal((await calls(page, 'applyProviderSetup')).length, 0, 'saves');
  truthy((await calls(page, 'getProviderSetup')).every((call) => call.args[0] === 'settings'), 'context');
  equal(await page.evaluate(() => document.querySelectorAll('.cats-setup input[type="checkbox"]').length), 0, 'tick boxes');
  truthy(/上次掃描有找到/.test(await textOf(page, '[data-row="claude"]')), 'claude passive');
  truthy(/2\.1\.0/.test(await textOf(page, '[data-row="claude"]')), 'claude version');
  truthy(/Cats 啟動時已就緒/.test(await textOf(page, '[data-row="node"]')), 'node passive');
  equal(await page.locator('.cats-setup .rail').isVisible(), false, 'rail');
  truthy(/檢查這台電腦/.test(await textOf(page, '#recheck')), 'button');
  if (shotDir) await page.screenshot({ path: join(shotDir, 'settings-before-check.png') });
  await close();
});

await check('settings: a check offers ticks; Apply installs top down with a fresh check', async () => {
  const { page, close } = await openSettings({ selection: SELECTED('codex', 'claude'), machine: { installed: [] } });
  await page.click('#recheck');
  await settled(page);
  truthy(/再檢查一次/.test(await textOf(page, '#recheck')), 'again');
  await page.check('#tick-claude');
  await page.click('#apply');
  await settled(page);
  const modes = (await calls(page, 'runHelper')).filter((call) => call.args[1] !== 'check').map((call) => [call.args[0], call.args[1]]);
  equal(modes, [['windows-claude-native-installer', 'apply']], 'changes');
  truthy(/剛完成/.test(await textOf(page, '[data-row="claude"]')), 'just finished');
  await close();
});

await check('settings: Update runs the upgrade, says what it runs first, and reports before and after', async () => {
  const { page, close } = await openSettings({
    selection: SELECTED('codex', 'claude'),
    machine: { installed: ['codex', 'claude'], signedIn: ['claude'], versions: { claude: '2.1.0', codex: '0.58.0' }, latest: { claude: '2.2.0' } },
  });
  await page.click('#recheck');
  await settled(page);
  // Node.js, Codex, Claude and Git can update; the npm folder and PowerShell only re-apply settings.
  truthy(/勾選全部 4 項更新/.test(await textOf(page, '#tick-updates')), 'shortcut');
  equal(await page.locator('#change-npm').count(), 0, 'no update for the npm folder');
  await page.check('#change-claude');
  truthy(/有新版就安裝新版/.test(await textOf(page, '[data-row="claude"]')), 'summary');
  await page.click('[data-row="claude"] [data-act="details"]');
  truthy(/-Upgrade -Json/.test(await textOf(page, '[data-row="claude"] .details')), 'command');
  truthy(/SHA-256/.test(await textOf(page, '[data-row="claude"] .details')), 'hash');
  await page.check('#change-codex');
  if (shotDir) {
    await page.waitForTimeout(1600);
    await page.locator('[data-row="claude"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(shotDir, 'settings-update-ticked.png') });
  }
  await page.click('#apply');
  await settled(page);
  if (shotDir) {
    await page.waitForTimeout(1600);
    await page.screenshot({ path: join(shotDir, 'settings-update-done.png') });
  }
  const changes = (await calls(page, 'runHelper')).filter((call) => call.args[1] !== 'check').map((call) => call.args[1]);
  equal(changes, ['upgrade', 'upgrade'], 'modes');
  truthy(/已更新\s*2\.1\.0\s*→\s*2\.2\.0/.test(await textOf(page, '[data-row="claude"] .row-state')), 'updated');
  truthy(/已經是最新版\s*0\.58\.0/.test(await textOf(page, '[data-row="codex"] .row-state')), 'already newest');
  truthy(/改了 1 項/.test(await textOf(page, '.cats-setup .lead')), 'an update that changed nothing is not counted');
  await close();
});

await check('settings: Uninstall runs a dry run first, then is a ticked removal', async () => {
  const { page, close } = await openSettings({ selection: SELECTED('claude'), machine: { installed: ['claude'], signedIn: ['claude'] } });
  await page.click('#recheck');
  await settled(page);
  await page.click('#row-more-claude');
  await page.click('#uninstall-claude');
  await page.waitForFunction(() => document.querySelector('#change-claude') && document.querySelector('#change-claude').checked, null, { timeout: 5000 });
  const preview = (await calls(page, 'runHelper')).find((call) => call.args[1] === 'uninstall');
  equal(preview.args[2], { dryRun: true }, 'dry run');
  truthy(/解除安裝/.test(await textOf(page, '[data-row="claude"] .row-change')), 'label');
  truthy(await page.locator('[data-row="claude"] .tag.danger').count() === 1, 'removal tag');
  truthy(/remove_claude/.test(await textOf(page, '[data-row="claude"] .details')), 'plan');
  await page.click('#apply');
  await settled(page);
  const removal = (await calls(page, 'runHelper')).filter((call) => call.args[1] === 'uninstall');
  equal(removal.length, 2, 'removal ran once after its dry run');
  equal(removal[1].args[2], null, 'real removal');
  truthy(/剛移除/.test(await textOf(page, '[data-row="claude"]')), 'removed');
  equal(await page.locator('#tick-claude').count(), 1, 'install again');
  await close();
});

await check('settings: a dry run that finds nothing offers no tick', async () => {
  const { page, close } = await openSettings({ selection: SELECTED('claude'), machine: { installed: ['claude'], signedIn: ['claude'], nothingToRemove: ['claude'] } });
  await page.click('#recheck');
  await settled(page);
  await page.click('#row-more-claude');
  await page.click('#uninstall-claude');
  await page.waitForFunction(() => /試跑後沒有找到/.test(document.querySelector('[data-row="claude"]').textContent), null, { timeout: 5000 });
  equal(await page.locator('#change-claude').isChecked(), false, 'not ticked');
  await close();
});

await check('settings: Choose tools saves and checks; a failed save is a toast and keeps the ticks', async () => {
  const { page, close } = await openSettings({ selection: SELECTED('claude'), machine: { installed: ['claude'] }, faults: { save: { message: 'Runtime refused the save.' } } });
  await page.click('#choose');
  await page.check('#pick-antigravity');
  await page.click('#go-check');
  await page.waitForFunction(() => window.__toasts.length > 0, null, { timeout: 5000 });
  truthy(/選擇沒有存好/.test((await page.evaluate(() => window.__toasts))[0]), 'toast');
  equal(await page.locator('.cats-setup [role="alert"]').count(), 0, 'no inline save error');
  equal(await page.locator('#pick-antigravity').isChecked(), true, 'tick kept');
  await page.click('#go-check');
  await settled(page);
  equal((await calls(page, 'applyProviderSetup')).length, 2, 'saved');
  truthy((await rowIds(page)).includes('antigravity'), 'new row');
  truthy((await calls(page, 'runHelper')).length > 0, 'checked after saving');
  await close();
});

await check('settings: the last check survives leaving Settings and coming back, and nothing reruns', async () => {
  const { page, close } = await openSettings({ selection: SELECTED('claude'), machine: { installed: [] } });
  await page.click('#recheck');
  await settled(page);
  await page.check('#tick-claude');
  const before = (await calls(page, 'runHelper')).length;
  await page.evaluate(() => window.__mount());
  await page.waitForFunction(() => document.querySelector('#tick-claude'), null, { timeout: 5000 });
  await page.waitForTimeout(120);
  equal((await calls(page, 'runHelper')).length, before, 'no new helper runs');
  equal(await page.locator('#tick-claude').isChecked(), true, 'tick kept');
  truthy(/檢查過/.test(await textOf(page, '.cats-setup .lead')), 'checked at');
  await close();
});

await check('a tool with no helper here that Runtime finds is ready, not "install it yourself"', async () => {
  const { page, close } = await openSettings({
    selection: SELECTED('claude', 'antigravity'), machine: { installed: ['claude'] },
    unsupported: ['windows-claude-native-installer', 'windows-antigravity-native-installer'],
  });
  await page.click('#recheck');
  await settled(page);
  truthy(/就緒/.test(await textOf(page, '[data-row="claude"] .row-state')), 'found by Runtime');
  truthy(/要自己安裝/.test(await textOf(page, '[data-row="antigravity"] .row-state')), 'still missing');
  equal(await page.locator('#change-claude').count(), 0, 'no update without a helper');
  await close();
});

await check('settings: sign-in rows open a terminal from Settings', async () => {
  const { page, close } = await openSettings({ selection: SELECTED('claude'), machine: { installed: ['claude'] } });
  await page.click('#recheck');
  await settled(page);
  truthy(await page.locator('[data-row="signin-claude"]').count() === 1, 'sign-in row');
  await page.click('#terminal-claude');
  await page.waitForFunction(() => window.__host.calls.some((call) => call.name === 'openTerminal'));
  await close();
});

await check('settings: a failed update opens the log and its details page returns to the rows', async () => {
  const { page, close } = await openSettings({
    selection: SELECTED('claude'), machine: { installed: ['claude'], signedIn: ['claude'] },
    faults: { 'upgrade:claude': { message: 'The vendor installer exited with 1.', always: true } },
  });
  await page.click('#recheck');
  await settled(page);
  await page.check('#change-claude');
  await page.click('#apply');
  await page.waitForSelector('#retry', { timeout: 8000 });
  truthy(await logOpen(page), 'log open');
  truthy(/沒有完成/.test(await textOf(page, '[data-row="claude"]')), 'failed row');
  await page.click('[data-row="claude"] [data-act="open-details"]');
  await page.waitForSelector('[data-details]:not([hidden]) [data-diag-title]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-row="claude"]');
  await page.click('#retry');
  await page.waitForFunction(() => (window.__host.calls.filter((call) => call.name === 'runHelper' && call.args[1] === 'upgrade').length >= 2), null, { timeout: 8000 });
  await close();
});

for (const locale of ['zh-TW', 'en-US']) {
  await check(`settings: fits the Desktop minimum window, with the action foot and log docked (${locale})`, async () => {
    const { page, close } = await openSettings({
      selection: SELECTED('codex', 'claude', 'antigravity', 'ollama'),
      machine: { installed: ['codex', 'claude'], node: 'ready', versions: { claude: '2.1.0' } },
    }, { size: [700, 600], locale });
    await page.click('#recheck');
    await settled(page);
    await page.check('#tick-antigravity');
    const box = await page.evaluate(() => {
      const dock = document.querySelector('.cats-setup .dock').getBoundingClientRect();
      const canvas = document.querySelector('.canvas');
      return { dockBottom: Math.round(dock.bottom), height: innerHeight, sideways: canvas.scrollWidth > canvas.clientWidth + 1 };
    });
    truthy(box.dockBottom <= box.height, `dock below the fold ${JSON.stringify(box)}`);
    truthy(!box.sideways, 'scrolls sideways');
    if (shotDir) await page.screenshot({ path: join(shotDir, `settings-${locale}-700.png`) });
    await close();
  });
}

await browser.close();
const passed = results.passed;
console.log(`${passed} passed, ${results.failed.length} failed, ${pageErrors.length} page errors`);
for (const line of results.failed) console.log(`FAIL ${line}`);
for (const line of [...new Set(pageErrors)]) console.log(`PAGE ERROR ${line}`);
process.exit(results.failed.length || pageErrors.length ? 1 : 0);

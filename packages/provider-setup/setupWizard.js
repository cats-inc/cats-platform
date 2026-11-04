/**
 * Pages 1 to 3 of the first-run wizard (SPEC-136): choose tools, this computer, sign-in and models.
 * Browser-only and self-contained, because the host embeds it before Platform starts. Everything it
 * says about a computer comes from a helper's report or Runtime; nothing runs until the person asks.
 */
export function mountSetupWizard(root, bridge, options) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const PRIMARY = ['claude', 'codex', 'antigravity'];
  const CHECKS_AT_ONCE = 4;
  const ADDRESS_DEFAULT = { ollama: 'http://127.0.0.1:11434', openclaw: 'ws://127.0.0.1:18789' };
  const MODEL_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/;

  const S = {
    lang: String(options.locale || 'en').startsWith('zh') ? 'zh-TW' : 'en',
    page: 1, snap: null, facts: null, catalog: 'slow', catalogError: null, saved: false, notice: null, reloading: false,
    picks: new Set(), expanded: false, revision: null, skipped: new Set(),
    phase: 'idle', rows: {}, checked: false, lastChecked: null, ticked: new Set(), details: new Set(), applied: new Set(), attempted: new Set(), systemRestarts: new Set(),
    queue: [], running: null, runStart: null, stopAfter: false, stopRequested: false, pageError: null, ticket: 0,
    conn: {
      ollama: { remote: false, address: ADDRESS_DEFAULT.ollama, state: 'untested', error: null, changed: false },
      openclaw: { remote: true, address: ADDRESS_DEFAULT.openclaw, state: 'untested', error: null, changed: false },
    },
    ollama: { installed: false, running: false, models: [], modelsKnown: false },
    pull: { name: '', state: 'idle', percent: null, error: null, status: '' },
    terminal: {}, handoffError: null, copied: null, setupComplete: false,
  };
  const T = (en, zh) => (S.lang === 'zh-TW' ? zh : en);
  const E = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const list = (items) => items.join(T(', ', '、'));
  const wizardBridge = bridge.setupWizard;

  const chrome = options.createChrome(root, bridge, {
    locale: S.lang,
    css: options.css,
    catHead: options.catHead,
    isBusy: () => S.phase !== 'idle',
    onStep: (page) => goTo(page),
    onDetailsClosed: () => render(),
    onRun: () => { if (S.page === 3) renderPage(); },
  });
  const ICON = chrome.icons;
  const { pane, foot } = chrome;

  /* ------------------------------ Tools and rows ------------------------------ */

  let TOOLS = {};
  let ORDER = [];
  let CUSTOM = [];
  const platform = () => (S.snap ? S.snap.platform : (S.facts && S.facts.platform) || 'windows');
  const targetKey = (target) => JSON.stringify([target.provider, target.backend, target.instance]);

  function buildTools() {
    const universe = S.snap.runtime.universe || [];
    const npm = new Set((S.facts && S.facts.npmProviders) || []);
    const tools = {};
    for (const entry of universe) {
      if (tools[entry.provider]) continue;
      const install = entry.install || {};
      tools[entry.provider] = {
        id: entry.provider,
        label: entry.familyLabel || entry.provider,
        binary: entry.binaryName,
        kind: entry.provider === 'ollama' ? 'local' : entry.provider === 'openclaw' ? 'connection' : npm.has(entry.provider) ? 'npm' : 'native',
        command: (install.install && install.install.command) || null,
        docs: (install.auth && install.auth.docsUrl) || (install.install && install.install.docsUrl) || null,
        authHint: (install.auth && install.auth.hint) || null,
        pkg: (install.npm && install.npm.packageName) || null,
        target: { provider: entry.provider, backend: entry.backend, instance: entry.instance },
      };
    }
    TOOLS = tools;
    const known = (S.facts && S.facts.order) || [];
    ORDER = [...known.filter((id) => tools[id]), ...Object.keys(tools).filter((id) => !known.includes(id))]
      .filter((id) => tools[id].kind === 'npm' || tools[id].kind === 'native');
    const keys = new Set(Object.values(tools).map((tool) => targetKey(tool.target)));
    CUSTOM = (S.snap.runtime.selection.targets || []).filter((target) => !keys.has(targetKey(target)));
  }

  const picked = (kind) => ORDER.filter((id) => S.picks.has(id) && TOOLS[id].kind === kind);
  const VC_FREE = () => new Set((S.facts && S.facts.vcRuntimeFree) || []);

  function layout() {
    const groups = [];
    const npm = picked('npm');
    const native = picked('native');
    const windows = platform() === 'windows';
    if (npm.length) groups.push({ key: 'node', title: T('Installed through Node.js', '透過 Node.js 安裝'), rows: ['node', 'npm', ...npm], root: 'node' });
    const other = [];
    if (windows && [...S.picks].some((id) => TOOLS[id] && (TOOLS[id].kind === 'npm' || TOOLS[id].kind === 'native') && !VC_FREE().has(id))) other.push('vc');
    if (S.picks.has('copilot')) other.push('gh');
    other.push(...native);
    if (other.length) groups.push({ key: 'native', title: T('With their own installer', '有自己的安裝程式'), rows: other });
    const services = ['ollama', 'openclaw'].filter((id) => S.picks.has(id));
    if (services.length) groups.push({ key: 'services', title: T('Local models and connections', '本機模型與連線'), rows: services });
    groups.push({ key: 'optional', title: T('Optional, and fine to leave for later', '選用，可以之後再說'), rows: windows ? ['git', 'shell'] : ['git'] });
    return groups;
  }
  const rowIds = () => layout().flatMap((group) => group.rows);
  const isOptional = (id) => id === 'git' || id === 'shell';
  const isConnection = (id) => id === 'openclaw' || (id === 'ollama' && S.conn.ollama.remote);
  const nodeReady = () => S.rows.node && S.rows.node.kind === 'ready';
  const waitsOnNode = (id) => (id === 'npm' || (TOOLS[id] && TOOLS[id].kind === 'npm')) && !nodeReady();

  function helperIdOf(id) {
    const os = platform();
    switch (id) {
      case 'node': return `${os}-node-host-installer`;
      case 'npm': return `${os}-npm-prefix-helper`;
      case 'vc': return 'windows-vcredist-installer';
      case 'gh': return `${os}-github-cli-installer`;
      case 'git': return `${os}-git-installer`;
      case 'shell': return 'windows-cli-readiness-helper';
      case 'ollama': return `${os}-ollama-local-model-installer`;
      default: return `${os}-${id}-native-installer`;
    }
  }
  /** A helper this build ships and this OS supports, or null, which makes the row a manual one. */
  function helperOf(id) {
    const helper = S.facts && S.facts.helpers ? S.facts.helpers[helperIdOf(id)] : null;
    return helper && helper.available && helper.supported ? helper : null;
  }

  function neededBy(id) {
    const labels = (ids) => ids.map((item) => TOOLS[item].label);
    if (id === 'node') return labels(picked('npm'));
    if (id === 'vc') return labels(ORDER.filter((item) => S.picks.has(item) && !VC_FREE().has(item)));
    if (id === 'gh') return TOOLS.copilot ? labels(['copilot']) : [];
    return [];
  }
  const factsOf = (id) => options.facts(T, id, {
    platform: platform(),
    tool: TOOLS[id],
    neededBy: neededBy(id),
    planned: (S.rows[id] && S.rows[id].planned) || [],
    ollamaInstalled: S.ollama.installed,
  });
  const rowLabel = (id) => factsOf(id).title;

  /* ------------------------------ What a helper reported ------------------------------ */

  /** One row state from a read-only check, so the page never has to guess what a status means. */
  function classifyCheck(id, record) {
    if (!record) return { kind: 'checkFailed', status: 'failed', error: T('The helper did not return a result.', '輔助程式沒有回傳結果。'), planned: [] };
    const planned = record.plannedActions || [];
    const base = { status: record.status, version: record.detectedVersion || null, planned, manual: record.manualSteps || [], warnings: record.warnings || [] };
    if (record.status === 'stopped') return { kind: 'pending' };
    if (record.runState === 'failed') return { ...base, kind: 'checkFailed', error: record.error || record.summary, timeout: Boolean(record.timedOut) };
    if (id === 'ollama') {
      S.ollama.installed = record.installed === true;
      S.ollama.running = record.apiReady === true;
      if (record.status === 'ready' || record.apiReady === true) return { ...base, kind: 'ready' };
    }
    if (record.status === 'ready' || (record.status === 'auth_required' && record.installed !== false)) return { ...base, kind: 'ready' };
    if (S.systemRestarts.has(id)) return { ...base, kind: 'restart' };
    if (record.status === 'prerequisite_required') return { ...base, kind: 'waiting' };
    const helper = helperOf(id);
    return helper && helper.supportsApply ? { ...base, kind: 'needs' } : { ...base, kind: 'manual' };
  }

  async function readOne(id, mine) {
    S.rows[id] = { kind: 'checking' };
    renderPage();
    let record = null;
    let thrown = null;
    try { record = await wizardBridge.runHelper(helperIdOf(id), 'check'); }
    catch (error) { thrown = error; }
    if (mine !== S.ticket) return;
    S.rows[id] = thrown
      ? { kind: 'checkFailed', status: 'failed', error: String(thrown.message || thrown), planned: [] }
      : classifyCheck(id, record);
    if (S.rows[id].kind === 'checkFailed') S.details.add(id);
    renderPage();
  }

  /** Bounded, so a page of many tools does not start sixteen PowerShells together. */
  async function readAll(ids, mine) {
    const pending = [...ids];
    const worker = async () => {
      while (pending.length && mine === S.ticket) await readOne(pending.shift(), mine);
    };
    await Promise.all(Array.from({ length: Math.min(CHECKS_AT_ONCE, ids.length) }, worker));
  }

  /**
   * The host runs one provider operation at a time and cannot stop a scan. Whatever comes next waits
   * for it here, so leaving a page mid scan does not turn into a failed save a moment later.
   */
  let operationInFlight = Promise.resolve();
  function providerOperation(start) {
    const run = operationInFlight.then(start);
    operationInFlight = run.then(() => undefined, () => undefined);
    return run;
  }

  const scanTargets = () => [...S.picks]
    .filter((id) => TOOLS[id] && !isConnection(id))
    .map((id) => TOOLS[id].target);

  async function refreshSnapshot() {
    const next = await bridge.getProviderSetup('onboarding');
    S.snap = next;
    S.revision = next.runtime.selection.revision;
    buildTools();
    return next;
  }

  async function loadOllamaModels() {
    if (!S.picks.has('ollama') || S.conn.ollama.remote || !S.ollama.running || !wizardBridge.ollamaModels) return;
    try {
      S.ollama.models = await wizardBridge.ollamaModels();
      S.ollama.modelsKnown = true;
    } catch { /* The row still offers a download, and a failed list is not a failed computer. */ }
  }

  async function runCheck() {
    if (S.phase !== 'idle') return;
    chrome.beginWork();
    const mine = ++S.ticket;
    S.phase = 'checking';
    S.pageError = null;
    S.runStart = Date.now();
    S.lastChecked = null;
    chrome.setElapsedFrom(S.runStart);
    const ids = rowIds().filter((id) => !isConnection(id));
    for (const id of ids) S.rows[id] = helperOf(id) ? { kind: 'pending' } : { kind: 'manual', status: 'not_supported', planned: [] };
    const readable = ids.filter((id) => helperOf(id));
    renderPage();
    if (readable.includes('node')) {
      await readOne('node', mine);
      if (mine !== S.ticket) return;
    }
    const rest = readable.filter((id) => id !== 'node');
    for (const id of rest.filter((item) => waitsOnNode(item))) S.rows[id] = { kind: 'waiting', status: 'prerequisite_required', planned: [] };
    await readAll(rest.filter((id) => !waitsOnNode(id)), mine);
    if (mine !== S.ticket) return;
    const targets = scanTargets();
    if (targets.length) {
      try {
        const next = await providerOperation(() => bridge.runProviderSetup({ action: 'detect', targets, expectedRevision: S.revision }));
        if (mine !== S.ticket) return;
        S.snap = next;
      } catch (error) {
        if (mine !== S.ticket) return;
        S.pageError = { raw: String(error.message || error) };
      }
    }
    await loadOllamaModels();
    if (mine !== S.ticket) return;
    S.ticked = new Set([...S.ticked].filter((id) => S.rows[id] && S.rows[id].kind === 'needs'));
    S.checked = true;
    S.checkedAt = new Date().toISOString();
    S.phase = 'idle';
    S.runStart = null;
    chrome.setElapsedFrom(null);
    saveState();
    renderPage();
  }

  function stopCheck() {
    S.ticket++;
    if (wizardBridge.cancelChecks) Promise.resolve(wizardBridge.cancelChecks()).catch(() => undefined);
    for (const id of Object.keys(S.rows)) {
      if (['checking', 'pending'].includes(S.rows[id].kind)) delete S.rows[id];
    }
    S.phase = 'idle';
    S.runStart = null;
    chrome.setElapsedFrom(null);
  }

  async function recheckRow(id) {
    if (S.phase !== 'idle') return;
    chrome.beginWork();
    const mine = ++S.ticket;
    S.phase = 'checking';
    S.runStart = Date.now();
    chrome.setElapsedFrom(S.runStart);
    await readOne(id, mine);
    if (mine !== S.ticket) return;
    await readWaiting(mine);
    if (mine !== S.ticket) return;
    S.phase = 'idle';
    S.runStart = null;
    chrome.setElapsedFrom(null);
    await loadOllamaModels();
    saveState();
    renderPage();
  }

  /** Whatever was waiting on Node.js can now say what it needs. */
  async function readWaiting(mine) {
    const ready = rowIds().filter((id) => S.rows[id] && S.rows[id].kind === 'waiting' && !waitsOnNode(id) && helperOf(id));
    if (ready.length) await readAll(ready, mine);
  }

  /* ------------------------------ Changing: ticked scripts, top down ------------------------------ */

  async function apply(ids) {
    if (!ids.length || S.phase !== 'idle') return;
    chrome.beginWork();
    const mine = ++S.ticket;
    S.stopRequested = false;
    S.stopAfter = false;
    S.phase = 'applying';
    S.pageError = null;
    S.queue = [...ids];
    let stopped = false;
    const finished = [];
    for (const id of ids) {
      if (S.stopRequested) break;
      S.running = id;
      S.runStart = Date.now();
      chrome.setElapsedFrom(S.runStart);
      S.attempted.add(id);
      renderPage();
      let record = null;
      let thrown = null;
      try { record = await wizardBridge.runHelper(helperIdOf(id), 'apply'); }
      catch (error) { thrown = error; }
      if (mine !== S.ticket) return;
      S.queue = S.queue.filter((item) => item !== id);
      S.ticked.delete(id);
      const interruption = record && (record.interruptions || []).map((entry) => entry.kind);
      const declined = record && (record.status === 'elevation_required' || (interruption || []).includes('elevation_required'));
      if (thrown || declined || (record && (record.runState === 'failed' || record.status === 'failed'))) {
        S.rows[id] = {
          kind: declined ? 'declined' : 'failed',
          status: thrown ? 'failed' : record.status,
          error: thrown ? String(thrown.message || thrown) : record.error || record.summary,
          manual: record ? record.manualSteps || [] : [],
          planned: record ? record.plannedActions || [] : [],
        };
        S.details.add(id);
        stopped = true;
        break;
      }
      // A fresh read after each step decides, not the script's own word.
      // Keep explicit MSI reboot advice throughout this wizard, even when its CLI already works.
      if (platform() === 'windows' && ['node', 'gh', 'vc'].includes(id)
        && record.restartRequired && record.status === 'restart_required'
        && (record.interruptions || []).some((entry) => entry.kind === 'restart_required' && entry.requiresRestart)) {
        S.systemRestarts.add(id);
        S.applied.add(id);
      }
      let check = null;
      try { check = await wizardBridge.runHelper(helperIdOf(id), 'check'); } catch { check = null; }
      if (mine !== S.ticket) return;
      const next = classifyCheck(id, check);
      if (next.kind === 'ready') {
        S.rows[id] = next;
        S.applied.add(id);
        S.attempted.delete(id);
        finished.push(id);
      } else if (record.restartRequired || (interruption || []).some((kind) => ['relaunch_required', 'restart_required'].includes(kind))) {
        S.rows[id] = { kind: 'restart', status: 'restart_required', planned: record.plannedActions || [], manual: record.manualSteps || [] };
        stopped = true;
        break;
      } else {
        S.rows[id] = {
          kind: 'failed', status: next.status || record.status,
          error: record.summary || null,
          human: T('The script finished, but a fresh check says this is still not ready.', '腳本跑完了，但重新檢查後還是沒有就緒。'),
          manual: [...(record.manualSteps || []), ...(next.manual || [])], planned: next.planned || [],
        };
        S.details.add(id);
        stopped = true;
        break;
      }
      await readWaiting(mine);
      if (mine !== S.ticket) return;
      renderPage();
    }
    const targets = finished.filter((id) => TOOLS[id]).map((id) => TOOLS[id].target);
    if (targets.length) {
      try { S.snap = await providerOperation(() => bridge.runProviderSetup({ action: 'detect', targets, expectedRevision: S.revision })); }
      catch { /* The rows already say what the helpers found. The scan repeats on Check again. */ }
    }
    await loadOllamaModels();
    if (mine !== S.ticket) return;
    S.running = null;
    S.runStart = null;
    chrome.setElapsedFrom(null);
    S.queue = [];
    S.phase = 'idle';
    S.stopAfter = false;
    saveState();
    renderPage();
    if (stopped) showRow(stoppedRow());
  }

  const FAILED_KINDS = ['failed', 'declined', 'restart', 'checkFailed'];
  const queueOf = () => rowIds().filter((id) => S.ticked.has(id) && S.rows[id] && S.rows[id].kind === 'needs');
  const stoppedRow = () => rowIds().find((id) => S.rows[id] && FAILED_KINDS.includes(S.rows[id].kind)) || null;
  function retryQueue(stopped) {
    if (!stopped || S.rows[stopped].kind === 'restart' || !S.attempted.has(stopped)) return [];
    return [stopped, ...queueOf().filter((id) => id !== stopped)];
  }
  function pendingRows() {
    return rowIds().filter((id) => {
      if (isOptional(id)) return false;
      if (isConnection(id)) return S.conn[id].state !== 'connected';
      return !S.rows[id] || S.rows[id].kind !== 'ready';
    });
  }
  const tickableRequired = () => rowIds().filter((id) => !isOptional(id) && S.rows[id] && S.rows[id].kind === 'needs');

  /* ------------------------------ Connections ------------------------------ */

  function addressProblem(id) {
    const value = S.conn[id].address.trim();
    if (!value) return T('Enter an address.', '請輸入位址。');
    const schemes = id === 'ollama' ? ['http:', 'https:'] : ['ws:', 'wss:'];
    let parsed = null;
    try { parsed = new URL(value); } catch { parsed = null; }
    if (!parsed || !schemes.includes(parsed.protocol) || !parsed.hostname) {
      return id === 'ollama'
        ? T('The address must start with http:// or https://', '位址要以 http:// 或 https:// 開頭。')
        : T('The address must start with ws:// or wss://', '位址要以 ws:// 或 wss:// 開頭。');
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      return T('Use an address without a user name, password or query.', '位址不能包含帳號、密碼或查詢參數。');
    }
    return null;
  }

  function selectionTargets(endpoints = {}) {
    const chosen = [...S.picks].filter((id) => TOOLS[id]).map((id) => ({
      ...TOOLS[id].target,
      ...(endpoints[id] ? { endpoint: endpoints[id] } : {}),
    }));
    return [...chosen, ...CUSTOM.map((target) => ({ provider: target.provider, backend: target.backend, instance: target.instance }))];
  }

  async function testConnection(id) {
    if (S.phase !== 'idle') return;
    const conn = S.conn[id];
    const problem = addressProblem(id);
    if (problem) { conn.state = 'invalid'; conn.error = problem; renderPage(); return; }
    chrome.beginWork();
    S.phase = 'testing';
    conn.state = 'testing';
    conn.error = null;
    conn.changed = false;
    renderPage();
    const tool = TOOLS[id];
    try {
      const saved = await providerOperation(() => bridge.applyProviderSetup({
        targets: selectionTargets({ [id]: conn.address.trim() }), expectedRevision: S.revision, detectAfter: false,
      }));
      S.snap = saved;
      S.revision = saved.runtime.selection.revision;
      const next = await providerOperation(() => bridge.runProviderSetup({ action: 'detect', targets: [tool.target], expectedRevision: S.revision }));
      S.snap = next;
      const observation = (next.runtime.observations || []).find((entry) => targetKey(entry) === targetKey(tool.target));
      if (observation && observation.connectionStatus === 'connected') {
        conn.state = 'connected';
      } else {
        conn.state = 'failed';
        conn.error = (observation && observation.detail) || T('The connection test did not succeed.', '連線測試沒有成功。');
      }
    } catch (error) {
      conn.state = 'failed';
      conn.error = String(error.message || error);
    }
    if (id === 'ollama' && conn.state === 'connected') {
      S.ollama.running = true;
      S.ollama.installed = true;
    }
    S.phase = 'idle';
    saveState();
    renderPage();
  }

  async function setOllamaRemote(on) {
    if (S.phase !== 'idle') return;
    const conn = S.conn.ollama;
    conn.remote = on;
    conn.state = 'untested';
    conn.error = null;
    conn.changed = false;
    if (!on) {
      conn.address = ADDRESS_DEFAULT.ollama;
      delete S.rows.ollama;
      try {
        const saved = await providerOperation(() => bridge.applyProviderSetup({
          targets: selectionTargets({ ollama: conn.address }), expectedRevision: S.revision, detectAfter: false,
        }));
        S.snap = saved;
        S.revision = saved.runtime.selection.revision;
      } catch { /* Check this again reports what is true. */ }
      await recheckRow('ollama');
      return;
    }
    if (conn.address === ADDRESS_DEFAULT.ollama) conn.address = '';
    delete S.rows.ollama;
    renderPage();
  }

  /* ------------------------------ Ollama's first model ------------------------------ */

  let unsubscribeProgress = null;
  async function startPull() {
    if (S.phase !== 'idle') return;
    const pull = S.pull;
    const name = pull.name.trim();
    if (!MODEL_NAME.test(name)) {
      pull.state = 'invalid';
      pull.error = T('Enter a model name, such as the one suggested below.', '請輸入模型名稱，可以用下面建議的名稱。');
      renderPage();
      return;
    }
    chrome.beginWork();
    pull.state = 'running';
    pull.error = null;
    pull.percent = null;
    pull.status = '';
    S.phase = 'pulling';
    S.runStart = Date.now();
    chrome.setElapsedFrom(S.runStart);
    renderPage();
    try {
      const result = await wizardBridge.pullOllamaModel(name);
      if (result && result.stopped) {
        pull.state = 'idle';
      } else {
        pull.state = 'done';
        await loadOllamaModels();
        if (!S.ollama.models.length) S.ollama.models = [name];
      }
    } catch (error) {
      pull.state = 'failed';
      pull.error = String(error.message || error);
    }
    S.phase = 'idle';
    S.runStart = null;
    chrome.setElapsedFrom(null);
    saveState();
    renderPage();
  }

  /* ------------------------------ Page changes ------------------------------ */

  function stateBlob() {
    return {
      page: S.page, lang: S.lang, expanded: S.expanded, checked: S.checked,
      lastChecked: S.checkedAt || null, priorChanges: S.priorChanges || 0,
      rows: S.rows, ticked: [...S.ticked], skipped: [...S.skipped], applied: [...S.applied], attempted: [...S.attempted],
      conn: { ollama: { remote: S.conn.ollama.remote, address: S.conn.ollama.address, state: S.conn.ollama.state === 'connected' ? 'connected' : 'untested' },
        openclaw: { address: S.conn.openclaw.address, state: S.conn.openclaw.state === 'connected' ? 'connected' : 'untested' } },
      ollama: S.ollama, pullName: S.pull.name,
    };
  }
  function saveState() {
    if (wizardBridge.saveState) Promise.resolve(wizardBridge.saveState(stateBlob())).catch(() => undefined);
  }
  function restoreState(state) {
    if (!state) return;
    if (state.lang === 'en' || state.lang === 'zh-TW') S.lang = state.lang;
    S.expanded = Boolean(state.expanded);
    S.checked = Boolean(state.checked);
    S.lastChecked = state.lastChecked || null;
    S.checkedAt = state.lastChecked || null;
    S.priorChanges = Number(state.priorChanges) || 0;
    chrome.setPriorChanges(S.priorChanges);
    S.rows = state.rows && typeof state.rows === 'object' ? state.rows : {};
    S.ticked = new Set(state.ticked || []);
    S.skipped = new Set(state.skipped || []);
    S.applied = new Set(state.applied || []);
    S.attempted = new Set(state.attempted || []);
    if (state.conn) {
      Object.assign(S.conn.ollama, state.conn.ollama || {});
      Object.assign(S.conn.openclaw, state.conn.openclaw || {});
    }
    if (state.ollama) Object.assign(S.ollama, state.ollama);
    if (state.pullName) S.pull.name = state.pullName;
    // Only pages this half draws. A run in progress did not survive, so nothing resumes by itself.
    if ([1, 2, 3].includes(state.page)) S.page = state.page;
  }

  const signInRows = () => ORDER.filter((id) => S.picks.has(id) && S.rows[id] && S.rows[id].kind === 'ready');
  const ollamaUsable = () => S.picks.has('ollama') && !S.conn.ollama.remote && S.rows.ollama && S.rows.ollama.kind === 'ready';
  const pageThreeHasWork = () => signInRows().length > 0 || (ollamaUsable() && S.ollama.modelsKnown && !S.ollama.models.length);

  function authState(id) {
    const row = S.rows[id] || {};
    if (row.status === 'auth_required') return 'required';
    const target = TOOLS[id] && TOOLS[id].target;
    const observation = target && ((S.snap.runtime.observations || []).find((entry) => targetKey(entry) === targetKey(target)));
    if (observation && observation.authStatus === 'missing') return 'required';
    if (observation && observation.authStatus === 'not_required') return 'not_required';
    // Claude's helper asks the CLI, and only reports ready when it is signed in.
    return id === 'claude' && row.status === 'ready' ? 'signed_in' : 'unknown';
  }

  function goTo(page) {
    if (page >= 4) { void handoff(); return; }
    if (S.phase === 'checking') stopCheck();
    S.pageError = null;
    S.page = page;
    saveState();
    render(true);
  }

  async function saveAndCheck() {
    if (!['ready', 'invalid', 'partial', 'savefail'].includes(S.catalog) || S.phase !== 'idle') return;
    chrome.beginWork();
    S.notice = null;
    S.catalog = S.catalog === 'partial' || S.catalog === 'savefail' ? 'ready' : S.catalog;
    S.phase = 'saving';
    renderFoot();
    const empty = selectionTargets().length === 0;
    try {
      const saved = await providerOperation(() => bridge.applyProviderSetup({ targets: selectionTargets(), expectedRevision: S.revision, detectAfter: false }));
      S.snap = saved;
      S.revision = saved.runtime.selection.revision;
      S.catalog = 'ready';
    } catch (error) {
      S.phase = 'idle';
      await classifySaveFailure(error);
      render();
      return;
    }
    S.phase = 'idle';
    buildTools();
    try {
      const facts = await wizardBridge.facts();
      S.facts = { ...S.facts, ollamaSuggestions: facts.ollamaSuggestions };
    } catch { /* Only suggestions: a person can still type a name. */ }
    if (S.picks.size === 0 || empty) {
      S.skipped = new Set([2, 3]);
      await handoff();
      return;
    }
    S.skipped = new Set();
    S.page = 2;
    S.rows = {};
    render(true);
    await runCheck();
  }

  /** Saved but not active, changed elsewhere, or simply not saved: three different things to say. */
  async function classifySaveFailure(error) {
    const message = String(error.message || error);
    S.catalogError = message;
    let current = null;
    try { current = await bridge.getProviderSetup('onboarding'); } catch { current = null; }
    if (!current) { S.catalog = 'lost'; return; }
    S.snap = current;
    if (current.runtime.selection.diskChanged || /changed|revision/i.test(message)) {
      S.catalog = current.runtime.selection.revision === S.revision ? 'savefail' : 'changed';
      return;
    }
    if (current.runtime.selection.revision !== S.revision) {
      S.revision = current.runtime.selection.revision;
      S.catalog = 'partial';
      return;
    }
    S.catalog = 'savefail';
  }

  async function handoff() {
    if (S.phase !== 'idle') return;
    chrome.beginWork();
    S.phase = 'handoff';
    S.handoffError = null;
    S.page = Math.min(S.page, 3);
    await Promise.resolve(wizardBridge.saveState ? wizardBridge.saveState(stateBlob()) : undefined).catch(() => undefined);
    renderFoot();
    try {
      await bridge.runAction(S.setupComplete ? 'open_chat' : 'open_setup');
    } catch (error) {
      S.phase = 'idle';
      S.handoffError = String(error.message || error);
      if (S.page === 1) S.notice = 'handoff';
      render();
      return;
    }
    // Navigating replaces this page. If the host stayed here, the buttons must come back.
    S.phase = 'idle';
    render();
  }

  function nextFromPageTwo() {
    if (pageThreeHasWork()) {
      S.skipped.delete(3);
      goTo(3);
    } else {
      S.skipped.add(3);
      void handoff();
    }
  }

  /* ------------------------------ Rendering ------------------------------ */

  function withFocus(fn, focusHeading) {
    const active = doc.activeElement;
    const id = active && root.contains(active) ? active.id : null;
    const start = id && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    const top = pane.scrollTop;
    fn();
    if (focusHeading) {
      pane.scrollTop = 0;
      const heading = doc.getElementById('setup-h');
      if (heading) heading.focus({ preventScroll: true });
      return;
    }
    pane.scrollTop = top;
    if (id) {
      const next = doc.getElementById(id);
      if (next && next !== doc.activeElement) {
        next.focus({ preventScroll: true });
        if (start !== null && typeof next.setSelectionRange === 'function') {
          try { next.setSelectionRange(start, start); } catch { /* Not a text field. */ }
        }
      }
    }
  }

  function render(focusHeading = false) {
    if (destroyed || chrome.isDetailsOpen()) return;
    withFocus(() => {
      renderRail();
      pane.innerHTML = [null, pageOne, pageTwo, pageThree][S.page]();
      renderFoot();
    }, focusHeading);
    chrome.tick();
  }
  const renderPage = () => render(false);

  function showRow(id) {
    if (!id) return;
    const node = pane.querySelector(`[data-row="${id}"]`);
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
  }

  function renderRail() {
    const hasOllama = S.picks.has('ollama');
    const all = [
      { n: 1, title: T('Choose tools', '選擇工具'), note: T('Changes nothing', '不會動到你的電腦') },
      { n: 2, title: T('Check this computer', '檢查這台電腦'), note: T('Runs only what you tick', '只執行你勾選的') },
      { n: 3, title: hasOllama ? T('Sign in and models', '登入與模型') : T('Sign in', '登入'), note: T('In a real terminal', '在真的終端機裡登入') },
      { n: 4, title: T('Your account', '你的帳號'), note: T('Created at the last step', '最後一步才建立') },
      { n: 5, title: T('Catlas and start', 'Catlas 與開始'), note: T('Lists what happens first', '開始前會列出會做的事') },
    ];
    const steps = S.setupComplete ? all.slice(0, 3) : all;
    const locked = ['applying', 'handoff', 'pulling', 'saving'].includes(S.phase);
    chrome.setSteps(steps.map((step) => ({
      ...step,
      state: S.page === step.n ? 'current' : S.page > step.n ? 'done' : 'future',
      skipped: S.skipped.has(step.n),
      enabled: S.page > step.n && !S.skipped.has(step.n) && !locked,
    })));
    chrome.setNote('Catlas', S.picks.size ? T(`${S.picks.size} chosen`, `已選 ${S.picks.size} 項工具`) : T('No tools yet', '還沒選工具'));
    chrome.setBusy(S.phase !== 'idle');
  }

  function renderFoot() {
    if (chrome.isDetailsOpen()) return;
    foot.innerHTML = [null, pageOneFoot, pageTwoFoot, pageThreeFoot][S.page]();
    chrome.setBusy(S.phase !== 'idle');
  }

  function detailsLink(key, cls = 'more') {
    return `<button type="button" class="${cls}" id="details-${E(key.replace(/[^a-z0-9]+/gi, '-'))}" data-act="open-details" data-arg="${E(key)}">${E(T('Show details', '顯示詳細資料'))}</button>`;
  }
  function alertHtml({ tone = '', title, body, actions = '' }) {
    return `<div class="alert ${tone}" role="alert"><div class="alert-text"><strong>${E(title)}</strong>${body ? `<span>${body}</span>` : ''}</div>${actions ? `<div class="alert-actions">${actions}</div>` : ''}</div>`;
  }

  /* ------------------------------ Page 1 ------------------------------ */

  const langSelect = () => `<select class="input lang" id="setup-lang" aria-label="${E(T('Display language', '顯示語言'))}" data-change="lang">
      <option value="zh-TW" ${S.lang === 'zh-TW' ? 'selected' : ''}>繁體中文</option>
      <option value="en" ${S.lang === 'en' ? 'selected' : ''}>English</option>
    </select>`;

  function pickCard(id) {
    const tool = TOOLS[id];
    if (!tool) return '';
    const sub = tool.kind === 'npm' ? T('Needs Node.js', '需要 Node.js')
      : tool.kind === 'native' ? T('Official installer', '官方安裝程式')
        : id === 'ollama' ? T('Runs models on this computer', '模型在這台電腦上執行') : T('Connects to a running gateway', '連到已在執行的閘道');
    return `<label class="pick" data-provider="${E(id)}"><input type="checkbox" id="pick-${E(id)}" data-change="pick" data-arg="${E(id)}" ${S.picks.has(id) ? 'checked' : ''}><strong>${E(tool.label)}</strong><small>${E(sub)}</small></label>`;
  }

  function pageOne() {
    const head = `<div class="head"><h1 id="setup-h" tabindex="-1">${E(T('Which AI tools do you want to use?', '你想用哪些 AI 工具？'))}</h1>${langSelect()}</div>
      <p class="lead">${E(T('Tick the ones you want. This page runs nothing and scans nothing, and you can change it later in Settings.', '勾選想用的就好。這一頁不會執行或掃描任何東西，之後也能在設定裡改。'))}</p>`;
    if (S.catalog === 'slow') {
      return `${head}<div class="picks" aria-busy="true" aria-label="${E(T('Loading tools', '正在載入工具'))}">${'<div class="skeleton"></div>'.repeat(4)}</div>`;
    }
    if (S.catalog === 'fail') {
      return head + alertHtml({
        title: T('Could not load the list of tools', '讀不到工具清單'),
        body: E(T('Cats Runtime did not answer. Nothing on this computer changed. Try again.', 'Cats Runtime 沒有回應，這台電腦沒有任何變更。請再試一次。')),
        actions: `${detailsLink('catalog-fail')}<button type="button" class="btn small" id="catalog-retry" data-act="catalog-retry" ${S.reloading ? 'disabled' : ''}>${E(S.reloading ? T('Trying…', '重試中…') : T('Try again', '再試一次'))}</button>`,
      });
    }
    let banner = '';
    if (S.catalog === 'lost') {
      banner = alertHtml({
        tone: 'warn', title: T('Lost the connection to Cats Runtime', '和 Cats Runtime 的連線中斷了'),
        body: E(T('Your ticks are kept. Reconnect before checking this computer.', '你的勾選都還在。重新連上後才能檢查這台電腦。')),
        actions: `${detailsLink('catalog-lost')}<button type="button" class="btn small" id="catalog-retry" data-act="catalog-retry" ${S.reloading ? 'disabled' : ''}>${E(S.reloading ? T('Reconnecting…', '連線中…') : T('Reconnect', '重新連線'))}</button>`,
      });
    } else if (S.catalog === 'invalid') {
      banner = alertHtml({
        tone: 'warn', title: T('The saved tool settings could not be read', '讀不懂已儲存的工具設定'),
        body: `<span class="cmd">providers.yaml</span> ${E(T('is not valid. Checking this computer replaces it with what you tick here, and keeps a backup of the old file.', '有問題。按「檢查這台電腦」會用這裡的勾選取代它，舊檔會留一份備份。'))}`,
        actions: detailsLink('catalog-invalid'),
      });
    } else if (S.catalog === 'changed') {
      banner = alertHtml({
        tone: 'warn', title: T('These settings were changed somewhere else', '工具設定在別的地方被改了'),
        body: E(T('Another window or a person edited the file. Reloading shows what is saved now and drops your ticks here.', '可能是另一個視窗或有人改了設定檔。重新讀取會顯示目前存的內容，這裡的勾選會被取代。')),
        actions: `${detailsLink('catalog-changed')}<button type="button" class="btn small" id="catalog-reload" data-act="catalog-reload" ${S.reloading ? 'disabled' : ''}>${E(T('Reload', '重新讀取'))}</button>`,
      });
    } else if (S.catalog === 'partial') {
      banner = alertHtml({
        title: T('Your choices are saved, but Cats Runtime did not reload them', '選擇已經存好，但 Cats Runtime 沒有重新載入'),
        body: E(T('You do not need to choose again. Nothing on this computer changed.', '不需要重選，這台電腦也沒有任何變更。')),
        actions: `${detailsLink('save-failed')}<button type="button" class="btn small" id="save-retry" data-act="go-check">${E(T('Try again', '再試一次'))}</button>`,
      });
    } else if (S.catalog === 'savefail') {
      banner = alertHtml({
        title: T('Your choices were not saved', '選擇沒有存好'),
        body: E(T('Your ticks are kept and nothing on this computer changed. Try again.', '你的勾選都還在，這台電腦也沒有任何變更。請再試一次。')),
        actions: `${detailsLink('save-failed')}<button type="button" class="btn small" id="save-retry" data-act="catalog-saved-retry">${E(T('Try again', '再試一次'))}</button>`,
      });
    } else if (S.notice === 'handoff') {
      banner = handoffAlert();
    }
    const shown = ORDER.filter((id) => S.expanded || PRIMARY.includes(id) || S.picks.has(id));
    const hiddenCount = ORDER.length - shown.length;
    const toggle = !S.expanded && hiddenCount
      ? `<button type="button" class="pick-more" id="pick-more" data-act="pick-more">${E(T(`Show ${hiddenCount} more`, `顯示其他 ${hiddenCount} 項`))}</button>`
      : '';
    const custom = CUSTOM.length
      ? `<p class="footnote">${E(T(`${CUSTOM.length} other configured target(s) stay as they are. Change them in Settings.`, `另外 ${CUSTOM.length} 個已設定的目標會維持原樣，可以到設定修改。`))}</p>`
      : '';
    return `${head}${banner}
      <div class="block"><div class="label-line"><p class="group-label">${E(T('AI agents (CLI)', 'AI 代理工具（CLI）'))}</p>${S.expanded ? `<button type="button" class="more" id="pick-more" data-act="pick-more">${E(T('Show fewer', '顯示較少'))}</button>` : ''}</div>
      <div class="picks">${shown.map(pickCard).join('')}${toggle}</div></div>
      <div class="pick-pair">
        <div><p class="group-label">${E(T('Models on this computer', '在這台電腦上跑模型'))}</p><div class="picks">${pickCard('ollama')}</div></div>
        <div><p class="group-label">${E(T('Connect to a service', '連線到服務'))}</p><div class="picks">${pickCard('openclaw')}</div></div>
      </div>${custom}`;
  }

  /** One per row, plus Runtime's scan of the chosen tools. */
  function checksPlanned() {
    return rowIds().filter((id) => !isConnection(id) && helperOf(id)).length + (scanTargets().length ? 1 : 0);
  }

  function pageOneFoot() {
    const blocked = !['ready', 'invalid', 'partial', 'savefail'].includes(S.catalog);
    const saving = S.phase === 'saving' || S.phase === 'handoff';
    if (S.picks.size === 0) {
      return `<p class="hint">${E(T('You can add tools later in Settings. Chats and Catlas need one before they can answer.', '可以之後在設定加入。聊天和 Catlas 要有工具才能回話。'))}</p>
        <button type="button" class="btn" id="go-check" data-act="go-check" ${blocked || saving ? 'disabled' : ''}>${E(saving ? T('Continuing…', '繼續中…') : T('Continue without tools', '不選工具，直接繼續'))}</button>`;
    }
    const count = checksPlanned();
    return `<p class="hint">${E(T(`Saves your choices, then runs up to ${count} read-only checks. Nothing on this computer changes.`, `會儲存你的選擇，再做最多 ${count} 項唯讀檢查，不會變更這台電腦。`))}</p>
      <button type="button" class="btn primary" id="go-check" data-act="go-check" ${blocked || saving ? 'disabled' : ''}>${E(saving ? T('Saving…', '儲存中…') : T('Check this computer', '檢查這台電腦'))}</button>`;
  }

  /* ------------------------------ Page 2 ------------------------------ */

  function plainRow(id, depCls, glyph, state, note) {
    return `<li class="row ${depCls}" data-row="${E(id)}"><div class="row-top"><span class="glyph">${glyph}</span>
      <div class="row-text"><strong>${E(rowLabel(id))}</strong>${isOptional(id) ? `<em>${E(T('(optional)', '（選用）'))}</em>` : ''}${note ? `<p>${E(note)}</p>` : ''}</div>
      <span class="row-state">${state}</span></div></li>`;
  }

  function stagesHtml(bad) {
    const o = S.ollama;
    const hasModel = o.models.length > 0;
    const stage = (label, done, now) => `<span class="stage ${done ? 'done' : now ? (bad ? 'bad' : 'now') : ''}"><i></i>${E(label)}</span>`;
    return `<div class="stages" aria-label="${E(T('Ollama setup stages', 'Ollama 設定進度'))}">
      ${stage(T('Install', '安裝'), o.installed, !o.installed)}
      ${stage(T('Start the service', '啟動服務'), o.running, o.installed && !o.running)}
      ${stage(T('Get a model', '準備模型'), hasModel, o.running && !hasModel)}
    </div>`;
  }

  function detailsHtml(id) {
    const row = S.rows[id] || {};
    const fact = factsOf(id);
    const helper = helperOf(id);
    const copied = S.copied === `manual:${id}`;
    const parts = [];
    if (row.error) parts.push(`<dt>${E(T('Reason', '原因'))}</dt><dd class="mono" style="font-size:12px">${E(row.error)}</dd>`);
    if (row.planned && row.planned.length) parts.push(`<dt>${E(T('It will', '它會'))}</dt><dd>${row.planned.map((line) => `<div>${E(line)}</div>`).join('')}</dd>`);
    if (helper && helper.commands && helper.commands.apply) parts.push(`<dt>${E(T('Runs', '實際執行'))}</dt><dd><span class="cmd">${E(helper.commands.apply)}</span></dd>`);
    if (helper && helper.sha256) parts.push(`<dt>${E(T('Script', '腳本'))}</dt><dd title="${E(helper.sha256)}">${E(T(`${helper.file}, SHA-256 ${helper.sha256.slice(0, 8)}…`, `${helper.file}，SHA-256 ${helper.sha256.slice(0, 8)}…`))}</dd>`);
    if (fact.manual) parts.push(`<dt>${E(T('By hand', '自己來'))}</dt><dd class="with-copy"><span class="cmd">${E(fact.manual)}</span><button type="button" class="more" id="copy-manual-${E(id)}" data-act="copy-manual" data-arg="${E(id)}">${E(copied ? T('Copied', '已複製') : T('Copy', '複製'))}</button></dd>`);
    if (row.manual && row.manual.length) parts.push(`<dt>${E(T('Next', '下一步'))}</dt><dd>${row.manual.map((line) => `<div>${E(line)}</div>`).join('')}</dd>`);
    return `<div class="details"><dl>${parts.join('')}</dl></div>`;
  }

  function tagsHtml(id, extra = '') {
    const open = S.details.has(id);
    return `<div class="tags">${factsOf(id).tags.map((tag) => `<span class="tag ${tag.danger ? 'danger' : ''}">${E(tag.text)}</span>`).join('')}
      <button type="button" class="more" id="more-${E(id)}" aria-expanded="${open}" data-act="details" data-arg="${E(id)}">${E(open ? T('Hide', '收起') : T('What it does', '它會做什麼'))}</button>${extra}</div>`;
  }

  function connectionRow(id, depCls) {
    const conn = S.conn[id];
    const label = id === 'ollama' ? T('Ollama on another computer', '另一台電腦上的 Ollama') : TOOLS[id] ? TOOLS[id].label : id;
    const glyph = conn.state === 'connected' ? ICON.check : conn.state === 'failed' ? ICON.cross : conn.state === 'testing' ? '<span class="spinner"></span>' : ICON.wait;
    const state = conn.state === 'connected' ? `<span class="row-state ok">${E(T('Connected', '已連線'))}</span>`
      : conn.state === 'failed' ? `<span class="row-state bad">${E(T('Could not connect', '連線失敗'))}</span>`
        : conn.state === 'testing' ? `<span class="row-state">${E(T('Testing…', '測試中…'))}</span>`
          : `<span class="row-state">${E(conn.changed ? T('Address changed, test again', '位址改了，請重新測試') : T('Not tested', '尚未測試'))}</span>`;
    const body = id === 'openclaw'
      ? T('Cats connects to a gateway that is already running; nothing is installed. Checking this computer does not touch this address.', 'Cats 會連到已在執行的閘道，不會安裝任何東西。檢查這台電腦時不會碰這個位址。')
      : T('Cats uses Ollama on this address and installs nothing here. It answers with the models that computer has.', 'Cats 會用這個位址上的 Ollama，這台電腦不會安裝任何東西。可用的模型由那台電腦決定。');
    return `<li class="row ${depCls} ${conn.state === 'failed' ? 'is-failed' : ''}" data-row="${E(id)}">
      <div class="row-top"><span class="glyph">${glyph}</span>
        <div class="row-text"><strong>${E(label)}</strong><p>${E(body)}</p></div>${state}</div>
      <div class="addr"><input class="input" id="addr-${E(id)}" data-input="address" data-arg="${E(id)}" value="${E(conn.address)}" placeholder="${E(ADDRESS_DEFAULT[id])}" spellcheck="false" aria-label="${E(T('Address', '連線位址'))}" aria-invalid="${conn.state === 'invalid'}" ${conn.state === 'testing' ? 'disabled' : ''}>
        <button type="button" class="btn small" id="test-${E(id)}" data-act="test" data-arg="${E(id)}" ${conn.state === 'testing' || S.phase !== 'idle' ? 'disabled' : ''}>${E(T('Test connection', '測試連線'))}</button>
        ${id === 'ollama' ? `<button type="button" class="more" id="ollama-local" data-act="ollama-remote" data-arg="off" ${S.phase !== 'idle' ? 'disabled' : ''}>${E(T('Use this computer', '改回這台電腦'))}</button>` : ''}</div>
      ${conn.state === 'invalid' ? `<p class="addr-error" role="alert">${E(conn.error)}</p>` : ''}
      ${conn.state === 'failed' ? `<p class="addr-error" role="alert">${E(T(`Could not reach ${conn.address}. Check that it is running and this computer can reach it. The log has the reason.`, `連不上 ${conn.address}。請確認它正在執行，而且這台電腦連得到。原因寫在記錄裡。`))}</p><div class="row-actions">${detailsLink(`conn:${id}`)}</div>` : ''}
    </li>`;
  }

  function stepRow(id, depCls) {
    if (isConnection(id)) return connectionRow(id, depCls);
    const row = S.rows[id] || { kind: 'pending' };
    const fact = factsOf(id);
    const optional = isOptional(id) ? `<em>${E(T('(optional)', '（選用）'))}</em>` : '';
    const systemAdvice = S.systemRestarts.has(id) ? `<p>${E(T('Restart Windows to finish installation.', '請重新啟動 Windows 以完成安裝。'))}</p>` : '';
    const open = S.details.has(id);
    const elevates = helperOf(id) && helperOf(id).requiresElevation;
    if (row.kind === 'pending') return plainRow(id, depCls, '', E(T('Waiting', '等待中')));
    if (row.kind === 'checking') return plainRow(id, depCls, '<span class="spinner"></span>', E(T('Checking', '檢查中')));
    if (id === S.running) {
      return plainRow(id, depCls, '<span class="spinner"></span>', '<span data-elapsed></span>',
        elevates ? T('Windows asks for permission; choose Yes. This updates when the installer ends.', 'Windows 會跳出權限視窗，請選「是」。安裝程式結束後這裡才會更新。') : T(`Running ${helperOf(id).file}`, `正在執行 ${helperOf(id).file}`));
    }
    if (S.queue.includes(id)) return plainRow(id, depCls, ICON.wait, E(T('Queued', '排隊中')));
    if (row.kind === 'ready') {
      if (id === 'ollama') {
        const count = S.ollama.models.length;
        return `<li class="row is-ready ${depCls}" data-row="${E(id)}"><div class="row-top"><span class="glyph">${ICON.check}</span>
          <div class="row-text"><strong>Ollama</strong>${count ? '' : `<p>${E(T('It has no models yet. The next page can download one.', '還沒有模型。下一頁可以下載第一個。'))}</p>`}</div>
          <span class="row-state ${count ? 'ok' : 'attn'}">${E(count ? T(`${count} model(s)`, `${count} 個模型`) : T('No models yet', '還沒有模型'))}</span></div>${stagesHtml(false)}</li>`;
      }
      return `<li class="row is-ready ${depCls}" data-row="${E(id)}"><div class="row-top"><span class="glyph">${ICON.check}</span>
        <div class="row-text"><strong>${E(fact.title)}</strong>${optional}${systemAdvice}</div>
        <span class="row-state ok">${E(S.applied.has(id) ? T('Just finished', '剛完成') : T('Ready', '就緒'))}${row.version ? `<span class="version">${E(row.version)}</span>` : ''}</span></div>${row.manual && row.manual.length ? `<div class="row-actions">${row.manual.map((line) => `<span class="hint-inline">${E(line)}</span>`).join('')}</div>` : ''}</li>`;
    }
    if (row.kind === 'waiting') {
      return `<li class="row is-waiting ${depCls}" data-row="${E(id)}"><div class="row-top"><span class="glyph">${ICON.wait}</span>
        <div class="row-text"><strong>${E(fact.title)}</strong><p>${E(T('Waits for Node.js. Once it works, this lists what it would do, for you to tick.', '等 Node.js 好了，這裡才會列出要做的事讓你勾選。'))}</p></div></div></li>`;
    }
    if (row.kind === 'manual') {
      const docs = id === 'ollama' ? 'https://ollama.com/download' : TOOLS[id] && TOOLS[id].docs;
      const notes = row.manual && row.manual.length ? row.manual : [];
      const remote = id === 'ollama' ? `<button type="button" class="more" id="ollama-remote" data-act="ollama-remote" data-arg="on">${E(T('Use Ollama on another computer', '改用另一台電腦上的 Ollama'))}</button>` : '';
      return `<li class="row ${depCls}" data-row="${E(id)}"><div class="row-top"><span class="glyph">${ICON.wait}</span>
        <div class="row-text"><strong>${E(fact.title)}</strong>${optional}<p>${E(T('Cats has no installer for this on this computer, so there is nothing to tick. Install it yourself, then check again.', 'Cats 在這台電腦上沒有它的安裝腳本，所以沒有東西可勾。請自己安裝後再檢查一次。'))}</p>${notes.map((line) => `<p>${E(line)}</p>`).join('')}</div>
        <span class="row-state attn">${E(T('Install it yourself', '要自己安裝'))}</span></div>
        <div class="row-actions">${docs ? `<a href="${E(docs)}" target="_blank" rel="noopener noreferrer">${E(T('Install guide', '安裝說明'))}</a>` : ''}${remote}</div>
        ${id === 'ollama' ? stagesHtml(false) : ''}</li>`;
    }
    if (row.kind === 'restart') {
      return `<li class="row is-failed ${depCls}" data-row="${E(id)}"><div class="row-top"><span class="glyph">${ICON.wait}</span>
        <div class="row-text"><strong>${E(fact.title)}</strong>${optional}${systemAdvice || `<p>${E(T('Installed, but Cats cannot find it yet. Check again first. If that does not help, restart Cats.', '已經安裝，但 Cats 還找不到它。請先再檢查一次；還是不行再重新啟動 Cats。'))}</p>`}</div>
        <span class="row-state attn">${E(T('Not found yet', '還找不到'))}</span></div><div class="row-actions">${detailsLink(`row:${id}`)}</div></li>`;
    }
    if (row.kind === 'checkFailed') {
      const text = row.timeout ? T('The check did not finish in time. Nothing changed. Check it again, or set it up yourself.', '檢查逾時沒有結束，沒有任何變更。可以再檢查一次，或自己處理。') : T('Its check could not run, so nothing is known about it. Nothing changed. Other rows are not affected.', '這一項的檢查沒有跑成，所以狀態不明，也沒有任何變更。其他項目不受影響。');
      return `<li class="row is-failed ${depCls}" data-row="${E(id)}"><div class="row-top"><span class="glyph">${ICON.cross}</span>
        <div class="row-text"><strong>${E(fact.title)}</strong>${optional}<p>${E(text)}</p>${systemAdvice}</div>
        <span class="row-state bad">${E(T('Cannot check', '無法檢查'))}</span></div>
        <div class="row-actions"><button type="button" class="btn small" id="recheck-${E(id)}" data-act="recheck-row" data-arg="${E(id)}" ${S.phase !== 'idle' ? 'disabled' : ''}>${E(T('Check this again', '再檢查這一項'))}</button><button type="button" class="more" id="more-${E(id)}" aria-expanded="${open}" data-act="details" data-arg="${E(id)}">${E(open ? T('Hide', '收起') : T('What happened', '發生了什麼'))}</button>${detailsLink(`row:${id}`)}</div>
        ${open ? detailsHtml(id) : ''}</li>`;
    }
    if (row.kind === 'failed' || row.kind === 'declined') {
      const text = row.kind === 'declined'
        ? T('You chose No in the permission prompt, so nothing changed.', '你在權限視窗選了「否」，所以沒有任何變更。')
        : row.human || T('It did not finish. The log below says why.', '沒有完成，原因寫在下方記錄裡。');
      return `<li class="row is-failed ${depCls}" data-row="${E(id)}"><div class="row-top"><span class="glyph">${ICON.cross}</span>
        <div class="row-text"><strong>${E(fact.title)}</strong>${optional}<p>${E(text)}</p>${systemAdvice}</div>
        <span class="row-state bad">${E(row.kind === 'declined' ? T('Not installed', '尚未安裝') : T('Did not finish', '沒有完成'))}</span></div>
        ${id === 'ollama' ? stagesHtml(true) : ''}${tagsHtml(id, detailsLink(`row:${id}`))}${open ? detailsHtml(id) : ''}</li>`;
    }
    const remoteLink = id === 'ollama' ? `<div class="row-actions"><button type="button" class="more" id="ollama-remote" data-act="ollama-remote" data-arg="on" ${S.phase !== 'idle' ? 'disabled' : ''}>${E(T('Use Ollama on another computer instead', '改用另一台電腦上的 Ollama'))}</button></div>` : '';
    return `<li class="row is-needs ${depCls}" data-row="${E(id)}"><div class="row-top"><label>
        <input type="checkbox" id="tick-${E(id)}" data-change="tick" data-arg="${E(id)}" ${S.ticked.has(id) ? 'checked' : ''} ${S.phase !== 'idle' ? 'disabled' : ''}>
        <span class="row-text"><strong>${E(fact.title)}</strong>${optional}<span class="p">${E(fact.summary)}</span></span></label></div>
      ${id === 'ollama' ? stagesHtml(false) : ''}${tagsHtml(id)}${open ? detailsHtml(id) : ''}${remoteLink}</li>`;
  }

  function pageTwoTitle() {
    const stopped = stoppedRow();
    const pending = pendingRows();
    if (S.phase === 'checking') return [T('Checking this computer', '正在檢查這台電腦'), T('This only reads what is there and changes nothing. Back stops it, if you want other tools.', '這只會讀取目前的狀態，不會變更任何東西。想換工具可以按「返回」停止。')];
    if (S.phase === 'applying') return [T('Applying what you ticked', '正在套用你勾選的項目'), T('One at a time, with a fresh check after each. This window cannot close until it finishes.', '一次一項，每項做完都會重新檢查。完成前無法關閉這個視窗。')];
    if (S.pageError) return [T('The check did not finish', '檢查沒有跑完'), T('Your choices are saved and nothing on this computer changed.', '選擇已經存好，這台電腦沒有任何變更。')];
    if (stopped && S.rows[stopped].kind === 'restart') return S.systemRestarts.has(stopped)
      ? [T('Windows needs a restart', '需要重新啟動 Windows'), T('Restart Windows to finish installation. You can check again or leave this for later.', '請重新啟動 Windows 以完成安裝。也可以再檢查一次，或之後再處理。')]
      : [T(`Cannot find ${rowLabel(stopped)} yet`, `還找不到 ${rowLabel(stopped)}`), T('Check again first. Your choices stay if Cats has to restart.', '請先再檢查一次。就算要重新啟動 Cats，你的選擇也都還在。')];
    if (stopped && retryQueue(stopped).length) return [T(`${rowLabel(stopped)} did not finish`, `${rowLabel(stopped)} 沒有完成`), queueOf().length ? T('What comes after it has not run, and your ticks are kept. Try again, set it up yourself, or skip it for now.', '後面的項目還沒執行，勾選都留著。可以重試、自己處理，或先跳過它。') : T('Try again, set it up yourself, or skip it for now.', '可以重試、自己處理，或先跳過它。')];
    if (stopped) return [T(`Cannot check ${rowLabel(stopped)}`, `無法檢查 ${rowLabel(stopped)}`), T('Its script did not run. You can still apply the other rows.', '它的腳本沒有跑成。其他項目還是可以套用。')];
    if (pending.length) return [T(`${pending.length} left before these tools are ready`, `還有 ${pending.length} 項要處理，這些工具才能用`), T('Tick what Cats should do. Nothing unticked runs. You can also set things up yourself and check again, or leave them for later.', '勾選要讓 Cats 做的事，沒勾的不會執行。也可以自己處理後再檢查，或之後再說。')];
    if (S.applied.size) return [T('This computer is ready', '這台電腦準備好了'), T(`Changed ${S.applied.size} item(s). The log below has the details.`, `這次改了 ${S.applied.size} 項，細節都在下方記錄裡。`)];
    return [T('This computer is ready', '這台電腦準備好了'), T('Nothing needed installing, and nothing here changed.', '不需要安裝，這台電腦沒有任何變更。')];
  }

  function pageTwo() {
    const [title, lead] = pageTwoTitle();
    const handoffNote = S.handoffError ? handoffAlert() : '';
    if (S.pageError) {
      return `<h1 id="setup-h" tabindex="-1">${E(title)}</h1><p class="lead">${E(lead)}</p>${handoffNote}${alertHtml({
        title: T('Cats Runtime stopped answering during the check', '檢查途中 Cats Runtime 沒有回應'),
        body: E(T('This does not mean your tools are missing. Try again; the log below has the details.', '這不代表你的工具沒安裝。請再試一次，下方記錄有細節。')),
        actions: `${detailsLink('scan')}<button type="button" class="btn small" id="scan-retry" data-act="recheck">${E(T('Check again', '再檢查一次'))}</button>`,
      })}`;
    }
    const shortcut = tickableRequired();
    const allTicked = shortcut.length > 0 && shortcut.every((id) => S.ticked.has(id));
    const tools = S.phase === 'idle' && shortcut.length >= 2
      ? `<p class="tick-line" style="margin:-6px 0 8px"><button type="button" class="more" id="tick-all" data-act="tick-all">${E(allTicked ? T('Untick all required', '取消全部勾選') : T(`Tick all ${shortcut.length} required`, `勾選全部 ${shortcut.length} 項必要項目`))}</button></p>`
      : '';
    const stored = S.lastChecked && S.phase === 'idle'
      ? `<p class="footnote stored" style="margin:-8px 0 10px !important">${E(T(`Results from your last check, ${new Date(S.lastChecked).toLocaleString('en')}. Nothing has run since you opened this page.`, `這是上次檢查的結果（${new Date(S.lastChecked).toLocaleString('zh-TW')}）。打開這一頁之後還沒有執行任何東西。`))}</p>`
      : '';
    const groups = layout().map((group) => {
      const unlocked = group.root && S.rows[group.root] && S.rows[group.root].kind === 'ready';
      const rows = group.rows.map((id, index) => {
        let dep = '';
        if (group.root && id === group.root) dep = 'dep-root';
        else if (group.root) dep = index === group.rows.length - 1 ? 'dep last' : 'dep';
        return stepRow(id, dep);
      }).join('');
      return `<div class="block"><p class="group-label">${E(group.title)}</p><ul class="rows ${unlocked ? 'unlocked' : ''}" aria-busy="${S.phase !== 'idle'}">${rows}</ul></div>`;
    }).join('');
    return `<h1 id="setup-h" tabindex="-1">${E(title)}</h1><p class="lead">${E(lead)}</p>${handoffNote}${stored}${tools}${groups}`;
  }

  function pageTwoFoot() {
    const back = `<button type="button" class="btn" id="back" data-act="back" ${['applying', 'handoff', 'testing'].includes(S.phase) ? 'disabled' : ''}>${E(T('Back', '返回'))}</button>`;
    const again = `<button type="button" class="btn" id="recheck" data-act="recheck" ${S.phase !== 'idle' ? 'disabled' : ''}>${E(T('Check again', '再檢查一次'))}</button>`;
    if (S.phase === 'checking') return `<p class="hint"></p>${back}<button type="button" class="btn primary" disabled>${E(T('Checking…', '檢查中…'))}</button>`;
    if (S.phase === 'applying') {
      return `<p class="hint">${E(S.stopAfter ? T('Stops after this one.', '這項做完就會停。') : '')}</p>
        <button type="button" class="btn" id="stop-after" data-act="stop-after" ${S.stopAfter ? 'disabled' : ''}>${E(T('Stop after this one', '這項做完就停'))}</button>
        <button type="button" class="btn primary" disabled>${E(T('Applying…', '套用中…'))}</button>`;
    }
    const opening = S.phase === 'handoff' || S.phase === 'testing';
    if (S.pageError) return `<p class="hint"></p>${back}<button type="button" class="btn" id="skip-next" data-act="next2" ${opening ? 'disabled' : ''}>${E(T('Skip for now', '先跳過'))}</button>`;
    const stopped = stoppedRow();
    if (stopped && S.rows[stopped].kind === 'restart') {
      return `<p class="hint"></p>${S.systemRestarts.has(stopped) ? '' : `<button type="button" class="btn" id="restart-app" data-act="restart-app">${E(T('Restart Cats', '重新啟動 Cats'))}</button>`}
        <button type="button" class="btn" id="next" data-act="next2" ${opening ? 'disabled' : ''}>${E(T('Skip for now', '先跳過'))}</button>
        <button type="button" class="btn primary" id="recheck" data-act="recheck">${E(T('Check again', '再檢查一次'))}</button>`;
    }
    const retry = retryQueue(stopped);
    if (retry.length) {
      return `<p class="hint">${E(T('Skipping leaves it for later, in Settings.', '跳過的話，之後可以在設定處理。'))}</p>${back}${again}
        <button type="button" class="btn" id="next" data-act="next2" ${opening ? 'disabled' : ''}>${E(T('Skip for now', '先跳過'))}</button>
        <button type="button" class="btn primary" id="retry" data-act="retry">${E(T('Try again', '重試'))}</button>`;
    }
    const queued = queueOf();
    if (queued.length) {
      const admin = queued.some((id) => helperOf(id) && helperOf(id).requiresElevation);
      return `<p class="hint">${E(admin ? T(`${queued.length} ticked. Your system will ask for administrator permission.`, `已勾選 ${queued.length} 項。系統會跳出系統管理員權限視窗。`) : T(`${queued.length} ticked.`, `已勾選 ${queued.length} 項。`))}</p>${back}${again}
        <button type="button" class="btn primary" id="apply" data-act="apply">${E(T(`Apply ${queued.length} ticked`, `套用 ${queued.length} 項`))}</button>`;
    }
    const pending = pendingRows();
    const hint = pending.length ? T(`${pending.length} not ready yet. You can finish them later in Settings.`, `${pending.length} 項還沒好，可以之後在設定完成。`) : '';
    return `<p class="hint">${E(hint)}</p>${back}${again}<button type="button" class="btn ${pending.length ? '' : 'primary'}" id="next" data-act="next2" ${!S.checked || opening ? 'disabled' : ''}>${E(opening ? T('Opening…', '開啟中…') : pending.length ? T('Skip for now, next', '先跳過，下一步') : T('Next', '下一步'))}</button>`;
  }

  /* ------------------------------ Page 3 ------------------------------ */

  function signInRow(id) {
    const tool = TOOLS[id];
    const auth = authState(id);
    const term = S.terminal[id];
    const command = S.facts && S.facts.signIn ? S.facts.signIn[id] : null;
    const changedPath = chrome.logTotals().changes > 0;
    const done = auth === 'signed_in' || auth === 'not_required';
    const glyph = done ? ICON.check : ICON.wait;
    const state = auth === 'signed_in' ? `<span class="row-state ok">${E(T('Signed in', '已登入'))}</span>`
      : auth === 'not_required' ? `<span class="row-state ok">${E(T('No sign-in needed', '不需要登入'))}</span>`
        : auth === 'required' ? `<span class="row-state attn">${E(T('Not signed in', '尚未登入'))}</span>`
          : `<span class="row-state">${E(T('Cannot tell', '無法得知'))}</span>`;
    let body = '';
    if (auth === 'required') body = T('Sign in in a real terminal. Cats only asks the CLI whether it is signed in and reads no credential files.', '請在真的終端機裡登入。Cats 只會問 CLI 是否已登入，不會讀取憑證檔。');
    if (auth === 'unknown') body = T('This CLI does not report whether it is signed in. Run this once if it is not; if it is, you need not.', '這個 CLI 不會回報是否已登入。還沒登入就執行一次；已登入就不用。');
    if (!done && changedPath) body += T(' Terminals already open need reopening to see the new PATH.', ' 已經開著的終端機要重開，才看得到新的 PATH。');
    let actions = '';
    if (!done) {
      if (command) {
        const copied = S.copied === `signin:${id}`;
        actions = `<div class="row-actions"><span class="cmd">${E(command)}</span>
          <button type="button" class="more" id="copy-signin-${E(id)}" data-act="copy-signin" data-arg="${E(id)}">${E(copied ? T('Copied', '已複製') : T('Copy', '複製'))}</button>
          <button type="button" class="btn small" id="terminal-${E(id)}" data-act="terminal" data-arg="${E(id)}" ${S.phase !== 'idle' ? 'disabled' : ''}>${E(T('Open terminal and run', '開啟終端機並執行'))}</button>
          ${id === 'claude' ? `<button type="button" class="btn small" id="signin-recheck-${E(id)}" data-act="signin-recheck" data-arg="${E(id)}" ${S.phase !== 'idle' ? 'disabled' : ''}>${E(T('Check again', '再檢查一次'))}</button>` : ''}
          ${term === 'opened' ? `<span class="hint-inline">${E(T('Terminal opened.', '終端機已開啟。'))}</span>` : ''}
          ${term === 'missing' ? `<span class="hint-inline bad" role="alert">${E(T('No terminal was found. Copy the command and run it in yours.', '找不到終端機。請複製指令，到你自己的終端機執行。'))}</span>${detailsLink(`terminal:${id}`)}` : ''}</div>`;
      } else {
        actions = `<div class="row-actions"><span class="hint-inline">${E(tool.authHint || '')}</span>${tool.docs ? `<a href="${E(tool.docs)}" target="_blank" rel="noopener noreferrer">${E(T('Sign-in guide', '登入說明'))}</a>` : ''}</div>`;
      }
    }
    return `<li class="row ${done ? 'is-ready' : ''}" data-row="signin-${E(id)}"><div class="row-top"><span class="glyph">${glyph}</span>
      <div class="row-text"><strong>${E(tool.label)}</strong>${body ? `<p>${E(body)}</p>` : ''}</div>${state}</div>${actions}</li>`;
  }

  function ollamaModelRow() {
    const o = S.ollama;
    const pull = S.pull;
    if (o.models.length) {
      return `<li class="row is-ready" data-row="ollama-model"><div class="row-top"><span class="glyph">${ICON.check}</span>
        <div class="row-text"><strong>${E(T('Ollama models', 'Ollama 模型'))}</strong><p class="mono" style="font-size:12px">${E(o.models.join(', '))}</p></div>
        <span class="row-state ok">${E(pull.state === 'done' ? T('Just downloaded', '剛下載完成') : T(`${o.models.length} model(s)`, `${o.models.length} 個模型`))}</span></div>${stagesHtml(false)}</li>`;
    }
    const running = pull.state === 'running';
    const failed = pull.state === 'failed';
    const percent = pull.percent === null ? null : pull.percent;
    const state = running ? `<span class="row-state" id="pull-pct">${percent === null ? '' : `${percent}%`}</span>`
      : failed ? `<span class="row-state bad">${E(T('Did not finish', '沒有完成'))}</span>` : `<span class="row-state attn">${E(T('No models yet', '還沒有模型'))}</span>`;
    const suggestions = (S.facts && S.facts.ollamaSuggestions) || [];
    return `<li class="row ${failed ? 'is-failed' : ''}" data-row="ollama-model"><div class="row-top"><span class="glyph">${running ? '<span class="spinner"></span>' : failed ? ICON.cross : ICON.wait}</span>
      <div class="row-text"><strong>${E(T('Download a first model', '下載第一個模型'))}</strong>
      <p>${E(failed ? T('The download stopped. Try again; it continues where it left off.', '下載中斷了。可以重試，會從中斷的地方繼續。') : T('Ollama cannot answer until it has a model. Models can be several gigabytes, and you can skip this and do it later.', 'Ollama 要有模型才能回話。模型可能有好幾 GB，也可以先跳過，之後再下載。'))}</p></div>${state}</div>
      ${stagesHtml(failed)}${failed ? `<div class="row-actions">${detailsLink('pull')}</div>` : ''}
      ${running ? `<div class="bar" role="progressbar" ${percent === null ? '' : `aria-valuenow="${percent}"`} aria-valuemin="0" aria-valuemax="100"><i id="pull-bar" style="width:${percent === null ? 0 : percent}%"></i></div>
        <div class="row-actions"><button type="button" class="btn small" id="pull-cancel" data-act="pull-cancel">${E(T('Stop', '停止'))}</button><span class="hint-inline mono">${E(pull.name)}</span></div>`
        : `<div class="addr"><input class="input" id="pull-name" data-input="pull" value="${E(pull.name)}" placeholder="${E(T('Model name', '模型名稱'))}" spellcheck="false" aria-label="${E(T('Model name', '模型名稱'))}" aria-invalid="${pull.state === 'invalid'}">
          <button type="button" class="btn small" id="pull-start" data-act="pull-start">${E(failed ? T('Try again', '重試') : T('Download', '下載'))}</button></div>
          ${pull.state === 'invalid' ? `<p class="addr-error" role="alert">${E(pull.error)}</p>` : ''}
          ${suggestions.length ? `<div class="chips">${suggestions.map((name, index) => `<button type="button" class="chip" id="chip-${index}" aria-pressed="${pull.name === name}" data-act="pull-pick" data-arg="${E(name)}">${E(name)}</button>`).join('')}</div>` : ''}`}
    </li>`;
  }

  function handoffAlert() {
    return alertHtml({
      title: T('Cats could not open the next step', 'Cats 開不了下一步'),
      body: E(T('Cats Platform is not answering. Everything so far is kept, and you can try again.', 'Cats Platform 沒有回應。到目前為止的設定都留著，可以再試一次。')),
      actions: `${detailsLink('handoff')}<button type="button" class="btn small" id="handoff-retry" data-act="handoff">${E(T('Try again', '再試一次'))}</button>`,
    });
  }

  function pageThree() {
    const signIn = signInRows();
    const missing = ORDER.filter((id) => S.picks.has(id) && (!S.rows[id] || S.rows[id].kind !== 'ready'));
    const needsLead = signIn.length ? T('Cats only asks each CLI whether it is signed in, and reads no credential files. You can skip any of these and do it later.', 'Cats 只會問 CLI 是否已登入，不會讀取憑證檔。這些都可以先跳過，之後再做。') : T('You can skip this and do it later.', '可以先跳過，之後再做。');
    const rows = [...signIn.map(signInRow), ...(ollamaUsable() ? [ollamaModelRow()] : [])].join('');
    return `<h1 id="setup-h" tabindex="-1">${E(signIn.length ? (ollamaUsable() ? T('Sign in, and get a model', '登入，並準備模型') : T('Sign in to your tools', '登入你的工具')) : T('Get a model for Ollama', '幫 Ollama 準備模型'))}</h1>
      <p class="lead">${E(needsLead)}</p>${S.handoffError ? handoffAlert() : ''}<ul class="rows">${rows}</ul>
      ${missing.length ? `<p class="footnote">${E(T(`${list(missing.map((id) => TOOLS[id].label))} not installed yet, so not listed here. You can finish it later in Settings.`, `${list(missing.map((id) => TOOLS[id].label))} 還沒安裝，所以不在這裡。可以之後在設定完成。`))}</p>` : ''}`;
  }

  function pageThreeFoot() {
    const remaining = signInRows().filter((id) => authState(id) === 'required').length;
    const noModel = ollamaUsable() && !S.ollama.models.length;
    const hint = remaining
      ? T('You can finish these later. A tool that is not signed in cannot answer until it is.', '這些可以之後再做。工具沒登入之前無法回話。')
      : noModel ? T('You can do this later. Ollama cannot answer until it has a model.', '可以之後再做。Ollama 要有模型才能回話。') : '';
    const label = S.phase === 'handoff' ? T('Opening…', '開啟中…')
      : S.setupComplete ? T('Open Cats', '開啟 Cats') : T('Continue to your account', '繼續設定帳號');
    return `<p class="hint">${E(hint)}</p><button type="button" class="btn" id="back" data-act="back" ${S.phase === 'handoff' || S.phase === 'pulling' ? 'disabled' : ''}>${E(T('Back', '返回'))}</button>
      <button type="button" class="btn primary" id="go-account" data-act="handoff" ${S.phase !== 'idle' ? 'disabled' : ''}>${E(label)}</button>`;
  }

  /* ------------------------------ The reasons behind the details page ------------------------------ */

  function reasonFor(key) {
    const [kind, id] = key.split(/:(.*)/);
    const repair = (label, run) => ({ label, run });
    const tryAgain = T('Try again', '再試一次');
    switch (kind) {
      case 'catalog-fail':
        return { title: T('Could not load the list of tools', '讀不到工具清單'), body: T('Cats Runtime did not answer. Nothing on this computer changed.', 'Cats Runtime 沒有回應，這台電腦沒有任何變更。'), raw: S.catalogError, severity: 'error', repair: repair(tryAgain, () => reconnect()) };
      case 'catalog-lost':
        return { title: T('Lost the connection to Cats Runtime', '和 Cats Runtime 的連線中斷了'), body: T('Your ticks are kept. Reconnect before checking this computer.', '你的勾選都還在。重新連上後才能檢查這台電腦。'), raw: S.catalogError, severity: 'error', repair: repair(T('Reconnect', '重新連線'), () => reconnect()) };
      case 'catalog-invalid':
        return { title: T('The saved tool settings could not be read', '讀不懂已儲存的工具設定'), body: T('Checking this computer replaces the file with what you tick, and keeps a backup of the old one.', '按「檢查這台電腦」會用你的勾選取代這個檔案，舊檔會留一份備份。'), raw: S.snap ? S.snap.runtime.selection.error : null, extras: [[T('File', '檔案'), 'providers.yaml']], severity: 'warning', repair: null };
      case 'catalog-changed':
        return { title: T('These settings were changed somewhere else', '工具設定在別的地方被改了'), body: T('Reloading shows what is saved now and drops your ticks here.', '重新讀取會顯示目前存的內容，這裡的勾選會被取代。'), raw: S.catalogError || (S.snap ? S.snap.runtime.selection.error : null), severity: 'warning', repair: repair(T('Reload', '重新讀取'), () => reloadSaved()) };
      case 'save-failed':
        return { title: S.catalog === 'partial' ? T('Your choices are saved, but Cats Runtime did not reload them', '選擇已經存好，但 Cats Runtime 沒有重新載入') : T('Your choices were not saved', '選擇沒有存好'), body: T('Nothing on this computer changed.', '這台電腦沒有任何變更。'), raw: S.catalogError, severity: 'error', repair: repair(tryAgain, () => { void saveAndCheck(); }) };
      case 'scan':
        return { title: T('Cats Runtime stopped answering during the check', '檢查途中 Cats Runtime 沒有回應'), body: T('This does not mean your tools are missing. Nothing on this computer changed.', '這不代表你的工具沒安裝。這台電腦沒有任何變更。'), raw: S.pageError ? S.pageError.raw : null, severity: 'error', repair: repair(T('Check again', '再檢查一次'), () => { void runCheck(); }) };
      case 'row': {
        const row = S.rows[id] || {};
        const helper = helperOf(id);
        const label = rowLabel(id);
        const extras = [[T('Status', '狀態'), row.status || '']];
        if (helper && helper.sha256) extras.push([T('Script', '腳本'), `${helper.file}, SHA-256 ${helper.sha256}`]);
        const command = helper && helper.commands ? (row.kind === 'checkFailed' ? helper.commands.check : helper.commands.apply) : null;
        if (command) extras.push([T('Ran', '執行的指令'), command]);
        for (const line of row.manual || []) extras.push([T('Next', '下一步'), line]);
        if (row.kind === 'restart') return { title: T(`Cannot find ${label} yet`, `還找不到 ${label}`), body: T('Its script finished and asked for a restart, but a fresh check still cannot find it.', '腳本跑完並要求重新啟動，但重新檢查還是找不到它。'), raw: null, extras, severity: 'warning', repair: repair(T('Check again', '再檢查一次'), () => { void recheckRow(id); }) };
        if (row.kind === 'checkFailed') return { title: T(`Cannot check ${label}`, `無法檢查 ${label}`), body: T('Its check could not run, so nothing is known about it. Nothing changed.', '這一項的檢查沒有跑成，所以狀態不明，也沒有任何變更。'), raw: row.error, extras, severity: 'error', repair: repair(T('Check this again', '再檢查這一項'), () => { void recheckRow(id); }) };
        const retry = repair(T('Try again', '重試'), () => { void apply(retryQueue(id).length ? retryQueue(id) : [id]); });
        if (row.kind === 'declined') return { title: T(`${label} did not finish`, `${label} 沒有完成`), body: T('You chose No in the permission prompt, so nothing changed.', '你在權限視窗選了「否」，所以沒有任何變更。'), raw: row.error, extras, severity: 'warning', repair: retry };
        return { title: T(`${label} did not finish`, `${label} 沒有完成`), body: row.human || T('It did not finish.', '沒有完成。'), raw: row.error, extras, severity: 'error', repair: retry };
      }
      case 'conn': {
        const conn = S.conn[id];
        return { title: T(`Could not connect to ${TOOLS[id].label}`, `連不上 ${TOOLS[id].label}`), body: T('Check that it is running and this computer can reach it. Nothing was installed or changed.', '請確認它正在執行，而且這台電腦連得到。沒有安裝或變更任何東西。'), raw: conn.error, extras: [[T('Address', '連線位址'), conn.address]], severity: 'error', repair: repair(T('Test connection', '測試連線'), () => { void testConnection(id); }) };
      }
      case 'pull':
        return { title: T('The model did not finish downloading', '模型沒有下載完'), body: T('It stopped partway. Trying again continues where it left off.', '下載到一半停止了。重試會從中斷的地方繼續。'), raw: S.pull.error, extras: [[T('Model', '模型'), S.pull.name], ...(S.pull.percent === null ? [] : [[T('Reached', '進度'), `${S.pull.percent}%`]])], severity: 'error', repair: repair(T('Try again', '重試'), () => { void startPull(); }) };
      case 'terminal':
        return { title: T('No terminal was found', '找不到終端機'), body: T('Copy the command and run it in your own terminal.', '請複製指令，到你自己的終端機執行。'), raw: 'No terminal could be opened.', extras: [[T('Command', '指令'), (S.facts.signIn || {})[id] || '']], severity: 'warning', repair: null };
      case 'handoff':
      default:
        return { title: T('Cats could not open the next step', 'Cats 開不了下一步'), body: T('Cats Platform is not answering. Everything so far is kept.', 'Cats Platform 沒有回應。到目前為止的設定都留著。'), raw: S.handoffError, severity: 'error', repair: repair(tryAgain, () => { void handoff(); }) };
    }
  }

  /* ------------------------------ Loading ------------------------------ */

  let everLoaded = false;
  let pendingPicks = true;
  let destroyed = false;

  function acceptSnapshot(next) {
    S.snap = next;
    const selection = next.runtime.selection;
    buildTools();
    if (pendingPicks) {
      pendingPicks = false;
      S.revision = selection.revision;
      const known = new Set(Object.values(TOOLS).map((tool) => targetKey(tool.target)));
      for (const target of selection.targets || []) {
        if (known.has(targetKey(target))) S.picks.add(target.provider);
      }
      for (const connection of next.runtime.connections || []) {
        const id = connection.provider;
        if (!S.conn[id] || !connection.endpoint) continue;
        if (S.conn[id].state === 'untested' && !S.conn[id].changed) S.conn[id].address = connection.endpoint;
        if (id === 'ollama' && S.picks.has('ollama')) {
          const loopback = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(connection.endpoint);
          S.conn.ollama.remote = !loopback;
        }
      }
    }
    if (S.phase !== 'idle') return;
    if (selection.state === 'invalid') S.catalog = 'invalid';
    else if (selection.diskChanged || (S.revision !== null && S.revision !== selection.revision)) S.catalog = 'changed';
    else if (['slow', 'fail', 'lost', 'invalid', 'changed'].includes(S.catalog)) S.catalog = 'ready';
  }

  async function poll(first) {
    try {
      const next = await bridge.getProviderSetup('onboarding');
      if (destroyed) return;
      const before = S.catalog;
      acceptSnapshot(next);
      everLoaded = true;
      if (first || before !== S.catalog) render(first);
    } catch (error) {
      if (destroyed) return;
      S.catalogError = String(error.message || error);
      // Nothing loaded yet: a restored page has nothing to draw, so page 1 says what happened.
      if (first && !everLoaded) S.page = 1;
      if (S.page === 1 && S.phase === 'idle') {
        const nextState = everLoaded ? 'lost' : 'fail';
        if (S.catalog !== nextState || first) { S.catalog = nextState; render(first); }
      }
    }
  }

  async function reconnect() {
    S.reloading = true;
    render();
    await poll(false);
    S.reloading = false;
    render();
  }

  async function reloadSaved() {
    S.reloading = true;
    render();
    try {
      const next = await bridge.getProviderSetup('onboarding');
      S.snap = next;
      S.revision = next.runtime.selection.revision;
      S.picks = new Set();
      pendingPicks = true;
      acceptSnapshot(next);
      S.catalog = next.runtime.selection.state === 'invalid' ? 'invalid' : 'ready';
    } catch (error) {
      S.catalogError = String(error.message || error);
      S.catalog = 'lost';
    }
    S.reloading = false;
    render();
  }

  /* ------------------------------ Events ------------------------------ */

  function onClick(event) {
    const target = event.target.closest('[data-act]');
    if (!target || !root.contains(target)) return;
    const act = target.dataset.act;
    const arg = target.dataset.arg;
    switch (act) {
      case 'pick-more': S.expanded = !S.expanded; render(); break;
      case 'catalog-retry': void reconnect(); break;
      case 'catalog-reload': void reloadSaved(); break;
      case 'catalog-saved-retry': S.catalog = 'ready'; void saveAndCheck(); break;
      case 'go-check': void saveAndCheck(); break;
      case 'tick-all': {
        const list_ = tickableRequired();
        const all = list_.every((id) => S.ticked.has(id));
        for (const id of list_) { if (all) S.ticked.delete(id); else S.ticked.add(id); }
        render();
        break;
      }
      case 'details': if (S.details.has(arg)) S.details.delete(arg); else S.details.add(arg); render(); break;
      case 'open-details': chrome.openDetails(reasonFor(arg), target); break;
      case 'back': if (S.phase === 'checking') stopCheck(); goTo(S.page - 1); break;
      case 'recheck': void runCheck(); break;
      case 'recheck-row': void recheckRow(arg); break;
      case 'stop-after': S.stopRequested = true; S.stopAfter = true; renderFoot(); break;
      case 'apply': void apply(queueOf()); break;
      case 'retry': void apply(retryQueue(stoppedRow())); break;
      case 'next2': nextFromPageTwo(); break;
      case 'restart-app':
        // This process's log goes with it, so what it changed travels with the draft.
        if (wizardBridge.relaunch) Promise.resolve(wizardBridge.relaunch({ ...stateBlob(), priorChanges: chrome.logTotals().changes })).catch(() => undefined);
        break;
      case 'test': void testConnection(arg); break;
      case 'ollama-remote': void setOllamaRemote(arg === 'on'); break;
      case 'copy-manual': copyInto(factsOf(arg).manual, `manual:${arg}`); break;
      case 'copy-signin': copyInto((S.facts.signIn || {})[arg], `signin:${arg}`); break;
      case 'terminal': void openTerminal(arg); break;
      case 'signin-recheck': void recheckRow(arg); break;
      case 'pull-pick': S.pull.name = arg; if (S.pull.state === 'invalid') S.pull.state = 'idle'; render(); break;
      case 'pull-start': void startPull(); break;
      case 'pull-cancel': Promise.resolve(wizardBridge.cancelOllamaPull()).catch(() => undefined); break;
      case 'handoff': void handoff(); break;
      default: break;
    }
  }
  function copyInto(text, key) {
    if (!text) return;
    chrome.copyText(text).then(() => {
      S.copied = key;
      renderPage();
      win.setTimeout(() => { if (S.copied === key) { S.copied = null; renderPage(); } }, 1400);
    });
  }
  async function openTerminal(id) {
    try {
      const result = await wizardBridge.openTerminal(id);
      S.terminal[id] = result && result.opened ? 'opened' : 'missing';
    } catch {
      S.terminal[id] = 'missing';
    }
    renderPage();
  }
  function onChange(event) {
    const target = event.target;
    const kind = target.dataset && target.dataset.change;
    if (!kind) return;
    if (kind === 'pick') {
      if (target.checked) S.picks.add(target.dataset.arg); else S.picks.delete(target.dataset.arg);
      S.notice = null;
      render();
    } else if (kind === 'tick') {
      if (target.checked) S.ticked.add(target.dataset.arg); else S.ticked.delete(target.dataset.arg);
      render();
    } else if (kind === 'lang') {
      S.lang = target.value;
      doc.documentElement.lang = S.lang;
      chrome.setLocale(S.lang);
      saveState();
      render();
    }
  }
  function onInput(event) {
    const target = event.target;
    const kind = target.dataset && target.dataset.input;
    if (kind === 'address') {
      const conn = S.conn[target.dataset.arg];
      conn.address = target.value;
      if (conn.state !== 'untested' || !conn.changed) {
        const was = conn.state;
        conn.state = 'untested';
        conn.error = null;
        conn.changed = was === 'connected' || was === 'failed' || conn.changed;
        // Only what the page shows about the address changes, so typing keeps its place.
        if (was !== 'untested') renderPage();
      }
    } else if (kind === 'pull') {
      S.pull.name = target.value;
      if (S.pull.state === 'invalid') { S.pull.state = 'idle'; renderPage(); }
    }
  }
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);

  if (wizardBridge.onOllamaProgress) {
    unsubscribeProgress = wizardBridge.onOllamaProgress((progress) => {
      S.pull.status = progress.status || '';
      if (progress.percent === null || progress.percent === undefined) return;
      S.pull.percent = progress.percent;
      const bar = doc.getElementById('pull-bar');
      const pct = doc.getElementById('pull-pct');
      if (bar) bar.style.width = `${progress.percent}%`;
      if (pct) pct.textContent = `${progress.percent}%`;
    });
  }

  render();
  const start = (async () => {
    try {
      S.facts = await wizardBridge.facts();
      for (const id of ['node', 'gh', 'vc']) {
        if ((S.facts.systemRestartHelpers || []).includes(helperIdOf(id))) S.systemRestarts.add(id);
      }
      S.setupComplete = Boolean(S.facts.setupComplete);
      restoreState(S.facts.state);
      if (S.lang !== (String(options.locale || 'en').startsWith('zh') ? 'zh-TW' : 'en')) {
        doc.documentElement.lang = S.lang;
        chrome.setLocale(S.lang);
      }
    } catch (error) {
      S.facts = { helpers: {}, signIn: {}, ollamaSuggestions: [] };
      S.catalogError = String(error.message || error);
    }
    await poll(true);
    // A restored page needs what it described. Without a saved selection, or a finished check, it starts over.
    const noSelection = S.snap && ['missing', 'invalid'].includes(S.snap.runtime.selection.state);
    if (!destroyed && S.page !== 1 && (!S.checked || noSelection)) {
      S.page = 1;
      if (noSelection) { S.rows = {}; S.ticked = new Set(); S.skipped = new Set(); S.checked = false; }
      render(true);
    }
  })();
  // Reads are passive: they notice a lost connection or an edit elsewhere, and start nothing.
  const timer = win.setInterval(() => {
    if (doc.visibilityState !== 'hidden' && S.page === 1 && S.phase === 'idle') void poll(false);
  }, 5000);
  const onFocus = () => { if (S.page === 1 && S.phase === 'idle') void poll(false); };
  win.addEventListener('focus', onFocus);

  return {
    ready: start,
    destroy() {
      destroyed = true;
      win.clearInterval(timer);
      win.removeEventListener('focus', onFocus);
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
      root.removeEventListener('input', onInput);
      if (unsubscribeProgress) unsubscribeProgress();
      chrome.destroy();
    },
  };
}

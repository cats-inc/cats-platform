export function buildDesktopBootstrapPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cats</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #FAFAF7;
      --panel: #ffffff;
      --panel-hover: #E8E4DC;
      --text: #1A1A1A;
      --muted: #6B6560;
      --muted-soft: #8C857D;
      --border: #E4DFD7;
      --accent: #C4653A;
      --accent-soft: rgba(196,101,58,0.1);
      --focus-ring: rgba(196,101,58,0.08);
      --ok: #207A53;
      --ok-bg: rgba(61,167,121,0.11);
      --warn: #8D6830;
      --warn-bg: rgba(191,146,73,0.12);
      --err: #C0392B;
      --err-bg: rgba(192,57,43,0.1);
      --shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { max-width: 100%; overflow-x: hidden; }
    body {
      font-family: "Aptos", system-ui, "Segoe UI", "Helvetica Neue", sans-serif;
      font-size: 1rem;
      line-height: 1.6;
      color: var(--text);
      background: var(--bg);
      min-height: 100vh;
      font-synthesis: none;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Layout */
    .app { max-width: 620px; margin: 0 auto; padding: 56px 24px 72px; }
    .app-centered {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      padding-top: 38vh;
      text-align: center;
    }
    .section { margin-bottom: 28px; }
    .section-head {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 12px;
    }
    .section-head::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border);
    }

    /* Hero — loading */
    .hero { margin-bottom: 36px; }
    .hero-title {
      font-size: clamp(1.4rem, 3vw, 1.8rem);
      font-weight: 600;
      letter-spacing: -0.03em;
      line-height: 1.2;
      margin-bottom: 8px;
    }
    .hero-summary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 0.92rem;
      color: var(--muted);
      line-height: 1.5;
    }
    .hero-phase {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.01em;
      margin-bottom: 12px;
    }

    /* Error intermediate state */
    .error-area {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .error-area.visible {
      display: flex;
      animation: fadeSlideIn 0.4s ease both;
    }
    .error-actions {
      display: flex;
      gap: 8px;
      justify-content: center;
    }
    .slow-hint {
      display: none;
    }
    .slow-hint.visible {
      display: flex;
      animation: fadeSlideIn 0.4s ease both;
    }
    .hidden { display: none; }

    /* Dot */
    .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .dot-ok { background: var(--ok); }
    .dot-warn { background: var(--warn); }
    .dot-err { background: var(--err); }
    .dot-pulse { animation: pulse 1.6s ease-in-out infinite; }

    /* Card */
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
      box-shadow: var(--shadow);
    }
    .card + .card { margin-top: 8px; }

    /* Service rows */
    .svc-row {
      display: grid;
      grid-template-columns: auto 1fr auto auto;
      align-items: center;
      gap: 10px;
      padding: 9px 0;
    }
    .svc-row + .svc-row { border-top: 1px solid var(--border); }
    .svc-name { font-weight: 600; font-size: 0.85rem; }
    .svc-status { font-size: 0.78rem; font-weight: 500; text-align: right; }
    .svc-url {
      font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
      font-size: 0.72rem;
      color: var(--muted-soft);
      grid-column: 2 / -1;
    }
    .svc-detail {
      grid-column: 1 / -1;
      font-size: 0.78rem;
      padding: 2px 0 0 18px;
    }

    /* Runtime */
    .rt-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 3px 0;
    }
    .rt-label {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted-soft);
      min-width: 54px;
    }
    .rt-value {
      font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
      font-size: 0.75rem;
      word-break: break-all;
    }
    .rt-divider {
      margin: 10px 0;
      border: 0;
      border-top: 1px solid var(--border);
    }
    .rt-provider { font-size: 0.85rem; color: var(--muted); }
    .rt-counts {
      display: flex;
      gap: 14px;
      margin-top: 6px;
      font-size: 0.78rem;
    }
    .rt-count {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    /* Buttons — matches main app primaryButton / secondaryButton */
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 14px;
      border-radius: 12px;
      font: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--text);
      cursor: pointer;
      transition: background 0.15s;
      user-select: none;
    }
    .btn:hover:not(:disabled) {
      background: var(--panel-hover);
    }
    .btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .btn-primary {
      background: var(--panel);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-primary:hover:not(:disabled) {
      background: var(--panel-hover);
    }

    /* Issue row */
    .issue-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .issue-title { font-size: 0.85rem; font-weight: 600; }
    .issue-sev { font-size: 0.72rem; font-weight: 600; }

    /* Setup & detail cards */
    .detail-meta { font-size: 0.78rem; color: var(--muted); line-height: 1.5; }
    .detail-code {
      font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
      font-size: 0.75rem;
      color: var(--muted);
      word-break: break-all;
      white-space: pre-wrap;
    }
    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .card-label { font-size: 0.85rem; font-weight: 600; }
    .card-badge { font-size: 0.72rem; font-weight: 600; }

    /* Chip */
    .chip {
      display: inline-flex;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 0.69rem;
      font-weight: 600;
      letter-spacing: 0.01em;
      background: var(--accent-soft);
      color: var(--accent);
    }
    .chip-list { display: flex; flex-wrap: wrap; gap: 5px; }

    /* Chronology */
    .chrono-item { padding: 8px 0; }
    .chrono-item + .chrono-item { border-top: 1px solid var(--border); }
    .chrono-summary { font-size: 0.85rem; font-weight: 500; }
    .chrono-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 0.72rem;
      color: var(--muted-soft);
      margin-top: 3px;
    }

    /* Color utilities */
    .c-ok { color: var(--ok); }
    .c-warn { color: var(--warn); }
    .c-err { color: var(--err); }

    /* Animations */
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    @keyframes fadeSlideIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes bootSpin {
      to { transform: rotate(360deg); }
    }
    .anim { animation: fadeSlideIn 0.35s ease both; }
    .anim-d1 { animation-delay: 0.06s; }
    .anim-d2 { animation-delay: 0.12s; }
    .anim-d3 { animation-delay: 0.18s; }
    .anim-d4 { animation-delay: 0.24s; }
    .anim-d5 { animation-delay: 0.30s; }
    .anim-d6 { animation-delay: 0.36s; }

    /* Recovery summary card */
    .recovery-summary {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px 24px;
      box-shadow: var(--shadow);
      margin-bottom: 28px;
      text-align: center;
    }
    .recovery-title {
      font-size: clamp(1.1rem, 2.5vw, 1.3rem);
      font-weight: 600;
      letter-spacing: -0.02em;
      line-height: 1.3;
      margin-bottom: 8px;
    }
    .recovery-desc {
      font-size: 0.88rem;
      color: var(--muted);
      line-height: 1.5;
      margin-bottom: 20px;
    }
    .recovery-actions {
      display: flex;
      gap: 8px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .recovery-back {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font: inherit;
      font-size: 0.82rem;
      font-weight: 500;
      color: var(--muted);
      background: none;
      border: none;
      cursor: pointer;
      padding: 6px 0;
      margin-bottom: 20px;
    }
    .recovery-back:hover { color: var(--text); }

    /* Expandable detail sections */
    .expand-trigger {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      font: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--muted);
      background: none;
      border: none;
      cursor: pointer;
      padding: 10px 0;
      text-align: left;
      border-top: 1px solid var(--border);
    }
    .expand-trigger:first-child { border-top: none; }
    .expand-trigger:hover { color: var(--text); }
    .expand-trigger::before {
      content: '\u25B8';
      display: inline-block;
      transition: transform 0.15s;
      font-size: 0.7rem;
    }
    .expand-trigger.open::before { transform: rotate(90deg); }
    .expand-body {
      display: none;
      padding: 0 0 12px 18px;
    }
    .expand-body.open { display: block; animation: fadeSlideIn 0.25s ease both; }

    /* Onboarding mode — shown when cliInventory.total === 0 + !setupCompleteAt */
    .onboarding-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      padding: 56px 24px 56px;
      text-align: center;
    }
    .onboarding-hero {
      margin-bottom: 24px;
    }
    .onboarding-actions {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      margin-bottom: 32px;
    }
    .onboarding-btn {
      min-width: 180px;
    }
    .cli-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      width: 100%;
      max-width: 720px;
      margin-bottom: 12px;
    }
    .cli-grid.collapsed { display: grid; }
    .cli-grid-row-hidden { display: none; }
    .cli-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 10px 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      min-height: 110px;
      box-shadow: var(--shadow);
    }
    .cli-card-name {
      font-size: 0.92rem;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .cli-card-status {
      font-size: 0.72rem;
      color: var(--muted);
      min-height: 14px;
    }
    .cli-card-status.c-ok { color: var(--ok); }
    .cli-card-status.c-err { color: var(--err); }
    .cli-card-btn {
      align-self: stretch;
      padding: 6px 8px;
      font-size: 0.78rem;
      border-radius: 8px;
    }
    .cli-card-spinner {
      width: 12px;
      height: 12px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: bootSpin 0.8s linear infinite;
      display: inline-block;
      vertical-align: middle;
      margin-right: 4px;
    }

    /* Responsive */
    @media (max-width: 520px) {
      .app { padding: 32px 16px 56px; }
      .hero-title { font-size: 1.25rem; }
      .svc-row { grid-template-columns: auto 1fr auto; }
      .svc-url { display: none; }
      .actions { flex-direction: column; }
      .btn { width: 100%; }
      .error-actions { flex-direction: column; }
      .cli-grid { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <div id="app">
    <div id="splash" class="app app-centered">
      <section class="hero">
        <h1 class="hero-title">Cats</h1>
        <p id="splash-summary" class="hero-summary">
          <span id="splash-dot" class="dot dot-warn dot-pulse"></span>
          <span id="splash-text">Starting up\u2026</span>
        </p>
      </section>
      <p id="slow-hint" class="slow-hint hero-summary"></p>
      <div id="error-area" class="error-area">
        <p class="hero-summary">Mew\u2026 something tripped me up during startup.</p>
        <div class="error-actions">
          <button id="btn-retry" class="btn" type="button">Retry</button>
          <button id="btn-details" class="btn" type="button">Show details</button>
        </div>
      </div>
    </div>
    <div id="onboarding" class="app hidden"></div>
    <div id="recovery" class="app hidden"></div>
  </div>
  <script>
    'use strict';

    /* ================================================================
     *  Utilities
     * ================================================================ */

    function el(tag, attrs) {
      var e = document.createElement(tag);
      if (attrs) {
        for (var k in attrs) {
          var v = attrs[k];
          if (v == null || v === false) continue;
          if (k === 'class') e.className = v;
          else if (k === 'onclick') e.addEventListener('click', v);
          else if (k === 'disabled') e.disabled = true;
          else e.setAttribute(k, String(v));
        }
      }
      for (var i = 2; i < arguments.length; i++) {
        var c = arguments[i];
        if (c == null || c === false) continue;
        if (Array.isArray(c)) { c.forEach(function (x) { if (x) e.append(x); }); }
        else if (typeof c === 'string') e.append(document.createTextNode(c));
        else e.append(c);
      }
      return e;
    }

    function getServiceDisplayName(name) {
      return name;
    }

    function sc(status) {
      if (status === 'ready' || status === 'ok') return 'ok';
      if (status === 'failed' || status === 'unavailable' || status === 'error') return 'err';
      return 'warn';
    }

    function describeSetupPack(pack) {
      var m = {
        api_baseline: 'API baseline',
        native_cli_pack: 'native CLI pack',
        local_model_pack: 'local model pack',
        wsl_power_user_pack: 'WSL power-user pack'
      };
      return m[pack] || null;
    }

    function isOptionalCapabilityPackSetupAction(action) {
      if (!action) return false;
      if (action.optionalFollowThroughPack !== undefined) {
        return action.optionalFollowThroughPack === 'local_model_pack';
      }
      if (!Array.isArray(action.plannedActions) || action.plannedActions.length === 0) return false;
      return action.plannedActions.every(function (e) { return e.startsWith('local_model:'); });
    }

    function isCliMissing(snapshot) {
      return Boolean(
        snapshot && snapshot.phase === 'needs_prerequisites'
          && snapshot.prerequisites && snapshot.prerequisites.cliInventory
          && snapshot.prerequisites.cliInventory.total === 0
      );
    }

    function resolvePageMode(snapshot) {
      if (!snapshot) return 'loading';
      if (snapshot.phase === 'failed') return 'recovery';
      if (snapshot.phase === 'needs_prerequisites') {
        var setupCompleteAt = snapshot.app && snapshot.app.setupCompleteAt;
        if (isCliMissing(snapshot) && !setupCompleteAt) return 'onboarding';
        return 'recovery';
      }
      return 'loading';
    }

    /* ================================================================
     *  CLI install card (shared between onboarding + recovery accordion)
     * ================================================================ */

    var ONBOARDING_PROVIDER_ORDER = [
      'claude_code', 'codex', 'gemini', 'copilot',
      'cursor_agent', 'kiro', 'opencode', 'kilo',
      'auggie', 'junie', 'goose', 'pi',
      'ollama'
    ];
    var cliInstallingState = Object.create(null);
    var onboardingExpanded = false;

    function pickInventoryCandidate(snapshot, providerId) {
      var inv = snapshot && snapshot.prerequisites && snapshot.prerequisites.cliInventory;
      if (!inv || !Array.isArray(inv.candidates)) return null;
      for (var i = 0; i < inv.candidates.length; i++) {
        if (inv.candidates[i].providerId === providerId) return inv.candidates[i];
      }
      return null;
    }

    function handleCliInstallClick(candidate) {
      if (cliInstallingState[candidate.helperId]) return;
      cliInstallingState[candidate.helperId] = true;
      doRender();
      bridge.runSetupHelper(candidate.helperId, 'apply')
        .catch(function (err) {
          try { console.error('CLI install failed', candidate.helperId, err); } catch (e) {}
        })
        .finally(function () {
          delete cliInstallingState[candidate.helperId];
          doRender();
        });
    }

    function CliCard(candidate, hidden) {
      var installing = Boolean(cliInstallingState[candidate.helperId]);
      var btnLabel, statusClass, statusText;
      if (installing) {
        btnLabel = 'Installing…';
        statusClass = '';
        statusText = '';
      } else if (candidate.installed) {
        btnLabel = 'Reinstall';
        statusClass = 'c-ok';
        statusText = '✓ Installed';
      } else {
        btnLabel = 'Install';
        statusClass = '';
        statusText = '';
      }
      var btn = el('button', {
        class: 'btn cli-card-btn',
        disabled: installing || !candidate.available || !candidate.supported,
        onclick: function () { handleCliInstallClick(candidate); }
      }, btnLabel);
      var classNames = 'cli-card' + (hidden ? ' cli-card-hidden' : '');
      return el('div', { class: classNames },
        el('div', { class: 'cli-card-name' }, candidate.label),
        el('div', { class: 'cli-card-status ' + statusClass }, statusText || ' '),
        btn
      );
    }

    function buildCliCards(snapshot, alwaysExpanded) {
      var cards = [];
      var rendered = 0;
      for (var i = 0; i < ONBOARDING_PROVIDER_ORDER.length; i++) {
        var providerId = ONBOARDING_PROVIDER_ORDER[i];
        var candidate = pickInventoryCandidate(snapshot, providerId);
        if (!candidate || !candidate.available) continue;
        var hidden = !alwaysExpanded && !onboardingExpanded && rendered >= 4;
        cards.push(CliCard(candidate, hidden));
        rendered += 1;
      }
      return cards;
    }

    /* ================================================================
     *  Atoms
     * ================================================================ */

    function Dot(status, pulse) {
      return el('span', { class: 'dot dot-' + sc(status) + (pulse ? ' dot-pulse' : '') });
    }

    function SectionHead(label) {
      return el('div', { class: 'section-head' }, label);
    }

    function Chip(label) {
      return el('span', { class: 'chip' }, String(label).replace(/_/g, ' '));
    }

    function Btn(label, opts) {
      return el('button', {
        class: 'btn' + (opts && opts.primary ? ' btn-primary' : ''),
        disabled: opts && opts.disabled,
        onclick: opts && opts.onclick
      }, label);
    }

    function CardHead(label, badge, badgeClass) {
      return el('div', { class: 'card-head' },
        el('strong', { class: 'card-label' }, label),
        el('span', { class: 'card-badge ' + (badgeClass || '') }, badge)
      );
    }

    /* ================================================================
     *  Interruption chips
     * ================================================================ */

    function renderInterruptions(interruptions) {
      if (!Array.isArray(interruptions) || interruptions.length === 0) return null;
      return el('div', { class: 'chip-list' },
        interruptions.map(function (entry) { return Chip(entry.kind || ''); })
      );
    }

    /* ================================================================
     *  Splash (loading / error) — fixed DOM, no recreation
     * ================================================================ */

    var splashEl = document.getElementById('splash');
    var splashDot = document.getElementById('splash-dot');
    var splashText = document.getElementById('splash-text');
    var errorArea = document.getElementById('error-area');
    var recoveryEl = document.getElementById('recovery');
    var onboardingEl = document.getElementById('onboarding');
    var btnRetry = document.getElementById('btn-retry');
    var btnDetails = document.getElementById('btn-details');
    var slowHint = document.getElementById('slow-hint');

    function friendlyLoadingSummary(phase) {
      if (phase === 'checking_prerequisites') return 'Almost ready\u2026';
      if (phase === 'ready_for_setup' || phase === 'ready_for_chat') return 'Ready.';
      return 'Starting up\u2026';
    }

    function clearSlowHintTimer() {
      if (slowHintHandle !== null) {
        clearTimeout(slowHintHandle);
        slowHintHandle = null;
      }
    }

    function hideSlowHint() {
      slowHint.classList.remove('visible');
      slowHint.textContent = '';
    }

    function showSlowHintMessage(message) {
      slowHint.textContent = message;
      slowHint.classList.add('visible');
    }

    function resetSlowHintCycle() {
      clearSlowHintTimer();
      slowHintStep = 0;
      retryHintActive = false;
      hideSlowHint();
    }

    function showRetryLoadingState() {
      showRecoveryDetails = false;
      retryHintActive = true;
      clearSlowHintTimer();
      splashEl.classList.remove('hidden');
      recoveryEl.classList.add('hidden');
      onboardingEl.classList.add('hidden');
      splashDot.className = 'dot dot-warn dot-pulse';
      splashDot.style.display = '';
      splashText.textContent = 'Trying again\u2026';
      errorArea.classList.remove('visible');
      showSlowHintMessage(retryHintMessage);
    }

    function updateSplash(snap) {
      var isError = resolvePageMode(snap) === 'recovery';
      var isPending = snap.phase === 'starting_services' || snap.phase === 'checking_prerequisites';
      var isReady = snap.phase === 'ready_for_setup' || snap.phase === 'ready_for_chat';

      /* Update dot */
      splashDot.className = 'dot dot-' + sc(snap.status) + (isPending && !isError ? ' dot-pulse' : '');
      splashDot.style.display = isError ? 'none' : '';

      /* Update text */
      splashText.textContent = isError ? '' : friendlyLoadingSummary(snap.phase);

      /* Dismiss or resume slow-launch hint state */
      if (isError || isReady) {
        resetSlowHintCycle();
      } else if (retryHintActive) {
        showSlowHintMessage(retryHintMessage);
      } else {
        scheduleSlowHint();
      }

      /* Show/hide error area */
      if (isError) {
        errorArea.classList.add('visible');
      } else {
        errorArea.classList.remove('visible');
      }
    }

    /* ================================================================
     *  Recovery — copy per state
     * ================================================================ */

    function recoveryTitle(snap) {
      if (snap.phase === 'failed') return 'Cats needs a quick restart';
      if (snap.phase === 'needs_prerequisites') {
        return snap.app && snap.app.setupCompleteAt
          ? 'Cats can open, but one helper needs attention'
          : 'Cats needs one setup fix';
      }
      if (snap.phase === 'ready_for_setup') return 'Cats is ready to set up';
      return 'Cats recovery';
    }

    function recoverySummary(snap) {
      if (snap.phase === 'failed') {
        var failedSvc = snap.services.find(function (s) { return s.status === 'failed'; });
        if (failedSvc) {
          return getServiceDisplayName(failedSvc.name)
            + ' did not start. Try again first; use advanced details only if it keeps failing.';
        }
        return 'A local helper did not start. Try again first; use advanced details only if it keeps failing.';
      }
      if (snap.phase === 'needs_prerequisites') {
        if (snap.app && snap.app.setupCompleteAt) {
          return 'You can keep using Cats now. Repair the local helper when convenient, or open advanced details if you need them.';
        }
        return 'Finish the setup fix below, then Cats will continue.';
      }
      if (snap.phase === 'ready_for_setup') {
        return 'Local helpers are running. Continue into setup to get started.';
      }
      return snap.summary || 'See details below.';
    }

    /* ================================================================
     *  Recovery — expandable section helper
     * ================================================================ */

    function ExpandableSection(label, children) {
      var initiallyOpen = sectionOpenState[label] === true;
      var body = el('div', {
        class: initiallyOpen ? 'expand-body open' : 'expand-body'
      }, children);
      var trigger = el('button', {
        class: initiallyOpen ? 'expand-trigger open' : 'expand-trigger',
        onclick: function () {
          var open = trigger.classList.toggle('open');
          sectionOpenState[label] = open;
          if (open) { body.classList.add('open'); }
          else { body.classList.remove('open'); }
        }
      }, label);
      return el('div', null, trigger, body);
    }

    /* ================================================================
     *  Recovery — summary card + 3-slot actions
     * ================================================================ */

    function RecoverySummaryCard(snap, bridge) {
      var actionButtons = (snap.actions || []).map(function (action) {
        return Btn(action.label, {
          primary: action.primary === true,
          disabled: action.disabled,
          onclick: function () {
            var self = this;
            self.disabled = true;
            if (action.id === 'retry') {
              runRetryAction(self, Boolean(action.disabled));
              return;
            }
            bridge.runAction(action.id)
              .then(function () {
                if (action.id === 'resume_setup') refreshSetup();
              })
              .finally(function () { self.disabled = Boolean(action.disabled); });
          }
        });
      });

      return el('div', { class: 'recovery-summary anim' },
        el('h1', { class: 'hero-title' }, 'Cats'),
        el('h2', { class: 'recovery-title' }, recoveryTitle(snap)),
        el('p', { class: 'recovery-desc' }, recoverySummary(snap)),
        el('div', { class: 'recovery-actions' }, actionButtons)
      );
    }

    /* ================================================================
     *  Recovery — expandable detail sections
     * ================================================================ */

    function WhySection(snap) {
      var items = [];
      if (snap.issues && snap.issues.length > 0) {
        snap.issues.forEach(function (issue) {
          var s = issue.severity === 'error' ? 'err' : issue.severity === 'warning' ? 'warn' : 'ok';
          items.push(el('div', { class: 'card' },
            el('div', { class: 'issue-head' },
              el('span', { class: 'issue-title' }, issue.title),
              el('span', { class: 'issue-sev c-' + s }, issue.severity)
            ),
            el('div', { class: 'detail-meta' }, issue.detail)
          ));
        });
      }
      var failedServices = snap.services.filter(function (s) { return s.status === 'failed'; });
      failedServices.forEach(function (svc) {
        if (svc.error) {
          items.push(el('div', { class: 'card' },
            el('div', { class: 'issue-head' },
              el('span', { class: 'issue-title' }, getServiceDisplayName(svc.name) + ' error'),
              el('span', { class: 'issue-sev c-err' }, 'error')
            ),
            el('div', { class: 'detail-meta' }, svc.error),
            svc.lastOutput
              ? el('code', { class: 'detail-code' }, svc.lastOutput)
              : false
          ));
        }
      });
      if (items.length === 0) {
        items.push(el('div', { class: 'detail-meta' }, 'No specific issues were reported.'));
      }
      return ExpandableSection('What needs attention', items);
    }

    function ServiceStatusSection(snap) {
      var rows = snap.services.map(function (svc) {
        var isPending = svc.status !== 'ready' && svc.status !== 'failed';
        var parts = [
          el('div', { class: 'svc-row' },
            Dot(svc.status, isPending),
            el('span', { class: 'svc-name' }, getServiceDisplayName(svc.name)),
            el('span', { class: 'svc-status c-' + sc(svc.status) }, svc.status),
            el('code', { class: 'svc-url' }, svc.healthUrl)
          )
        ];
        if (svc.error) {
          parts.push(el('div', { class: 'svc-detail c-err' }, svc.error));
        }
        if (svc.lastOutput) {
          parts.push(el('div', { class: 'svc-detail' },
            el('code', { class: 'detail-code' }, svc.lastOutput)
          ));
        }
        return parts;
      });

      return ExpandableSection('Local helpers', [el('div', { class: 'card' }, rows.flat())]);
    }

    function DiagnosticsSection(snap) {
      var diagnostics = snap.diagnostics;
      var actionRow = el('div', { class: 'actions', style: 'margin-top:12px' },
        Btn('Open advanced diagnostics', {
          onclick: function () {
            bridge.runAction('open_runtime_diagnostics');
          }
        })
      );

      if (!diagnostics || !diagnostics.aggregation) {
        return ExpandableSection('Diagnostics', [
          el('div', { class: 'detail-meta' }, 'Advanced diagnostics are still loading.'),
          actionRow,
        ]);
      }

      var agg = diagnostics.aggregation;
      var content = [];

      content.push(el('div', { class: 'card' },
        CardHead('Layer summary', agg.attemptId || 'current', 'c-ok'),
        el('div', { class: 'detail-meta' },
          el('strong', null, 'runtime: '), agg.layers.runtime.summary),
        el('div', { class: 'detail-meta' },
          el('strong', null, 'product: '), agg.layers.product.summary),
        el('div', { class: 'detail-meta' },
          el('strong', null, 'host: '), agg.layers.host.summary)
      ));

      var chronology = Array.isArray(agg.chronology) ? agg.chronology.slice(0, 8) : [];
      if (chronology.length) {
        var chronoItems = chronology.map(function (evt) {
          return el('div', { class: 'chrono-item' },
            el('div', { class: 'chrono-summary' }, evt.summary),
            el('div', { class: 'chrono-meta' },
              el('span', null, evt.layer),
              el('span', null, evt.kind),
              el('span', null, evt.status),
              el('span', null, evt.timestamp)
            ),
            evt.error && evt.error.message
              ? el('div', { class: 'detail-meta c-err' }, evt.error.message)
              : false
          );
        });
        content.push(el('div', { class: 'card' },
          CardHead('Recent events', String(chronology.length) + ' entries', 'c-warn'),
          chronoItems
        ));
      }

      content.push(actionRow);

      return ExpandableSection('Advanced diagnostics', content);
    }

    function LogsAndPathsSection(snap) {
      var diagnostics = snap.diagnostics;
      var items = [];

      if (snap.hostStatePath) {
        items.push(el('div', { class: 'detail-meta' },
          el('strong', null, 'Host state: '),
          el('code', { class: 'detail-code' }, snap.hostStatePath)));
      }
      if (diagnostics) {
        if (diagnostics.activeAttemptId) {
          items.push(el('div', { class: 'detail-meta' },
            el('strong', null, 'Attempt: '),
            el('code', { class: 'detail-code' }, diagnostics.activeAttemptId)));
        }
        if (diagnostics.product && diagnostics.product.historyPath) {
          items.push(el('div', { class: 'detail-meta' },
            el('strong', null, 'History: '),
            el('code', { class: 'detail-code' }, diagnostics.product.historyPath)));
        }
        if (Array.isArray(diagnostics.serviceLogs)) {
          diagnostics.serviceLogs
            .filter(function (e) { return e && e.logPath; })
            .forEach(function (e) {
              items.push(el('div', { class: 'detail-meta' },
                el('strong', null, getServiceDisplayName(e.service) + ' log: '),
                el('code', { class: 'detail-code' }, e.logPath)));
            });
        }
      }
      if (items.length === 0) {
        items.push(el('div', { class: 'detail-meta' }, 'No advanced log paths available yet.'));
      }

      return ExpandableSection('Advanced logs and paths', [el('div', { class: 'card' }, items)]);
    }

    function SetupRecoverySection(snap, setupSnap, bridge) {
      var lastAction = (setupSnap && setupSnap.state && setupSnap.state.lastAction)
        || (snap.setup && snap.setup.lastAction);
      if (!lastAction && (!setupSnap || !setupSnap.resumeAction)) return null;

      var cards = [];

      if (setupSnap && setupSnap.resumeAction) {
        var ra = setupSnap.resumeAction;
        var rac = [
          CardHead('Recommended next step',
            ra.reason.replace(/_/g, ' '), 'c-warn'),
          el('div', { class: 'detail-meta' }, ra.summary),
          renderInterruptions(ra.interruptions)
        ];
        if (Array.isArray(ra.manualSteps) && ra.manualSteps.length) {
          rac.push(el('div', { class: 'detail-meta' }, ra.manualSteps[0]));
        }
        rac.push(Btn('Continue setup fix', {
          onclick: function () {
            var self = this;
            self.disabled = true;
            bridge.resumeSetup()
              .then(function (next) { currentSetupSnapshot = next; doRender(); })
              .finally(function () { self.disabled = false; });
          }
        }));
        cards.push(el('div', { class: 'card' }, rac));
      }

      if (lastAction) {
        var las = lastAction.runState === 'failed' ? 'err'
          : lastAction.status === 'ready' ? 'ok' : 'warn';
        var lac = [
          CardHead(lastAction.label || lastAction.helperId,
            lastAction.status || lastAction.runState, 'c-' + las),
          el('div', { class: 'detail-meta' },
            lastAction.summary || 'No summary recorded.')
        ];
        if (lastAction.restartRequired) {
          lac.push(el('div', { class: 'detail-meta c-warn' },
            'A restart is needed before the next step.'));
        }
        if (lastAction.error) {
          lac.push(el('div', { class: 'detail-meta c-err' }, lastAction.error));
        }
        cards.push(el('div', { class: 'card' }, lac));
      }

      return ExpandableSection('Setup fix', cards);
    }

    /* ================================================================
     *  App shell & render
     * ================================================================ */

    var bridge = window.catsDesktopHost;
    var currentSnapshot = null;
    var currentSetupSnapshot = null;
    var snapshotListenerBound = false;
    var retryHandle = null;
    var showRecoveryDetails = false;
    /* Recovery sections collapse on every doRender() because showRecovery
     * rebuilds recoveryEl.innerHTML from scratch whenever a new snapshot
     * arrives. Persist each ExpandableSection's open state by label so the
     * user's manual expand survives the next snapshot push. */
    var sectionOpenState = Object.create(null);
    /* Snapshot publishes often (timestamp/heartbeat updates) carry no
     * recovery-meaningful changes. Skip rebuilding the recovery DOM when
     * the meaningful fields are byte-identical to last render so the page
     * does not flicker every few seconds. */
    var lastRecoverySignature = null;
    function recoverySignature(snap, setupSnap) {
      if (!snap) return '';
      try {
        return JSON.stringify({
          phase: snap.phase,
          status: snap.status,
          summary: snap.summary,
          actions: snap.actions || null,
          services: (snap.services || []).map(function (s) {
            return {
              name: s.name,
              status: s.status,
              ready: s.ready,
              exitCode: s.exitCode,
              error: s.error,
            };
          }),
          issues: snap.issues || null,
          progress: snap.progress || null,
          runtime: snap.runtime
            ? {
                status: snap.runtime.status,
                summary: snap.runtime.summary,
                providerSummary: snap.runtime.providerSummary || null,
                issues: snap.runtime.issues || null,
              }
            : null,
          app: snap.app || null,
          prerequisites: snap.prerequisites || null,
          setup: snap.setup || null,
          setupSnap: setupSnap
            ? {
                resumeAction: setupSnap.resumeAction || null,
                lastAction: setupSnap.state ? setupSnap.state.lastAction || null : null,
              }
            : null,
        });
      } catch (e) {
        return '';
      }
    }
    var slowHintHandle = null;
    var slowHintStep = 0;
    var retryHintActive = false;
    var slowHintMessages = [
      'First launch takes a moment. Still stretching\u2026',
      'Want to play? Hang in there, almost ready~',
      'Almost done, really! Just a whisker away~'
    ];
    var retryHintMessage = 'Mew\u2026 sorry. Let me try that one more time, okay?';

    function scheduleSlowHint() {
      if (retryHintActive || slowHintHandle !== null || slowHintStep >= slowHintMessages.length) {
        return;
      }
      slowHintHandle = window.setTimeout(function () {
        slowHintHandle = null;
        if (showRecoveryDetails) return;
        if (currentSnapshot && resolvePageMode(currentSnapshot) === 'recovery') return;
        var phase = currentSnapshot && currentSnapshot.phase;
        if (phase === 'ready_for_setup' || phase === 'ready_for_chat') return;
        showSlowHintMessage(slowHintMessages[slowHintStep]);
        slowHintStep += 1;
        scheduleSlowHint();
      }, 20000);
    }

    function runRetryAction(button, restoreDisabled) {
      showRetryLoadingState();
      bridge.runAction('retry')
        .catch(function () {
          retryHintActive = false;
          hideSlowHint();
          doRender();
        })
        .finally(function () { button.disabled = restoreDisabled; });
    }

    function showOnboarding(snap) {
      splashEl.classList.add('hidden');
      recoveryEl.classList.add('hidden');
      onboardingEl.classList.remove('hidden');
      resetSlowHintCycle();

      onboardingEl.innerHTML = '';
      onboardingEl.classList.add('onboarding-page');

      var setupCompleteAt = snap.app && snap.app.setupCompleteAt;
      var heading = setupCompleteAt
        ? 'No CLI is currently available. Pick one to continue.'
        : 'Welcome. Pick a CLI to get started.';

      var inventory = (snap.prerequisites && snap.prerequisites.cliInventory) || {};
      var installedCount = Array.isArray(inventory.installed) ? inventory.installed.length : 0;
      var continueDisabled = installedCount === 0;

      var continueBtn = el('button', {
        class: 'btn btn-primary onboarding-btn',
        disabled: continueDisabled,
        onclick: function () {
          if (continueDisabled) return;
          var self = this;
          self.disabled = true;
          var nextAction = setupCompleteAt ? 'open_chat' : 'open_setup';
          bridge.runAction(nextAction).catch(function () {
            self.disabled = false;
          });
        }
      }, '繼續');

      var moreLabel = onboardingExpanded ? 'Show fewer' : 'Show more';
      var moreBtn = el('button', {
        class: 'btn onboarding-btn',
        onclick: function () {
          onboardingExpanded = !onboardingExpanded;
          doRender();
        }
      }, moreLabel);

      var cards = buildCliCards(snap, false);

      onboardingEl.append(
        el('section', { class: 'onboarding-hero' },
          el('h1', { class: 'hero-title' }, 'Cats'),
          el('p', { class: 'recovery-desc' }, heading)
        ),
        el('div', { class: 'onboarding-actions' }, continueBtn, moreBtn),
        el('div', { class: 'cli-grid' }, cards)
      );
    }

    function InstallACliSection(snap) {
      var inv = snap.prerequisites && snap.prerequisites.cliInventory;
      if (!inv || inv.total > 0) return null;
      var cards = buildCliCards(snap, true);
      if (cards.length === 0) return null;
      return ExpandableSection('Install a CLI', [
        el('div', { class: 'cli-grid' }, cards)
      ]);
    }

    function showRecovery(snap) {
      splashEl.classList.add('hidden');
      onboardingEl.classList.add('hidden');
      recoveryEl.classList.remove('hidden');

      var signature = recoverySignature(snap, currentSetupSnapshot);
      if (recoveryEl.firstChild && signature && signature === lastRecoverySignature) {
        return;
      }
      lastRecoverySignature = signature;
      recoveryEl.innerHTML = '';

      /* Back button */
      var backBtn = el('button', {
        class: 'recovery-back',
        onclick: function () {
          showRecoveryDetails = false;
          doRender();
        }
      }, '\u2190 Back to quick fix');

      /* Summary card with 3-slot action row */
      var summary = RecoverySummaryCard(snap, bridge);

      /* Expandable detail sections */
      var details = el('div', { class: 'anim anim-d1' },
        WhySection(snap),
        ServiceStatusSection(snap),
        DiagnosticsSection(snap),
        LogsAndPathsSection(snap)
      );

      /* Install a CLI accordion (only when cliInventory.total === 0) */
      var installCliSection = InstallACliSection(snap);
      if (installCliSection) {
        details.append(installCliSection);
      }

      /* Conditional setup recovery section */
      var setupSection = SetupRecoverySection(snap, currentSetupSnapshot, bridge);
      if (setupSection) {
        details.append(setupSection);
      }

      recoveryEl.append(backBtn, summary, details);
    }

    function doRender() {
      var snap = currentSnapshot;
      if (!snap) return;

      var mode = resolvePageMode(snap);

      if (showRecoveryDetails || mode === 'recovery') {
        showRecovery(snap);
        return;
      }

      if (mode === 'onboarding') {
        showOnboarding(snap);
        return;
      }

      /* Splash is always in the DOM — just update it */
      splashEl.classList.remove('hidden');
      recoveryEl.classList.add('hidden');
      onboardingEl.classList.add('hidden');
      updateSplash(snap);
    }

    function getSetupSnapshotOrNull() {
      if (!bridge) return Promise.resolve(null);
      return bridge.getSetupSnapshot().catch(function () { return null; });
    }

    function refreshSetup() {
      getSetupSnapshotOrNull()
        .then(function (s) { currentSetupSnapshot = s; doRender(); })
        .catch(function () {});
    }

    function applySnapshot(snapshot) {
      currentSnapshot = snapshot;
      getSetupSnapshotOrNull()
        .then(function (setupSnap) {
          currentSetupSnapshot = setupSnap;
          /* If user was on recovery details and snapshot improved, stay there */
          doRender();
        });
    }

    function ensureSnapshotListener() {
      if (snapshotListenerBound) return;
      bridge.onSnapshot(applySnapshot);
      snapshotListenerBound = true;
    }

    function scheduleInitialSnapshotRetry() {
      if (retryHandle !== null) return;
      retryHandle = window.setTimeout(function () {
        retryHandle = null;
        loadInitialSnapshot();
      }, 750);
    }

    function loadInitialSnapshot() {
      bridge.getSnapshot()
        .then(function (snapshot) {
          return getSetupSnapshotOrNull()
            .then(function (setupSnap) {
              ensureSnapshotListener();
              currentSnapshot = snapshot;
              currentSetupSnapshot = setupSnap;
              doRender();
            });
        })
        .catch(function () {
          scheduleInitialSnapshotRetry();
        });
    }

    function main() {
      if (!bridge) {
        splashDot.style.display = 'none';
        splashText.textContent = '';
        errorArea.classList.add('visible');
        btnRetry.style.display = 'none';
        btnDetails.style.display = 'none';
        return;
      }

      btnRetry.addEventListener('click', function () {
        btnRetry.disabled = true;
        runRetryAction(btnRetry, false);
      });
      btnDetails.addEventListener('click', function () {
        showRecoveryDetails = true;
        doRender();
      });

      loadInitialSnapshot();
    }

    main();
  </script>
</body>
</html>`;
}

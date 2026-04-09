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

    /* Responsive */
    @media (max-width: 520px) {
      .app { padding: 32px 16px 56px; }
      .hero-title { font-size: 1.25rem; }
      .svc-row { grid-template-columns: auto 1fr auto; }
      .svc-url { display: none; }
      .actions { flex-direction: column; }
      .btn { width: 100%; }
      .error-actions { flex-direction: column; }
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
      <div id="error-area" class="error-area">
        <p class="hero-summary">Something went wrong during startup.</p>
        <div class="error-actions">
          <button id="btn-retry" class="btn" type="button">Retry</button>
          <button id="btn-details" class="btn" type="button">Show details</button>
        </div>
      </div>
    </div>
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

    function resolvePageMode(snapshot) {
      return snapshot.phase === 'failed' || snapshot.phase === 'needs_prerequisites'
        ? 'recovery' : 'loading';
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
    var btnRetry = document.getElementById('btn-retry');
    var btnDetails = document.getElementById('btn-details');

    function friendlyLoadingSummary(phase) {
      if (phase === 'checking_prerequisites') return 'Almost ready\u2026';
      if (phase === 'ready_for_setup' || phase === 'ready_for_chat') return 'Ready.';
      return 'Starting up\u2026';
    }

    function updateSplash(snap) {
      var isError = resolvePageMode(snap) === 'recovery';
      var isPending = snap.phase === 'starting_services' || snap.phase === 'checking_prerequisites';

      /* Update dot */
      splashDot.className = 'dot dot-' + sc(snap.status) + (isPending && !isError ? ' dot-pulse' : '');
      splashDot.style.display = isError ? 'none' : '';

      /* Update text */
      splashText.textContent = isError ? '' : friendlyLoadingSummary(snap.phase);

      /* Show/hide error area */
      if (isError) {
        errorArea.classList.add('visible');
      } else {
        errorArea.classList.remove('visible');
      }
    }

    function RecoveryHero(snap) {
      return el('section', { class: 'hero anim' },
        el('div', { class: 'hero-phase' },
          Dot(snap.status === 'ok' ? 'ready' : snap.status, false),
          el('span', { class: 'c-' + sc(snap.status) }, snap.phase.replace(/_/g, ' '))
        ),
        el('h1', { class: 'hero-title' }, 'Cats'),
        el('p', { class: 'hero-summary' }, snap.summary)
      );
    }

    /* ================================================================
     *  Services
     * ================================================================ */

    function ServicesSection(snap) {
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
      return el('section', { class: 'section anim anim-d1' },
        SectionHead('Services'),
        el('div', { class: 'card' }, rows.flat())
      );
    }

    /* ================================================================
     *  Runtime
     * ================================================================ */

    function RuntimeSection(snap) {
      var kids = [
        el('div', { class: 'rt-row' },
          el('span', { class: 'rt-label' }, 'App'),
          el('code', { class: 'rt-value' }, snap.app.baseUrl)
        ),
        el('div', { class: 'rt-row' },
          el('span', { class: 'rt-label' }, 'Runtime'),
          el('code', { class: 'rt-value' }, snap.runtime.baseUrl)
        )
      ];
      if (snap.runtime.providerSummary) {
        var ps = snap.runtime.providerSummary;
        kids.push(
          el('hr', { class: 'rt-divider' }),
          el('div', { class: 'rt-provider' }, ps.summary),
          el('div', { class: 'rt-counts' },
            el('span', { class: 'rt-count' }, Dot('ready', false), ' ok ' + ps.ok),
            el('span', { class: 'rt-count' }, Dot('degraded', false),
              ' attention ' + (ps.degraded + ps.unavailable))
          )
        );
      } else {
        kids.push(
          el('hr', { class: 'rt-divider' }),
          el('div', { class: 'detail-meta' }, 'Provider diagnostics are still loading.')
        );
      }
      return el('section', { class: 'section anim anim-d2' },
        SectionHead('Runtime'),
        el('div', { class: 'card' }, kids)
      );
    }

    /* ================================================================
     *  Actions
     * ================================================================ */

    function ActionsSection(snap, bridge) {
      if (!snap.actions || snap.actions.length === 0) {
        return el('section', { class: 'section' });
      }
      var sorted = snap.actions.slice().sort(function (a, b) {
        return (b.primary ? 1 : 0) - (a.primary ? 1 : 0);
      });
      var buttons = sorted.map(function (action) {
        return Btn(action.label, {
          primary: action.primary,
          disabled: action.disabled,
          onclick: function () {
            this.disabled = true;
            var self = this;
            bridge.runAction(action.id)
              .then(function () {
                if (action.id === 'resume_setup') refreshSetup();
              })
              .finally(function () { self.disabled = Boolean(action.disabled); });
          }
        });
      });
      return el('section', { class: 'section anim anim-d3' },
        SectionHead('Actions'),
        el('div', { class: 'actions' }, buttons)
      );
    }

    /* ================================================================
     *  Prerequisites
     * ================================================================ */

    function PrereqSection(snap) {
      if (!snap.issues || snap.issues.length === 0) {
        return el('section', { class: 'section anim anim-d4' },
          SectionHead('Prerequisites'),
          el('div', { class: 'card' },
            el('div', { class: 'detail-meta' }, 'No blocking prerequisites are currently reported.')
          )
        );
      }
      var cards = snap.issues.map(function (issue) {
        var s = issue.severity === 'error' ? 'err' : issue.severity === 'warning' ? 'warn' : 'ok';
        return el('div', { class: 'card' },
          el('div', { class: 'issue-head' },
            el('span', { class: 'issue-title' }, issue.title),
            el('span', { class: 'issue-sev c-' + s }, issue.severity)
          ),
          el('div', { class: 'detail-meta' }, issue.detail),
          issue.target ? el('code', { class: 'detail-code' }, issue.target) : false
        );
      });
      return el('section', { class: 'section anim anim-d4' },
        SectionHead('Prerequisites'),
        cards
      );
    }

    /* ================================================================
     *  Setup Recovery
     * ================================================================ */

    function SetupSection(snap, setupSnap, bridge) {
      var lastAction = (setupSnap && setupSnap.state && setupSnap.state.lastAction)
        || (snap.setup && snap.setup.lastAction);
      var helperSummary = setupSnap
        ? {
            total: setupSnap.helpers.length,
            available: setupSnap.helpers.filter(function (h) { return h.available && h.supported; }).length,
            blocked: setupSnap.helpers.filter(function (h) { return !h.available || !h.supported; }).length
          }
        : null;

      var capabilityPackCatalog = (snap.packaging && snap.packaging.installer
        && snap.packaging.installer.providerSetup
        && Array.isArray(snap.packaging.installer.providerSetup.capabilityPacks))
        ? snap.packaging.installer.providerSetup.capabilityPacks : [];

      var capabilityPackCoverage = setupSnap
        ? Object.values(setupSnap.helpers.reduce(function (acc, helper) {
            var packId = helper.pack || 'shared';
            if (!acc[packId]) {
              var pack = capabilityPackCatalog.find(function (c) { return c.id === helper.pack; });
              acc[packId] = {
                label: pack ? pack.label : helper.pack ? helper.pack.replace(/_/g, ' ') : 'Shared host helpers',
                available: 0, total: 0
              };
            }
            acc[packId].total += 1;
            if (helper.available && helper.supported) acc[packId].available += 1;
            return acc;
          }, {}))
        : [];

      var localProviders = (snap.packaging && snap.packaging.installer
        && snap.packaging.installer.providerSetup
        && Array.isArray(snap.packaging.installer.providerSetup.localProviders))
        ? snap.packaging.installer.providerSetup.localProviders : [];

      var providerRollout = localProviders.length > 0
        ? {
            bundled: localProviders.filter(function (p) { return p.bundledInCurrentInstaller; }),
            additional: localProviders.filter(function (p) { return !p.bundledInCurrentInstaller; })
          }
        : null;

      var cards = [];

      /* Helper catalog */
      if (helperSummary) {
        var hc = [
          CardHead('Bundled helper catalog', helperSummary.available + '/' + helperSummary.total, 'c-ok'),
          el('div', { class: 'detail-meta' },
            helperSummary.available + ' helper(s) are ready from repo-owned packaged assets.')
        ];
        if (helperSummary.blocked > 0) {
          hc.push(el('div', { class: 'detail-meta c-warn' },
            helperSummary.blocked + ' helper(s) are unavailable on this host or build.'));
        }
        cards.push(el('div', { class: 'card' }, hc));
      }

      /* Capability pack coverage */
      if (capabilityPackCoverage.length > 0) {
        var cpc = [
          CardHead('Capability pack coverage', capabilityPackCoverage.length + ' pack(s)', 'c-ok')
        ];
        capabilityPackCoverage.forEach(function (pack) {
          cpc.push(el('div', { class: 'detail-meta' },
            pack.label + ': ' + pack.available + '/' + pack.total
              + ' helper(s) ready from repo-owned packaged assets.'));
        });
        cards.push(el('div', { class: 'card' }, cpc));
      }

      /* Local provider rollout */
      if (providerRollout) {
        var lpr = [
          CardHead('Local provider rollout', providerRollout.bundled.length + ' bundled', 'c-ok'),
          el('div', { class: 'detail-meta' },
            'Bundled in this desktop build: '
              + (providerRollout.bundled.length
                ? providerRollout.bundled.map(function (p) { return p.label; }).join(', ')
                : 'none')
              + '.')
        ];
        if (providerRollout.additional.length) {
          lpr.push(el('div', { class: 'detail-meta c-warn' },
            'Not bundled in this desktop build: '
              + providerRollout.additional.map(function (p) { return p.label; }).join(', ')
              + '.'));
        }
        cards.push(el('div', { class: 'card' }, lpr));
      }

      /* Recommended resume step */
      if (setupSnap && setupSnap.resumeAction) {
        var ra = setupSnap.resumeAction;
        var rac = [
          CardHead('Recommended resume step',
            ra.reason.replace(/_/g, ' '), 'c-warn'),
          el('div', { class: 'detail-meta' }, ra.summary),
          renderInterruptions(ra.interruptions),
          el('code', { class: 'detail-code' }, ra.mode)
        ];
        if (Array.isArray(ra.manualSteps) && ra.manualSteps.length) {
          rac.push(el('div', { class: 'detail-meta' }, ra.manualSteps[0]));
        }
        rac.push(Btn('Resume packaged setup', {
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

      /* Last action */
      if (lastAction) {
        var optCap = isOptionalCapabilityPackSetupAction(lastAction);
        var optionalPackLabel = describeSetupPack(lastAction.optionalFollowThroughPack)
          || 'capability-pack';
        var las = lastAction.runState === 'failed' ? 'err'
          : lastAction.status === 'ready' ? 'ok' : 'warn';
        var lac = [
          CardHead(lastAction.label || lastAction.helperId,
            lastAction.status || lastAction.runState, 'c-' + las),
          el('div', { class: 'detail-meta' },
            lastAction.summary || 'No setup action summary recorded.'),
          renderInterruptions(lastAction.interruptions),
          el('code', { class: 'detail-code' }, lastAction.mode)
        ];
        if (optCap) {
          lac.push(el('div', { class: 'detail-meta c-ok' },
            'Optional ' + optionalPackLabel
              + ' follow-through. This does not block the API baseline or first chat.'));
        }
        if (lastAction.restartRequired) {
          lac.push(el('div', { class: 'detail-meta c-warn' },
            'Restart is required before the next packaged setup step.'));
        }
        if (Array.isArray(lastAction.manualSteps) && lastAction.manualSteps.length) {
          lac.push(el('div', { class: 'detail-meta' }, lastAction.manualSteps[0]));
        }
        if (lastAction.error) {
          lac.push(el('div', { class: 'detail-meta c-err' }, lastAction.error));
        }
        cards.push(el('div', { class: 'card' }, lac));
      }

      if (cards.length === 0) {
        cards.push(el('div', { class: 'card' },
          el('div', { class: 'detail-meta' }, 'Setup helper status is still loading.')
        ));
      }

      return el('section', { class: 'section anim anim-d5', id: 'setup-summary' },
        SectionHead('Setup Recovery'),
        cards
      );
    }

    /* ================================================================
     *  Diagnostics
     * ================================================================ */

    function DiagSection(snap) {
      var diagnostics = snap.diagnostics;
      if (!diagnostics || !diagnostics.aggregation) {
        return el('section', { class: 'section anim anim-d6' },
          SectionHead('Diagnostics'),
          el('div', { class: 'card' },
            el('div', { class: 'detail-meta' }, 'Diagnostics bundle is still loading.'))
        );
      }

      /* Artifacts */
      var logRows = Array.isArray(diagnostics.serviceLogs)
        ? diagnostics.serviceLogs.filter(function (e) { return e && e.logPath; })
            .map(function (e) {
              return el('div', { class: 'detail-meta' },
                el('strong', null, getServiceDisplayName(e.service) + ': '),
                el('code', { class: 'detail-code' }, e.logPath));
            })
        : [];
      var historyRow = diagnostics.product && diagnostics.product.historyPath
        ? el('div', { class: 'detail-meta' },
            el('strong', null, 'product: '),
            el('code', { class: 'detail-code' }, diagnostics.product.historyPath))
        : false;

      var artifactCard = el('div', { class: 'card' },
        CardHead('Artifacts', diagnostics.activeAttemptId || 'no-attempt', 'c-ok'),
        el('div', { class: 'detail-meta' },
          el('strong', null, 'host: '),
          el('code', { class: 'detail-code' }, snap.hostStatePath || 'unknown')),
        historyRow,
        logRows
      );

      /* Layer summary */
      var agg = diagnostics.aggregation;
      var layerCard = el('div', { class: 'card' },
        CardHead('Layer summary', agg.attemptId || 'current', 'c-ok'),
        el('div', { class: 'detail-meta' },
          el('strong', null, 'runtime: '), agg.layers.runtime.summary),
        el('div', { class: 'detail-meta' },
          el('strong', null, 'product: '), agg.layers.product.summary),
        el('div', { class: 'detail-meta' },
          el('strong', null, 'host: '), agg.layers.host.summary)
      );

      /* Recent chronology */
      var chronology = Array.isArray(agg.chronology) ? agg.chronology.slice(0, 8) : [];
      var chronoItems = chronology.length
        ? chronology.map(function (evt) {
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
          })
        : [el('div', { class: 'detail-meta' }, 'No chronology entries have been captured yet.')];

      var chronoCard = el('div', { class: 'card' },
        CardHead('Recent chronology', String(chronology.length) + ' entries', 'c-warn'),
        chronoItems
      );

      return el('section', { class: 'section anim anim-d6' },
        SectionHead('Diagnostics'),
        artifactCard,
        layerCard,
        chronoCard
      );
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

    function showRecovery(snap) {
      splashEl.classList.add('hidden');
      recoveryEl.classList.remove('hidden');
      recoveryEl.innerHTML = '';
      recoveryEl.append(
        RecoveryHero(snap),
        ServicesSection(snap),
        RuntimeSection(snap),
        PrereqSection(snap),
        SetupSection(snap, currentSetupSnapshot, bridge),
        ActionsSection(snap, bridge),
        DiagSection(snap)
      );
    }

    function doRender() {
      var snap = currentSnapshot;
      if (!snap) return;

      if (showRecoveryDetails) {
        showRecovery(snap);
        return;
      }

      /* Splash is always in the DOM — just update it */
      splashEl.classList.remove('hidden');
      recoveryEl.classList.add('hidden');
      updateSplash(snap);
    }

    function refreshSetup() {
      if (!bridge) return;
      bridge.getSetupSnapshot()
        .then(function (s) { currentSetupSnapshot = s; doRender(); })
        .catch(function () {});
    }

    function applySnapshot(snapshot) {
      currentSnapshot = snapshot;
      /* If user was on recovery details and snapshot improved, stay there */
      doRender();
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
          return bridge.getSetupSnapshot().catch(function () { return null; })
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
        bridge.runAction('retry').finally(function () { btnRetry.disabled = false; });
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

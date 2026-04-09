export function buildDesktopBootstrapPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cats Desktop Host</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #F8F7F4;
      --surface: #fff;
      --surface-hover: #F3F0EB;
      --ink: #1A1917;
      --ink-2: #6E6A62;
      --ink-3: #A19D96;
      --border: #E6E2DB;
      --border-subtle: #EEEAE4;
      --accent: #C4653A;
      --accent-hover: #B35A31;
      --accent-soft: rgba(196,101,58,0.07);
      --ok: #1A8754;
      --ok-soft: rgba(26,135,84,0.09);
      --warn: #9A7B2E;
      --warn-soft: rgba(154,123,46,0.09);
      --err: #C23B2E;
      --err-soft: rgba(194,59,46,0.09);
      --radius: 12px;
      --shadow: 0 1px 3px rgba(26,25,23,0.04);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { max-width: 100%; overflow-x: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--ink);
      background: var(--bg);
      background-image: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(196,101,58,0.035), transparent);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Layout */
    .app { max-width: 620px; margin: 0 auto; padding: 56px 24px 72px; }
    .section { margin-bottom: 28px; }
    .section-head {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      font-weight: 650;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 10px;
    }
    .section-head::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border-subtle);
    }

    /* Hero */
    .hero { margin-bottom: 36px; }
    .hero-phase {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
      margin-bottom: 14px;
    }
    .hero-title {
      font-size: 30px;
      font-weight: 750;
      letter-spacing: -0.04em;
      line-height: 1.15;
      margin-bottom: 6px;
    }
    .hero-summary {
      font-size: 15px;
      color: var(--ink-2);
      line-height: 1.55;
    }

    /* Dot */
    .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .dot-ok { background: var(--ok); box-shadow: 0 0 0 3px var(--ok-soft); }
    .dot-warn { background: var(--warn); box-shadow: 0 0 0 3px var(--warn-soft); }
    .dot-err { background: var(--err); box-shadow: 0 0 0 3px var(--err-soft); }
    .dot-pulse { animation: pulse 1.6s ease-in-out infinite; }

    /* Card */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px 16px;
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
    .svc-row + .svc-row { border-top: 1px solid var(--border-subtle); }
    .svc-name { font-weight: 600; font-size: 13px; }
    .svc-status { font-size: 12px; font-weight: 500; text-align: right; }
    .svc-url {
      font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
      font-size: 11px;
      color: var(--ink-3);
      grid-column: 2 / -1;
    }
    .svc-detail {
      grid-column: 1 / -1;
      font-size: 12px;
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
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--ink-3);
      min-width: 54px;
    }
    .rt-value {
      font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
      font-size: 12px;
      word-break: break-all;
    }
    .rt-divider {
      margin: 10px 0;
      border: 0;
      border-top: 1px solid var(--border-subtle);
    }
    .rt-provider { font-size: 13px; color: var(--ink-2); }
    .rt-counts {
      display: flex;
      gap: 14px;
      margin-top: 6px;
      font-size: 12px;
    }
    .rt-count {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    /* Buttons */
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 9px 18px;
      border-radius: var(--radius);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: background 0.14s, box-shadow 0.14s, transform 0.1s;
      user-select: none;
    }
    .btn:hover:not(:disabled) {
      background: var(--surface-hover);
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
    }
    .btn:active:not(:disabled) { transform: scale(0.98); }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-primary {
      background: var(--accent);
      color: #fff;
      border-color: transparent;
    }
    .btn-primary:hover:not(:disabled) {
      background: var(--accent-hover);
      box-shadow: 0 2px 8px rgba(196,101,58,0.25);
    }

    /* Issue row */
    .issue-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .issue-title { font-size: 13px; font-weight: 600; }
    .issue-sev { font-size: 11px; font-weight: 600; }

    /* Setup & detail cards */
    .detail-meta { font-size: 12px; color: var(--ink-2); line-height: 1.5; }
    .detail-code {
      font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
      font-size: 11px;
      color: var(--ink-2);
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
    .card-label { font-size: 13px; font-weight: 600; }
    .card-badge { font-size: 11px; font-weight: 600; }

    /* Chip */
    .chip {
      display: inline-flex;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      background: var(--accent-soft);
      color: var(--accent);
      border: 1px solid var(--border-subtle);
    }
    .chip-list { display: flex; flex-wrap: wrap; gap: 5px; }

    /* Chronology */
    .chrono-item { padding: 8px 0; }
    .chrono-item + .chrono-item { border-top: 1px solid var(--border-subtle); }
    .chrono-summary { font-size: 13px; font-weight: 500; }
    .chrono-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 11px;
      color: var(--ink-3);
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
      .hero-title { font-size: 24px; }
      .svc-row { grid-template-columns: auto 1fr auto; }
      .svc-url { display: none; }
      .actions { flex-direction: column; }
      .btn { width: 100%; }
    }
  </style>
</head>
<body>
  <div id="app">
    <div class="app">
      <section class="hero anim">
        <div class="hero-phase">
          <span class="dot dot-warn dot-pulse"></span>
          <span class="c-warn">starting desktop host</span>
        </div>
        <h1 class="hero-title">Cats</h1>
        <p class="hero-summary">Waiting for local services.</p>
      </section>
    </div>
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
      return name === 'cats' ? 'cats-platform' : name;
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
     *  Hero
     * ================================================================ */

    function HeroSection(snap) {
      var isPending = snap.phase === 'starting_services' || snap.phase === 'checking_prerequisites';
      return el('section', { class: 'hero anim' },
        el('div', { class: 'hero-phase' },
          Dot(snap.status === 'ok' ? 'ready' : snap.status, isPending),
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

    function doRender() {
      var snap = currentSnapshot;
      if (!snap) return;
      var root = document.getElementById('app');
      root.innerHTML = '';

      var isRecovery = resolvePageMode(snap) === 'recovery';
      var app = el('div', { class: 'app' },
        HeroSection(snap),
        ServicesSection(snap),
        RuntimeSection(snap),
        isRecovery ? PrereqSection(snap) : false,
        isRecovery ? SetupSection(snap, currentSetupSnapshot, bridge) : false,
        ActionsSection(snap, bridge),
        isRecovery ? DiagSection(snap) : false
      );
      root.appendChild(app);
    }

    function refreshSetup() {
      if (!bridge) return;
      bridge.getSetupSnapshot()
        .then(function (s) { currentSetupSnapshot = s; doRender(); })
        .catch(function () {});
    }

    function applySnapshot(snapshot) {
      currentSnapshot = snapshot;
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
        var root = document.getElementById('app');
        root.innerHTML = '';
        root.appendChild(el('div', { class: 'app' },
          el('section', { class: 'hero anim' },
            el('h1', { class: 'hero-title' }, 'Cats'),
            el('p', { class: 'hero-summary' }, 'Desktop bridge is unavailable.')
          )
        ));
        return;
      }
      loadInitialSnapshot();
    }

    main();
  </script>
</body>
</html>`;
}

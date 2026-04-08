import { describeSetupPack, isOptionalCapabilityPackSetupAction } from './setupBridge.js';

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
        --bg: #FAFAF7;
        --panel: #ffffff;
        --panel-hover: #E8E4DC;
        --ink: #1A1A1A;
        --muted: #6B6560;
        --accent: #C4653A;
        --warning: #8D6830;
        --danger: #C0392B;
        --ok: #207A53;
        --line: #E4DFD7;
        --shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        --shadow-raised: 0 4px 16px rgba(0, 0, 0, 0.08);
      }
      * { box-sizing: border-box; }
      html, body {
        max-width: 100%;
        overflow-x: hidden;
      }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Aptos", system-ui, "Segoe UI", "Helvetica Neue", sans-serif;
        background: var(--bg);
        color: var(--ink);
      }
      main {
        width: min(980px, calc(100vw - 32px));
        margin: 32px auto;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 28px;
        box-shadow: var(--shadow);
      }
      main[data-page-mode="loading"] [data-recovery-only="true"] {
        display: none;
      }
      main[data-page-mode="loading"] .grid {
        grid-template-columns: 1fr;
      }
      main[data-page-mode="loading"] .column:last-child {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }
      h1, h2 { margin: 0; font-weight: 700; }
      h1 { font-size: 1.6rem; letter-spacing: -0.03em; }
      h2 {
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: var(--accent);
        font-weight: 700;
      }
      p { margin: 0; }
      .hero { display: grid; gap: 10px; margin-bottom: 24px; }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 600;
        width: fit-content;
      }
      .badge.status-ok { background: rgba(61, 167, 121, 0.11); color: var(--ok); }
      .badge.status-degraded { background: rgba(191, 146, 73, 0.12); color: var(--warning); }
      .badge.status-unavailable { background: rgba(192, 57, 43, 0.1); color: var(--danger); }
      .status-ok { color: var(--ok); }
      .status-degraded { color: var(--warning); }
      .status-unavailable { color: var(--danger); }
      .grid {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 16px;
        align-items: start;
      }
      .column {
        display: grid;
        gap: 16px;
      }
      .panel {
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--panel);
        padding: 16px;
        display: grid;
        gap: 12px;
      }
      .summary { font-size: 0.92rem; line-height: 1.5; color: var(--muted); }
      .service-row, .issue-row {
        display: grid;
        gap: 4px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--line);
        background: var(--panel);
      }
      .setup-summary {
        display: grid;
        gap: 10px;
      }
      .row-title {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }
      .row-title strong { font-size: 0.85rem; }
      .meta { font-size: 0.78rem; color: var(--muted); }
      .interruption-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .interruption-chip {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 2px 8px;
        background: rgba(196, 101, 58, 0.08);
        border: 1px solid var(--line);
        color: var(--accent);
        font-size: 0.69rem;
        font-weight: 600;
      }
      .issues, .services { display: grid; gap: 8px; }
      .actions {
        display: grid;
        gap: 8px;
      }
      .actions button[data-primary="true"] {
        order: -1;
      }
      .diagnostics-list, .chronology-list {
        display: grid;
        gap: 8px;
      }
      .chronology-item {
        padding: 8px 10px;
        border-radius: 12px;
        border: 1px solid var(--line);
        background: var(--panel);
        display: grid;
        gap: 3px;
      }
      .timeline-meta {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        color: var(--muted);
        font-size: 0.69rem;
      }
      button {
        border: 0;
        border-radius: 12px;
        padding: 10px 14px;
        font: inherit;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        background: var(--panel);
        color: var(--ink);
        border: 1px solid var(--line);
        transition: background 140ms ease;
      }
      button:hover {
        background: var(--panel-hover);
      }
      button[data-primary="true"] {
        background: var(--accent);
        color: #fff;
        border-color: transparent;
      }
      button[data-primary="true"]:hover {
        background: #b55a32;
      }
      button:disabled {
        cursor: default;
        opacity: 0.5;
        pointer-events: none;
      }
      code {
        font-family: "Cascadia Code", "Consolas", monospace;
        font-size: 0.75rem;
        white-space: pre-wrap;
      }
      .grid,
      .column,
      .panel,
      .services,
      .issues,
      .actions,
      .diagnostics-list,
      .chronology-list,
      .setup-summary,
      .service-row,
      .issue-row,
      .chronology-item,
      .row-title,
      .summary,
      .meta,
      .timeline-meta,
      code {
        min-width: 0;
      }
      .summary,
      .row-title strong,
      .meta,
      .timeline-meta span,
      code {
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      @media (max-width: 860px) {
        main { padding: 16px; margin: 12px auto; }
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main id="host-shell" data-page-mode="loading">
      <section class="hero">
        <span id="phase-badge" class="badge status-degraded">Starting desktop host</span>
        <h1>Cats</h1>
        <p id="summary" class="summary">Waiting for local services.</p>
      </section>
      <section class="grid">
        <div class="column">
          <section class="panel">
            <h2>Services</h2>
            <div id="services" class="services"></div>
          </section>
          <section class="panel" data-recovery-only="true">
            <h2>Prerequisites</h2>
            <div id="issues" class="issues"></div>
          </section>
        </div>
        <div class="column">
          <section class="panel">
            <h2>Runtime</h2>
            <div id="runtime-summary" class="meta"></div>
            <div id="provider-summary" class="meta"></div>
          </section>
          <section class="panel" data-recovery-only="true">
            <h2>Setup Recovery</h2>
            <div id="setup-summary" class="setup-summary"></div>
          </section>
          <section class="panel">
            <h2>Actions</h2>
            <div id="actions" class="actions"></div>
          </section>
          <section class="panel" data-recovery-only="true">
            <h2>Diagnostics</h2>
            <div id="diagnostics" class="diagnostics-list"></div>
          </section>
        </div>
      </section>
    </main>
    <script>
      const bridge = window.catsDesktopHost;
      const phaseBadge = document.getElementById('phase-badge');
      const hostShell = document.getElementById('host-shell');
      const summary = document.getElementById('summary');
      const services = document.getElementById('services');
      const issues = document.getElementById('issues');
      const actions = document.getElementById('actions');
      const runtimeSummary = document.getElementById('runtime-summary');
      const providerSummary = document.getElementById('provider-summary');
      const setupSummary = document.getElementById('setup-summary');
      const diagnosticsSummary = document.getElementById('diagnostics');
      let latestSnapshot = null;
      let snapshotListenerBound = false;
      let retryHandle = null;
      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }
      function getServiceDisplayName(serviceName) {
        return serviceName === 'cats' ? 'cats-platform' : serviceName;
      }
      function renderServices(snapshot) {
        services.innerHTML = snapshot.services.map((service) => {
          const statusClass = 'status-' + (service.status === 'ready' ? 'ok' : service.status === 'failed' ? 'unavailable' : 'degraded');
          return '<article class="service-row">'
            + '<div class="row-title"><strong>' + escapeHtml(getServiceDisplayName(service.name)) + '</strong><span class="' + statusClass + '">' + escapeHtml(service.status) + '</span></div>'
            + '<div class="meta"><code>' + escapeHtml(service.healthUrl) + '</code></div>'
            + (service.error ? '<div class="meta status-unavailable">' + escapeHtml(service.error) + '</div>' : '')
            + (service.lastOutput ? '<div class="meta"><code>' + escapeHtml(service.lastOutput) + '</code></div>' : '')
            + '</article>';
        }).join('');
      }
      function renderIssues(snapshot) {
        if (!snapshot.issues.length) {
          issues.innerHTML = '<article class="issue-row"><div class="meta">No blocking prerequisites are currently reported.</div></article>';
          return;
        }
        issues.innerHTML = snapshot.issues.map((issue) => {
          const statusClass = issue.severity === 'error' ? 'status-unavailable' : issue.severity === 'warning' ? 'status-degraded' : 'status-ok';
          return '<article class="issue-row">'
            + '<div class="row-title"><strong>' + escapeHtml(issue.title) + '</strong><span class="' + statusClass + '">' + escapeHtml(issue.severity) + '</span></div>'
            + '<div class="meta">' + escapeHtml(issue.detail) + '</div>'
            + (issue.target ? '<div class="meta"><code>' + escapeHtml(issue.target) + '</code></div>' : '')
            + '</article>';
        }).join('');
      }
      function renderActions(snapshot) {
        actions.innerHTML = '';
        for (const action of snapshot.actions) {
          const button = document.createElement('button');
          button.textContent = action.label;
          button.disabled = Boolean(action.disabled);
          button.dataset.primary = action.primary ? 'true' : 'false';
          button.addEventListener('click', async () => {
            button.disabled = true;
            try {
              await bridge.runAction(action.id);
              if (action.id === 'resume_setup') {
                const nextSetupSnapshot = await bridge.getSetupSnapshot().catch(() => null);
                renderSetup(latestSnapshot || snapshot, nextSetupSnapshot);
              }
            } finally {
              button.disabled = Boolean(action.disabled);
            }
          });
          actions.appendChild(button);
        }
      }
      function renderInterruptions(interruptions) {
        if (!Array.isArray(interruptions) || interruptions.length === 0) {
          return '';
        }
        return '<div class="interruption-list">'
          + interruptions.map((entry) => (
            '<span class="interruption-chip">' + escapeHtml(String(entry.kind || '').replace(/_/g, ' ')) + '</span>'
          )).join('')
          + '</div>';
      }
      function renderSetup(snapshot, setupSnapshot) {
        const helperSummary = setupSnapshot
          ? {
              total: setupSnapshot.helpers.length,
              available: setupSnapshot.helpers.filter((helper) => helper.available && helper.supported).length,
              blocked: setupSnapshot.helpers.filter((helper) => !helper.available || !helper.supported).length,
            }
          : null;
        const capabilityPackCatalog = Array.isArray(snapshot.packaging && snapshot.packaging.installer
          && snapshot.packaging.installer.providerSetup
          && snapshot.packaging.installer.providerSetup.capabilityPacks)
          ? snapshot.packaging.installer.providerSetup.capabilityPacks
          : [];
        const capabilityPackCoverage = setupSnapshot
          ? Object.entries(setupSnapshot.helpers.reduce((acc, helper) => {
              const packId = helper.pack || 'shared';
              if (!acc[packId]) {
                const pack = capabilityPackCatalog.find((candidate) => candidate.id === helper.pack);
                acc[packId] = {
                  label: pack ? pack.label : helper.pack ? helper.pack.replace(/_/g, ' ') : 'Shared host helpers',
                  available: 0,
                  total: 0,
                };
              }
              acc[packId].total += 1;
              if (helper.available && helper.supported) {
                acc[packId].available += 1;
              }
              return acc;
            }, {})).map(([, value]) => value)
          : [];
        const localProviders = Array.isArray(snapshot.packaging && snapshot.packaging.installer
          && snapshot.packaging.installer.providerSetup
          && snapshot.packaging.installer.providerSetup.localProviders)
          ? snapshot.packaging.installer.providerSetup.localProviders
          : [];
        const providerRollout = localProviders.length > 0
          ? {
              bundled: localProviders.filter((provider) => provider.bundledInCurrentInstaller),
              additional: localProviders.filter((provider) => !provider.bundledInCurrentInstaller),
            }
          : null;
        const lastAction = (setupSnapshot && setupSnapshot.state && setupSnapshot.state.lastAction)
          || snapshot.setup && snapshot.setup.lastAction;

        if (!helperSummary && !providerRollout && !lastAction) {
          setupSummary.innerHTML = '<article class="issue-row"><div class="meta">Setup helper status is still loading.</div></article>';
          return;
        }

        const cards = [];
        if (helperSummary) {
          cards.push(
            '<article class="issue-row">'
              + '<div class="row-title"><strong>Bundled helper catalog</strong><span class="status-ok">'
              + helperSummary.available + '/' + helperSummary.total + '</span></div>'
              + '<div class="meta">' + helperSummary.available + ' helper(s) are ready from repo-owned packaged assets.</div>'
              + (helperSummary.blocked > 0
                ? '<div class="meta status-degraded">' + helperSummary.blocked + ' helper(s) are unavailable on this host or build.</div>'
                : '')
              + '</article>',
          );
        }

        if (capabilityPackCoverage.length > 0) {
          cards.push(
            '<article class="issue-row">'
              + '<div class="row-title"><strong>Capability pack coverage</strong><span class="status-ok">'
              + capabilityPackCoverage.length + ' pack(s)</span></div>'
              + capabilityPackCoverage.map((pack) => (
                '<div class="meta">' + escapeHtml(pack.label) + ': '
                + escapeHtml(String(pack.available)) + '/' + escapeHtml(String(pack.total))
                + ' helper(s) ready from repo-owned packaged assets.</div>'
              )).join('')
              + '</article>',
          );
        }

        if (providerRollout) {
          cards.push(
            '<article class="issue-row">'
              + '<div class="row-title"><strong>Local provider rollout</strong><span class="status-ok">'
              + providerRollout.bundled.length + ' bundled</span></div>'
              + '<div class="meta">Bundled in this desktop build: '
              + escapeHtml(
                providerRollout.bundled.length
                  ? providerRollout.bundled.map((provider) => provider.label).join(', ')
                  : 'none',
              )
              + '.</div>'
              + (providerRollout.additional.length
                ? '<div class="meta status-degraded">Not bundled in this desktop build: '
                  + escapeHtml(providerRollout.additional.map((provider) => provider.label).join(', '))
                  + '.</div>'
                : '')
              + '</article>',
          );
        }

        if (setupSnapshot && setupSnapshot.resumeAction) {
          cards.push(
            '<article class="issue-row">'
              + '<div class="row-title"><strong>Recommended resume step</strong><span class="status-degraded">'
              + escapeHtml(setupSnapshot.resumeAction.reason.replace(/_/g, ' ')) + '</span></div>'
              + '<div class="meta">' + escapeHtml(setupSnapshot.resumeAction.summary) + '</div>'
              + renderInterruptions(setupSnapshot.resumeAction.interruptions)
              + '<div class="meta"><code>' + escapeHtml(setupSnapshot.resumeAction.mode) + '</code></div>'
              + (Array.isArray(setupSnapshot.resumeAction.manualSteps) && setupSnapshot.resumeAction.manualSteps.length
                ? '<div class="meta">' + escapeHtml(setupSnapshot.resumeAction.manualSteps[0]) + '</div>'
                : '')
              + '<div><button type="button" data-resume-setup="true">Resume packaged setup</button></div>'
              + '</article>',
          );
        }

        if (lastAction) {
          const optionalCapabilityFollowThrough = isOptionalCapabilityPackSetupAction(lastAction);
          const optionalPackLabel = describeSetupPack(lastAction.optionalFollowThroughPack)
            ?? 'capability-pack';
          const statusClass = lastAction.runState === 'failed'
            ? 'status-unavailable'
            : lastAction.status === 'ready'
              ? 'status-ok'
              : lastAction.restartRequired
                ? 'status-degraded'
                : 'status-degraded';
          cards.push(
            '<article class="issue-row">'
              + '<div class="row-title"><strong>' + escapeHtml(lastAction.label || lastAction.helperId) + '</strong><span class="' + statusClass + '">'
              + escapeHtml(lastAction.status || lastAction.runState) + '</span></div>'
              + '<div class="meta">' + escapeHtml(lastAction.summary || 'No setup action summary recorded.') + '</div>'
              + renderInterruptions(lastAction.interruptions)
              + '<div class="meta"><code>' + escapeHtml(lastAction.mode) + '</code></div>'
              + (optionalCapabilityFollowThrough
                ? '<div class="meta status-ok">Optional ' + escapeHtml(optionalPackLabel)
                  + ' follow-through. This does not block the API baseline or first chat.</div>'
                : '')
              + (lastAction.restartRequired ? '<div class="meta status-degraded">Restart is required before the next packaged setup step.</div>' : '')
              + (Array.isArray(lastAction.manualSteps) && lastAction.manualSteps.length
                ? '<div class="meta">' + escapeHtml(lastAction.manualSteps[0]) + '</div>'
                : '')
              + (lastAction.error ? '<div class="meta status-unavailable">' + escapeHtml(lastAction.error) + '</div>' : '')
              + '</article>',
          );
        }

        setupSummary.innerHTML = cards.join('');
        const resumeButton = setupSummary.querySelector('[data-resume-setup="true"]');
        if (resumeButton && bridge && setupSnapshot && setupSnapshot.resumeAction) {
          resumeButton.addEventListener('click', async () => {
            resumeButton.disabled = true;
            try {
              const nextSetupSnapshot = await bridge.resumeSetup();
              renderSetup(latestSnapshot || snapshot, nextSetupSnapshot);
            } finally {
              resumeButton.disabled = false;
            }
          });
        }
      }
      function renderDiagnostics(snapshot) {
        const diagnostics = snapshot.diagnostics;
        if (!diagnostics || !diagnostics.aggregation) {
          diagnosticsSummary.innerHTML = '<article class="issue-row"><div class="meta">Diagnostics bundle is still loading.</div></article>';
          return;
        }

        const chronology = Array.isArray(diagnostics.aggregation.chronology)
          ? diagnostics.aggregation.chronology.slice(0, 8)
          : [];
        const logRows = Array.isArray(diagnostics.serviceLogs)
          ? diagnostics.serviceLogs
            .filter((entry) => entry && entry.logPath)
            .map((entry) => (
              '<div class="meta"><strong>' + escapeHtml(getServiceDisplayName(entry.service)) + ':</strong> <code>'
              + escapeHtml(entry.logPath) + '</code></div>'
            )).join('')
          : '';
        const historyPath = diagnostics.product && diagnostics.product.historyPath
          ? '<div class="meta"><strong>product:</strong> <code>' + escapeHtml(diagnostics.product.historyPath) + '</code></div>'
          : '';
        diagnosticsSummary.innerHTML = ''
          + '<article class="issue-row">'
          + '<div class="row-title"><strong>Artifacts</strong><span class="status-ok">'
          + escapeHtml(diagnostics.activeAttemptId || 'no-attempt') + '</span></div>'
          + '<div class="meta"><strong>host:</strong> <code>' + escapeHtml(snapshot.hostStatePath || 'unknown') + '</code></div>'
          + historyPath
          + logRows
          + '</article>'
          + '<article class="issue-row">'
          + '<div class="row-title"><strong>Layer summary</strong><span class="status-ok">'
          + escapeHtml(diagnostics.aggregation.attemptId || 'current') + '</span></div>'
          + '<div class="meta"><strong>runtime:</strong> ' + escapeHtml(diagnostics.aggregation.layers.runtime.summary) + '</div>'
          + '<div class="meta"><strong>product:</strong> ' + escapeHtml(diagnostics.aggregation.layers.product.summary) + '</div>'
          + '<div class="meta"><strong>host:</strong> ' + escapeHtml(diagnostics.aggregation.layers.host.summary) + '</div>'
          + '</article>'
          + '<article class="issue-row">'
          + '<div class="row-title"><strong>Recent chronology</strong><span class="status-degraded">'
          + escapeHtml(String(chronology.length)) + ' entries</span></div>'
          + (chronology.length
            ? '<div class="chronology-list">'
              + chronology.map((event) => (
                '<div class="chronology-item">'
                  + '<strong>' + escapeHtml(event.summary) + '</strong>'
                  + '<div class="timeline-meta"><span>' + escapeHtml(event.layer) + '</span><span>' + escapeHtml(event.kind) + '</span><span>' + escapeHtml(event.status) + '</span><span>' + escapeHtml(event.timestamp) + '</span></div>'
                  + (event.error && event.error.message
                    ? '<div class="meta status-unavailable">' + escapeHtml(event.error.message) + '</div>'
                    : '')
                + '</div>'
              )).join('')
              + '</div>'
            : '<div class="meta">No chronology entries have been captured yet.</div>')
          + '</article>';
      }
      function resolvePageMode(snapshot) {
        return snapshot.phase === 'failed' || snapshot.phase === 'needs_prerequisites'
          ? 'recovery'
          : 'loading';
      }
      function applySnapshot(snapshot) {
        latestSnapshot = snapshot;
        if (hostShell) {
          hostShell.dataset.pageMode = resolvePageMode(snapshot);
        }
        phaseBadge.className = 'badge status-' + snapshot.status;
        phaseBadge.textContent = snapshot.phase.replace(/_/g, ' ');
        summary.textContent = snapshot.summary;
        runtimeSummary.innerHTML = '<div>App: <code>' + escapeHtml(snapshot.app.baseUrl) + '</code></div>'
          + '<div>Runtime: <code>' + escapeHtml(snapshot.runtime.baseUrl) + '</code></div>';
        if (snapshot.runtime.providerSummary) {
          providerSummary.innerHTML = '<div>' + escapeHtml(snapshot.runtime.providerSummary.summary) + '</div>'
            + '<div class="meta">ok ' + snapshot.runtime.providerSummary.ok
            + ' / attention ' + (snapshot.runtime.providerSummary.degraded + snapshot.runtime.providerSummary.unavailable)
            + '</div>';
        } else {
          providerSummary.textContent = 'Provider diagnostics are still loading.';
        }
        renderServices(snapshot);
        renderIssues(snapshot);
        renderActions(snapshot);
        renderSetup(snapshot, null);
        renderDiagnostics(snapshot);
      }
      function ensureSnapshotListener() {
        if (snapshotListenerBound) {
          return;
        }
        bridge.onSnapshot(applySnapshot);
        snapshotListenerBound = true;
      }
      function scheduleInitialSnapshotRetry() {
        if (retryHandle !== null) {
          return;
        }
        retryHandle = window.setTimeout(() => {
          retryHandle = null;
          void loadInitialSnapshot();
        }, 750);
      }
      async function loadInitialSnapshot() {
        try {
          const snapshot = await bridge.getSnapshot();
          const setupSnapshot = await bridge.getSetupSnapshot().catch(() => null);
          ensureSnapshotListener();
          applySnapshot(snapshot);
          renderSetup(snapshot, setupSnapshot);
        } catch {
          summary.textContent = 'Waiting for local services.';
          scheduleInitialSnapshotRetry();
        }
      }
      async function main() {
        if (!bridge) {
          summary.textContent = 'Desktop bridge is unavailable.';
          return;
        }
        void loadInitialSnapshot();
      }
      void main();
    </script>
  </body>
</html>`;
}

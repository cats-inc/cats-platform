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
        --bg: #f5f1e8;
        --panel: rgba(255, 252, 247, 0.86);
        --ink: #1f1a14;
        --muted: #6e6254;
        --accent: #9d4f2e;
        --warning: #b56b00;
        --danger: #9b2c2c;
        --ok: #1f6f50;
        --line: rgba(54, 38, 26, 0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", "Aptos", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(231, 197, 175, 0.8), transparent 28rem),
          linear-gradient(135deg, #f7f0e2 0%, #f0e5d8 40%, #efe9df 100%);
        color: var(--ink);
      }
      main {
        width: min(980px, calc(100vw - 32px));
        margin: 32px auto;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 28px;
        padding: 28px;
        backdrop-filter: blur(18px);
        box-shadow: 0 18px 48px rgba(68, 43, 23, 0.12);
      }
      h1, h2 { margin: 0; font-weight: 700; }
      h1 { font-size: 30px; letter-spacing: -0.04em; }
      h2 {
        font-size: 15px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--muted);
      }
      p { margin: 0; }
      .hero { display: grid; gap: 12px; margin-bottom: 24px; }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.7);
        border: 1px solid var(--line);
        width: fit-content;
        color: var(--muted);
      }
      .status-ok { color: var(--ok); }
      .status-degraded { color: var(--warning); }
      .status-unavailable { color: var(--danger); }
      .grid {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 20px;
      }
      .column { display: grid; gap: 20px; }
      .panel {
        border: 1px solid var(--line);
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.7);
        padding: 18px;
        display: grid;
        gap: 14px;
      }
      .summary { font-size: 18px; line-height: 1.5; }
      .service-row, .issue-row {
        display: grid;
        gap: 6px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.85);
      }
      .row-title {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
      }
      .row-title strong { font-size: 15px; }
      .meta { font-size: 13px; color: var(--muted); }
      .issues, .services, .actions { display: grid; gap: 12px; }
      .actions { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
      button {
        border: 0;
        border-radius: 16px;
        padding: 12px 14px;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        background: #fff;
        color: var(--ink);
        border: 1px solid var(--line);
        transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
      }
      button:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 18px rgba(74, 47, 24, 0.08);
      }
      button[data-primary="true"] {
        background: linear-gradient(135deg, var(--accent), #bb6e48);
        color: #fff;
        border-color: transparent;
      }
      button:disabled {
        cursor: default;
        opacity: 0.6;
        transform: none;
        box-shadow: none;
      }
      code {
        font-family: "Cascadia Code", "Consolas", monospace;
        font-size: 12px;
      }
      @media (max-width: 860px) {
        main { padding: 18px; margin: 12px auto; }
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span id="phase-badge" class="badge">Starting desktop host</span>
        <h1>Cats Desktop Host</h1>
        <p id="summary" class="summary">Waiting for local services.</p>
      </section>
      <section class="grid">
        <div class="column">
          <section class="panel">
            <h2>Services</h2>
            <div id="services" class="services"></div>
          </section>
          <section class="panel">
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
          <section class="panel">
            <h2>Actions</h2>
            <div id="actions" class="actions"></div>
          </section>
        </div>
      </section>
    </main>
    <script>
      const bridge = window.catsDesktopHost;
      const phaseBadge = document.getElementById('phase-badge');
      const summary = document.getElementById('summary');
      const services = document.getElementById('services');
      const issues = document.getElementById('issues');
      const actions = document.getElementById('actions');
      const runtimeSummary = document.getElementById('runtime-summary');
      const providerSummary = document.getElementById('provider-summary');
      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }
      function renderServices(snapshot) {
        services.innerHTML = snapshot.services.map((service) => {
          const statusClass = 'status-' + (service.status === 'ready' ? 'ok' : service.status === 'failed' ? 'unavailable' : 'degraded');
          return '<article class="service-row">'
            + '<div class="row-title"><strong>' + escapeHtml(service.name) + '</strong><span class="' + statusClass + '">' + escapeHtml(service.status) + '</span></div>'
            + '<div class="meta"><code>' + escapeHtml(service.healthUrl) + '</code></div>'
            + (service.error ? '<div class="meta status-unavailable">' + escapeHtml(service.error) + '</div>' : '')
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
            } finally {
              button.disabled = Boolean(action.disabled);
            }
          });
          actions.appendChild(button);
        }
      }
      function applySnapshot(snapshot) {
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
      }
      async function main() {
        if (!bridge) {
          summary.textContent = 'Desktop bridge is unavailable.';
          return;
        }
        const snapshot = await bridge.getSnapshot();
        applySnapshot(snapshot);
        bridge.onSnapshot(applySnapshot);
      }
      void main();
    </script>
  </body>
</html>`;
}

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

    /* Onboarding mode (CLI install gate for first-run / reset) */
    .onboarding-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      padding: 38vh 24px 56px;
      text-align: center;
    }
    .onboarding-headline {
      font-size: 0.92rem;
      color: var(--muted);
      line-height: 1.5;
      margin-top: 8px;
      margin-bottom: 18px;
      max-width: 480px;
    }
    /* Onboarding action row matches splash error-actions layout exactly so
       buttons don't drift between modes. */
    .onboarding-actions {
      display: flex;
      flex-direction: row;
      gap: 8px;
      justify-content: center;
      margin-bottom: 24px;
    }
    .cli-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      width: 100%;
      max-width: 720px;
    }
    .cli-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 10px 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      min-height: 108px;
      box-shadow: var(--shadow);
    }
    .cli-card.cli-card-hidden { display: none; }
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
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid var(--border);
      border-top-color: var(--muted-soft);
      border-radius: 50%;
      animation: bootSpin 0.8s linear infinite;
      vertical-align: middle;
    }
    .cli-card-btn .cli-card-spinner {
      width: 10px;
      height: 10px;
    }
    .cli-row-break {
      grid-column: 1 / -1;
      height: 0;
    }
    .cli-row-break.cli-card-hidden { display: none; }

    /* Responsive */
    @media (max-width: 520px) {
      .app { padding: 32px 16px 56px; }
      .hero-title { font-size: 1.25rem; }
      .svc-row { grid-template-columns: auto 1fr auto; }
      .svc-url { display: none; }
      .actions { flex-direction: column; }
      .btn { width: 100%; }
      .error-actions { flex-direction: column; }
      .onboarding-page { padding: 16vh 16px 40px; }
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
          <span id="splash-text"></span>
        </p>
      </section>
      <p id="slow-hint" class="slow-hint hero-summary"></p>
      <div id="error-area" class="error-area">
        <p id="startup-error-copy" class="hero-summary"></p>
        <div class="error-actions">
          <button id="btn-retry" class="btn" type="button"></button>
          <button id="btn-details" class="btn" type="button"></button>
        </div>
      </div>
    </div>
    <div id="onboarding" class="hidden"></div>
    <div id="recovery" class="app hidden"></div>
  </div>
  <script>
    'use strict';

    /* ================================================================
     *  Utilities
     * ================================================================ */

    var BOOTSTRAP_COPY = {
      en: {
        'action.continue': 'Continue',
        'action.continueSetupFix': 'Continue setup fix',
        'action.return': '\u2190 Return',
        'action.retry': 'Retry',
        'action.showDetails': 'Show details',
        'action.showFewer': 'Show fewer',
        'action.showMore': 'Show more',
        'actionLabel.continueToSetup': 'Continue to Setup',
        'actionLabel.enterReadyChatFlow': 'Enter ready chat flow',
        'actionLabel.openCats': 'Open Cats',
        'actionLabel.openRuntimeDiagnostics': 'Open runtime diagnostics',
        'actionLabel.openSetup': 'Open Setup',
        'actionLabel.openSetupLower': 'Open setup',
        'actionLabel.prepareFirstRunSetup': 'Prepare first-run setup or remediation handoff',
        'actionLabel.quitCats': 'Quit Cats',
        'actionLabel.resumePackagedSetup': 'Resume packaged setup',
        'actionLabel.resumeSetup': 'Resume Setup',
        'actionLabel.retryCheck': 'Retry Check',
        'actionLabel.retryCliScan': 'Retry CLI Scan',
        'actionLabel.retryDesktopHostStartup': 'Retry desktop host startup',
        'actionLabel.retryStartup': 'Retry Startup',
        'actionLabel.scanReadiness': 'Scan provider and prerequisite readiness',
        'actionLabel.startPlatformServer': 'Start cats-platform server',
        'actionLabel.startRuntimeSidecar': 'Start cats-runtime sidecar',
        'diagnostics.advancedLoading': 'Advanced diagnostics are still loading.',
        'diagnostics.attempt': 'Attempt: ',
        'diagnostics.current': 'current',
        'diagnostics.entries': '{count} entries',
        'diagnostics.history': 'History: ',
        'diagnostics.host': 'host: ',
        'diagnostics.hostState': 'Host state: ',
        'diagnostics.layerSummary': 'Layer summary',
        'diagnostics.log': '{service} log: ',
        'diagnostics.noLogPaths': 'No advanced log paths available yet.',
        'diagnostics.openAdvanced': 'Open advanced diagnostics',
        'diagnostics.product': 'product: ',
        'diagnostics.recentEvents': 'Recent events',
        'diagnostics.runtime': 'runtime: ',
        'diagnostics.summary.hostUnavailable': 'Host diagnostics are not available yet.',
        'diagnostics.summary.noProductEvents':
          'No product-owned onboarding events were recorded for this bootstrap attempt yet.',
        'diagnostics.summary.productUnavailable': 'Product diagnostics are not available yet.',
        'diagnostics.summary.productOnboardingUnavailable': 'Product onboarding diagnostics are not available yet.',
        'diagnostics.summary.restoredIncomplete':
          'Restored desktop host state is incomplete; rechecking desktop services.',
        'diagnostics.summary.runtimeUnavailable': 'Runtime diagnostics are not available yet.',
        'diagnostics.summary.productOnboardingEmpty':
          'No product-owned onboarding events have been recorded yet.',
        'diagnostics.summary.productSetupOpened': 'Packaged platform setup was opened.',
        'diagnostics.summary.productSetupSubmissionStarted':
          'Packaged setup submission started.',
        'diagnostics.summary.productSetupStatePersisted':
          'Setup state snapshot persisted.',
        'diagnostics.summary.productSetupPayloadFallback':
          'Setup completed but app shell payload used a fallback envelope.',
        'diagnostics.summary.productSetupCompleted': 'Packaged setup completed.',
        'diagnostics.summary.productPlatformSetupCompleted':
          'Packaged platform setup completed.',
        'diagnostics.summary.productSetupFailedBeforeResponse':
          'Packaged setup failed before completion response was returned.',
        'fixed.startupError': 'Mew\u2026 something tripped me up during startup.',
        'issue.serviceError': '{service} error',
        'issue.noSpecificIssues': 'No specific issues were reported.',
        'issue.hostStartupError.title': 'Desktop host failed to finish startup',
        'issue.runtimeUnreachable.title': 'Cats cannot reach cats-runtime',
        'issue.runtimeUnreachable.detail': 'The local app booted, but its runtime dependency is still unreachable.',
        'issue.noProviderTargets.title': 'No provider targets are configured yet',
        'issue.noProviderTargets.detail.afterSetup': 'Setup is complete. Open Cats to recover in-app after you restore a provider path.',
        'issue.noProviderTargets.detail.beforeSetup': 'Continue into setup to choose an API baseline or optional local CLI provider path.',
        'issue.noReadyProviderPath.title': 'No provider target is currently ready',
        'issue.providerDiagnosticsAttention.detail': 'Provider diagnostics need attention.',
        'issue.providerDefaultTarget.title': '{target} needs attention',
        'issue.optionalPackFollowThrough.title': 'Optional {pack} is available for follow-through',
        'issue.setup.followThrough.title': 'Packaged setup still needs follow-through',
        'issue.setup.restartRequired.title': 'Packaged setup needs a Windows restart before it can continue',
        'issue.setup.relaunchRequired.title': 'Packaged setup needs the desktop host to relaunch',
        'issue.setup.elevationRequired.title': 'Packaged setup needs elevation before it can continue',
        'issue.setup.authRequired.title': 'Installed provider still needs authentication',
        'issue.setup.firstWslBootRequired.title': 'WSL distro needs its first boot before setup can continue',
        'issue.setup.dockerWarmUpRequired.title': 'Docker still needs to finish starting before setup can continue',
        'issue.setup.recoveryRequired.title': 'Packaged setup helper needs recovery',
        'issue.setup.manualFollowThrough.title': 'Packaged setup still has manual follow-through',
        'issue.runtimeDiagnosticsPending.title': 'Runtime diagnostics are still loading',
        'issue.runtimeDiagnosticsPending.detail': 'The desktop host has not finished its prerequisite scan yet.',
        'loading.almostReady': 'Almost ready\u2026',
        'loading.ready': 'Ready.',
        'loading.retrying': 'Trying again\u2026',
        'loading.startingUp': 'Starting up\u2026',
        'onboarding.headline': 'Welcome. Install a CLI now or continue into setup.',
        'onboarding.installCli': 'Install a CLI',
        'onboarding.installNodeFirst': 'Install Node first',
        'onboarding.nodeLabel': 'Node.js / npm',
        'onboarding.nodeStatus': 'Required by npm CLIs',
        'recovery.summary.details': 'See details below.',
        'recovery.summary.failedHelper': 'A local helper did not start. Try again first; use advanced details only if it keeps failing.',
        'recovery.summary.failedService': '{service} did not start. Try again first; use advanced details only if it keeps failing.',
        'recovery.summary.fixBelow': 'Finish the setup fix below, then Cats will continue.',
        'recovery.summary.helperAttention': 'You can keep using Cats now. Repair the local helper when convenient, or open advanced details if you need them.',
        'recovery.summary.noCliAfterSetup': 'Cats did not find an installed CLI. Install at least one CLI below, then continue.',
        'recovery.summary.noCliBeforeSetup': 'Cats needs at least one installed CLI before setup can continue.',
        'recovery.summary.readyForSetup': 'Local helpers are running. Continue into setup to get started.',
        'recovery.title.failed': 'Cats needs a quick restart',
        'recovery.title.helperAttention': 'Cats can open, but one helper needs attention',
        'recovery.title.installCliContinue': 'Install a CLI to continue using Cats',
        'recovery.title.oneSetupFix': 'Cats needs one setup fix',
        'recovery.title.pickCli': 'Pick a CLI to get started',
        'recovery.title.readyForSetup': 'Cats is ready to set up',
        'recovery.title.recovery': 'Cats recovery',
        'section.advancedDiagnostics': 'Advanced diagnostics',
        'section.advancedLogsPaths': 'Advanced logs and paths',
        'section.diagnostics': 'Diagnostics',
        'section.localHelpers': 'Local helpers',
        'section.setupFix': 'Setup fix',
        'section.whatNeedsAttention': 'What needs attention',
        'setup.noSummary': 'No summary recorded.',
        'setup.recommendedNextStep': 'Recommended next step',
        'setup.restartNeeded': 'A restart is needed before the next step.',
        'setupReason.authRequired': 'authentication required',
        'setupReason.changesRequired': 'changes required',
        'setupReason.dockerWarmUpRequired': 'Docker warm-up required',
        'setupReason.elevationRequired': 'elevation required',
        'setupReason.firstWslBootRequired': 'first WSL boot required',
        'setupReason.manualFollowUp': 'manual follow-through',
        'setupReason.notInstalled': 'not installed',
        'setupReason.relaunchRequired': 'relaunch required',
        'setupReason.restartRequired': 'restart required',
        'setupReason.retryFailed': 'retry failed',
        'setupReason.verificationRecommended': 'verification recommended',
        'setupMode.apply': 'apply',
        'setupMode.check': 'check',
        'setupMode.force': 'force',
        'setupMode.uninstall': 'uninstall',
        'setupMode.upgrade': 'upgrade',
        'setupSummary.authThenRerunMode': 'Complete the required sign-in flow, then rerun {helperLabel} in {mode} mode.',
        'setupSummary.elevationRequired': '{helperLabel} requires an elevated host step before it can continue.',
        'setupSummary.finishManualFollowThrough': 'Finish the manual follow-through for {helperLabel}, then rerun a verification step.',
        'setupSummary.finishedWithStatus': '{helperLabel} {mode} finished with {status}.',
        'setupSummary.launchWslFirstBoot': 'Launch the target WSL distro once to finish first-user setup, then rerun the packaged setup check.',
        'setupSummary.relaunchThenVerify': 'Relaunch Cats Desktop Host, then rerun {helperLabel} to verify the updated packaged setup state.',
        'setupSummary.rerunCheckToVerify': 'Rerun {helperLabel} in check mode if you want to verify the packaged setup state again.',
        'setupSummary.restartThenRerun': 'Restart Windows or the current session, then rerun {helperLabel}.',
        'setupSummary.restartThenRerunMode': 'Restart the host or Windows session, then rerun {helperLabel} in {mode} mode.',
        'setupSummary.retryAfterFailure': 'Retry {helperLabel} after addressing the last failure.',
        'setupSummary.runApplyRemainingChanges': 'Run {helperLabel} again to apply the remaining packaged setup changes.',
        'setupSummary.runMissingHostSubstrate': 'Run {helperLabel} to install the missing host substrate flagged by the readiness audit.',
        'setupSummary.runMissingRequirement': 'Run {helperLabel} to install the missing packaged setup requirement.',
        'setupSummary.startDockerWarmUp': 'Start Docker Desktop and wait for the engine to become ready, then rerun the packaged setup check.',
        'setupPack.apiBaseline': 'API baseline',
        'setupPack.localModel': 'local model pack',
        'setupPack.nativeCli': 'native CLI pack',
        'setupPack.wslPowerUser': 'WSL power-user pack',
        'slowHint.almostDone': 'Almost done, really! Just a whisker away~',
        'slowHint.firstLaunch': 'First launch takes a moment. Still stretching\u2026',
        'slowHint.retry': 'Mew\u2026 sorry. Let me try that one more time, okay?',
        'slowHint.wantToPlay': 'Want to play? Hang in there, almost ready~',
        'status.checking': 'checking',
        'status.error': 'error',
        'status.failed': 'failed',
        'status.info': 'info',
        'status.install': 'Install',
        'status.installed': 'Installed',
        'status.installedWithCheck': '\u2713 Installed',
        'status.installing': 'Installing\u2026',
        'status.ok': 'ok',
        'status.pending': 'pending',
        'status.ready': 'ready',
        'status.reinstall': 'Reinstall',
        'status.running': 'running',
        'status.starting': 'starting',
        'status.unavailable': 'unavailable',
        'status.warning': 'warning',
        'status.completed': 'completed'
      },
      'zh-TW': {
        'action.continue': '繼續',
        'action.continueSetupFix': '繼續設定修復',
        'action.return': '\u2190 返回',
        'action.retry': '重試',
        'action.showDetails': '顯示詳細資料',
        'action.showFewer': '顯示較少',
        'action.showMore': '顯示更多',
        'actionLabel.continueToSetup': '繼續設定',
        'actionLabel.enterReadyChatFlow': '進入可用的聊天流程',
        'actionLabel.openCats': '開啟 Cats',
        'actionLabel.openRuntimeDiagnostics': '開啟執行階段診斷',
        'actionLabel.openSetup': '開啟設定',
        'actionLabel.openSetupLower': '開啟設定',
        'actionLabel.prepareFirstRunSetup': '準備首次設定或修復交接',
        'actionLabel.quitCats': '結束 Cats',
        'actionLabel.resumePackagedSetup': '繼續套裝設定',
        'actionLabel.resumeSetup': '繼續設定',
        'actionLabel.retryCheck': '重新檢查',
        'actionLabel.retryCliScan': '重新掃描 CLI',
        'actionLabel.retryDesktopHostStartup': '重試桌面主機啟動',
        'actionLabel.retryStartup': '重試啟動',
        'actionLabel.scanReadiness': '掃描供應器與先決條件狀態',
        'actionLabel.startPlatformServer': '啟動 cats-platform 伺服器',
        'actionLabel.startRuntimeSidecar': '啟動 cats-runtime 伴隨服務',
        'diagnostics.advancedLoading': '進階診斷仍在載入。',
        'diagnostics.attempt': '嘗試：',
        'diagnostics.current': '目前',
        'diagnostics.entries': '{count} 筆',
        'diagnostics.history': '歷程：',
        'diagnostics.host': '主機：',
        'diagnostics.hostState': '主機狀態：',
        'diagnostics.layerSummary': '層級摘要',
        'diagnostics.log': '{service} 日誌：',
        'diagnostics.noLogPaths': '尚無進階日誌路徑。',
        'diagnostics.openAdvanced': '開啟進階診斷',
        'diagnostics.product': '產品：',
        'diagnostics.recentEvents': '最近事件',
        'diagnostics.runtime': '執行階段：',
        'diagnostics.summary.hostUnavailable': '主機診斷尚無法使用。',
        'diagnostics.summary.noProductEvents':
          '此啟動設定嘗試尚未記錄產品擁有的初始引導事件。',
        'diagnostics.summary.productUnavailable': '產品診斷尚無法使用。',
        'diagnostics.summary.productOnboardingUnavailable': '產品初始引導診斷尚無法使用。',
        'diagnostics.summary.restoredIncomplete':
          '已還原的桌面主機狀態不完整；正在重新檢查桌面服務。',
        'diagnostics.summary.runtimeUnavailable': '執行階段診斷尚無法使用。',
        'diagnostics.summary.productOnboardingEmpty':
          '尚未記錄產品擁有的初始引導事件。',
        'diagnostics.summary.productSetupOpened': '已開啟套裝平台設定。',
        'diagnostics.summary.productSetupSubmissionStarted':
          '已開始送出套裝設定。',
        'diagnostics.summary.productSetupStatePersisted':
          '已保存設定狀態快照。',
        'diagnostics.summary.productSetupPayloadFallback':
          '設定已完成，但應用程式殼層酬載使用了備援信封。',
        'diagnostics.summary.productSetupCompleted': '套裝設定已完成。',
        'diagnostics.summary.productPlatformSetupCompleted':
          '套裝平台設定已完成。',
        'diagnostics.summary.productSetupFailedBeforeResponse':
          '套裝設定在回傳完成回應前失敗。',
        'fixed.startupError': '喵…啟動時有地方出錯了。',
        'issue.serviceError': '{service} 錯誤',
        'issue.noSpecificIssues': '沒有回報具體問題。',
        'issue.hostStartupError.title': '桌面主機未完成啟動',
        'issue.runtimeUnreachable.title': 'Cats 無法連線到 cats-runtime',
        'issue.runtimeUnreachable.detail': '本機應用程式已啟動，但仍無法連線到執行階段相依服務。',
        'issue.noProviderTargets.title': '尚未設定任何供應器目標',
        'issue.noProviderTargets.detail.afterSetup': '設定已完成。還原供應器路徑後，請開啟 Cats 在應用程式內復原。',
        'issue.noProviderTargets.detail.beforeSetup': '請繼續進入設定，選擇 API 基準設定或選用的本機 CLI 供應器路徑。',
        'issue.noReadyProviderPath.title': '目前沒有可用的供應器目標',
        'issue.providerDiagnosticsAttention.detail': '供應器診斷需要處理。',
        'issue.providerDefaultTarget.title': '{target} 需要處理',
        'issue.optionalPackFollowThrough.title': '可選的 {pack} 可繼續後續處理',
        'issue.setup.followThrough.title': '套裝設定仍需要後續處理',
        'issue.setup.restartRequired.title': '套裝設定需要 Windows 重新啟動後才能繼續',
        'issue.setup.relaunchRequired.title': '套裝設定需要重新啟動桌面主機',
        'issue.setup.elevationRequired.title': '套裝設定需要提升權限後才能繼續',
        'issue.setup.authRequired.title': '已安裝的供應器仍需要驗證',
        'issue.setup.firstWslBootRequired.title': 'WSL 發行版需要先完成第一次啟動，設定才能繼續',
        'issue.setup.dockerWarmUpRequired.title': 'Docker 仍需要完成啟動，設定才能繼續',
        'issue.setup.recoveryRequired.title': '套裝設定輔助程式需要復原',
        'issue.setup.manualFollowThrough.title': '套裝設定仍有手動後續步驟',
        'issue.runtimeDiagnosticsPending.title': '執行階段診斷仍在載入',
        'issue.runtimeDiagnosticsPending.detail': '桌面主機尚未完成先決條件掃描。',
        'loading.almostReady': '幾乎準備好了…',
        'loading.ready': '已就緒。',
        'loading.retrying': '正在重試…',
        'loading.startingUp': '正在啟動…',
        'onboarding.headline': '歡迎。你可以現在安裝 CLI，或繼續進入設定。',
        'onboarding.installCli': '安裝 CLI',
        'onboarding.installNodeFirst': '請先安裝 Node',
        'onboarding.nodeLabel': 'Node.js / npm',
        'onboarding.nodeStatus': 'npm CLI 需要此項',
        'recovery.summary.details': '請查看下方詳細資料。',
        'recovery.summary.failedHelper': '本機輔助程式未啟動。請先重試；只有持續失敗時才需要使用進階詳細資料。',
        'recovery.summary.failedService': '{service} 未啟動。請先重試；只有持續失敗時才需要使用進階詳細資料。',
        'recovery.summary.fixBelow': '完成下方設定修復後，Cats 會繼續。',
        'recovery.summary.helperAttention': '你現在可以繼續使用 Cats。方便時再修復本機輔助程式；需要時也可以開啟進階詳細資料。',
        'recovery.summary.noCliAfterSetup': 'Cats 沒有找到已安裝的 CLI。請在下方至少安裝一個 CLI，然後繼續。',
        'recovery.summary.noCliBeforeSetup': 'Cats 需要至少一個已安裝的 CLI，才能繼續設定。',
        'recovery.summary.readyForSetup': '本機輔助程式已在執行。請繼續進入設定開始使用。',
        'recovery.title.failed': 'Cats 需要快速重新啟動',
        'recovery.title.helperAttention': 'Cats 可以開啟，但有一個本機輔助程式需要處理',
        'recovery.title.installCliContinue': '安裝 CLI 以繼續使用 Cats',
        'recovery.title.oneSetupFix': 'Cats 需要完成一項設定修復',
        'recovery.title.pickCli': '選一個 CLI 開始',
        'recovery.title.readyForSetup': 'Cats 已準備好進行設定',
        'recovery.title.recovery': 'Cats 復原',
        'section.advancedDiagnostics': '進階診斷',
        'section.advancedLogsPaths': '進階日誌與路徑',
        'section.diagnostics': '診斷',
        'section.localHelpers': '本機輔助程式',
        'section.setupFix': '設定修復',
        'section.whatNeedsAttention': '需要處理的項目',
        'setup.noSummary': '未記錄摘要。',
        'setup.recommendedNextStep': '建議的下一步',
        'setup.restartNeeded': '下一步前需要重新啟動。',
        'setupReason.authRequired': '需要驗證',
        'setupReason.changesRequired': '需要變更',
        'setupReason.dockerWarmUpRequired': 'Docker 需要暖機',
        'setupReason.elevationRequired': '需要提升權限',
        'setupReason.firstWslBootRequired': '需要第一次啟動 WSL',
        'setupReason.manualFollowUp': '手動後續步驟',
        'setupReason.notInstalled': '尚未安裝',
        'setupReason.relaunchRequired': '需要重新啟動桌面主機',
        'setupReason.restartRequired': '需要重新啟動',
        'setupReason.retryFailed': '重試失敗',
        'setupReason.verificationRecommended': '建議重新驗證',
        'setupMode.apply': '套用',
        'setupMode.check': '檢查',
        'setupMode.force': '強制執行',
        'setupMode.uninstall': '解除安裝',
        'setupMode.upgrade': '升級',
        'setupSummary.authThenRerunMode': '完成必要登入流程後，請以{mode}模式重新執行 {helperLabel}。',
        'setupSummary.elevationRequired': '{helperLabel} 需要提升權限的主機步驟後才能繼續。',
        'setupSummary.finishManualFollowThrough': '完成 {helperLabel} 的手動後續步驟，然後重新執行驗證步驟。',
        'setupSummary.finishedWithStatus': '{helperLabel} 的{mode}已完成，狀態為{status}。',
        'setupSummary.launchWslFirstBoot': '請先啟動目標 WSL 發行版一次以完成首次使用者設定，然後重新執行套裝設定檢查。',
        'setupSummary.relaunchThenVerify': '請重新啟動 Cats 桌面主機，然後重新執行 {helperLabel} 以驗證更新後的套裝設定狀態。',
        'setupSummary.rerunCheckToVerify': '如需再次驗證套裝設定狀態，請以檢查模式重新執行 {helperLabel}。',
        'setupSummary.restartThenRerun': '請重新啟動 Windows 或目前工作階段，然後重新執行 {helperLabel}。',
        'setupSummary.restartThenRerunMode': '請重新啟動主機或 Windows 工作階段，然後以{mode}模式重新執行 {helperLabel}。',
        'setupSummary.retryAfterFailure': '處理上一次失敗後，請重試 {helperLabel}。',
        'setupSummary.runApplyRemainingChanges': '請再次執行 {helperLabel}，套用剩餘的套裝設定變更。',
        'setupSummary.runMissingHostSubstrate': '請執行 {helperLabel}，安裝就緒稽核標記缺少的主機基礎元件。',
        'setupSummary.runMissingRequirement': '請執行 {helperLabel}，安裝缺少的套裝設定需求。',
        'setupSummary.startDockerWarmUp': '請啟動 Docker Desktop，等待引擎就緒後重新執行套裝設定檢查。',
        'setupPack.apiBaseline': 'API 基準設定',
        'setupPack.localModel': '本機模型套件',
        'setupPack.nativeCli': '原生 CLI 套件',
        'setupPack.wslPowerUser': 'WSL 進階使用者套件',
        'slowHint.almostDone': '真的快完成了，只差最後一步~',
        'slowHint.firstLaunch': '第一次啟動需要一點時間，還在準備…',
        'slowHint.retry': '喵…抱歉，讓我再試一次，好嗎？',
        'slowHint.wantToPlay': '快好了，請再稍等一下~',
        'status.checking': '檢查中',
        'status.error': '錯誤',
        'status.failed': '失敗',
        'status.info': '資訊',
        'status.install': '安裝',
        'status.installed': '已安裝',
        'status.installedWithCheck': '\u2713 已安裝',
        'status.installing': '安裝中…',
        'status.ok': '正常',
        'status.pending': '待處理',
        'status.ready': '就緒',
        'status.reinstall': '重新安裝',
        'status.running': '執行中',
        'status.starting': '啟動中',
        'status.unavailable': '無法使用',
        'status.warning': '警告',
        'status.completed': '已完成'
      }
    };

    var BOOTSTRAP_ACTION_LABEL_KEYS = {
      'Continue to Setup': 'actionLabel.continueToSetup',
      'Enter ready chat flow': 'actionLabel.enterReadyChatFlow',
      'Open Cats': 'actionLabel.openCats',
      'Open runtime diagnostics': 'actionLabel.openRuntimeDiagnostics',
      'Open setup': 'actionLabel.openSetupLower',
      'Open Setup': 'actionLabel.openSetup',
      'Prepare first-run setup or remediation handoff': 'actionLabel.prepareFirstRunSetup',
      'Quit Cats': 'actionLabel.quitCats',
      'Resume packaged setup': 'actionLabel.resumePackagedSetup',
      'Resume Setup': 'actionLabel.resumeSetup',
      'Retry Check': 'actionLabel.retryCheck',
      'Retry CLI Scan': 'actionLabel.retryCliScan',
      'Retry desktop host startup': 'actionLabel.retryDesktopHostStartup',
      'Retry Startup': 'actionLabel.retryStartup',
      'Scan provider and prerequisite readiness': 'actionLabel.scanReadiness',
      'Start cats-platform server': 'actionLabel.startPlatformServer',
      'Start cats-runtime sidecar': 'actionLabel.startRuntimeSidecar'
    };

    var BOOTSTRAP_STATUS_LABEL_KEYS = {
      checking: 'status.checking',
      error: 'status.error',
      failed: 'status.failed',
      info: 'status.info',
      ok: 'status.ok',
      pending: 'status.pending',
      ready: 'status.ready',
      running: 'status.running',
      starting: 'status.starting',
      unavailable: 'status.unavailable',
      warning: 'status.warning',
      completed: 'status.completed'
    };

    var BOOTSTRAP_SETUP_REASON_KEYS = {
      auth_required: 'setupReason.authRequired',
      changes_required: 'setupReason.changesRequired',
      docker_warm_up_required: 'setupReason.dockerWarmUpRequired',
      elevation_required: 'setupReason.elevationRequired',
      first_wsl_boot_required: 'setupReason.firstWslBootRequired',
      manual_follow_up: 'setupReason.manualFollowUp',
      not_installed: 'setupReason.notInstalled',
      relaunch_required: 'setupReason.relaunchRequired',
      restart_required: 'setupReason.restartRequired',
      retry_failed: 'setupReason.retryFailed',
      verification_recommended: 'setupReason.verificationRecommended'
    };

    var BOOTSTRAP_SETUP_MODE_KEYS = {
      apply: 'setupMode.apply',
      check: 'setupMode.check',
      force: 'setupMode.force',
      uninstall: 'setupMode.uninstall',
      upgrade: 'setupMode.upgrade'
    };

    var BOOTSTRAP_ISSUE_TITLE_KEYS = {
      'host-startup-error': 'issue.hostStartupError.title',
      'cats-runtime-unreachable': 'issue.runtimeUnreachable.title',
      'no-provider-targets': 'issue.noProviderTargets.title',
      'no-ready-provider-path': 'issue.noReadyProviderPath.title',
      'setup-restart-required': 'issue.setup.restartRequired.title',
      'setup-relaunch-required': 'issue.setup.relaunchRequired.title',
      'setup-elevation-required': 'issue.setup.elevationRequired.title',
      'setup-auth-required': 'issue.setup.authRequired.title',
      'setup-first-wsl-boot-required': 'issue.setup.firstWslBootRequired.title',
      'setup-docker-warm-up-required': 'issue.setup.dockerWarmUpRequired.title',
      'setup-recovery-required': 'issue.setup.recoveryRequired.title',
      'setup-manual-follow-through': 'issue.setup.manualFollowThrough.title',
      'runtime-diagnostics-pending': 'issue.runtimeDiagnosticsPending.title'
    };

    var BOOTSTRAP_ISSUE_DETAIL_KEYS = {
      'The local app booted, but its runtime dependency is still unreachable.':
        'issue.runtimeUnreachable.detail',
      'Setup is complete. Open Cats to recover in-app after you restore a provider path.':
        'issue.noProviderTargets.detail.afterSetup',
      'Continue into setup to choose an API baseline or optional local CLI provider path.':
        'issue.noProviderTargets.detail.beforeSetup',
      'Provider diagnostics need attention.':
        'issue.providerDiagnosticsAttention.detail',
      'The desktop host has not finished its prerequisite scan yet.':
        'issue.runtimeDiagnosticsPending.detail'
    };

    var BOOTSTRAP_SUMMARY_KEYS = {
      'Host diagnostics are not available yet.': 'diagnostics.summary.hostUnavailable',
      'No product-owned onboarding events were recorded for this bootstrap attempt yet.':
        'diagnostics.summary.noProductEvents',
      'Product diagnostics are not available yet.': 'diagnostics.summary.productUnavailable',
      'Product onboarding diagnostics are not available yet.':
        'diagnostics.summary.productOnboardingUnavailable',
      'No product-owned onboarding events have been recorded yet.':
        'diagnostics.summary.productOnboardingEmpty',
      'Packaged platform setup was opened.':
        'diagnostics.summary.productSetupOpened',
      'Packaged setup submission started.':
        'diagnostics.summary.productSetupSubmissionStarted',
      'Setup state snapshot persisted.':
        'diagnostics.summary.productSetupStatePersisted',
      'Setup completed but app shell payload used a fallback envelope.':
        'diagnostics.summary.productSetupPayloadFallback',
      'Packaged setup completed.':
        'diagnostics.summary.productSetupCompleted',
      'Packaged platform setup completed.':
        'diagnostics.summary.productPlatformSetupCompleted',
      'Packaged setup failed before completion response was returned.':
        'diagnostics.summary.productSetupFailedBeforeResponse',
      'Restored desktop host state is incomplete; rechecking desktop services.':
        'diagnostics.summary.restoredIncomplete',
      'Runtime diagnostics are not available yet.': 'diagnostics.summary.runtimeUnavailable'
    };

    function resolveBootstrapLocale(languages) {
      var list = Array.isArray(languages) ? languages : [];
      for (var i = 0; i < list.length; i++) {
        var value = String(list[i] || '').toLowerCase();
        if (value === 'zh-tw' || value === 'zh-hant' || value.indexOf('zh-hant-') === 0) {
          return 'zh-TW';
        }
        if (value.indexOf('zh') === 0) return 'zh-TW';
      }
      return 'en';
    }

    var bootstrapLocale = resolveBootstrapLocale(
      navigator.languages && navigator.languages.length
        ? navigator.languages
        : [navigator.language]
    );
    document.documentElement.lang = bootstrapLocale;

    function tx(key, values) {
      var catalog = BOOTSTRAP_COPY[bootstrapLocale] || BOOTSTRAP_COPY.en;
      var template = catalog[key] || BOOTSTRAP_COPY.en[key] || key;
      if (!values) return template;
      for (var k in values) {
        template = template.split('{' + k + '}').join(String(values[k]));
      }
      return template;
    }

    function localizeActionLabel(label) {
      var key = BOOTSTRAP_ACTION_LABEL_KEYS[label];
      return key ? tx(key) : label;
    }

    function displayStatus(status) {
      var key = BOOTSTRAP_STATUS_LABEL_KEYS[status];
      return key ? tx(key) : String(status || '').replace(/_/g, ' ');
    }

    function localizeIssueTitle(issue) {
      if (!issue) return '';
      var key = BOOTSTRAP_ISSUE_TITLE_KEYS[issue.id];
      if (key) return tx(key);
      var title = String(issue.title || '');
      if (issue.id === 'setup-optional-capability-pack') {
        var optionalMatch = title.match(/^Optional (.+) is available for follow-through$/);
        if (optionalMatch) {
          return tx('issue.optionalPackFollowThrough.title', { pack: optionalMatch[1] });
        }
      }
      if (issue.id && String(issue.id).indexOf('provider-') === 0) {
        return tx('issue.providerDefaultTarget.title', {
          target: title.replace(/ needs attention$/u, '')
        });
      }
      if (title === 'Packaged setup still needs follow-through') {
        return tx('issue.setup.followThrough.title');
      }
      return title;
    }

    function localizeIssueDetail(detail) {
      var text = String(detail || '');
      var key = BOOTSTRAP_ISSUE_DETAIL_KEYS[text];
      return key ? tx(key) : localizeSetupSummary(text);
    }

    function localizeBootstrapSummary(summary) {
      var text = String(summary || '');
      var key = BOOTSTRAP_SUMMARY_KEYS[text];
      return key ? tx(key) : text;
    }

    function localizeSetupReason(reason) {
      var text = String(reason || '');
      var key = BOOTSTRAP_SETUP_REASON_KEYS[text];
      return key ? tx(key) : text.replace(/_/g, ' ');
    }

    function localizeSetupMode(mode) {
      var text = String(mode || '');
      var key = BOOTSTRAP_SETUP_MODE_KEYS[text];
      return key ? tx(key) : text;
    }

    function localizeSetupSummary(summary) {
      var text = String(summary || '');
      var match = null;
      if (text === 'Launch the target WSL distro once to finish first-user setup, then rerun the packaged setup check.') {
        return tx('setupSummary.launchWslFirstBoot');
      }
      if (text === 'Start Docker Desktop and wait for the engine to become ready, then rerun the packaged setup check.') {
        return tx('setupSummary.startDockerWarmUp');
      }
      match = text.match(/^Run (.+) to install the missing host substrate flagged by the readiness audit.$/);
      if (match) {
        return tx('setupSummary.runMissingHostSubstrate', { helperLabel: match[1] });
      }
      match = text.match(/^Restart the host or Windows session, then rerun (.+) in (.+) mode.$/);
      if (match) {
        return tx('setupSummary.restartThenRerunMode', {
          helperLabel: match[1],
          mode: localizeSetupMode(match[2])
        });
      }
      match = text.match(/^Restart Windows or the current session, then rerun (.+).$/);
      if (match) {
        return tx('setupSummary.restartThenRerun', { helperLabel: match[1] });
      }
      match = text.match(/^Relaunch Cats Desktop Host, then rerun (.+) to verify the updated packaged setup state.$/);
      if (match) {
        return tx('setupSummary.relaunchThenVerify', { helperLabel: match[1] });
      }
      match = text.match(/^(.+) requires an elevated host step before it can continue.$/);
      if (match) {
        return tx('setupSummary.elevationRequired', { helperLabel: match[1] });
      }
      match = text.match(/^Complete the required sign-in flow, then rerun (.+) in (.+) mode.$/);
      if (match) {
        return tx('setupSummary.authThenRerunMode', {
          helperLabel: match[1],
          mode: localizeSetupMode(match[2])
        });
      }
      match = text.match(/^Retry (.+) after addressing the last failure.$/);
      if (match) {
        return tx('setupSummary.retryAfterFailure', { helperLabel: match[1] });
      }
      match = text.match(/^Run (.+) to install the missing packaged setup requirement.$/);
      if (match) {
        return tx('setupSummary.runMissingRequirement', { helperLabel: match[1] });
      }
      match = text.match(/^Finish the manual follow-through for (.+), then rerun a verification step.$/);
      if (match) {
        return tx('setupSummary.finishManualFollowThrough', { helperLabel: match[1] });
      }
      match = text.match(/^Run (.+) again to apply the remaining packaged setup changes.$/);
      if (match) {
        return tx('setupSummary.runApplyRemainingChanges', { helperLabel: match[1] });
      }
      match = text.match(/^Rerun (.+) in check mode if you want to verify the packaged setup state again.$/);
      if (match) {
        return tx('setupSummary.rerunCheckToVerify', { helperLabel: match[1] });
      }
      match = text.match(/^(.+) (check|apply|upgrade|force|uninstall) finished with (.+).$/);
      if (match) {
        return tx('setupSummary.finishedWithStatus', {
          helperLabel: match[1],
          mode: localizeSetupMode(match[2]),
          status: displayStatus(match[3])
        });
      }
      return text;
    }

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
        api_baseline: tx('setupPack.apiBaseline'),
        native_cli_pack: tx('setupPack.nativeCli'),
        local_model_pack: tx('setupPack.localModel'),
        wsl_power_user_pack: tx('setupPack.wslPowerUser')
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

    /* Sticky once entered: after the user lands on onboarding, we keep them
       there even if a successful install flips phase to ready_for_setup, so
       they see their install complete and can click Continue at their own
       pace (and queue up more installs if they want). The flag is cleared
       when the user explicitly continues into setup. */
    var onboardingActive = false;

    function isCliMissing(snapshot) {
      return Boolean(
        snapshot && snapshot.phase === 'needs_prerequisites'
          && snapshot.prerequisites && snapshot.prerequisites.cliInventory
          && snapshot.prerequisites.cliInventory.source === 'runtime'
          && snapshot.prerequisites.cliInventory.total === 0
      );
    }

    function isSetupComplete(snapshot) {
      return Boolean(
        snapshot && snapshot.app
          && (snapshot.app.setupCompleted || snapshot.app.setupCompleteAt)
      );
    }

    function usesSetupStatusOnboarding(snapshot) {
      return Boolean(
        snapshot && snapshot.app
          && snapshot.app.onboardingMode === 'setup_status'
      );
    }

    function resolvePageMode(snapshot) {
      if (!snapshot) return 'loading';
      if (snapshot.phase === 'failed') return 'recovery';
      var setupComplete = isSetupComplete(snapshot);
      if (onboardingActive && !setupComplete) {
        return 'onboarding';
      }
      if (
        usesSetupStatusOnboarding(snapshot)
          && !setupComplete
          && snapshot.phase === 'ready_for_setup'
      ) {
        return 'onboarding';
      }
      if (snapshot.phase === 'needs_prerequisites') {
        if (isCliMissing(snapshot) && !setupComplete) {
          return 'onboarding';
        }
        return 'recovery';
      }
      return 'loading';
    }

    /* CLI install card — used by onboarding mode AND the recovery accordion.
       First row favors CLIs that do not depend on Node/npm. Lower rows are
       collapsed until Show more is pressed, then npm prerequisites appear
       before npm-based CLIs. */
    var ONBOARDING_NATIVE_PROVIDER_ORDER = [
      'claude_code', 'cursor_agent', 'kiro', 'junie',
      'goose', 'ollama'
    ];
    var ONBOARDING_NPM_PROVIDER_ORDER = [
      'codex', 'gemini', 'copilot', 'opencode',
      'kilo', 'auggie', 'pi'
    ];
    var ONBOARDING_NODE_HELPER_SUFFIX = '-node-host-installer';
    var ONBOARDING_CARD_LABELS = {
      node: tx('onboarding.nodeLabel')
    };
    var ONBOARDING_CARD_STATUS = {
      node: tx('onboarding.nodeStatus')
    };
    var ONBOARDING_PROVIDER_LABELS = {
      claude_code: 'Claude',
      cursor_agent: 'Cursor',
      codex: 'Codex',
      gemini: 'Gemini',
      copilot: 'Copilot',
      opencode: 'OpenCode',
      kilo: 'Kilo',
      kiro: 'Kiro',
      goose: 'Goose',
      junie: 'Junie',
      auggie: 'Auggie',
      pi: 'Pi',
      ollama: 'Ollama'
    };
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

    function pickSetupHelper(setupSnap, predicate) {
      var helpers = setupSnap && Array.isArray(setupSnap.helpers) ? setupSnap.helpers : [];
      for (var i = 0; i < helpers.length; i++) {
        if (predicate(helpers[i])) return helpers[i];
      }
      return null;
    }

    function isNodePrerequisiteHelperId(helperId) {
      return Boolean(helperId && helperId.indexOf(ONBOARDING_NODE_HELPER_SUFFIX) > 0);
    }

    function pickNodePrerequisiteHelper(setupSnap) {
      return pickSetupHelper(setupSnap, function (candidate) {
        return candidate && isNodePrerequisiteHelperId(candidate.id);
      });
    }

    function isReadinessAuditAction(action) {
      return Boolean(
        action
          && action.helperId
          && action.helperId.indexOf('-install-readiness-audit') > 0
      );
    }

    function plannedActionsIncludeNodeInstall(action) {
      var planned = action && Array.isArray(action.plannedActions) ? action.plannedActions : [];
      return planned.indexOf('install_node_lts') >= 0
        || planned.indexOf('install_node_lts_via_nvm') >= 0;
    }

    function isNodePrerequisiteReady(setupSnap) {
      var action = setupSnap && setupSnap.state ? setupSnap.state.lastAction : null;
      if (!action || action.runState === 'failed') return false;
      if (isNodePrerequisiteHelperId(action.helperId)) {
        return action.status === 'ready';
      }
      if (isReadinessAuditAction(action)) {
        return !plannedActionsIncludeNodeInstall(action);
      }
      return false;
    }

    function buildNodePrerequisiteCard(setupSnap) {
      var helper = pickNodePrerequisiteHelper(setupSnap);
      if (!helper) {
        if (!setupSnap) {
          return {
            helperId: null,
            label: ONBOARDING_CARD_LABELS.node,
            statusText: ' ',
            installed: false,
            available: false,
            supported: true,
            supportsApply: false,
            checkingHint: 'spinner-in-status'
          };
        }
        return null;
      }
      var nodeReady = isNodePrerequisiteReady(setupSnap);
      return {
        helperId: helper.id,
        label: ONBOARDING_CARD_LABELS.node,
        statusText: ONBOARDING_CARD_STATUS.node,
        installed: nodeReady,
        available: helper.available,
        supported: helper.supported,
        supportsApply: nodeReady ? false : helper.supportsApply
      };
    }

    function toProviderInstallCard(candidate) {
      return {
        helperId: candidate.helperId,
        label: ONBOARDING_PROVIDER_LABELS[candidate.providerId] || candidate.label,
        installed: candidate.installed,
        available: candidate.available,
        supported: candidate.supported,
        supportsApply: true
      };
    }

    function handleCliInstallClick(card) {
      if (!card.helperId) return;
      if (cliInstallingState[card.helperId]) return;
      cliInstallingState[card.helperId] = true;
      doRender();
      bridge.runSetupHelper(card.helperId, 'apply')
        .catch(function (err) {
          try { console.error('CLI install failed', card.helperId, err); } catch (e) {}
        })
        .finally(function () {
          delete cliInstallingState[card.helperId];
          doRender();
        });
    }

    function spinnerEl() {
      return el('span', { class: 'cli-card-spinner', 'aria-hidden': 'true' });
    }

    function CliCard(card, hidden) {
      var installing = Boolean(cliInstallingState[card.helperId]);
      var btnLabel, statusClass, statusContent, btnContent;
      if (installing) {
        btnLabel = tx('status.installing');
        statusClass = '';
        statusContent = ' ';
        btnContent = btnLabel;
      } else if (card.installed) {
        btnLabel = card.supportsApply === false ? tx('status.installed') : tx('status.reinstall');
        statusClass = 'c-ok';
        statusContent = tx('status.installedWithCheck');
        btnContent = btnLabel;
      } else {
        btnLabel = tx('status.install');
        statusClass = '';
        statusContent = card.statusText || ' ';
        btnContent = btnLabel;
        if (card.checkingHint === 'spinner-in-status') {
          statusContent = spinnerEl();
        } else if (card.checkingHint === 'spinner-in-button') {
          btnContent = spinnerEl();
        }
      }
      var btn = el('button', {
        class: 'btn cli-card-btn',
        disabled: installing || !card.available || !card.supported || card.supportsApply === false,
        onclick: function () { handleCliInstallClick(card); }
      }, btnContent);
      var className = 'cli-card' + (hidden ? ' cli-card-hidden' : '');
      return el('div', { class: className },
        el('div', { class: 'cli-card-name' }, card.label),
        el('div', { class: 'cli-card-status ' + statusClass }, statusContent),
        btn
      );
    }

    function rowBreak(hidden) {
      return el('div', { class: 'cli-row-break' + (hidden ? ' cli-card-hidden' : '') });
    }

    /* Provider IDs that stay visible in the collapsed onboarding view.
       The Node prerequisite card is always pinned in collapsed view too —
       see ONBOARDING_COLLAPSED_INCLUDES_NODE below. CSS grid auto-flow does
       the visual reordering: hidden cards drop out and the visible cards
       collapse into row 1 in entry order. */
    var ONBOARDING_COLLAPSED_PROVIDER_IDS = ['claude_code', 'codex', 'gemini'];
    var ONBOARDING_COLLAPSED_INCLUDES_NODE = true;

    function appendProviderCards(cards, snapshot, providerOrder, options) {
      for (var i = 0; i < providerOrder.length; i++) {
        var providerId = providerOrder[i];
        var candidate = pickInventoryCandidate(snapshot, providerId);
        if (!candidate || !candidate.available) continue;
        var card = toProviderInstallCard(candidate);
        if (options && options.waitForNodePrerequisite) {
          card.statusText = options.nodePrerequisiteStatusText || tx('onboarding.installNodeFirst');
          card.supportsApply = false;
          if (options.showCheckingSpinner) {
            card.checkingHint = 'spinner-in-button';
          }
        }
        card.collapsedSlot = ONBOARDING_COLLAPSED_PROVIDER_IDS.indexOf(providerId) !== -1;
        cards.push(card);
      }
    }

    function buildCliCards(snapshot, setupSnap, options) {
      var alwaysExpanded = Boolean(options && options.alwaysExpanded);
      var expanded = alwaysExpanded || onboardingExpanded;
      var entries = [];
      appendProviderCards(entries, snapshot, ONBOARDING_NATIVE_PROVIDER_ORDER);
      entries.push({ kind: 'break' });
      var nodeCard = buildNodePrerequisiteCard(setupSnap);
      if (nodeCard) {
        nodeCard.collapsedSlot = ONBOARDING_COLLAPSED_INCLUDES_NODE;
        entries.push(nodeCard);
      }
      var nodeReady = isNodePrerequisiteReady(setupSnap);
      appendProviderCards(entries, snapshot, ONBOARDING_NPM_PROVIDER_ORDER, {
        waitForNodePrerequisite: !nodeReady,
        nodePrerequisiteStatusText: setupSnap ? tx('onboarding.installNodeFirst') : ' ',
        showCheckingSpinner: !setupSnap
      });

      var elements = [];
      var hasHiddenCards = false;
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.kind === 'break') {
          elements.push(rowBreak(!expanded));
          continue;
        }
        var hidden = !expanded && !entry.collapsedSlot;
        if (hidden) hasHiddenCards = true;
        elements.push(CliCard(entry, hidden));
      }
      return {
        elements: elements,
        hasHiddenCards: hasHiddenCards
      };
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
        interruptions.map(function (entry) { return Chip(localizeSetupReason(entry.kind || '')); })
      );
    }

    /* ================================================================
     *  Splash (loading / error) — fixed DOM, no recreation
     * ================================================================ */

    var splashEl = document.getElementById('splash');
    var splashDot = document.getElementById('splash-dot');
    var splashText = document.getElementById('splash-text');
    var startupErrorCopy = document.getElementById('startup-error-copy');
    var errorArea = document.getElementById('error-area');
    var recoveryEl = document.getElementById('recovery');
    var onboardingEl = document.getElementById('onboarding');
    var btnRetry = document.getElementById('btn-retry');
    var btnDetails = document.getElementById('btn-details');
    var slowHint = document.getElementById('slow-hint');

    function applyStaticCopy() {
      splashText.textContent = tx('loading.startingUp');
      startupErrorCopy.textContent = tx('fixed.startupError');
      btnRetry.textContent = tx('action.retry');
      btnDetails.textContent = tx('action.showDetails');
    }

    function friendlyLoadingSummary(phase) {
      if (phase === 'checking_prerequisites') return tx('loading.almostReady');
      if (phase === 'ready_for_setup' || phase === 'ready_for_chat') return tx('loading.ready');
      return tx('loading.startingUp');
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
      splashText.textContent = tx('loading.retrying');
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
      if (snap.phase === 'failed') return tx('recovery.title.failed');
      if (snap.phase === 'needs_prerequisites') {
        if (isCliMissing(snap)) {
          return snap.app && snap.app.setupCompleteAt
            ? tx('recovery.title.installCliContinue')
            : tx('recovery.title.pickCli');
        }
        return snap.app && snap.app.setupCompleteAt
          ? tx('recovery.title.helperAttention')
          : tx('recovery.title.oneSetupFix');
      }
      if (snap.phase === 'ready_for_setup') return tx('recovery.title.readyForSetup');
      return tx('recovery.title.recovery');
    }

    function recoverySummary(snap) {
      if (snap.phase === 'failed') {
        var failedSvc = snap.services.find(function (s) { return s.status === 'failed'; });
        if (failedSvc) {
          return tx('recovery.summary.failedService', {
            service: getServiceDisplayName(failedSvc.name)
          });
        }
        return tx('recovery.summary.failedHelper');
      }
      if (snap.phase === 'needs_prerequisites') {
        if (isCliMissing(snap)) {
          return snap.app && snap.app.setupCompleteAt
            ? tx('recovery.summary.noCliAfterSetup')
            : tx('recovery.summary.noCliBeforeSetup');
        }
        if (snap.app && snap.app.setupCompleteAt) {
          return tx('recovery.summary.helperAttention');
        }
        return tx('recovery.summary.fixBelow');
      }
      if (snap.phase === 'ready_for_setup') {
        return tx('recovery.summary.readyForSetup');
      }
      return snap.summary || tx('recovery.summary.details');
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
        return Btn(localizeActionLabel(action.label), {
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
              el('span', { class: 'issue-title' }, localizeIssueTitle(issue)),
              el('span', { class: 'issue-sev c-' + s }, displayStatus(issue.severity))
            ),
            el('div', { class: 'detail-meta' }, localizeIssueDetail(issue.detail))
          ));
        });
      }
      var failedServices = snap.services.filter(function (s) { return s.status === 'failed'; });
      failedServices.forEach(function (svc) {
        if (svc.error) {
          items.push(el('div', { class: 'card' },
            el('div', { class: 'issue-head' },
              el('span', { class: 'issue-title' }, tx('issue.serviceError', {
                service: getServiceDisplayName(svc.name)
              })),
              el('span', { class: 'issue-sev c-err' }, displayStatus('error'))
            ),
            el('div', { class: 'detail-meta' }, svc.error),
            svc.lastOutput
              ? el('code', { class: 'detail-code' }, svc.lastOutput)
              : false
          ));
        }
      });
      if (items.length === 0) {
        items.push(el('div', { class: 'detail-meta' }, tx('issue.noSpecificIssues')));
      }
      return ExpandableSection(tx('section.whatNeedsAttention'), items);
    }

    function ServiceStatusSection(snap) {
      var rows = snap.services.map(function (svc) {
        var isPending = svc.status !== 'ready' && svc.status !== 'failed';
        var parts = [
          el('div', { class: 'svc-row' },
            Dot(svc.status, isPending),
            el('span', { class: 'svc-name' }, getServiceDisplayName(svc.name)),
            el('span', { class: 'svc-status c-' + sc(svc.status) }, displayStatus(svc.status)),
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

      return ExpandableSection(tx('section.localHelpers'), [el('div', { class: 'card' }, rows.flat())]);
    }

    function DiagnosticsSection(snap) {
      var diagnostics = snap.diagnostics;
      var actionRow = el('div', { class: 'actions', style: 'margin-top:12px' },
        Btn(tx('diagnostics.openAdvanced'), {
          onclick: function () {
            bridge.runAction('open_runtime_diagnostics');
          }
        })
      );

      if (!diagnostics || !diagnostics.aggregation) {
        return ExpandableSection(tx('section.diagnostics'), [
          el('div', { class: 'detail-meta' }, tx('diagnostics.advancedLoading')),
          actionRow,
        ]);
      }

      var agg = diagnostics.aggregation;
      var content = [];

      content.push(el('div', { class: 'card' },
        CardHead(tx('diagnostics.layerSummary'), agg.attemptId || tx('diagnostics.current'), 'c-ok'),
        el('div', { class: 'detail-meta' },
          el('strong', null, tx('diagnostics.runtime')), localizeBootstrapSummary(agg.layers.runtime.summary)),
        el('div', { class: 'detail-meta' },
          el('strong', null, tx('diagnostics.product')), localizeBootstrapSummary(agg.layers.product.summary)),
        el('div', { class: 'detail-meta' },
          el('strong', null, tx('diagnostics.host')), localizeBootstrapSummary(agg.layers.host.summary))
      ));

      var chronology = Array.isArray(agg.chronology) ? agg.chronology.slice(0, 8) : [];
      if (chronology.length) {
        var chronoItems = chronology.map(function (evt) {
          return el('div', { class: 'chrono-item' },
            el('div', { class: 'chrono-summary' }, localizeBootstrapSummary(evt.summary)),
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
          CardHead(tx('diagnostics.recentEvents'),
            tx('diagnostics.entries', { count: chronology.length }), 'c-warn'),
          chronoItems
        ));
      }

      content.push(actionRow);

      return ExpandableSection(tx('section.advancedDiagnostics'), content);
    }

    function LogsAndPathsSection(snap) {
      var diagnostics = snap.diagnostics;
      var items = [];

      if (snap.hostStatePath) {
        items.push(el('div', { class: 'detail-meta' },
          el('strong', null, tx('diagnostics.hostState')),
          el('code', { class: 'detail-code' }, snap.hostStatePath)));
      }
      if (diagnostics) {
        if (diagnostics.activeAttemptId) {
          items.push(el('div', { class: 'detail-meta' },
            el('strong', null, tx('diagnostics.attempt')),
            el('code', { class: 'detail-code' }, diagnostics.activeAttemptId)));
        }
        if (diagnostics.product && diagnostics.product.historyPath) {
          items.push(el('div', { class: 'detail-meta' },
            el('strong', null, tx('diagnostics.history')),
            el('code', { class: 'detail-code' }, diagnostics.product.historyPath)));
        }
        if (Array.isArray(diagnostics.serviceLogs)) {
          diagnostics.serviceLogs
            .filter(function (e) { return e && e.logPath; })
            .forEach(function (e) {
              items.push(el('div', { class: 'detail-meta' },
                el('strong', null, tx('diagnostics.log', {
                  service: getServiceDisplayName(e.service)
                })),
                el('code', { class: 'detail-code' }, e.logPath)));
            });
        }
      }
      if (items.length === 0) {
        items.push(el('div', { class: 'detail-meta' }, tx('diagnostics.noLogPaths')));
      }

      return ExpandableSection(tx('section.advancedLogsPaths'), [el('div', { class: 'card' }, items)]);
    }

    function SetupRecoverySection(snap, setupSnap, bridge) {
      var lastAction = (setupSnap && setupSnap.state && setupSnap.state.lastAction)
        || (snap.setup && snap.setup.lastAction);
      if (!lastAction && (!setupSnap || !setupSnap.resumeAction)) return null;

      var cards = [];

      if (setupSnap && setupSnap.resumeAction) {
        var ra = setupSnap.resumeAction;
        var rac = [
          CardHead(tx('setup.recommendedNextStep'),
            localizeSetupReason(ra.reason), 'c-warn'),
          el('div', { class: 'detail-meta' }, localizeSetupSummary(ra.summary)),
          renderInterruptions(ra.interruptions)
        ];
        if (Array.isArray(ra.manualSteps) && ra.manualSteps.length) {
          rac.push(el('div', { class: 'detail-meta' }, localizeSetupSummary(ra.manualSteps[0])));
        }
        rac.push(Btn(tx('action.continueSetupFix'), {
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
            displayStatus(lastAction.status || lastAction.runState), 'c-' + las),
          el('div', { class: 'detail-meta' },
            lastAction.summary ? localizeSetupSummary(lastAction.summary) : tx('setup.noSummary'))
        ];
        if (lastAction.restartRequired) {
          lac.push(el('div', { class: 'detail-meta c-warn' },
            tx('setup.restartNeeded')));
        }
        if (lastAction.error) {
          lac.push(el('div', { class: 'detail-meta c-err' }, lastAction.error));
        }
        cards.push(el('div', { class: 'card' }, lac));
      }

      return ExpandableSection(tx('section.setupFix'), cards);
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
      tx('slowHint.firstLaunch'),
      tx('slowHint.wantToPlay'),
      tx('slowHint.almostDone')
    ];
    var retryHintMessage = tx('slowHint.retry');

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
      bridge.runAction(resolveRetryActionId())
        .catch(function () {
          retryHintActive = false;
          hideSlowHint();
          doRender();
        })
        .finally(function () { button.disabled = restoreDisabled; });
    }

    function resolveRetryActionId() {
      var actions = currentSnapshot && Array.isArray(currentSnapshot.actions)
        ? currentSnapshot.actions
        : [];
      for (var i = 0; i < actions.length; i++) {
        if (actions[i] && actions[i].id === 'retry_cli_scan') return 'retry_cli_scan';
      }
      return 'retry';
    }

    function showOnboarding(snap) {
      onboardingActive = true;
      splashEl.classList.add('hidden');
      recoveryEl.classList.add('hidden');
      onboardingEl.classList.remove('hidden');
      onboardingEl.classList.add('onboarding-page');
      resetSlowHintCycle();

      onboardingEl.innerHTML = '';

      var legacyCliGate = snap.app && snap.app.onboardingMode === 'cli_inventory_gate';
      var inventory = (snap.prerequisites && snap.prerequisites.cliInventory) || {};
      var installedCount = Array.isArray(inventory.installed) ? inventory.installed.length : 0;
      var continueDisabled = legacyCliGate && installedCount === 0;

      var continueBtn = el('button', {
        class: 'btn',
        disabled: continueDisabled,
        onclick: function () {
          if (continueDisabled) return;
          var self = this;
          self.disabled = true;
          onboardingActive = false;
          bridge.runAction('open_setup').catch(function () {
            onboardingActive = true;
            self.disabled = false;
          });
        }
      }, tx('action.continue'));

      var cardSet = buildCliCards(snap, currentSetupSnapshot, { alwaysExpanded: false });
      var actions = [continueBtn];
      if (cardSet.hasHiddenCards) {
        var moreLabel = onboardingExpanded ? tx('action.showFewer') : tx('action.showMore');
        actions.push(el('button', {
          class: 'btn',
          onclick: function () {
            onboardingExpanded = !onboardingExpanded;
            doRender();
          }
        }, moreLabel));
      }

      onboardingEl.append(
        el('section', { class: 'hero' },
          el('h1', { class: 'hero-title' }, 'Cats')
        ),
        el('p', { class: 'onboarding-headline' },
          tx('onboarding.headline')),
        el('div', { class: 'onboarding-actions' }, actions),
        el('div', { class: 'cli-grid' }, cardSet.elements)
      );
    }

    function InstallACliSection(snap) {
      var inv = snap.prerequisites && snap.prerequisites.cliInventory;
      if (!inv || inv.source !== 'runtime' || inv.total > 0) return null;
      var cardSet = buildCliCards(snap, currentSetupSnapshot, { alwaysExpanded: true });
      if (cardSet.elements.length === 0) return null;
      return ExpandableSection(tx('onboarding.installCli'), [
        el('div', { class: 'cli-grid' }, cardSet.elements)
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
      }, tx('action.return'));

      /* Summary card with 3-slot action row */
      var summary = RecoverySummaryCard(snap, bridge);

      /* Expandable detail sections */
      var details = el('div', { class: 'anim anim-d1' },
        WhySection(snap),
        ServiceStatusSection(snap),
        DiagnosticsSection(snap),
        LogsAndPathsSection(snap)
      );

      /* Install-a-CLI accordion only when runtime probe says zero CLIs are
         installed. Reuses the same card grid as the onboarding mode so the
         install action goes through one shared code path. */
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

      /* Recovery panel is opt-in — only when the user explicitly clicks
         Show details. Don't auto-route on phase change. */
      if (showRecoveryDetails) {
        showRecovery(snap);
        return;
      }

      /* Onboarding replaces splash for fresh desktop users before /setup.
         The default policy is informational: users may install CLIs here or
         continue into setup without waiting for inventory scans. */
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
      applyStaticCopy();
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

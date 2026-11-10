/**
 * The frame both halves of the first-run wizard share (SPEC-136): the step rail, the log and the
 * details page. Browser-only and self-contained, so the host can embed it before Platform starts;
 * Platform mounts the same function and renders its pages into `pane` and `foot`.
 */
export function mountSetupChrome(root, bridge, options = {}) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const LOG_SETTLE_MS = 1400;
  let zh = String(options.locale || 'en').startsWith('zh');
  const T = (en, tw) => (zh ? tw : en);
  const E = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const browserOnly = Boolean(options.browserOnly) || !bridge || !bridge.setupWizard;
  const ICON = {
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="#207A53" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cross: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="#B5342A" stroke-width="2" stroke-linecap="round"/></svg>',
    wait: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="#6B6560" stroke-width="1.5"/><path d="M8 4.5V8l2.2 1.6" fill="none" stroke="#6B6560" stroke-width="1.5" stroke-linecap="round"/></svg>',
    dash: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8h8" fill="none" stroke="#6B6560" stroke-width="2" stroke-linecap="round"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  // SPEC-137: Settings shows the same rows without the rail, with the log at the section's foot.
  const settingsLayout = options.layout === 'settings';
  root.classList.add('cats-setup');
  if (settingsLayout) root.classList.add('is-settings');
  if (options.css) {
    const style = doc.createElement('style');
    style.textContent = options.css;
    root.append(style);
  }
  const frame = doc.createElement('div');
  frame.className = 'wz';
  const logMarkup = `<div class="log" data-log>
      <div class="log-bar" data-logbar></div>
      <div class="log-panel"><div class="log-scroll" data-logscroll role="log" aria-live="polite"></div></div>
    </div>`;
  frame.innerHTML = settingsLayout ? `<div class="wz-frame">
      <nav class="rail" data-rail hidden>
        <div class="brand" data-brand></div>
        <ol class="steps" data-steps></ol>
        <div class="perch" data-perch aria-hidden="true">
          <div class="cat"></div>
          <div class="cat-note"><strong data-note-a></strong><span data-note-b></span></div>
        </div>
      </nav>
      <div class="main">
        <div class="pane" data-pane></div>
        <div class="pane" data-details hidden></div>
        <div class="dock"><div class="foot" data-foot></div>${logMarkup}</div>
      </div>
    </div>` : `<div class="wz-frame">
      <nav class="rail" data-rail>
        <div class="brand" data-brand></div>
        <ol class="steps" data-steps></ol>
        <div class="perch" data-perch aria-hidden="true">
          <div class="cat">${options.catHead || ''}</div>
          <div class="cat-note"><strong data-note-a></strong><span data-note-b></span></div>
        </div>
      </nav>
      <main class="main">
        <div class="pane" data-pane></div>
        <div class="pane" data-details hidden></div>
        <div class="foot" data-foot></div>
      </main>
    </div>
    <div class="log" data-log>
      <div class="log-bar" data-logbar></div>
      <div class="log-panel"><div class="log-scroll" data-logscroll role="log" aria-live="polite"></div></div>
    </div>`;
  root.append(frame);
  const part = (name) => frame.querySelector(`[data-${name}]`);
  const rail = part('rail');
  const pane = part('pane');
  const foot = part('foot');
  const detailsPane = part('details');
  const logEl = part('log');
  const logBar = part('logbar');
  const logScroll = part('logscroll');

  let steps = [];
  let destroyed = false;
  let elapsedFrom = null;
  const copied = new Set();
  const log = { runs: [], open: false, choice: null, hold: false, hovering: false, closeOnLeave: false, settle: null, pinned: true };
  const details = { reason: null, returnFocus: null, paneTop: 0, open: {}, snapshot: null, note: null };

  /* ---------- Rail ---------- */

  function renderRail() {
    part('brand').innerHTML = `Cats<small>${E(T('First-time setup', '首次設定'))}</small>`;
    rail.setAttribute('aria-label', T('Setup steps', '設定步驟'));
    part('steps').innerHTML = steps.map((step, index) => {
      const cls = ['step', step.state === 'done' ? 'done' : '', step.state === 'future' ? 'future' : '', step.skipped ? 'skipped' : ''].join(' ');
      const glyph = step.skipped ? ICON.dash : step.state === 'done' ? ICON.check : index + 1;
      return `<li><button type="button" class="${cls}" data-step="${step.n}" ${step.state === 'current' ? 'aria-current="step"' : ''} ${step.enabled ? '' : 'disabled'}>
        <span class="step-n">${glyph}</span><span class="step-t">${E(step.title)}<small>${E(step.skipped ? T('Skipped', '已略過') : step.note)}</small></span></button></li>`;
    }).join('');
  }

  /* ---------- Log ---------- */

  const runEnded = (run) => Boolean(run.endedAt);
  const runFailed = (run) => Boolean(run.error) || ['failed', 'elevation_required', 'stopped'].includes(run.status);
  const kindLabel = (kind) => ({ check: T('Check', '檢查'), change: T('Change', '變更'), terminal: T('Terminal', '終端機'), service: T('Service', '服務') }[kind] || kind);
  const clockOf = (at) => new Date(at).toTimeString().slice(0, 8);

  function runFacts(run) {
    const lines = [];
    if (run.status) lines.push(`status: ${run.status}${run.version ? `, version: ${run.version}` : ''}`);
    if (run.planned && run.planned.length) lines.push(`planned: ${run.planned.join(', ')}`);
    if (run.applied && run.applied.length) lines.push(`applied: ${run.applied.join(', ')}`);
    for (const line of run.warnings || []) lines.push(`warning: ${line}`);
    for (const line of run.manual || []) lines.push(`next: ${line}`);
    if (run.error) lines.push(`error: ${run.error}`);
    if (runEnded(run) && run.tookMs !== null && run.tookMs !== undefined) lines.push(`took ${(run.tookMs / 1000).toFixed(1)} s`);
    return lines;
  }
  const logText = () => log.runs.map((run) => [`${clockOf(run.startedAt)} ${run.kind} ${run.label}`, `> ${run.command}`, ...runFacts(run)].join('\n')).join('\n\n');
  let priorChanges = 0;
  const logTotals = () => ({
    checks: log.runs.filter((run) => run.kind === 'check' && runEnded(run)).length,
    // Saving a choice is not a change to the computer, and neither is creating an account.
    changes: priorChanges + log.runs.filter((run) => run.kind === 'change' && runEnded(run) && !runFailed(run)
      && run.applied && run.applied.length > 0 && run.label !== 'Cats Runtime' && run.label !== 'Cats Platform').length,
  });

  function renderLog() {
    if (browserOnly) { logEl.hidden = true; return; }
    logEl.classList.toggle('open', log.open);
    const totals = logTotals();
    const running = log.runs.filter((run) => !runEnded(run)).slice(-1)[0];
    const last = running
      ? running.label
      : log.runs.length
        ? T(`Ran ${totals.checks} check(s) and changed ${totals.changes} item(s).`, `跑了 ${totals.checks} 項檢查，改了 ${totals.changes} 項。`)
        : T('Nothing has run on this computer yet.', '這台電腦上還沒有執行任何東西。');
    logBar.innerHTML = `
      <button type="button" class="log-toggle" data-log-toggle aria-expanded="${log.open}">
        ${ICON.chev}<span class="log-label">${E(T('Log', '記錄'))}</span><span class="log-last">${E(last)}</span>
        ${running ? '<span class="log-time" data-elapsed></span>' : ''}
      </button>
      ${log.open && log.runs.length ? `<button type="button" class="log-copy" data-log-copy>${E(copied.has('log') ? T('Copied', '已複製') : T('Copy all', '全部複製'))}</button>` : ''}`;
    const top = logScroll.scrollTop;
    logScroll.tabIndex = log.open ? 0 : -1;
    logScroll.innerHTML = log.runs.length
      ? log.runs.map((run) => `<div class="log-run">
          <div class="log-head"><span>${clockOf(run.startedAt)}</span><span class="log-kind ${runFailed(run) ? 'fail' : E(run.kind)}">${E(kindLabel(run.kind))}</span><span>${E(run.label)}</span></div>
          <div class="log-cmd">&gt; ${E(run.command)}</div>
          ${runFacts(run).map((line) => `<div class="log-fact ${runFailed(run) && /^(status|error|warning)/.test(line) ? 'fail' : ''}">${E(line)}</div>`).join('')}
        </div>`).join('')
      : `<p class="log-empty">${E(T("Each script's full command and result appear here once something runs.", '每個腳本實際執行的指令和結果，都會顯示在這裡。'))}</p>`;
    logScroll.scrollTop = log.pinned ? logScroll.scrollHeight : top;
    tick();
  }

  function settleLog() {
    win.clearTimeout(log.settle);
    log.settle = win.setTimeout(() => {
      if (destroyed || log.choice) return;
      if (log.hovering) { log.closeOnLeave = true; return; }
      log.open = false;
      renderLog();
    }, LOG_SETTLE_MS);
  }

  /**
   * Any run opens the log, unless the person closed it. A failure opens it whatever they chose and
   * holds it open, through any run that follows, until the next thing they start.
   */
  function acceptRun(run) {
    const index = log.runs.findIndex((entry) => entry.id === run.id);
    if (index >= 0) log.runs[index] = run;
    else log.runs.push(run);
    win.clearTimeout(log.settle);
    log.closeOnLeave = false;
    if (!runEnded(run)) {
      if (log.choice !== 'closed') log.open = true;
    } else if (runFailed(run) && run.status !== 'stopped') {
      log.hold = true;
      log.open = true;
    } else if (!log.hold && !log.runs.some((entry) => !runEnded(entry))) {
      settleLog();
    }
    renderLog();
    if (options.onRun) options.onRun(run);
  }

  /* ---------- Copying ---------- */

  function copyText(text) {
    const fallback = () => {
      const box = doc.createElement('textarea');
      box.value = text;
      box.setAttribute('readonly', '');
      box.style.position = 'fixed';
      box.style.opacity = '0';
      doc.body.append(box);
      box.select();
      let done = false;
      try { done = doc.execCommand('copy'); } catch { done = false; }
      box.remove();
      return done;
    };
    const clipboard = win.navigator && win.navigator.clipboard;
    if (clipboard && clipboard.writeText) return clipboard.writeText(text).then(() => true, () => fallback());
    return Promise.resolve(fallback());
  }
  function markCopied(key, render) {
    copied.add(key);
    render();
    win.setTimeout(() => {
      copied.delete(key);
      if (!destroyed) render();
    }, 1400);
  }

  /* ---------- The details page (SPEC-054, SPEC-136 FR-34 to FR-36) ---------- */

  const EVENT_KIND = () => ({
    helper_run_completed: T('Helper finished', '輔助程式已完成'),
    host_phase_changed: T('Desktop host phase changed', '桌面主機階段已變更'),
    resume_action_changed: T('Setup resume action changed', '設定續行動作已變更'),
    runtime_service_unavailable_observed: T('Runtime service unavailable', '執行階段服務無法使用'),
    runtime_status_observed: T('Runtime status observed', '已觀察到執行階段狀態'),
    service_exited_before_ready: T('Service exited before ready', '服務在就緒前結束'),
    setup_completed: T('Setup completed', '設定已完成'),
    setup_failed: T('Setup failed', '設定失敗'),
    setup_opened: T('Setup opened', '設定已開啟'),
    setup_payload_fallback: T('Setup used fallback payload', '設定使用備援資料'),
    setup_started: T('Setup started', '設定已開始'),
    setup_state_persisted: T('Setup state saved', '設定狀態已儲存'),
    selection_save_failed: T('Saving the selection failed', '儲存選擇失敗'),
    selection_saved: T('Selection saved', '選擇已儲存'),
    scan_failed: T('Checking the tools failed', '檢查工具失敗'),
    connection_test_failed: T('Connection test failed', '連線測試失敗'),
    connection_tested: T('Connection tested', '已測試連線'),
    model_pull_failed: T('Model download failed', '模型下載失敗'),
    model_pulled: T('Model downloaded', '模型已下載'),
    terminal_open_failed: T('Could not open a terminal', '開啟終端機失敗'),
    terminal_opened: T('Terminal opened', '已開啟終端機'),
    setup_open_failed: T('Could not open setup', '開啟設定失敗'),
    setup_rejected: T('Setup request refused', '設定請求被拒絕'),
  });
  const layerName = (layer) => ({ host: T('host', '主機'), product: T('product', '產品'), runtime: T('runtime', '執行階段') }[layer] || layer);
  const severityLabel = (severity) => ({ error: T('error', '錯誤'), warning: T('warning', '警告'), info: T('info', '資訊') }[severity] || severity);
  const serviceName = (name) => ({ 'cats-platform': 'Cats Platform', 'cats-runtime': 'Cats Runtime' }[name] || name);
  const statusWord = (status) => ({ ready: T('ready', '就緒'), failed: T('failed', '失敗'), starting: T('starting', '啟動中'), stopped: T('stopped', '已停止'), unavailable: T('unavailable', '無法使用'), ok: T('ok', '正常'), info: T('info', '資訊'), degraded: T('degraded', '受影響') }[status] || status);

  function detailsData() {
    const snapshot = details.snapshot || {};
    const diagnostics = snapshot.diagnostics || null;
    const aggregation = diagnostics && diagnostics.aggregation;
    const paths = [];
    if (snapshot.hostStatePath) paths.push([T('Host state: ', '主機狀態：'), snapshot.hostStatePath]);
    if (diagnostics && diagnostics.activeAttemptId) paths.push([T('Attempt: ', '嘗試：'), diagnostics.activeAttemptId]);
    if (diagnostics && diagnostics.product && diagnostics.product.historyPath) paths.push([T('History: ', '歷程：'), diagnostics.product.historyPath]);
    for (const entry of (diagnostics && diagnostics.serviceLogs) || []) {
      if (entry && entry.logPath) paths.push([T(`${serviceName(entry.service)} log: `, `${serviceName(entry.service)} 日誌：`), entry.logPath]);
    }
    return {
      services: snapshot.services || [],
      attempt: (aggregation && aggregation.attemptId) || (diagnostics && diagnostics.activeAttemptId) || null,
      layers: aggregation ? aggregation.layers : null,
      events: aggregation && Array.isArray(aggregation.chronology) ? aggregation.chronology.slice(0, 8) : [],
      paths,
    };
  }

  function detailsText() {
    const reason = details.reason;
    const data = detailsData();
    const lines = [reason.title, reason.body];
    if (reason.raw) lines.push(`error: ${reason.raw}`);
    for (const [label, value] of reason.extras || []) lines.push(`${label}: ${value}`);
    lines.push('');
    for (const service of data.services) {
      lines.push(`${serviceName(service.name)}: ${service.status}${service.error ? ` (${service.error})` : ''}`);
      if (service.lastOutput) lines.push(`output: ${service.lastOutput}`);
    }
    if (data.layers) {
      lines.push('', `runtime: ${data.layers.runtime.summary}`, `product: ${data.layers.product.summary}`, `host: ${data.layers.host.summary}`);
    }
    if (data.events.length) lines.push('');
    for (const event of data.events) {
      lines.push(`${event.timestamp} ${event.layer} ${event.kind} ${event.summary}${event.error && event.error.message ? ` (${event.error.message})` : ''}`);
    }
    if (data.paths.length) lines.push('');
    for (const [label, value] of data.paths) lines.push(label + value);
    if (log.runs.length) lines.push('', logText());
    return lines.join('\n');
  }

  function section(name, label, body) {
    const open = Boolean(details.open[name]);
    return `<div class="diag-section"><button type="button" class="diag-toggle" data-diag-section="${name}" aria-expanded="${open}">${ICON.chev}<span>${E(label)}</span></button>
      <div class="diag-body"${open ? '' : ' hidden'}>${body}</div></div>`;
  }

  function renderDetails() {
    const reason = details.reason;
    if (!reason) return;
    const data = detailsData();
    const runtime = data.services.find((service) => /runtime/i.test(service.name));
    const runtimeDown = !runtime || runtime.status !== 'ready';
    const busy = Boolean(options.isBusy && options.isBusy());
    const why = `<div class="diag-card"><div class="diag-head"><span>${E(reason.title)}</span><span class="${reason.severity === 'error' ? 'diag-bad' : reason.severity === 'warning' ? 'diag-warn' : ''}">${E(severityLabel(reason.severity || 'error'))}</span></div>
      ${reason.raw ? `<code class="diag-code">${E(reason.raw)}</code>` : ''}
      ${(reason.extras || []).length ? `<dl class="diag-dl">${reason.extras.map(([label, value]) => `<dt>${E(label)}</dt><dd>${E(value)}</dd>`).join('')}</dl>` : ''}
      ${!reason.raw && !(reason.extras || []).length ? `<div class="diag-small">${E(T('No specific issues were reported.', '沒有回報具體問題。'))}</div>` : ''}</div>`;
    const services = data.services.length
      ? `<div class="diag-card">${data.services.map((service) => {
        const failed = service.status === 'failed';
        const glyph = service.status === 'ready' ? ICON.check : failed ? ICON.cross : ICON.wait;
        return `<div class="diag-service"><span class="glyph">${glyph}</span><div class="diag-grow"><div class="diag-head"><span>${E(serviceName(service.name))}</span><span class="${failed ? 'diag-bad' : service.status === 'ready' ? 'diag-ok' : ''}">${E(statusWord(service.status))}</span></div>
          ${service.healthUrl ? `<code class="diag-code">${E(service.healthUrl)}</code>` : ''}
          ${service.error ? `<div class="diag-bad diag-small">${E(service.error)}</div>` : ''}
          ${service.lastOutput ? `<code class="diag-code">${E(service.lastOutput)}</code>` : ''}</div></div>`;
      }).join('')}</div>`
      : `<div class="diag-small">${E(T('Service status is not available.', '讀不到服務狀態。'))}</div>`;
    const kinds = EVENT_KIND();
    const eventList = data.events.map((event) => `<div class="diag-event"><div>${E(event.summary)}</div><div class="diag-meta"><span>${E(layerName(event.layer))}</span><span>${E(kinds[event.kind] || event.kind)}</span><span>${E(statusWord(event.status))}</span><span>${E(event.timestamp)}</span></div>${event.error && event.error.message ? `<div class="diag-bad diag-small">${E(event.error.message)}</div>` : ''}</div>`).join('');
    const layerRows = data.layers
      ? `<div class="diag-card"><div class="diag-head"><span>${E(T('Layer summary', '層級摘要'))}</span>${data.attempt ? `<code class="diag-attempt">${E(data.attempt)}</code>` : ''}</div>
        <div class="diag-small"><strong>${E(T('runtime: ', '執行階段：'))}</strong>${E(data.layers.runtime.summary)}</div>
        <div class="diag-small"><strong>${E(T('product: ', '產品：'))}</strong>${E(data.layers.product.summary)}</div>
        <div class="diag-small"><strong>${E(T('host: ', '主機：'))}</strong>${E(data.layers.host.summary)}</div></div>`
      : `<div class="diag-small">${E(T('Advanced diagnostics are not available yet.', '進階診斷還讀不到。'))}</div>`;
    const diagnostics = `${layerRows}
      ${data.events.length ? `<div class="diag-card"><div class="diag-head"><span>${E(T('Recent events', '最近事件'))}</span><span class="diag-warn">${E(T(`${data.events.length} entries`, `${data.events.length} 筆`))}</span></div>${eventList}</div>` : ''}
      <div class="diag-after"><button type="button" class="btn small" data-diag-advanced ${runtimeDown ? 'disabled' : ''}>${E(T('Open advanced diagnostics', '開啟進階診斷'))}</button>
      ${runtimeDown ? `<span class="diag-small">${E(T('Cats Runtime is not running, so this page cannot open.', 'Cats Runtime 沒有執行，這個頁面打不開。'))}</span>` : details.note === 'advanced' ? `<span class="diag-small" role="status">${E(T('Opened in your browser.', '已在瀏覽器開啟。'))}</span>` : ''}</div>`;
    const paths = data.paths.length
      ? `<div class="diag-card">${data.paths.map(([label, value]) => `<div class="diag-small"><strong>${E(label)}</strong><code class="diag-code">${E(value)}</code></div>`).join('')}</div>`
      : `<div class="diag-small">${E(T('No log paths are available yet.', '還沒有可用的日誌路徑。'))}</div>`;
    detailsPane.innerHTML = `<div class="diag" data-diag>
      <button type="button" class="more diag-back" data-diag-back>${E(T('← Return', '← 返回'))}</button>
      <h1 tabindex="-1" data-diag-title>${E(reason.title)}</h1>
      <p class="lead" style="margin-bottom:10px !important">${E(reason.body)}</p>
      <div class="diag-actions">${reason.repair ? `<button type="button" class="btn" data-diag-repair ${busy ? 'disabled' : ''}>${E(reason.repair.label)}</button>` : ''}
        <button type="button" class="btn" data-diag-quit ${busy ? 'disabled' : ''}>${E(T('Quit Cats', '結束 Cats'))}</button></div>
      <div class="label-line diag-label"><p class="group-label">${E(T('Technical details', '技術細節'))}</p><button type="button" class="more" data-diag-copy>${E(copied.has('diag') ? T('Copied', '已複製') : T('Copy details', '複製診斷資訊'))}</button></div>
      ${section('why', T('What needs attention', '需要處理的項目'), why)}
      ${section('services', T('Service status', '服務狀態'), services)}
      ${section('diagnostics', T('Advanced diagnostics', '進階診斷'), diagnostics)}
      ${section('paths', T('Advanced logs and paths', '進階日誌與路徑'), paths)}
    </div>`;
  }

  function openDetails(reason, trigger) {
    details.reason = reason;
    details.returnFocus = trigger && trigger.id ? trigger.id : (trigger && trigger.dataset && trigger.dataset.focusKey) || null;
    details.paneTop = pane.scrollTop;
    details.open = {};
    details.note = null;
    pane.hidden = true;
    foot.hidden = true;
    detailsPane.hidden = false;
    renderDetails();
    detailsPane.scrollTop = 0;
    const title = detailsPane.querySelector('[data-diag-title]');
    if (title) title.focus({ preventScroll: true });
    // Read after opening: a host that is struggling must not hold the page back.
    Promise.resolve()
      .then(() => (bridge && bridge.getSnapshot ? bridge.getSnapshot() : null))
      .then((snapshot) => {
        if (!details.reason) return;
        details.snapshot = snapshot;
        renderDetails();
      })
      .catch(() => undefined);
  }

  function closeDetails(focus = true) {
    if (!details.reason) return;
    const focusKey = details.returnFocus;
    details.reason = null;
    detailsPane.hidden = true;
    detailsPane.innerHTML = '';
    pane.hidden = false;
    foot.hidden = false;
    pane.scrollTop = details.paneTop;
    if (focus && focusKey) {
      const target = pane.querySelector(`[id="${focusKey}"]`);
      if (target) target.focus({ preventScroll: true });
    }
    if (options.onDetailsClosed) options.onDetailsClosed();
  }

  /* ---------- Events ---------- */

  function onClick(event) {
    const target = event.target.closest('button');
    if (!target || !frame.contains(target)) return;
    if (target.dataset.step !== undefined) {
      closeDetails(false);
      if (options.onStep) options.onStep(Number(target.dataset.step));
      return;
    }
    if (target.dataset.logToggle !== undefined) {
      log.open = !log.open;
      log.choice = log.open ? 'open' : 'closed';
      win.clearTimeout(log.settle);
      renderLog();
      return;
    }
    if (target.dataset.logCopy !== undefined) {
      copyText(logText()).then(() => markCopied('log', renderLog));
      return;
    }
    if (target.dataset.diagBack !== undefined) { closeDetails(); return; }
    if (target.dataset.diagSection !== undefined) {
      const name = target.dataset.diagSection;
      details.open[name] = !details.open[name];
      renderDetails();
      const again = detailsPane.querySelector(`[data-diag-section="${name}"]`);
      if (again) again.focus({ preventScroll: true });
      return;
    }
    if (target.dataset.diagCopy !== undefined) {
      copyText(detailsText()).then(() => markCopied('diag', renderDetails));
      return;
    }
    if (target.dataset.diagAdvanced !== undefined) {
      Promise.resolve(bridge.runAction('open_runtime_diagnostics')).then(() => {
        details.note = 'advanced';
        renderDetails();
      }, () => undefined);
      return;
    }
    if (target.dataset.diagRepair !== undefined) {
      const repair = details.reason && details.reason.repair;
      closeDetails(false);
      if (repair) repair.run();
      return;
    }
    if (target.dataset.diagQuit !== undefined) {
      Promise.resolve(bridge.runAction('quit')).catch(() => undefined);
    }
  }
  function onKey(event) {
    if (event.key === 'Escape' && details.reason) {
      event.preventDefault();
      closeDetails();
    }
  }
  const onEnter = () => { log.hovering = true; };
  const onLeave = () => {
    log.hovering = false;
    if (log.closeOnLeave) { log.closeOnLeave = false; settleLog(); }
  };
  const onScroll = () => {
    log.pinned = logScroll.scrollHeight - logScroll.scrollTop - logScroll.clientHeight < 24;
  };
  frame.addEventListener('click', onClick);
  doc.addEventListener('keydown', onKey);
  logEl.addEventListener('pointerenter', onEnter);
  logEl.addEventListener('pointerleave', onLeave);
  logScroll.addEventListener('scroll', onScroll);

  /** The clock only runs while something on screen is counting. */
  let timer = null;
  function tick() {
    if (destroyed) return;
    const running = log.runs.filter((run) => !runEnded(run)).slice(-1)[0];
    if ((running || elapsedFrom) && timer === null) timer = win.setInterval(tick, 250);
    if (!running && !elapsedFrom && timer !== null) { win.clearInterval(timer); timer = null; }
    const logFrom = running ? new Date(running.startedAt).getTime() : null;
    for (const node of frame.querySelectorAll('[data-elapsed]')) {
      const from = node.closest('.log') ? logFrom : (elapsedFrom ?? logFrom);
      const seconds = from ? Math.max(0, Math.floor((Date.now() - from) / 1000)) : 0;
      node.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
  }
  let unsubscribe = null;
  if (!browserOnly) {
    unsubscribe = bridge.setupWizard.onRun ? bridge.setupWizard.onRun(acceptRun) : null;
    Promise.resolve(bridge.setupWizard.runs ? bridge.setupWizard.runs() : [])
      .then((runs) => {
        if (destroyed || !Array.isArray(runs)) return;
        // Runs that arrived while this was on its way are newer, so they win.
        const known = new Set(log.runs.map((run) => run.id));
        log.runs = [...runs.filter((run) => !known.has(run.id)), ...log.runs].sort((a, b) => a.id - b.id);
        renderLog();
        if (options.onRun) options.onRun(null);
      })
      .catch(() => undefined);
  }
  renderLog();

  return {
    pane,
    foot,
    icons: ICON,
    T,
    E,
    browserOnly,
    setLocale(locale) {
      zh = String(locale || 'en').startsWith('zh');
      renderRail();
      renderLog();
      if (details.reason) renderDetails();
    },
    setSteps(next) { steps = next; renderRail(); },
    setNote(a, b) {
      part('note-a').textContent = a;
      part('note-b').textContent = b;
    },
    setBusy(busy) { part('perch').classList.toggle('busy', Boolean(busy)); },
    setElapsedFrom(value) { elapsedFrom = value; tick(); },
    /** The person started something new, so an earlier failure stops holding the log open. */
    beginWork() { log.hold = false; },
    /** Changes made before a restart, which this process's log cannot see. */
    setPriorChanges(count) { priorChanges = Number(count) || 0; renderLog(); },
    tick,
    copyText,
    isDetailsOpen: () => Boolean(details.reason),
    openDetails,
    closeDetails,
    logTotals,
    runs: () => log.runs.slice(),
    destroy() {
      destroyed = true;
      win.clearTimeout(log.settle);
      if (timer !== null) win.clearInterval(timer);
      frame.removeEventListener('click', onClick);
      doc.removeEventListener('keydown', onKey);
      if (unsubscribe) unsubscribe();
      root.replaceChildren();
    },
  };
}

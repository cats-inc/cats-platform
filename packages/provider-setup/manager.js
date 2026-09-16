/** Browser-only, self-contained so the host can embed it before Platform starts. */
export function mountProviderManager(root, bridge, options = {}) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const zh = String(options.locale || 'en').startsWith('zh');
  const text = (en, tw) => zh ? tw : en;
  const context = options.context || 'settings';
  const key = (target) => JSON.stringify([target.provider, target.backend, target.instance]);
  const identity = (target) => ({ provider: target.provider, backend: target.backend, instance: target.instance });
  let snapshot = null;
  let draft = null;
  let revision = null;
  let detectAfter = null;
  let busy = false;
  let stage = '';
  let error = '';
  let notice = '';
  let destroyed = false;
  let refreshing = false;
  let epoch = 0;
  let filter = '';
  let signature = '';
  let confirmation = null;
  const endpointEdits = new Map();
  const elements = (...items) => items.flat().filter((item) => item !== null && item !== undefined);
  function el(tag, attrs = {}, ...children) {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
      else if (name === 'checked' || name === 'disabled') node[name] = Boolean(value);
      else if (name === 'value') node.value = value;
      else if (value !== null && value !== false) node.setAttribute(name, String(value));
    }
    node.append(...elements(...children));
    return node;
  }
  const button = (label, action, disabled = false, attrs = {}) => el('button', {
    type: 'button', disabled, onclick: action, ...attrs,
  }, label);
  const spinner = () => el('span', { class: 'pm-spinner', 'aria-hidden': 'true' });
  function changed() {
    if (!snapshot || !draft) return false;
    const saved = snapshot.runtime.selection.targets.map(key);
    return endpointEdits.size > 0 || saved.length !== draft.size || saved.some((value) => !draft.has(value));
  }
  function feedback(message) {
    if (destroyed) return;
    if (options.onFeedback) options.onFeedback(message);
    else notice = message;
  }
  function accept(next, reset = false) {
    if (confirmation && (confirmation.revision !== next.runtime.selection.revision || next.runtime.selection.diskChanged)) confirmation = null;
    snapshot = next;
    signature = JSON.stringify(next);
    if (draft === null || reset || (!changed() && revision === next.runtime.selection.revision)) {
      draft = new Set(next.runtime.selection.targets.map(key));
      revision = next.runtime.selection.revision;
      if (reset) endpointEdits.clear();
    }
    if (detectAfter === null) {
      detectAfter = context === 'onboarding' && ['missing', 'invalid'].includes(next.runtime.selection.state);
    }
  }
  async function refresh() {
    if (destroyed || refreshing) return;
    refreshing = true;
    const readEpoch = epoch;
    try {
      const next = await bridge.getProviderSetup(context);
      if (destroyed || readEpoch !== epoch) return;
      // Preserve dirty drafts, including their original revision, across external edits.
      const dirty = draft !== null && changed();
      if (!dirty && revision !== next.runtime.selection.revision) {
        draft = null;
        endpointEdits.clear();
      }
      const previousSignature = signature;
      accept(next);
      const hadError = Boolean(error);
      error = '';
      const nextSignature = JSON.stringify(next);
      if (hadError || nextSignature !== previousSignature) render();
    } catch (reason) {
      if (!destroyed && readEpoch === epoch) {
        const message = String(reason?.message || reason);
        if (error !== message) { error = message; render(); }
      }
    } finally { refreshing = false; }
  }
  async function perform(label, action) {
    if (busy) return;
    epoch++;
    busy = true; stage = label; error = ''; notice = ''; render();
    try {
      const next = await action();
      epoch++;
      if (!destroyed && next) accept(next);
    } catch (reason) {
      if (!destroyed) {
        const message = String(reason?.message || reason);
        if (options.onFeedback) options.onFeedback(message);
        else error = message;
      }
    } finally {
      epoch++;
      busy = false; stage = '';
      if (!destroyed) { render(); void refresh(); }
    }
  }
  function apply(reload = false) {
    const targets = [...draft].map((value) => {
      const [provider, backend, instance] = JSON.parse(value);
      return { provider, backend, instance,
        ...(endpointEdits.has(value) ? { endpoint: endpointEdits.get(value) } : {}) };
    });
    void perform(detectAfter && !reload ? text('Applying and detecting…', '正在套用並偵測…') : text('Applying…', '正在套用…'), async () => {
      const next = await bridge.applyProviderSetup({ targets, expectedRevision: revision,
        detectAfter: !reload && detectAfter, reload });
      if (destroyed) return next;
      accept(next, true);
      feedback(detectAfter && !reload
        ? text('Selection applied. Review each provider’s result below.', '已套用選擇，請查看各項偵測結果。')
        : text('Selection applied. Previous detection results are retained.', '已套用選擇，保留原有偵測結果。'));
      return next;
    });
  }
  function run(action, targets, expectedRevision = revision) {
    const labels = {
      detect: text('Detecting…', '偵測中…'), install: text('Installing and verifying…', '安裝並確認中…'),
      upgrade: text('Updating and verifying…', '更新並確認中…'), repair: text('Repairing and verifying…', '修復並確認中…'),
      uninstall: text('Uninstalling and verifying…', '解除安裝並確認中…'), preview_uninstall: text('Preparing removal preview…', '準備移除預覽…'),
    };
    void perform(labels[action], async () => {
      const next = await bridge.runProviderSetup({ action, targets: targets.map(identity), expectedRevision });
      if (destroyed) return next;
      if (action === 'preview_uninstall') confirmation = next.preview || null;
      else {
        const outcomes = targets.map((target) => next.outcomes[key(target)]).filter(Boolean);
        const failed = outcomes.find((outcome) => outcome.runState === 'failed' || outcome.status === 'failed');
        feedback(failed ? failed.summary : action === 'detect'
          ? text('Detection finished. Review the results.', '偵測完成，請查看結果。')
          : text('Operation finished. Review the result and any remaining steps.', '操作完成，請查看結果與待辦步驟。'));
      }
      return next;
    });
  }
  function row(target, selection, operationBusy) {
    const id = key(target);
    const selected = selection.targets.some((entry) => key(entry) === id);
    const wanted = draft.has(id);
    const observation = (snapshot.runtime.observations || []).find((entry) => key(entry) === id && entry.configurationStatus !== 'not_selected');
    const stale = observation?.configurationStatus === 'changed';
    const connection = (snapshot.runtime.connections || []).find((entry) => key(entry) === id);
    const isService = Boolean(connection) || target.provider === 'ollama' || target.provider === 'openclaw';
    const eligible = selection.nativeSetupTargets.some((entry) => key(entry) === id);
    const suffix = target.provider === 'ollama' ? 'local-model' : 'native';
    const helper = eligible ? snapshot.helpers.find((entry) => entry.id === `${snapshot.platform}-${target.provider}-${suffix}-installer` && entry.available && entry.supported) : null;
    const outcome = snapshot.outcomes[id];
    const operation = snapshot.operations.find((entry) => entry.targets.some((value) => key(value) === id));
    const installed = !stale && observation?.commandStatus === 'ready';
    let status = text('Not detected', '尚未偵測');
    let tone = '';
    if (!selected) status = wanted ? text('Apply to enable detection and installation', '套用後即可偵測與安裝') : text('Not selected', '未選用');
    else if (stale) status = text('Settings changed · detect again', '設定已變更，請重新偵測');
    else if (observation?.connectionStatus === 'connected') { status = text('Connection verified', '連線已確認'); tone = 'pm-ok'; }
    else if (observation?.connectionStatus === 'failed') { status = text('Connection failed', '連線失敗'); tone = 'pm-warn'; }
    else if (installed) { status = text('Installed', '已安裝') + (observation.version ? ` · ${observation.version}` : ''); tone = 'pm-ok'; }
    else if (observation?.commandStatus === 'probe_failed') { status = text('Detection failed · try again', '偵測失敗，請重試'); tone = 'pm-warn'; }
    else if (observation && ['missing_install', 'missing_path', 'missing'].includes(observation.commandStatus)) { status = text('Not installed / not found', '尚未安裝／找不到指令'); tone = 'pm-warn'; }
    else if (isService) status = text('Connection not checked', '尚未檢查連線');
    if (operation) { status = operation.stage; tone = ''; }
    const toggle = el('input', { type: 'checkbox', checked: wanted, disabled: busy || Boolean(operation) || Boolean(confirmation),
      'data-focus': `choice:${id}`, 'aria-label': text('Use ', '使用 ') + target.familyLabel,
      onchange: (event) => { if (event.target.checked) draft.add(id); else { draft.delete(id); endpointEdits.delete(id); } notice = ''; render(); },
    });
    const details = el('div', { class: 'pm-detail' },
      el('label', { class: 'pm-name' }, toggle, el('strong', {}, target.familyLabel || target.provider)),
      el('div', { class: `pm-status ${tone}`, 'data-status': id }, operation ? spinner() : null, status),
      selected && observation ? el('small', {}, text('Last checked: ', '上次偵測：') + new Date(observation.observedAt).toLocaleString(zh ? 'zh-TW' : 'en')) : null,
      installed ? el('small', {}, observation.authStatus === 'not_required'
        ? text('No sign-in required', '不需要登入') : observation.authStatus === 'missing'
          ? text('Sign-in required', '需要登入') : text('Sign-in has not been verified', '尚未驗證登入狀態')) : null,
      selected && observation?.detail ? el('small', {}, observation.detail) : null,
    );
    if (isService && wanted) {
      const endpoint = endpointEdits.get(id) ?? connection?.endpoint ?? '';
      details.append(el('label', { class: 'pm-endpoint' }, text('Endpoint', '服務位址'), el('input', {
        type: 'text', inputmode: 'url', value: endpoint, disabled: busy || Boolean(confirmation) || connection?.editable === false,
        placeholder: target.provider === 'ollama' ? 'http://127.0.0.1:11434' : 'ws://127.0.0.1:18789',
        'data-focus': `endpoint:${id}`, 'aria-label': `${target.familyLabel} ${text('endpoint', '服務位址')}`,
        oninput: (event) => { endpointEdits.set(id, event.target.value.trim()); render(); },
      })));
      if (connection?.source) details.append(el('small', {}, connection.source));
    }
    const canAct = wanted && selected && !endpointEdits.has(id) && !busy && !operationBusy && !error && !selection.diskChanged && !confirmation;
    const controls = el('div', { class: 'pm-actions' });
    if (wanted) controls.append(button(isService ? text('Test Connection', '測試連線') : observation ? text('Detect Again', '重新偵測') : text('Detect', '偵測'), () => run('detect', [target]), !canAct, { 'data-action': 'detect', 'data-target': id }));
    if (helper && wanted && !installed) controls.append(button(text('Install', '安裝'), () => run('install', [target]), !canAct || !helper.supportsApply, { 'data-action': 'install', 'data-target': id }));
    if (helper && wanted) {
      const more = el('details', { class: 'pm-more' }, el('summary', {}, text('More', '更多')));
      if (helper.supportsUpgrade) more.append(button(text('Upgrade', '更新'), () => run('upgrade', [target]), !canAct));
      if (helper.supportsForce) more.append(button(text('Repair', '修復'), () => run('repair', [target]), !canAct));
      if (helper.supportsUninstall) more.append(button(text('Uninstall…', '解除安裝…'), () => run('preview_uninstall', [target]), !canAct));
      controls.append(more);
    }
    const docsUrl = target.install?.auth?.docsUrl || target.install?.install?.docsUrl;
    if (wanted && docsUrl && /^https?:\/\//.test(docsUrl)) controls.append(el('a', { href: docsUrl, target: '_blank', rel: 'noopener noreferrer' }, text('Install / sign-in guide', '安裝／登入說明')));
    if (wanted && !helper && !docsUrl) details.append(el('small', {}, isService
      ? text('Configure the service, then test its connection.', '請先設定服務，再測試連線。')
      : text('Install this provider in its configured environment, then detect again.', '請在設定的執行環境中安裝，再重新偵測。')));
    if (selected && target.install?.auth?.hint && installed) details.append(el('small', {}, target.install.auth.hint));
    if (selected && outcome) {
      const remaining = [...outcome.warnings, ...outcome.manualSteps];
      details.append(el('p', { class: outcome.runState === 'failed' || outcome.status === 'failed' ? 'pm-warn' : 'pm-intro' }, outcome.summary));
      if (remaining.length) details.append(el('details', {}, el('summary', {}, text('Remaining steps / details', '待辦步驟／詳細資訊')), el('ul', {}, remaining.map((value) => el('li', {}, value)))));
    }
    return el('div', { class: 'pm-row', 'data-provider': target.provider, 'data-target': id }, details, controls);
  }
  function render() {
    if (destroyed) return;
    const focus = doc.activeElement?.getAttribute('data-focus');
    const cursor = doc.activeElement?.selectionStart;
    root.classList.add('catsProviderManager');
    const style = el('style', {}, `
      .catsProviderManager{--pm-border:#ddd8d0;--pm-muted:#6b6560;--pm-accent:#a84724;font:inherit;color:inherit;max-width:960px;margin:auto}
      .catsProviderManager *{box-sizing:border-box}.catsProviderManager h2{font-size:1.35rem;margin:0 0 8px}.catsProviderManager p{margin:8px 0}
      .catsProviderManager .pm-intro,.catsProviderManager small{color:var(--pm-muted);font-size:.85rem;display:block;line-height:1.6}
      .catsProviderManager .pm-row{display:flex;justify-content:space-between;align-items:start;gap:16px;padding:18px 0;border-bottom:1px solid var(--pm-border)}
      .catsProviderManager .pm-detail{flex:1;min-width:0}.catsProviderManager .pm-name{display:flex;align-items:center;gap:10px;cursor:pointer}
      .catsProviderManager .pm-list{max-height:min(60vh,640px);overflow-y:auto;overscroll-behavior:contain;padding-right:4px}
      .catsProviderManager input[type=checkbox]{width:19px;height:19px;accent-color:var(--pm-accent);flex-shrink:0;opacity:1}
      .catsProviderManager .pm-status{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:.88rem}.catsProviderManager .pm-ok{color:#207a53}.catsProviderManager .pm-warn{color:#986515}
      .catsProviderManager .pm-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;max-width:330px}
      .catsProviderManager button{font:inherit;font-size:.84rem;cursor:pointer;border:1px solid var(--pm-border);border-radius:7px;background:transparent;color:inherit;padding:8px 12px}
      .catsProviderManager button:hover:not(:disabled){border-color:var(--pm-accent)}.catsProviderManager button:disabled{cursor:default;opacity:.5}
      .catsProviderManager button.pm-primary{background:var(--pm-accent);border-color:var(--pm-accent);color:white}
      .catsProviderManager input[inputmode=url],.catsProviderManager input[type=search]{font:inherit;font-size:.87rem;color:inherit;background:transparent;border:1px solid var(--pm-border);border-radius:6px;padding:8px;width:100%}
      .catsProviderManager .pm-endpoint{display:block;font-size:.8rem;margin-top:9px}.catsProviderManager .pm-endpoint input{margin-top:4px}
      .catsProviderManager .pm-footer{position:sticky;bottom:0;z-index:2;background:var(--panel,#fff);border-top:1px solid var(--pm-border);padding:16px 0;margin-top:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
      .catsProviderManager .pm-footer label{display:flex;align-items:center;gap:8px;font-size:.86rem}.catsProviderManager .pm-continue{margin-left:auto}
      .catsProviderManager .pm-progress{display:flex;gap:10px;align-items:center;padding:12px;background:rgba(196,101,58,.08);border-radius:8px;margin:12px 0}
      .catsProviderManager .pm-spinner{display:inline-block;width:19px;height:19px;border:2px solid var(--pm-border);border-top-color:var(--pm-accent);border-radius:50%;animation:pm-spin .8s linear infinite;flex-shrink:0}
      @keyframes pm-spin{to{transform:rotate(360deg)}}.catsProviderManager a{font-size:.8rem;color:var(--pm-accent)}.catsProviderManager summary{font-size:.83rem;cursor:pointer;padding:7px 0}
      .catsProviderManager .pm-more button{display:block;margin:4px 0}.catsProviderManager .pm-dialog{border:2px solid var(--pm-accent);border-radius:10px;padding:20px;margin:16px 0;background:var(--panel,#fff);max-height:45vh;overflow:auto}
      .catsProviderManager [role=alert]{color:#b2342c;overflow-wrap:anywhere}.catsProviderManager li{margin-left:20px;font-size:.83rem;overflow-wrap:anywhere}
      @media(max-width:580px){.catsProviderManager .pm-row{flex-direction:column}.catsProviderManager .pm-actions{max-width:none;justify-content:flex-start}.catsProviderManager .pm-footer{gap:8px}}
      @media(prefers-reduced-motion:reduce){.catsProviderManager .pm-spinner{animation-duration:2s}}
    `);
    const heading = el('h2', {}, context === 'onboarding' ? text('Choose your providers', '選擇要使用的 providers') : text('Providers', 'Providers'));
    const intro = el('p', { class: 'pm-intro' }, text('Select the providers you want Cats to use. You can install missing providers now or return here later.', '勾選你希望 Cats 使用的 providers。可以現在補裝，或稍後回到這裡設定。'));
    const content = [style, heading, intro];
    if (error) content.push(el('div', { role: 'alert' }, error, ' ', button(text('Refresh', '重新讀取'), () => { signature = ''; void refresh(); }, busy)));
    if (!snapshot) {
      content.push(el('div', { class: 'pm-progress', role: 'status' }, spinner(), text('Loading provider settings…', '讀取 provider 設定中…')));
      root.replaceChildren(...content); return;
    }
    const selection = snapshot.runtime.selection;
    const invalid = ['missing', 'invalid'].includes(selection.state);
    const operationBusy = snapshot.operations.length > 0 || snapshot.runtime.state?.status === 'scanning';
    const dirty = changed();
    if (selection.diskChanged || revision !== selection.revision) content.push(el('div', { role: 'alert' }, text('Configuration changed elsewhere. Refresh or reload before applying your changes.', '設定已在其他地方變更。請重新讀取或載入後再套用。'), ' ', button(text('Discard draft and reload', '捨棄草稿並重新載入'), () => {
      revision = selection.revision; apply(true);
    }, busy || operationBusy)));
    else if (selection.error) content.push(el('p', { role: 'alert' }, selection.error));
    if (snapshot.runtime.state?.error) content.push(el('p', { role: 'alert' }, snapshot.runtime.state.error));
    if (busy || operationBusy) content.push(el('div', { class: 'pm-progress', role: 'status', 'aria-live': 'polite' }, spinner(), snapshot.operations[0]?.stage || stage || text('Detecting selected providers…', '偵測已選 providers 中…')));
    if (notice && !busy && !operationBusy) content.push(el('p', { role: 'status' }, notice));
    const search = el('input', { type: 'search', value: filter, placeholder: text('Find a provider', '尋找 provider'), 'data-focus': 'search',
      'aria-label': text('Find a provider', '尋找 provider'), oninput: (event) => { filter = event.target.value; render(); } });
    content.push(search);
    const catalog = snapshot.runtime.universe.slice();
    for (const target of selection.targets) if (!catalog.some((entry) => key(entry) === key(target))) catalog.push({ ...target, familyLabel: `${target.provider} (${target.backend}/${target.instance})` });
    content.push(el('div', { class: 'pm-list' }, catalog.filter((target) => `${target.familyLabel} ${target.provider}`.toLowerCase().includes(filter.toLowerCase())).map((target) => row(target, selection, operationBusy))));
    if (confirmation) {
      const current = confirmation;
      content.push(el('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': text('Confirm uninstall', '確認解除安裝'), class: 'pm-dialog' },
        el('h3', {}, text('Uninstall ', '解除安裝 ') + current.target.provider + '?'),
        el('p', {}, current.result.summary),
        el('ul', {}, [...current.result.plannedActions, ...current.result.warnings, ...current.result.manualSteps].map((value) => el('li', {}, value))),
        button(text('Cancel', '取消'), () => { confirmation = null; render(); }, busy), ' ',
        button(text('Uninstall', '解除安裝'), () => { confirmation = null; run('uninstall', [current.target], current.revision); }, busy || current.revision !== revision || changed() || selection.diskChanged || current.result.runState === 'failed' || !current.result.plannedActions.length),
      ));
    }
    if (dirty) content.push(button(text('Discard changes', '捨棄變更'), () => { confirmation = null; accept(snapshot, true); render(); }, busy || operationBusy || Boolean(confirmation), { class: 'pm-discard' }));
    const footer = el('div', { class: 'pm-footer' });
    if (dirty || invalid) {
      footer.append(button(text('Apply', 'Apply'), () => apply(), busy || operationBusy || Boolean(confirmation) || Boolean(error) || selection.diskChanged || revision !== selection.revision, { class: 'pm-primary', 'data-action': 'apply' }),
        el('label', {}, el('input', { type: 'checkbox', checked: detectAfter, disabled: busy,
          'data-focus': 'detect-after', 'data-action': 'detect-after', onchange: (event) => { detectAfter = event.target.checked; } }), text('Detect after applying', '套用後偵測')));
    } else {
      footer.append(button(text('Detect selected', '重新偵測已選項目'), () => run('detect', selection.targets), busy || operationBusy || Boolean(confirmation) || Boolean(error) || selection.diskChanged || !selection.targets.length, { 'data-action': 'detect-selected' }));
    }
    if (options.onContinue) footer.append(button(text('Continue', '繼續'), () => void perform(text('Continuing…', '繼續設定…'), async () => { await options.onContinue(); }), invalid || dirty || busy || operationBusy || Boolean(confirmation) || Boolean(error) || selection.diskChanged, { class: 'pm-primary pm-continue', 'data-action': 'continue' }));
    content.push(footer);
    if (!invalid && !dirty) {
      const observations = (snapshot.runtime.observations || []).filter((entry) => entry.configurationStatus === 'unchanged' && selection.targets.some((target) => key(entry) === key(target)));
      const detected = observations.length;
      const ready = observations.filter((entry) => entry.available).length;
      content.push(el('p', { class: 'pm-intro' }, selection.targets.length === 0
        ? text('No providers selected. You can add them later in Settings → Runtime.', '目前未選擇 provider，之後可到 Settings → Runtime 新增。')
        : text(`${selection.targets.length} selected · ${detected} checked · ${ready} found or connected. Installation and sign-in can be completed later.`, `已選 ${selection.targets.length} 項・已偵測 ${detected} 項・已找到或連線 ${ready} 項。安裝與登入可稍後完成。`)));
    }
    root.replaceChildren(...content);
    if (focus) {
      const next = [...root.querySelectorAll('[data-focus]')].find((node) => node.getAttribute('data-focus') === focus);
      next?.focus({ preventScroll: true });
      if (typeof cursor === 'number') { try { next?.setSelectionRange(cursor, cursor); } catch { /* URL inputs have no selection API. */ } }
    }
  }
  render();
  void refresh();
  const timer = win.setInterval(() => { if (doc.visibilityState !== 'hidden') void refresh(); }, 2000);
  const onFocus = () => void refresh();
  win.addEventListener('focus', onFocus);
  return { refresh, destroy() { destroyed = true; win.clearInterval(timer); win.removeEventListener('focus', onFocus); root.replaceChildren(); } };
}

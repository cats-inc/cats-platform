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
  let expanded = false;
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
        ? text('Saved. Check the results on your selected tools.', '已套用，請查看所選工具的偵測結果。')
        : text('Saved.', '已套用。'));
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
          ? text('Check finished.', '偵測完成。')
          : text('Finished. Check the tool’s status.', '已完成，請查看工具的狀態。'));
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
    if (!selected) status = wanted ? text('Apply to get started', '套用後開始使用') : text('Not selected', '未選用');
    else if (stale) status = text('Settings changed · detect again', '設定已變更，請重新偵測');
    else if (observation?.connectionStatus === 'connected') { status = text('Connection verified', '連線已確認'); tone = 'pm-ok'; }
    else if (observation?.connectionStatus === 'failed') { status = text('Connection failed', '連線失敗'); tone = 'pm-warn'; }
    else if (installed) { status = text('Installed', '已安裝'); tone = 'pm-ok'; }
    else if (observation?.commandStatus === 'probe_failed') { status = text('Detection failed · try again', '偵測失敗，請重試'); tone = 'pm-warn'; }
    else if (observation && ['missing_install', 'missing_path', 'missing'].includes(observation.commandStatus)) { status = text('Not installed', '尚未安裝'); tone = 'pm-warn'; }
    else if (isService) status = text('Connection not checked', '尚未檢查連線');
    if (operation) { status = stage || text('Working…', '處理中…'); tone = ''; }
    const failed = outcome && (outcome.runState === 'failed' || outcome.status === 'failed');
    if (failed && !operation) { status = text('Needs attention', '需要處理'); tone = 'pm-warn'; }
    const toggle = el('input', { type: 'checkbox', checked: wanted, disabled: busy || Boolean(operation) || Boolean(confirmation),
      'data-focus': `choice:${id}`, 'aria-label': text('Use ', '使用 ') + target.familyLabel + (target.custom ? ` (${target.backend}/${target.instance})` : ''),
      onchange: (event) => { if (event.target.checked) draft.add(id); else { draft.delete(id); endpointEdits.delete(id); } notice = ''; render(); },
    });
    const details = el('div', { class: 'pm-detail' },
      el('label', { class: 'pm-name' }, toggle, el('strong', {}, target.familyLabel || target.provider)),
      el('div', { class: `pm-status ${tone}`, 'data-status': id }, operation ? spinner() : null, status),
    );
    const more = el('details', { class: 'pm-more', 'data-details': `more:${id}` },
      el('summary', {}, text('Details', '詳細資訊')));
    if (target.custom) more.append(el('small', {}, text('Connection: ', '連線：') + `${target.backend} / ${target.instance}`));
    if (selected && observation) {
      if (installed) more.append(el('small', {}, text('Installation: Installed', '安裝狀態：已安裝')));
      more.append(el('small', {}, text('Last checked: ', '上次偵測：') + new Date(observation.observedAt).toLocaleString(zh ? 'zh-TW' : 'en')));
      if (observation.version) more.append(el('small', {}, text('Version: ', '版本：') + observation.version));
      if (installed) more.append(el('small', {}, observation.authStatus === 'not_required'
        ? text('No sign-in required', '不需要登入') : observation.authStatus === 'missing'
          ? text('Sign-in required', '需要登入') : text('Sign-in has not been verified', '尚未驗證登入狀態')));
      if (observation.detail) more.append(el('small', {}, observation.detail));
    }
    if (installed && observation.authStatus === 'missing') details.append(el('small', {}, text('Sign in to get started', '登入後即可開始使用')));
    if (isService && wanted) {
      const endpoint = endpointEdits.get(id) ?? connection?.endpoint ?? '';
      more.append(el('label', { class: 'pm-endpoint' }, text('Connection address', '連線位址'), el('input', {
        type: 'text', inputmode: 'url', value: endpoint, disabled: busy || Boolean(confirmation) || connection?.editable === false,
        placeholder: target.provider === 'ollama' ? 'http://127.0.0.1:11434' : 'ws://127.0.0.1:18789',
        'data-focus': `endpoint:${id}`, 'aria-label': `${target.familyLabel} ${text('endpoint', '服務位址')}`,
        oninput: (event) => { endpointEdits.set(id, event.target.value.trim()); render(); },
      })));
    }
    const canAct = wanted && selected && !endpointEdits.has(id) && !busy && !operationBusy && !error && !selection.diskChanged && !confirmation;
    const controls = el('div', { class: 'pm-actions' });
    if (wanted) controls.append(button(isService ? text('Test Connection', '測試連線') : observation ? text('Detect Again', '重新偵測') : text('Detect', '偵測'), () => run('detect', [target]), !canAct, { 'data-action': 'detect', 'data-target': id }));
    if (helper && wanted && !installed) controls.append(button(text('Install', '安裝'), () => run('install', [target]), !canAct || !helper.supportsApply, { 'data-action': 'install', 'data-target': id }));
    if (helper && wanted && installed) {
      if (helper.supportsUpgrade) more.append(button(text('Upgrade', '更新'), () => run('upgrade', [target]), !canAct));
      if (helper.supportsForce) more.append(button(text('Repair', '修復'), () => run('repair', [target]), !canAct));
      if (helper.supportsUninstall) more.append(button(text('Uninstall…', '解除安裝…'), () => run('preview_uninstall', [target]), !canAct));
    }
    const docsUrl = target.install?.auth?.docsUrl || target.install?.install?.docsUrl;
    if (wanted && docsUrl && /^https?:\/\//.test(docsUrl)) controls.append(el('a', { href: docsUrl, target: '_blank', rel: 'noopener noreferrer' }, text('Install / sign-in guide', '安裝／登入說明')));
    if (wanted && !helper && !docsUrl) more.append(el('small', {}, isService
      ? text('Configure the service, then test its connection.', '請先設定服務，再測試連線。')
      : text('Install this provider in its configured environment, then detect again.', '請在設定的執行環境中安裝，再重新偵測。')));
    if (selected && target.install?.auth?.hint && installed) more.append(el('small', {}, target.install.auth.hint));
    if (selected && outcome) {
      const remaining = [...outcome.warnings, ...outcome.manualSteps];
      more.append(el('p', { class: failed ? 'pm-warn' : 'pm-intro' }, outcome.summary));
      if (remaining.length) more.append(el('ul', {}, remaining.map((value) => el('li', {}, value))));
    }
    const extra = (wanted || target.custom) && more.childNodes.length > 1 ? more : null;
    if (extra && context === 'settings') details.append(extra);
    return el('div', { class: context === 'onboarding' ? 'pm-card cli-card' : 'pm-row', 'data-provider': target.provider, 'data-target': id },
      details, controls, context === 'onboarding' ? extra : null);
  }

  function prerequisite(suffix) {
    return snapshot.prerequisites?.find((entry) => entry.helperId === `${snapshot.platform}-${suffix}`);
  }
  function prerequisiteHelper(suffix) {
    return snapshot.helpers.find((entry) => entry.id === `${snapshot.platform}-${suffix}` && entry.available && entry.supported);
  }
  function runPrerequisite(suffix, mode) {
    void perform(mode === 'check' ? text('Checking…', '偵測中…') : text('Setting up…', '準備中…'), async () => {
      async function execute(name, helperMode) {
        const result = await bridge.runSetupHelper(`${snapshot.platform}-${name}`, helperMode);
        const action = result.state?.lastAction;
        if (!action || action.runState === 'failed' || action.status === 'failed') {
          throw new Error(action?.summary || text('Could not finish setup. Try again.', '無法完成設定，請重試。'));
        }
        return action;
      }
      async function prepare(name) {
        const applied = await execute(name, 'apply');
        const verified = await execute(name, 'check');
        if (verified.status !== 'ready') throw new Error([verified.summary, ...(applied.manualSteps || []), ...(verified.manualSteps || [])].join(' '));
        return verified;
      }
      const result = mode === 'apply' ? await prepare(suffix) : await execute(suffix, mode);
      if (suffix === 'node-host-installer' && result.status === 'ready') {
        // Node/npm and the location where their tools are installed are one
        // consumer-facing preparation action. Both helpers remain allowlisted.
        const prefix = await execute('npm-prefix-helper', 'check');
        if (mode === 'apply' && prefix.status !== 'ready') await prepare('npm-prefix-helper');
      }
      feedback(mode === 'check' ? text('Check finished.', '偵測完成。') : text('Setup finished.', '準備完成。'));
      return bridge.getProviderSetup(context);
    });
  }
  function prerequisiteCard() {
    const node = prerequisite('node-host-installer');
    const npm = prerequisite('npm-prefix-helper');
    const github = prerequisite('github-cli-installer');
    const nodeReady = node?.result?.status === 'ready' && node.result.runState !== 'failed';
    const prefixReady = npm?.result?.status === 'ready' && npm.result.runState !== 'failed';
    const checking = node?.checking || npm?.checking;
    const failed = [node, npm].some((entry) => entry?.result?.runState === 'failed' || entry?.result?.status === 'failed');
    const status = checking ? text('Checking…', '偵測中…') : failed ? text('Check needs attention', '偵測需要處理')
      : !node?.result ? text('Not checked yet', '尚未偵測') : !nodeReady ? text('Not installed', '尚未安裝')
        : !npm?.result ? text('Checking setup…', '正在確認設定…')
          : prefixReady ? text('Installed', '已安裝') : text('Finish setup', '尚待設定');
    const controls = el('div', { class: 'pm-actions' });
    const helper = prerequisiteHelper(!nodeReady ? 'node-host-installer' : 'npm-prefix-helper');
    const unavailable = busy || checking || Boolean(confirmation) || !bridge.runSetupHelper;
    if (node?.result && (!nodeReady || (npm?.result && !prefixReady))) {
      controls.append(button(!nodeReady ? text('Install', '安裝') : text('Finish setup', '完成設定'),
        () => runPrerequisite(!nodeReady ? 'node-host-installer' : 'npm-prefix-helper', 'apply'),
        unavailable || !helper?.supportsApply, { 'data-action': 'prepare-node' }));
    }
    controls.append(button(text('Detect', '偵測'), () => runPrerequisite('node-host-installer', 'check'),
      unavailable || !prerequisiteHelper('node-host-installer'), { 'data-action': 'check-node' }));
    const more = el('details', { class: 'pm-more', 'data-details': 'prerequisites' },
      el('summary', {}, text('Details', '詳細資訊')),
      el('small', {}, text('Needed by the tools in this group. Cats checks your computer; nothing is installed automatically.', '這一類工具需要 Node.js／npm。Cats 會先檢查，不會自動安裝。')));
    for (const [entry, label] of [[node, 'Node.js / npm'], [npm, text('Tool installation location', '工具安裝位置')], [github, 'GitHub CLI']]) {
      if (!entry) continue;
      more.append(el('small', {}, `${label}: ${entry.checking ? text('Checking…', '偵測中…') : entry.result?.status === 'ready'
        ? text('Ready', '已就緒') : entry.result?.runState === 'failed' ? text('Check failed', '偵測失敗') : entry.result ? text('Needs setup', '尚待設定') : text('Not checked', '尚未偵測')}`));
      if (entry.result && entry.result.status !== 'ready') more.append(el('small', {}, entry.result.summary));
    }
    if (github && !github.checking && github.result?.status !== 'ready') {
      more.append(button(text('Set up GitHub CLI', '安裝 GitHub CLI'), () => runPrerequisite('github-cli-installer', 'apply'),
        unavailable || !prerequisiteHelper('github-cli-installer')?.supportsApply));
    }
    more.append(button(text('Check GitHub CLI', '偵測 GitHub CLI'), () => runPrerequisite('github-cli-installer', 'check'),
      unavailable || github?.checking || !prerequisiteHelper('github-cli-installer')));
    return el('div', { class: context === 'onboarding' ? 'pm-card cli-card pm-prerequisite' : 'pm-row pm-prerequisite', 'data-prerequisite': 'node' },
      el('div', { class: 'pm-detail' }, el('strong', { class: 'pm-name' }, 'Node.js / npm'),
        el('div', { class: `pm-status ${nodeReady && prefixReady ? 'pm-ok' : ''}` }, checking ? spinner() : null, status)), controls, more);
  }
  function render() {
    if (destroyed) return;
    const scrollTop = root.querySelector('.pm-list')?.scrollTop || 0;
    const opened = new Set([...root.querySelectorAll('details[open][data-details]')].map((node) => node.getAttribute('data-details')));
    const focus = doc.activeElement?.getAttribute('data-focus');
    const cursor = doc.activeElement?.selectionStart;
    root.classList.add('catsProviderManager');
    root.classList.toggle('pm-onboarding', context === 'onboarding');
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
      .catsProviderManager .pm-more{max-width:100%;overflow-wrap:anywhere}.catsProviderManager .pm-row.pm-prerequisite{flex-wrap:wrap}.catsProviderManager .pm-row.pm-prerequisite>.pm-more{flex-basis:100%}
      .catsProviderManager.pm-onboarding{max-width:720px;text-align:center;width:100%}
      .catsProviderManager.pm-onboarding h2{font-size:1.1rem;font-weight:500}.catsProviderManager.pm-onboarding .pm-intro{font-size:.87rem}
      .catsProviderManager.pm-onboarding .pm-list{max-height:none;overflow:visible;padding:0}
      .catsProviderManager .pm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;text-align:center}
      .catsProviderManager .pm-card{background:var(--panel,#fff);border:1px solid var(--pm-border);border-radius:12px;padding:14px 10px 12px;display:flex;flex-direction:column;align-items:stretch;gap:8px;min-width:0;box-shadow:0 1px 3px rgba(0,0,0,.04)}
      .catsProviderManager .pm-card .pm-name{justify-content:center;gap:7px;font-size:.92rem;line-height:1.4;min-height:24px}
      .catsProviderManager .pm-card input[type=checkbox]{width:16px;height:16px}.catsProviderManager .pm-card .pm-status{justify-content:center;font-size:.74rem;margin:8px 0 0;min-height:20px}
      .catsProviderManager .pm-card .pm-actions{flex-direction:column;align-items:stretch;max-width:none;gap:6px}
      .catsProviderManager .pm-card button{font-size:.78rem;border-radius:8px;padding:6px 8px;width:100%}
      .catsProviderManager .pm-card .pm-more{margin-top:auto}.catsProviderManager .pm-card .pm-more[open]{text-align:left}
      .catsProviderManager .pm-card .pm-more small{font-size:.76rem}.catsProviderManager .pm-card .pm-more summary{text-align:center;font-size:.74rem;padding:0}
      .catsProviderManager .pm-group{grid-column:1/-1;text-align:left;color:var(--pm-muted);font-size:.78rem;font-weight:500;padding:10px 0 0;border-top:1px solid var(--pm-border)}
      .catsProviderManager.pm-onboarding .pm-footer{position:static;justify-content:center;border:0;background:transparent;margin:14px 0 22px;padding:0;gap:10px}
      .catsProviderManager.pm-onboarding .pm-continue{margin-left:0}.catsProviderManager.pm-onboarding button.pm-primary{background:var(--panel,#fff);border-color:var(--pm-border);color:inherit}
      .catsProviderManager.pm-onboarding .pm-progress{justify-content:center}.catsProviderManager.pm-onboarding .pm-discard{font-size:.78rem}
      .catsProviderManager [role=alert]{color:#b2342c;overflow-wrap:anywhere}.catsProviderManager li{margin-left:20px;font-size:.83rem;overflow-wrap:anywhere}
      @media(max-width:580px){.catsProviderManager .pm-row{flex-direction:column}.catsProviderManager .pm-actions{max-width:none;justify-content:flex-start}.catsProviderManager .pm-footer{gap:8px}.catsProviderManager .pm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(prefers-reduced-motion:reduce){.catsProviderManager .pm-spinner{animation-duration:2s}}
    `);
    const heading = el('h2', {}, context === 'onboarding' ? text('Choose your AI tools', '選擇你的 AI 工具') : text('AI tools', 'AI 工具'));
    const intro = el('p', { class: 'pm-intro' }, text('Choose what you want to use. Cats can help you install it. You can change this later in Settings.', '勾選想使用的工具，Cats 可以協助安裝。之後也能在設定中調整。'));
    const content = [style, heading, intro];
    if (error) content.push(el('div', { role: 'alert' }, error, ' ', button(text('Refresh', '重新讀取'), () => { signature = ''; void refresh(); }, busy)));
    if (!snapshot) {
      content.push(el('div', { class: 'pm-progress', role: 'status' }, spinner(), text('Loading tools…', '正在載入工具…')));
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
    if (busy || operationBusy) content.push(el('div', { class: 'pm-progress', role: 'status', 'aria-live': 'polite' }, spinner(), stage || text('Checking your tools…', '正在檢查工具…')));
    if (notice && !busy && !operationBusy) content.push(el('p', { role: 'status' }, notice));
    if (context === 'settings') content.push(el('input', { type: 'search', value: filter, placeholder: text('Find a tool', '尋找工具'), 'data-focus': 'search',
      'aria-label': text('Find a tool', '尋找工具'), oninput: (event) => { filter = event.target.value; render(); } }));
    const catalog = snapshot.runtime.universe.slice();
    for (const target of selection.targets) if (!catalog.some((entry) => key(entry) === key(target))) catalog.push({ ...target, familyLabel: `${target.provider} · ${target.instance}`, custom: true });
    const list = el('div', { class: 'pm-list' });
    if (context === 'onboarding') {
      const nativeOrder = ['claude', 'antigravity', 'cursor', 'kiro', 'junie', 'goose', 'grok', 'devin', 'muse', 'ollama'];
      const npmOrder = ['codex', 'copilot', 'opencode', 'kilo', 'auggie', 'pi', 'cline'];
      const primary = ['claude', 'antigravity', 'codex'];
      const show = (target) => expanded || primary.includes(target.provider) || draft.has(key(target));
      const grid = el('div', { class: 'pm-grid cli-grid' });
      for (const id of nativeOrder) for (const target of catalog.filter((entry) => !entry.custom && entry.provider === id && show(entry))) grid.append(row(target, selection, operationBusy));
      if (expanded) grid.append(el('div', { class: 'pm-group', 'data-group': 'npm' }, text('Tools that use Node.js / npm', '使用 Node.js／npm 的工具')));
      grid.append(prerequisiteCard());
      for (const id of npmOrder) for (const target of catalog.filter((entry) => !entry.custom && entry.provider === id && show(entry))) grid.append(row(target, selection, operationBusy));
      const others = catalog.filter((entry) => (entry.custom || (!nativeOrder.includes(entry.provider) && !npmOrder.includes(entry.provider))) && show(entry));
      if (others.length) grid.append(el('div', { class: 'pm-group', 'data-group': 'connections' }, text('Other connections', '其他連線')),
        ...others.map((target) => row(target, selection, operationBusy)));
      list.append(grid);
    } else {
      if (!filter) list.append(prerequisiteCard());
      list.append(...catalog.filter((target) => `${target.familyLabel} ${target.provider}`.toLowerCase().includes(filter.toLowerCase())).map((target) => row(target, selection, operationBusy)));
    }
    content.push(list);
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
    if (context === 'onboarding') {
      footer.append(button(expanded ? text('Show fewer', '顯示較少') : text('Show more', '顯示更多'), () => { expanded = !expanded; render(); }, false, { 'data-action': 'show-more' }));
      content.splice(content.indexOf(list), 0, footer);
    } else content.push(footer);
    if (!invalid && !dirty) {
      content.push(el('p', { class: 'pm-intro' }, selection.targets.length === 0
        ? text('You can choose your tools later in Settings.', '你可以稍後再到設定中選擇工具。')
        : text(`${selection.targets.length} tools selected. You can continue and finish installing later.`, `已選擇 ${selection.targets.length} 項工具。可以先繼續，稍後再完成安裝。`)));
    }
    root.replaceChildren(...content);
    for (const node of root.querySelectorAll('details[data-details]')) node.open = opened.has(node.getAttribute('data-details'));
    if (list) list.scrollTop = scrollTop;
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

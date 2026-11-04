/** The first-run wizard's tokens and rules (SPEC-136), scoped so they cannot touch the page around it. */
export const SETUP_WIZARD_CSS = `
.cats-setup { --paper: #FAFAF7; --panel: #FFFFFF; --rail: #EDE9E1; --line: #E4DFD7; --line-strong: #CFC8BC;
  --ink: #1A1A1A; --muted: #6B6560; --accent: #C4653A; --accent-strong: #A84724; --accent-soft: #FBF1EB;
  --ok: #207A53; --ok-soft: rgba(61, 167, 121, 0.11); --warn: #8D6830; --warn-soft: rgba(191, 146, 73, 0.12);
  --danger: #B5342A; --danger-soft: #FBF0ED;

  --log: #1B2233; --log-line: #2F3950; --log-text: #DCE2EC; --log-soft: #9DA8BC;
  --mono: 'Cascadia Code', 'Cascadia Mono', Consolas, ui-monospace, monospace;
  position: fixed; inset: 0; z-index: 1; overflow: hidden; text-align: left; background: var(--paper); color: var(--ink);
  font: 14px/1.5 'Aptos', 'Segoe UI', 'Microsoft JhengHei', 'PingFang TC', system-ui, sans-serif;
  font-synthesis: none; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  container: cats-setup / size; }
.cats-setup *, .cats-setup *::before, .cats-setup *::after { box-sizing: border-box; }
.cats-setup :focus-visible { outline: 2px solid var(--accent-strong); outline-offset: 1px; }
.cats-setup h1 { margin: 0; font-size: 24px; line-height: 1.25; font-weight: 600; letter-spacing: -0.02em; }
.cats-setup h1:focus { outline: none; }
.cats-setup h2 { margin: 0; font-size: 14px; font-weight: 600; }
.cats-setup p { margin: 0; }
.cats-setup a { color: var(--accent-strong); text-underline-offset: 2px; }
.cats-setup [hidden], .cats-setup .hidden { display: none !important; }
.cats-setup .error-area { align-items: stretch; gap: 6px; margin-top: 12px; }
.cats-setup #splash-summary .dot { margin-right: 6px; vertical-align: 1px; }
.cats-setup .btn { padding: 7px 14px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--panel); color: var(--ink); font: inherit; font-weight: 500; cursor: pointer; white-space: nowrap; }
.cats-setup .btn:hover:not(:disabled) { background: #F4F1EA; border-color: #B9B1A3; }
.cats-setup .btn:disabled { opacity: 0.5; cursor: default; }
.cats-setup .btn.primary { background: var(--accent-strong); border-color: var(--accent-strong); color: #fff; font-weight: 600; }
.cats-setup .btn.primary:hover:not(:disabled) { background: #923C1D; border-color: #923C1D; }
.cats-setup .btn.small { padding: 3px 10px; font-size: 13px; border-radius: 7px; }
.cats-setup .more { padding: 0 2px; border: 0; background: transparent; color: var(--accent-strong); font: inherit; font-size: 12.5px; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.cats-setup .input { width: 100%; padding: 7px 10px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--panel); color: var(--ink); font: inherit; }
.cats-setup .input[aria-invalid="true"] { border-color: var(--danger); }
.cats-setup select.input { padding: 6px 8px; }
.cats-setup .mono { font-family: var(--mono); }
.cats-setup .cmd { font: 12px/1.5 var(--mono); background: #F1EEE6; padding: 1px 6px; border-radius: 4px; overflow-wrap: anywhere; }
.cats-setup .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--line-strong); border-top-color: var(--accent-strong); border-radius: 50%; animation: cats-setup-spin 0.9s linear infinite; }
@keyframes cats-setup-spin { to { transform: rotate(360deg); } }
.cats-setup .wz { height: 100%; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
.cats-setup .wz-frame { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: 0; }
@container cats-setup (max-width: 1000px) {
.cats-setup .wz-frame { grid-template-columns: 186px minmax(0, 1fr); }
}
.cats-setup .rail { position: relative; display: flex; flex-direction: column; min-height: 0; padding: 16px 10px 0; background: var(--rail); border-right: 1px solid var(--line); }
.cats-setup .brand { padding: 0 8px 12px; font-size: 15px; font-weight: 650; line-height: 1.3; }
.cats-setup .brand small { display: block; font-size: 12px; font-weight: 400; color: var(--muted); }
.cats-setup .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.cats-setup .step { width: 100%; display: flex; gap: 9px; padding: 8px; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.cats-setup .step:disabled { cursor: default; }
.cats-setup .step:hover:not(:disabled):not([aria-current]) { background: rgba(0, 0, 0, 0.05); }
.cats-setup .step[aria-current='step'] { background: var(--panel); box-shadow: inset 3px 0 0 var(--accent); }
.cats-setup .step-n { flex: none; width: 21px; height: 21px; margin-top: 1px; display: grid; place-items: center; border: 1px solid var(--muted); border-radius: 50%; color: var(--muted); font-size: 11.5px; }
.cats-setup .step-n svg { width: 12px; height: 12px; }
.cats-setup .step[aria-current='step'] .step-n { background: var(--accent-strong); border-color: var(--accent-strong); color: #fff; font-weight: 600; }
.cats-setup .step.done .step-n { border-color: var(--ok); }
.cats-setup .step.skipped .step-n { border-style: dashed; }
.cats-setup .step-t { font-size: 13.5px; font-weight: 600; line-height: 1.3; }
.cats-setup .step.future .step-t { font-weight: 400; color: var(--muted); }
.cats-setup .step-t small { display: block; margin-top: 1px; font-size: 11.5px; font-weight: 400; color: var(--muted); }
.cats-setup .steps li.gap { margin-top: 10px; }
.cats-setup .perch { position: absolute; left: 10px; right: 8px; bottom: 0; display: flex; align-items: flex-end; gap: 4px; pointer-events: none; }
.cats-setup .cat { position: relative; flex: none; width: 70px; height: 46px; overflow: hidden; }
.cats-setup .cat svg { position: absolute; left: 0; top: -9px; width: 70px; height: 70px; display: block; }
.cats-setup .perch.busy .cat svg { animation: cats-setup-bob 0.9s ease-in-out infinite; }
@keyframes cats-setup-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.cats-setup .cat-note { flex: 1; min-width: 0; margin-bottom: 8px; padding: 3px 7px; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; line-height: 1.25; }
.cats-setup .cat-note strong { display: block; font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cats-setup .cat-note span { display: block; font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cats-setup .main { display: grid; grid-template-rows: minmax(0, 1fr) auto; min-width: 0; min-height: 0; }
.cats-setup .pane { overflow-y: auto; padding: 22px 32px 18px; scrollbar-gutter: stable; }
.cats-setup .pane > * { max-width: 780px; }
.cats-setup .head { display: flex; align-items: flex-start; gap: 16px; }
.cats-setup .head h1 { flex: 1; min-width: 0; }
.cats-setup .lang { flex: none; width: auto; padding: 3px 6px; font-size: 12.5px; }
.cats-setup .lead { margin: 4px 0 14px !important; color: var(--muted); max-width: 66ch; }
.cats-setup .foot { display: flex; align-items: center; gap: 8px; min-height: 56px; padding: 10px 32px; background: var(--paper); border-top: 1px solid var(--line); }
.cats-setup .foot .hint { flex: 1; min-width: 0; color: var(--muted); font-size: 13px; line-height: 1.35; }
.cats-setup .alert { display: flex; gap: 12px; align-items: flex-start; margin: 0 0 12px; padding: 10px 12px; background: var(--danger-soft); border: 1px solid #EFCFC8; border-radius: 8px; }
.cats-setup .alert.warn { background: var(--warn-soft); border-color: #E6D8BC; }
.cats-setup .alert-text { flex: 1; min-width: 0; font-size: 13.5px; }
.cats-setup .alert-text strong { display: block; font-weight: 600; color: var(--danger); }
.cats-setup .alert.warn .alert-text strong { color: var(--warn); }
.cats-setup .alert-actions { display: flex; gap: 6px; flex: none; align-items: center; }
.cats-setup .group-label { margin: 0 0 6px !important; font-size: 13.5px; font-weight: 600; }
.cats-setup .block { margin-top: 16px; }
.cats-setup .label-line { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.cats-setup .lead + .block, .cats-setup .alert + .block, .cats-setup .tick-line + .block, .cats-setup .stored + .block { margin-top: 0; }
.cats-setup .picks { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.cats-setup .pick { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 8px; align-content: start; padding: 9px 10px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
.cats-setup .pick:hover { border-color: var(--accent); }
.cats-setup .pick input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--accent-strong); }
.cats-setup .pick strong { font-size: 13.5px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
.cats-setup .pick small { grid-column: 2; margin-top: 1px; font-size: 12px; line-height: 1.3; color: var(--muted); }
.cats-setup .pick:has(input:checked) { background: var(--accent-soft); border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.cats-setup .pick:has(input:focus-visible) { outline: 2px solid var(--accent-strong); outline-offset: 1px; }
.cats-setup .pick:has(input:disabled) { cursor: default; opacity: 0.6; }
.cats-setup .pick-more { display: grid; place-items: center; min-height: 58px; padding: 6px; border: 1px dashed var(--line-strong); border-radius: 8px; background: transparent; color: var(--accent-strong); font: inherit; font-size: 13px; cursor: pointer; }
.cats-setup .pick-more:hover { border-color: var(--accent); background: var(--accent-soft); }
.cats-setup .pick-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }
.cats-setup .pick-pair .picks { grid-template-columns: minmax(0, 1fr); }
.cats-setup .skeleton { height: 58px; border-radius: 8px; background: linear-gradient(90deg, #F1EEE7 25%, #F7F5EF 50%, #F1EEE7 75%); background-size: 200% 100%; animation: cats-setup-shimmer 1.4s linear infinite; }
@keyframes cats-setup-shimmer { to { background-position: -200% 0; } }
.cats-setup .rows { margin: 0; padding: 0; list-style: none; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }
.cats-setup .rows > li:first-child { border-top: 0; border-top-left-radius: 10px; border-top-right-radius: 10px; }
.cats-setup .rows > li:last-child { border-bottom-left-radius: 10px; border-bottom-right-radius: 10px; }
.cats-setup .row { position: relative; padding: 10px 14px; border-top: 1px solid var(--line); }
.cats-setup .row-top { display: flex; align-items: flex-start; gap: 10px; }
.cats-setup .row-top label { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
.cats-setup .row input[type='checkbox'], .cats-setup .row input[type='radio'] { flex: none; width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--accent-strong); }
.cats-setup .glyph { flex: none; width: 16px; height: 16px; margin-top: 2px; display: grid; place-items: center; }
.cats-setup .glyph svg { width: 16px; height: 16px; }
.cats-setup .row-text { flex: 1; min-width: 0; display: block; }
.cats-setup .row-text strong { font-weight: 600; }
.cats-setup .row-text em { margin-left: 4px; color: var(--muted); font-style: normal; font-weight: 400; font-size: 12.5px; }
.cats-setup .row-text > span.p, .cats-setup .row-text > p { display: block; margin: 1px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.cats-setup .row-state { flex: none; color: var(--muted); font-size: 12.5px; text-align: right; white-space: nowrap; }
.cats-setup .row-state.ok { color: var(--ok); }
.cats-setup .row-state.attn { color: var(--warn); font-weight: 600; }
.cats-setup .row-state.bad { color: var(--danger); font-weight: 600; }
.cats-setup .version { margin-left: 6px; font: 11.5px var(--mono); color: var(--muted); }
.cats-setup .row.is-waiting strong { font-weight: 400; color: var(--muted); }
.cats-setup .row.is-failed { background: var(--danger-soft); }
.cats-setup .row.is-disabled { background: #FBFAF7; }
.cats-setup .row.is-disabled strong { font-weight: 400; color: var(--muted); }
.cats-setup .row-extra { margin: 7px 0 0 26px; }
.cats-setup .row-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 7px 0 0 26px; }
.cats-setup .row-actions .hint-inline { font-size: 12.5px; color: var(--muted); }
.cats-setup .row-actions .hint-inline.bad { color: var(--danger); }
.cats-setup .row-shortcut { padding: 6px 14px 6px 40px; }
.cats-setup .row.dep { padding-left: 44px; }
.cats-setup .row.dep::before { content: ''; position: absolute; left: 21px; top: -1px; bottom: 0; border-left: 2px dashed var(--line-strong); }
.cats-setup .row.dep::after { content: ''; position: absolute; left: 21px; top: 20px; width: 15px; border-top: 2px dashed var(--line-strong); }
.cats-setup .row.dep.last::before { bottom: auto; height: 22px; }
.cats-setup .row.dep-root::before { content: ''; position: absolute; left: 21px; top: 30px; bottom: 0; border-left: 2px dashed var(--line-strong); }
.cats-setup .rows.unlocked .row.dep::before, .cats-setup .rows.unlocked .row.dep::after, .cats-setup .rows.unlocked .row.dep-root::before { border-style: solid; border-color: #9CCDB6; }
.cats-setup .tags { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 7px 0 0 26px; }
.cats-setup .tag { padding: 0 8px; background: rgba(122, 116, 108, 0.11); border-radius: 10px; font-size: 12px; line-height: 1.65; white-space: nowrap; }
.cats-setup .tag.danger { background: #FBE9E5; color: var(--danger); box-shadow: inset 0 0 0 1px #EFC3BA; }
.cats-setup .tag.need { background: var(--accent-soft); color: var(--accent-strong); }
.cats-setup .details { margin: 8px 0 2px 26px; padding: 10px 12px; background: var(--paper); border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
.cats-setup .row.is-failed .details { background: var(--panel); }
.cats-setup .details dl { display: grid; grid-template-columns: 68px minmax(0, 1fr); gap: 5px 10px; margin: 0; }
.cats-setup .details dt { color: var(--muted); }
.cats-setup .details dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.cats-setup .details dd div + div { margin-top: 2px; }
.cats-setup .with-copy { display: flex; align-items: flex-start; gap: 8px; }
.cats-setup .with-copy .cmd { flex: 0 1 auto; }
.cats-setup .stages { display: flex; flex-wrap: wrap; align-items: center; margin: 7px 0 0 26px; font-size: 12.5px; color: var(--muted); }
.cats-setup .stage { display: inline-flex; align-items: center; gap: 5px; }
.cats-setup .stage i { width: 10px; height: 10px; border: 1.5px solid var(--line-strong); border-radius: 50%; }
.cats-setup .stage + .stage::before { content: ''; width: 20px; height: 2px; margin: 0 6px; background: var(--line-strong); }
.cats-setup .stage.done { color: var(--ok); }
.cats-setup .stage.done i { background: var(--ok); border-color: var(--ok); }
.cats-setup .stage.done + .stage::before { background: #9CCDB6; }
.cats-setup .stage.now { color: var(--warn); font-weight: 600; }
.cats-setup .stage.now i { border: 3px solid var(--warn); }
.cats-setup .stage.bad { color: var(--danger); font-weight: 600; }
.cats-setup .stage.bad i { border: 3px solid var(--danger); }
.cats-setup .addr { display: flex; gap: 8px; align-items: center; margin: 8px 0 0 26px; }
.cats-setup .addr .input { max-width: 340px; font-family: var(--mono); font-size: 12.5px; }
.cats-setup .addr-error { margin: 4px 0 0 26px !important; font-size: 12.5px; color: var(--danger); }
.cats-setup .bar { height: 6px; margin: 7px 0 0 26px; max-width: 420px; background: #EAE6DE; border-radius: 3px; overflow: hidden; }
.cats-setup .bar i { display: block; height: 100%; background: var(--accent-strong); transition: width 0.25s linear; }
.cats-setup .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 0 26px; }
.cats-setup .chip { padding: 1px 9px; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--panel); color: inherit; font: 12px var(--mono); cursor: pointer; }
.cats-setup .chip:hover { border-color: var(--accent); }
.cats-setup .chip[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); }
.cats-setup .footnote { margin-top: 10px !important; color: var(--muted); font-size: 13px; }
.cats-setup .log { background: var(--log); color: var(--log-text); font-size: 12.5px; }
.cats-setup .log-bar { display: flex; align-items: center; height: 34px; padding: 0 10px 0 6px; }
.cats-setup .log-toggle { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; height: 100%; padding: 0 6px; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.cats-setup .log-toggle .chev { width: 12px; height: 12px; flex: none; transition: transform 0.15s; }
.cats-setup .log.open .log-toggle .chev { transform: rotate(90deg); }
.cats-setup .log-label { flex: none; font-weight: 600; }
.cats-setup .log-last { flex: 1; min-width: 0; color: var(--log-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cats-setup .log-time { flex: none; font-family: var(--mono); color: var(--log-soft); }
.cats-setup .log-copy { flex: none; padding: 1px 9px; border: 1px solid var(--log-line); border-radius: 6px; background: transparent; color: var(--log-text); font: inherit; font-size: 12px; cursor: pointer; }
.cats-setup .log-panel { height: 0; overflow: hidden; transition: height 0.2s ease; }
.cats-setup .log.open .log-panel { height: clamp(120px, 30cqh, 260px); }
.cats-setup .solo .log.open .log-panel { height: clamp(96px, 20cqh, 170px); }
.cats-setup .log-scroll { height: 100%; overflow-y: auto; padding: 0 14px 12px; font: 12px/1.55 var(--mono); }
.cats-setup .log-empty { padding: 4px 0; color: var(--log-soft); font-family: 'Aptos', 'Segoe UI', 'Microsoft JhengHei', sans-serif; }
.cats-setup .log-run { padding: 6px 0; border-top: 1px solid var(--log-line); }
.cats-setup .log-run:first-child { border-top: 0; }
.cats-setup .log-head { display: flex; gap: 8px; color: var(--log-soft); }
.cats-setup .log-kind.check { color: #9CC2EE; }
.cats-setup .log-kind.change { color: #F2B98A; }
.cats-setup .log-kind.terminal { color: #CDBDF4; }
.cats-setup .log-kind.fail { color: #FF9F90; }
.cats-setup .log-cmd { overflow-wrap: anywhere; }
.cats-setup .log-fact { color: var(--log-soft); overflow-wrap: anywhere; }
.cats-setup .log-fact.fail { color: #FF9F90; }
.cats-setup .log :focus-visible { outline-color: #F2B98A; }
.cats-setup .form { max-width: 460px !important; display: grid; gap: 12px; }
.cats-setup .field { display: grid; gap: 3px; }
.cats-setup .field > label, .cats-setup .field > span.label { font-weight: 600; font-size: 13.5px; }
.cats-setup .field small { color: var(--muted); font-size: 12.5px; }
.cats-setup .field small.bad { color: var(--danger); }
.cats-setup .pw { position: relative; }
.cats-setup .pw .input { padding-right: 60px; }
.cats-setup .pw button { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); }
.cats-setup .seg { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.cats-setup .seg label { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
.cats-setup .seg input { margin: 3px 0 0; accent-color: var(--accent-strong); }
.cats-setup .seg label:has(input:checked) { background: var(--accent-soft); border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.cats-setup .seg label:has(input:disabled) { opacity: 0.6; cursor: default; }
.cats-setup .seg strong { display: block; font-weight: 600; font-size: 13.5px; }
.cats-setup .seg small { display: block; color: var(--muted); font-size: 12px; line-height: 1.3; }
.cats-setup .fields-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
.cats-setup .summary { margin-top: 12px; padding: 10px 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }
.cats-setup .summary ul { margin: 4px 0 6px; padding-left: 18px; }
.cats-setup .summary li + li { margin-top: 1px; }
.cats-setup .summary .tail { color: var(--muted); font-size: 13px; }
.cats-setup .choice-group { display: grid; gap: 6px; margin-bottom: 10px; }
.cats-setup .diag-back { display: block; margin-bottom: 6px; font-size: 13px; }
.cats-setup .diag-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.cats-setup .diag-label { margin-top: 18px; }
.cats-setup .diag-section { border-top: 1px solid var(--line); }
.cats-setup .diag-section:last-child { border-bottom: 1px solid var(--line); }
.cats-setup .diag-toggle { width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 2px; border: 0; background: transparent; color: inherit; font: inherit; font-weight: 600; text-align: left; cursor: pointer; }
.cats-setup .diag-toggle:hover { color: var(--accent-strong); }
.cats-setup .diag-toggle .chev { width: 12px; height: 12px; flex: none; transition: transform 0.15s; }
.cats-setup .diag-toggle[aria-expanded='true'] .chev { transform: rotate(90deg); }
.cats-setup .diag-body { padding: 0 0 12px; }
.cats-setup .diag-card { padding: 10px 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
.cats-setup .diag-card + .diag-card { margin-top: 8px; }
.cats-setup .diag-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-weight: 600; }
.cats-setup .diag-head > :last-child { flex: none; font-weight: 500; font-size: 12.5px; }
.cats-setup .diag-attempt { font: 11.5px var(--mono); color: var(--muted); overflow-wrap: anywhere; }
.cats-setup .diag-code { display: block; margin-top: 3px; font: 12px/1.5 var(--mono); color: var(--ink); overflow-wrap: anywhere; }
.cats-setup .diag-small { margin-top: 3px; font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
.cats-setup .diag-small strong { color: var(--ink); font-weight: 600; }
.cats-setup .diag-ok { color: var(--ok); }
.cats-setup .diag-warn { color: var(--warn); }
.cats-setup .diag-bad { color: var(--danger); }
.cats-setup .diag-dl { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 3px 10px; margin: 6px 0 0; }
.cats-setup .diag-dl dt { color: var(--muted); }
.cats-setup .diag-dl dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.cats-setup .diag-service { display: flex; gap: 10px; }
.cats-setup .diag-service + .diag-service { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
.cats-setup .diag-grow { flex: 1; min-width: 0; }
.cats-setup .diag-event { padding: 7px 0; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
.cats-setup .diag-event:first-of-type { margin-top: 6px; }
.cats-setup .diag-event:last-child { padding-bottom: 0; }
.cats-setup .diag-meta { display: flex; flex-wrap: wrap; gap: 2px 10px; margin-top: 1px; font-size: 12px; color: var(--muted); }
.cats-setup .diag-after { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
.cats-setup .alert-actions .more { white-space: nowrap; }
.cats-setup .solo { height: 100%; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
.cats-setup .solo-body { overflow-y: auto; display: grid; align-items: safe center; justify-items: center; padding: 24px; }
.cats-setup .solo-card { width: min(500px, 100%); }
.cats-setup .solo-card.wide { width: min(620px, 100%); }
.cats-setup .solo-cat { width: 84px; height: 84px; margin: 0 0 8px -6px; }
.cats-setup .solo-cat svg { width: 100%; height: 100%; display: block; }
.cats-setup .solo-card .lead { margin: 6px 0 14px !important; }
.cats-setup .solo-list { margin: 0 0 14px; padding-left: 20px; }
.cats-setup .solo-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.cats-setup .wait-hint { margin-top: 12px !important; color: var(--muted); font-size: 13.5px; }
@media (prefers-reduced-motion: reduce) {
.cats-setup *, .cats-setup *::before, .cats-setup *::after { animation-duration: 2.5s !important; transition: none !important; }
.cats-setup .perch.busy .cat svg { animation: none; }
}
@container cats-setup (max-height: 640px) {
.cats-setup .pane { padding: 14px 28px 8px; }
.cats-setup h1 { font-size: 22px; }
.cats-setup .lead { margin: 2px 0 10px !important; }
.cats-setup .pick { padding: 7px 9px; }
.cats-setup .picks { gap: 6px; }
.cats-setup .block, .cats-setup .pick-pair { margin-top: 10px; }
.cats-setup .foot { padding: 8px 28px; min-height: 50px; }
}
`;

/** The app icon's head (assets/app-icon-silhouette.svg) without its tile, so it can peek over the log. */
export const SETUP_CAT_HEAD = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\"> <defs> <clipPath id=\"catHeadClip\"> <path d=\" M 256 420 C 168 420, 96 364, 96 276 C 96 244, 104 214, 118 190 L 100 92 C 98 80, 110 74, 120 80 L 200 128 C 218 122, 236 120, 256 120 C 276 120, 294 122, 312 128 L 392 80 C 402 74, 414 80, 412 92 L 394 190 C 408 214, 416 244, 416 276 C 416 364, 344 420, 256 420 Z\"/> </clipPath> </defs> <path fill=\"#E8923A\" d=\" M 256 420 C 168 420, 96 364, 96 276 C 96 244, 104 214, 118 190 L 100 92 C 98 80, 110 74, 120 80 L 200 128 C 218 122, 236 120, 256 120 C 276 120, 294 122, 312 128 L 392 80 C 402 74, 414 80, 412 92 L 394 190 C 408 214, 416 244, 416 276 C 416 364, 344 420, 256 420 Z\"/> <g clip-path=\"url(#catHeadClip)\" fill=\"#B85C24\"> <path d=\"M 226 132 C 234 160, 236 186, 232 214 C 224 196, 220 168, 214 138 Z\"/> <path d=\"M 256 128 C 262 158, 262 188, 256 218 C 250 188, 250 158, 256 128 Z\"/> <path d=\"M 286 132 C 278 160, 276 186, 280 214 C 288 196, 292 168, 298 138 Z\"/> <path d=\"M 96 248 C 128 244, 150 250, 168 262 C 148 262, 126 262, 96 270 Z\"/> <path d=\"M 100 296 C 130 290, 152 292, 170 302 C 150 304, 128 308, 104 318 Z\"/> <path d=\"M 116 344 C 140 336, 158 336, 176 342 C 158 348, 140 356, 124 366 Z\"/> <path d=\"M 416 248 C 384 244, 362 250, 344 262 C 364 262, 386 262, 416 270 Z\"/> <path d=\"M 412 296 C 382 290, 360 292, 342 302 C 362 304, 384 308, 408 318 Z\"/> <path d=\"M 396 344 C 372 336, 354 336, 336 342 C 354 348, 372 356, 388 366 Z\"/> <path d=\"M 104 84 L 130 100 L 118 160 Z\"/> <path d=\"M 408 84 L 382 100 L 394 160 Z\"/> </g> <path fill=\"#F7C9A3\" d=\"M 136 118 L 190 150 C 176 160, 166 172, 158 186 Z\"/> <path fill=\"#F7C9A3\" d=\"M 376 118 L 322 150 C 336 160, 346 172, 354 186 Z\"/> <path fill=\"#FFF1DC\" d=\"M 256 402 C 200 402, 160 372, 160 330 C 160 300, 190 292, 220 300 C 236 304, 246 312, 256 312 C 266 312, 276 304, 292 300 C 322 292, 352 300, 352 330 C 352 372, 312 402, 256 402 Z\"/> <ellipse cx=\"204\" cy=\"258\" rx=\"18\" ry=\"28\" fill=\"#1B2233\"/> <ellipse cx=\"308\" cy=\"258\" rx=\"18\" ry=\"28\" fill=\"#1B2233\"/> <path fill=\"#E2604A\" d=\"M 236 316 L 276 316 L 256 340 Z\"/> <path d=\"M 256 340 L 256 358 M 256 358 C 244 374, 226 372, 218 360 M 256 358 C 268 374, 286 372, 294 360\" fill=\"none\" stroke=\"#1B2233\" stroke-width=\"8\" stroke-linecap=\"round\"/> <g stroke=\"#FFF1DC\" stroke-width=\"10\" stroke-linecap=\"round\" fill=\"none\"> <path d=\"M 168 328 L 62 306\"/> <path d=\"M 168 350 L 56 352\"/> <path d=\"M 344 328 L 450 306\"/> <path d=\"M 344 350 L 456 352\"/> </g> </svg>";

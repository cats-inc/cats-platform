// Usage: invoked by composer-layout-smoke.mjs, with its private URL/profile/output.
// Uses production renderer components; no Desktop supervisor or provider CLI starts.
const { app, BrowserWindow } = require('electron');
const { writeFile } = require('node:fs/promises');
const path = require('node:path');
app.setPath('userData', process.env.CATS_COMPOSER_FIXTURE_PROFILE);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1078, height: 632, useContentSize: true, show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false } });
  const errors = [];
  let failed = false;
  window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  try {
    await window.loadURL(process.env.CATS_COMPOSER_FIXTURE_URL);
    const checks = await window.webContents.executeJavaScript(`(async () => {
      const wait = async (predicate, label) => {
        const start = performance.now();
        while (!predicate()) {
          if (performance.now() - start > 10000) throw new Error('Timeout: ' + label);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      };
      const assert = (condition, message) => { if (!condition) throw new Error(message); };
      const active = () => document.querySelector('.draftCompareCarouselCardActive') || document.querySelector('.composerAreaStack');
      const input = () => active()?.querySelector('textarea');
      const type = value => {
        const node = input();
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(node, value);
        node.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const hit = (node, label) => {
        const r = node.getBoundingClientRect();
        assert(r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight, label + ': not visible');
        assert(node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)), label + ': obscured');
      };
      const attached = () => {
        const host = active(); const header = host.querySelector('.composerHeaderRow');
        const form = host.querySelector('.composerCard');
        const hr = header.getBoundingClientRect(); const fr = form.getBoundingClientRect();
        assert(Math.abs(fr.top - hr.bottom - 12) <= 1.5, 'Header detached from form: ' + JSON.stringify({ header: hr.toJSON(), form: fr.toJSON() }));
        for (const chip of header.querySelectorAll('.composerCwdChip,.composerPermissionChip,.composerSurfaceChip')) hit(chip, chip.className);
        return { headerTop: hr.top, formTop: fr.top, formBottom: fr.bottom, height: fr.height };
      };
      const menuChecks = async () => {
        const permission = active().querySelector('button.composerPermissionChip');
        if (permission && !permission.disabled) {
          permission.click(); await wait(() => active().querySelector('[role="listbox"]'), 'permission menu');
          hit(active().querySelector('[role="option"]'), 'permission option');
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await wait(() => !active().querySelector('[role="listbox"]'), 'close permission menu');
        }
        active().querySelector('.composerPlusButton').click();
        await wait(() => active().querySelector('.composerPlusMenu'), 'attachment menu');
        const menu = active().querySelector('.composerPlusMenu'); hit(menu, 'attachment menu');
        active().querySelector('.composerPlusButton').click();
        await wait(() => !active().querySelector('.composerPlusMenu'), 'close attachment menu');
      };
      await wait(() => input(), 'initial composer');
      window.__layoutHelpers = { wait, assert, active, input, type, hit, attached, menuChecks };
      const results = [];
      for (const product of ['chat', 'code', 'work']) for (const preset of ['default', 'group', 'parallel']) for (const started of [false, true]) {
        window.__composerFixture.select({ product, preset, started, direct: false });
        await wait(() => input() && input().value === '' && window.__composerFixture.scenario.product === product, 'scenario');
        if (started) {
          assert(document.querySelector('.composerAreaStackDocked'), 'Started fixture must use the docked composer');
          assert(document.querySelectorAll('.transcriptMessage').length >= 50, 'Started fixture must render its existing transcript');
        }
        const baseline = attached();
        const emptyInputHeight = input().getBoundingClientRect().height;
        type('Long fixture prompt, never sent to a provider.\\n'.repeat(20));
        await wait(() => input().getBoundingClientRect().height >= 199, 'expanded textarea');
        const expanded = attached();
        if (started) assert(Math.abs(expanded.formBottom - baseline.formBottom) <= 1.5, 'Docked bottom shifted');
        for (const mirror of document.querySelectorAll('textarea[readonly]')) assert(mirror.clientHeight >= 199, 'Parallel mirror did not resize');
        await menuChecks();
        active().querySelector('form').requestSubmit();
        await wait(() => input().value === '' && input().getBoundingClientRect().height <= emptyInputHeight + 1, 'send/clear shrink');
        const cleared = attached();
        assert(Math.abs(cleared.height - baseline.height) <= 1.5, 'Card did not restore its baseline');
        document.querySelector('#restore-draft').click();
        await wait(() => input().getBoundingClientRect().height >= 199, 'restored draft');
        document.querySelector('#clear-draft').click();
        await wait(() => input().getBoundingClientRect().height <= emptyInputHeight + 1, 'external clear');
        results.push({ product, preset, started, baseline, expanded, cleared });
      }
      return results;
    })()`);
    for (const [width, height] of [[1078, 632], [768, 800], [1440, 1000]]) {
      window.setContentSize(width, height);
      await window.webContents.executeJavaScript(`(async () => {
        const h = window.__layoutHelpers;
        for (const started of [false, true]) {
          window.__composerFixture.select({ product: 'code', preset: 'parallel', started, direct: false });
          await h.wait(() => h.input()?.value === '', 'resize scenario');
          h.type('Long line wrapping across the available composer width. '.repeat(7));
          await h.wait(() => h.input().style.height !== '', 'width resize'); h.attached();
          await h.menuChecks();
        }
      })()`);
      await writeFile(path.join(process.env.CATS_COMPOSER_FIXTURE_OUTPUT, `code-parallel-${width}.png`),
        (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
    }
    await window.webContents.executeJavaScript(`(async () => {
      const h = window.__layoutHelpers;
      for (const started of [false, true]) {
        window.__composerFixture.select({ product: 'chat', preset: 'default', started, direct: true });
        await h.wait(() => h.input()?.value === '', 'direct lane');
        h.type('Direct lane fixture\\n'.repeat(20));
        await h.wait(() => h.input().getBoundingClientRect().height >= 199, 'direct lane expanded');
        h.attached(); await h.menuChecks();
      }
    })()`);
    if (errors.length) throw new Error(errors.join('\n'));
    await writeFile(path.join(process.env.CATS_COMPOSER_FIXTURE_OUTPUT, 'result.json'), JSON.stringify({ checks, directLane: true,
      viewports: ['1078x632', '768x800', '1440x1000'], errors, cliCalls: 0 }, null, 2));
  } catch (error) {
    await writeFile(path.join(process.env.CATS_COMPOSER_FIXTURE_OUTPUT, 'failure.png'), (await window.webContents.capturePage()).toPNG());
    console.error(error); console.error(errors.join('\n')); failed = true;
  } finally { window.destroy(); if (failed) app.exit(1); else app.quit(); }
});

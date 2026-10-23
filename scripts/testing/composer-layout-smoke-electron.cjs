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
      const transcriptAligned = (label, wide) => {
        const composer = active().querySelector('.composerCard').getBoundingClientRect();
        const list = document.querySelector('.transcriptList');
        const lane = list.getBoundingClientRect();
        const near = (a, b) => Math.abs(a - b) <= 1.5;
        assert(near(lane.left, composer.left) && near(lane.right, composer.right), label + ': transcript/composer bounds differ');
        assert(list.scrollWidth <= list.clientWidth + 1, label + ': transcript overflow ' + list.scrollWidth + '/' + list.clientWidth);
        for (const stack of list.querySelectorAll('.transcriptMessageStack')) {
          const r = stack.getBoundingClientRect();
          assert(near(r.left, lane.left) && near(r.right, lane.right), label + ': message row escaped lane');
        }
        const bubbles = [...list.querySelectorAll('.transcriptMessage')];
        assert(bubbles.some(e => e.classList.contains('transcriptMessageUser')), label + ': missing user messages');
        for (const bubble of bubbles) {
          const r = bubble.getBoundingClientRect();
          const user = bubble.classList.contains('transcriptMessageUser');
          assert(user ? near(r.right, composer.right) : near(r.left, composer.left), label + ': bubble alignment shifted');
          assert(r.left >= lane.left - 1 && r.right <= lane.right + 1, label + ': bubble escaped lane');
          assert(bubble.scrollWidth <= bubble.clientWidth + 1, label + ': message content escaped bubble');
        }
        for (const bubble of bubbles.slice(-2)) {
          assert(bubble.getBoundingClientRect().width < lane.width * 0.6, label + ': short bubble expanded');
        }
        if (wide) {
          const table = list.querySelector('.messageBodyTableScroll');
          const code = list.querySelector('.messageBodyMarkdown pre');
          assert(table && code, label + ': missing wide content');
          const heading = document.createRange();
          heading.selectNodeContents(table.querySelector('th'));
          assert(heading.getClientRects().length === 1, label + ': table header wrapped letter by letter');
          for (const region of [table, code]) {
            const r = region.getBoundingClientRect();
            assert(r.left >= lane.left && r.right <= lane.right, label + ': scroll region escaped lane');
            assert(region.scrollWidth > region.clientWidth + 20, label + ': wide content is not locally scrollable');
            region.scrollLeft = region.scrollWidth;
            assert(region.scrollLeft > 0, label + ': horizontal scrolling failed');
            region.scrollLeft = 0;
          }
          assert(code.querySelector('code').textContent.trimEnd() === window.__composerFixture.expectedCode, label + ': code was truncated');
          assert(getComputedStyle(code.querySelector('code')).whiteSpace === 'pre', label + ': code wrapping changed');
          assert([...list.querySelectorAll('.messageBody')].some(e => e.textContent === window.__composerFixture.expectedPath), label + ': long user path was truncated');
        }
        const canvas = document.querySelector('.canvas');
        assert(canvas.scrollWidth <= canvas.clientWidth + 1, label + ': canvas overflow');
        return { left: lane.left, right: lane.right, width: lane.width, gridWidth: list.scrollWidth };
      };
      await wait(() => input(), 'initial composer');
      window.__layoutHelpers = { wait, assert, active, input, type, hit, attached, menuChecks, transcriptAligned };
      const results = [];
      for (const product of ['chat', 'code', 'work']) for (const preset of ['default', 'group', 'parallel']) for (const started of [false, true]) {
        window.__composerFixture.select({ product, preset, started, direct: false });
        await wait(() => input() && input().value === '' && window.__composerFixture.scenario.product === product, 'scenario');
        if (started) {
          assert(document.querySelector('.composerAreaStackDocked'), 'Started fixture must use the docked composer');
          assert(document.querySelectorAll('.transcriptMessage').length >= 50, 'Started fixture must render its existing transcript');
          transcriptAligned(product + '/' + preset, true);
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
    const transcriptChecks = [];
    for (const [width, height] of [[1078, 632], [768, 800], [1440, 1000]]) {
      window.setContentSize(width, height);
      transcriptChecks.push(...await window.webContents.executeJavaScript(`(async () => {
        const h = window.__layoutHelpers;
        const results = [];
        for (const product of ['chat', 'code', 'work']) for (const preset of ['default', 'group', 'parallel']) {
          window.__composerFixture.select({ product, preset, started: true, direct: false });
          window.__composerFixture.setWide(false);
          await h.wait(() => document.querySelector('.transcriptList') && !document.querySelector('.messageBodyTableScroll'), 'normal transcript');
          const normal = h.transcriptAligned(product + '/' + preset + '/normal', false);
          window.__composerFixture.setWide(true);
          await h.wait(() => document.querySelector('.messageBodyTableScroll'), 'late wide reply');
          const wide = h.transcriptAligned(product + '/' + preset + '/wide', true);
          h.assert(Math.abs(normal.left - wide.left) < 1 && Math.abs(normal.right - wide.right) < 1, 'Late content shifted lane');
          window.__composerFixture.setWide(false);
          await h.wait(() => !document.querySelector('.messageBodyTableScroll'), 'remove wide reply');
          h.transcriptAligned(product + '/' + preset + '/restored', false);
          results.push({ product, preset, viewport: [innerWidth, innerHeight], normal, wide });
        }
        return results;
      })()`));
      await window.webContents.executeJavaScript(`window.__composerFixture.setWide(true)`);
      await window.webContents.executeJavaScript(`window.__layoutHelpers.wait(() => document.querySelector('.messageBodyTableScroll'), 'wide screenshot')`);
      await new Promise(resolve => setTimeout(resolve, 100));
      await writeFile(path.join(process.env.CATS_COMPOSER_FIXTURE_OUTPUT, `transcript-wide-${width}.png`),
        (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
      await window.webContents.executeJavaScript(`document.querySelector('.messageBodyTableScroll').scrollIntoView({ block: 'center' })`);
      await new Promise(resolve => setTimeout(resolve, 100));
      await writeFile(path.join(process.env.CATS_COMPOSER_FIXTURE_OUTPUT, `transcript-table-${width}.png`),
        (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
    }
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
    await writeFile(path.join(process.env.CATS_COMPOSER_FIXTURE_OUTPUT, 'result.json'), JSON.stringify({ checks, transcriptChecks, directLane: true,
      viewports: ['1078x632', '768x800', '1440x1000'], errors, cliCalls: 0 }, null, 2));
  } catch (error) {
    await writeFile(path.join(process.env.CATS_COMPOSER_FIXTURE_OUTPUT, 'failure.png'), (await window.webContents.capturePage()).toPNG());
    console.error(error); console.error(errors.join('\n')); failed = true;
  } finally { window.destroy(); if (failed) app.exit(1); else app.quit(); }
});

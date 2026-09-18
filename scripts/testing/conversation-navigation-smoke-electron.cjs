// Usage: invoked by conversation-navigation-smoke.mjs; never run against real state.
// CATS_NAV_SMOKE_URL selects the fixture server, PROFILE isolates Electron state,
// and OUTPUT selects the screenshot/result directory. No Desktop supervisor loads.
const { app, BrowserWindow } = require('electron');
const { writeFile } = require('node:fs/promises');
const path = require('node:path');
app.setPath('userData', process.env.CATS_NAV_SMOKE_PROFILE);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1440, height: 1000, show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
  window.webContents.setFrameRate(60);
  const errors = [];
  window.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); });
  try {
    await window.loadURL(process.env.CATS_NAV_SMOKE_URL);
    const result = await window.webContents.executeJavaScript(`(async () => {
      const wait = async (predicate, label) => {
        const started = performance.now();
        while (!predicate()) {
          if (performance.now() - started > 10000) throw new Error('Timeout: ' + label + '\\n' + document.body.innerText);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      };
      await wait(() => document.body.innerText.includes('Transcript 1'), 'initial Chat render');
      const fixture = window.__navigationSmoke;
      const click = (title) => {
        const row = [...document.querySelectorAll('button,a,[role="button"],span')].find(el => el.textContent.trim() === title);
        if (!row) throw new Error('Missing navigation control: ' + title);
        row.click();
      };
      fixture.click = click;
      fixture.wait = wait;
      fixture.delays.shell = 60000;
      fixture.delays.preference = 2000;
      const timings = [];
      const checks = [];
      for (const index of [1, 2, 3]) {
        const start = performance.now(); click('Conversation ' + (index + 1));
        await wait(() => document.body.innerText.includes('Transcript ' + (index + 1)), 'cold conversation ' + index);
        timings.push({ kind: 'cold', conversation: index + 1, ms: performance.now() - start });
      }
      fixture.delays.snapshot = 2000;
      for (const index of [0, 2, 1, 3, 0]) {
        const start = performance.now(); click('Conversation ' + (index + 1));
        await wait(() => document.body.innerText.includes('Transcript ' + (index + 1)), 'warm conversation ' + index);
        const ms = performance.now() - start;
        if (ms >= 1500) throw new Error('Warm navigation waited for a delayed response: ' + ms);
        timings.push({ kind: 'warm', conversation: index + 1, ms });
      }
      fixture.pushReply(fixture.ids[0], 'Background reply received');
      await wait(() => document.body.innerText.includes('Background reply received'), 'subscription update');
      click('Conversation 2');
      await wait(() => document.body.innerText.includes('Transcript 2'), 'leave updated conversation');
      click('Conversation 1');
      await wait(() => document.body.innerText.includes('Background reply received'), 'retained updated transcript');
      const type = (value) => {
        const input = document.querySelector('textarea');
        if (!input) throw new Error('Missing composer textarea');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      type('Keep conversation one draft');
      await wait(() => document.querySelector('textarea')?.value === 'Keep conversation one draft', 'composer edit');
      click('New Chat');
      await wait(() => location.pathname.endsWith('/new'), 'new chat');
      if (document.querySelector('textarea')?.value) throw new Error('New chat inherited conversation draft');
      click('Conversation 1');
      await wait(() => document.querySelector('textarea')?.value === 'Keep conversation one draft', 'restore conversation draft after New Chat');
      checks.push('cold/warm A/B/C/D navigation', 'background update retention', 'conversation draft after New Chat');
      fixture.delays.snapshot = 20;
      for (const serverClose of [false, true]) {
        const body = serverClose ? 'Recovered server read failure' : 'Recovered disconnected stream';
        fixture.disconnect(fixture.ids[0], serverClose);
        if (!document.body.innerText.includes('Transcript 1')) throw new Error('Disconnect cleared retained transcript');
        fixture.pushReply(fixture.ids[0], body, false);
        await wait(() => document.body.innerText.includes(body), body);
      }
      checks.push('network and server-error reconnection');
      click('Group Chat');
      await wait(() => location.pathname.includes('/new'), 'group draft');
      checks.push({ mode: 'group draft', path: location.pathname, text: document.body.innerText });
      click('Parallel Chat');
      await wait(() => location.pathname.includes('/new'), 'parallel draft');
      checks.push({ mode: 'parallel draft', path: location.pathname, text: document.body.innerText });
      click('group fixture');
      await wait(() => document.body.innerText.includes('group transcript'), 'group room');
      checks.push({ mode: 'group room', text: document.body.innerText });
      click('Fixture Cat Two');
      await wait(() => document.body.innerText.includes('direct transcript'), 'direct lane');
      checks.push({ mode: 'direct lane', text: document.body.innerText });
      click('Conversation 1');
      await wait(() => document.querySelector('textarea')?.value === 'Keep conversation one draft', 'draft after other chat modes');
      return { timings, checks, calls: fixture.calls, text: document.body.innerText };
    })()`);
    result.errors = errors;
    await writeFile(path.join(process.env.CATS_NAV_SMOKE_OUTPUT, 'result.json'), JSON.stringify(result, null, 2));
    await writeFile(path.join(process.env.CATS_NAV_SMOKE_OUTPUT, 'chat.png'), (await window.webContents.capturePage()).toPNG());
    for (const [control, marker, name] of [
      ['Group Chat', 'Add another model to collaborate', 'group-draft'],
      ['Parallel Chat', 'Follows lead', 'parallel-draft'],
      ['group fixture', 'group transcript', 'group-room'],
      ['Fixture Cat Two', 'direct transcript', 'direct-lane'],
    ]) {
      await window.webContents.executeJavaScript(`(async () => {
        const fixture = window.__navigationSmoke;
        fixture.click(${JSON.stringify(control)});
        await fixture.wait(() => document.body.innerText.includes(${JSON.stringify(marker)}), ${JSON.stringify(name)});
      })()`);
      await writeFile(path.join(process.env.CATS_NAV_SMOKE_OUTPUT, `${name}.png`), (await window.webContents.capturePage()).toPNG());
    }
    await window.webContents.executeJavaScript(`(async () => {
      document.querySelector('.recentOverflowButton').click();
      await window.__navigationSmoke.wait(() => document.querySelector('.recentOverflowMenu'), 'sidebar overflow');
      const menu = document.querySelector('.recentOverflowMenu');
      const bounds = menu.getBoundingClientRect();
      const topElement = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      if (!menu.contains(topElement)) throw new Error('Sidebar overflow is obscured');
    })()`);
    await writeFile(path.join(process.env.CATS_NAV_SMOKE_OUTPUT, 'sidebar-overflow.png'), (await window.webContents.capturePage()).toPNG());
    if (errors.length) throw new Error(errors.join('\n'));
    window.webContents.stopPainting();
    window.destroy();
    app.quit();
  } catch (error) {
    await writeFile(path.join(process.env.CATS_NAV_SMOKE_OUTPUT, 'failure.png'), (await window.webContents.capturePage()).toPNG());
    console.error(error);
    console.error(errors.join('\n'));
    window.webContents.stopPainting();
    window.destroy();
    process.exitCode = 1;
    app.quit();
  }
});

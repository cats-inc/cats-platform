import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { installBrowserErrorDiagnostics, readBrowserErrorDiagnostics } from '../src/products/shared/renderer/browserDiagnostics.js';

function fixture(t: TestContext) {
  const dom = new JSDOM('', { url: 'http://localhost/chat/chats/incident' });
  // jsdom implements the browser event/location APIs used by this recorder.
  const target = dom.window as unknown as Window;
  const stop = installBrowserErrorDiagnostics(target);
  t.after(() => { stop(); dom.window.close(); });
  return {
    target, stop,
    navigate: (path: string) => dom.window.history.replaceState(null, '', path),
    error(message: string, error?: Error) {
      return target.dispatchEvent(new dom.window.ErrorEvent('error', {
        message, error, cancelable: true,
      }));
    },
    reject(reason: unknown) {
      const event = new dom.window.Event('unhandledrejection', { cancelable: true });
      Object.defineProperty(event, 'reason', { value: reason });
      return target.dispatchEvent(event);
    },
    read: (id = 'incident') => readBrowserErrorDiagnostics(id, target),
  };
}

test('UI errors retain bounded scrubbed evidence without suppressing events or serializing rejection objects', t => {
  const f = fixture(t);
  let forwarded = 0;
  f.target.addEventListener('error', () => { forwarded += 1; });
  const error = new Error('render failed token=private-token');
  error.stack = 'Error: token=private-token\n at render (https://localhost/assets/chat.js?opaque=private-query#secret:12:3)';
  assert.equal(f.error(error.message, error), true);
  assert.equal(f.reject('provider UI Bearer private-bearer'), true);
  assert.equal(f.reject({ toString: () => assert.fail('must not stringify arbitrary rejection'), secret: 'object-secret' }), true);
  assert.equal(forwarded, 1);
  const report = f.read();
  assert.equal(report.entries.length, 3);
  assert.deepEqual(report.entries.map(entry => entry.kind), ['error', 'unhandledrejection', 'unhandledrejection']);
  assert.match(report.entries[0]!.stack!, /chat\.js/u);
  assert.match(JSON.stringify(report), /redacted/u);
  assert.doesNotMatch(JSON.stringify(report), /private-token|private-bearer|private-query|object-secret/u);
  assert.match(report.entries[2]!.message!, /details omitted/u);
});

test('reports select the incident observed in this window and exclude other pages, URL queries and windows', t => {
  const f = fixture(t);
  f.navigate('/chat/chats/incident?secret=private-query#private-fragment');
  f.error('incident failure');
  f.navigate('/code/chats/debugger');
  f.error('debugger failure');
  for (const path of ['/code/new', '/chat/dm/cat-id', '/chat/chats/%E0%A4%A']) {
    f.navigate(path);
    f.error('unscoped failure');
  }
  const report = f.read();
  assert.equal(report.entries.length, 1);
  assert.equal(report.entries[0]!.view, '/chat/chats/incident');
  assert.doesNotMatch(JSON.stringify(report), /debugger failure|unscoped failure|private-query|private-fragment/u);
  assert.equal(f.read('debugger').entries[0]!.message, 'debugger failure');
  assert.equal(f.read('unknown').entries.length, 0);
  assert.equal(fixture(t).read().entries.length, 0);
});

test('retention, snapshot isolation and disposal remain bounded across navigation and reinstall', t => {
  const f = fixture(t);
  f.error('old incident failure');
  f.navigate('/work/chats/other');
  for (let index = 0; index < 20; index += 1) f.error(`failure ${index} ${'x'.repeat(6000)}`);
  assert.equal(f.read().entries.length, 0);
  const other = f.read('other');
  assert.equal(other.entries.length, 8);
  assert.match(other.entries[0]!.message!, /^failure 12/u);
  assert.ok(other.entries.every(entry => entry.message!.length < 1250));
  other.entries[0]!.message = 'changed copy';
  assert.match(f.read('other').entries[0]!.message!, /^failure 12/u);
  assert.equal(installBrowserErrorDiagnostics(f.target), f.stop);
  f.stop();
  f.error('after disposal');
  assert.match(f.read().availability, /not installed/u);
  const stopAgain = installBrowserErrorDiagnostics(f.target);
  t.after(stopAgain);
  f.stop(); // A stale disposer must not remove the new installation.
  f.error('after reinstall');
  assert.equal(f.read('other').entries[0]!.message, 'after reinstall');
});

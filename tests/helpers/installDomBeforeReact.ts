import { JSDOM } from 'jsdom';

/**
 * Installs a jsdom window on `globalThis` at module-evaluation time.
 *
 * Most renderer tests here create a jsdom inside each test, which is fine when
 * the test only clicks and reads markup. It is not enough for typing into a
 * controlled input.
 *
 * `react-dom` captures `canUseDOM` and `isInputEventSupported` once, when its
 * module body runs. Under `scripts/build-test-ui.mjs` every test file is a
 * single esbuild bundle, so that happens while the bundle loads — before a
 * test body could install a document. React then decides there is no DOM,
 * falls back to its legacy IE `onpropertychange` value watcher, and never
 * fires `onChange` for a controlled input: `fireEvent.change` updates the DOM
 * value while React state stays empty, which reads as a component bug.
 *
 * Importing this module *before* React (or anything that pulls React in, such
 * as `@testing-library/react`) makes the document exist first. ESM evaluates
 * dependencies in import order, so the import order in the consuming test file
 * is load-bearing — keep this one first.
 */

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'http://localhost/',
});

const globals: Array<[PropertyKey, unknown]> = [
  ['window', dom.window],
  ['document', dom.window.document],
  ['navigator', dom.window.navigator],
  ['HTMLElement', dom.window.HTMLElement],
  ['HTMLInputElement', dom.window.HTMLInputElement],
  ['Node', dom.window.Node],
  ['Event', dom.window.Event],
  ['MouseEvent', dom.window.MouseEvent],
  ['KeyboardEvent', dom.window.KeyboardEvent],
  ['MutationObserver', dom.window.MutationObserver],
  ['localStorage', dom.window.localStorage],
  ['getComputedStyle', dom.window.getComputedStyle.bind(dom.window)],
];

for (const [key, value] of globals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
    writable: true,
  });
}

export const testDomWindow = dom.window;

/** Clears document state between tests without tearing the window down. */
export function resetTestDom(): void {
  dom.window.document.body.innerHTML = '';
  dom.window.document.head.innerHTML = '';
}

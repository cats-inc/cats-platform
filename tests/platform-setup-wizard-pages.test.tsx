import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { setImmediate as nextTurn } from 'node:timers/promises';

import { clearProviderCatalogClientCache } from '../src/app/renderer/providerCatalogClient.ts';
import { clearProviderRegistryClientCache } from '../src/app/renderer/providerRegistryClient.ts';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { PlatformSetupWizard } from '../src/app/renderer/setup/index.ts';
import { listProductProviders } from '../src/shared/providerCatalog.ts';
import type { PlatformHostEnvelope } from '../src/shared/platform-contract.ts';
import { createFixtureProviderAdvancedCatalog, createFixtureProviderModelCatalog } from './helpers/catalogFixture.js';

/* SPEC-136 pages 4 and 5. Fetch and the Desktop bridge are stubs: nothing is written anywhere. */

const envelope = { bootstrapAttemptId: 'pages', runtime: { reachable: true } } as PlatformHostEnvelope;

// These suites share one process with the rest of the renderer tests, and a test here can call
// setup twice, so everything is put back to what it was before this file ran. Node 24 has no
// sessionStorage and Node 26 does, so the tests bring their own.
const realFetch = globalThis.fetch;
const realStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    clear: () => items.clear(),
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => [...items.keys()][index] ?? null,
    removeItem: (key: string) => { items.delete(key); },
    setItem: (key: string, value: string) => { items.set(key, value); },
  };
}

function desktopBridge(state: Record<string, unknown> | null = null) {
  const runs: Array<Record<string, unknown>> = [];
  const finished: Array<[number, Record<string, unknown>]> = [];
  const returned: number[] = [];
  const preferences: unknown[] = [];
  const bridge = {
    getSnapshot: async () => ({ services: [{ name: 'cats-runtime', status: 'ready', healthUrl: 'http://127.0.0.1:3110/health' }], diagnostics: null, hostStatePath: 'state.json' }),
    getProviderSetup: async () => ({ runtime: { selection: { targets: [{ provider: 'codex' }, { provider: 'claude' }, { provider: 'grok' }] } } }),
    runAction: async () => ({}),
    updateDesktopPreferences: async (value: unknown) => { preferences.push(value); return value; },
    setupWizard: {
      facts: async () => ({ state }),
      checkCodexInitialization: async (_instance?: string): Promise<{ status: string }> => ({ status: 'not_applicable' }),
      runs: async (): Promise<unknown[]> => [],
      onRun: () => () => {},
      startRun: async (input: Record<string, unknown>) => { runs.push(input); return runs.length; },
      finishRun: async (id: number, result: Record<string, unknown>) => { finished.push([id, result]); },
      returnToPage: async (page: number) => { returned.push(page); },
    },
  };
  return { bridge, runs, finished, returned, preferences };
}

function setup(t: { after(fn: () => void): void }, options: {
  providers?: string[];
  complete?: (body: Record<string, unknown>) => Response;
  bridge?: unknown;
} = {}) {
  resetTestDom();
  clearProviderRegistryClientCache();
  clearProviderCatalogClientCache();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: memoryStorage() });
  const submitted: Array<Record<string, unknown>> = [];
  let completed = false;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/providers') {
      return Response.json({ state: 'ready', providers: listProductProviders().filter((entry) => (options.providers ?? ['codex', 'claude']).includes(entry.id)) });
    }
    const catalog = /^\/api\/providers\/(codex|claude)\/models(\/advanced)?/u.exec(url);
    if (catalog) {
      return Response.json({ catalog: catalog[2]
        ? createFixtureProviderAdvancedCatalog(catalog[1]!, { instance: 'cli/native' })
        : createFixtureProviderModelCatalog(catalog[1]!, { instance: 'cli/native' }) });
    }
    if (url === '/api/platform/setup/complete') {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      submitted.push(body);
      return options.complete ? options.complete(body) : Response.json({ ...envelope, products: [], setupCompleteAt: '2099-01-01T00:00:00.000Z' });
    }
    return Response.json({});
  }) as typeof fetch;
  const host = globalThis as typeof globalThis & { catsDesktopHost?: unknown };
  if (options.bridge) host.catsDesktopHost = options.bridge;
  t.after(() => {
    cleanup();
    delete host.catsDesktopHost;
    resetTestDom();
    globalThis.fetch = realFetch;
    if (realStorage) Object.defineProperty(globalThis, 'sessionStorage', realStorage);
    else delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
    clearProviderRegistryClientCache();
    clearProviderCatalogClientCache();
  });
  const view = render(<I18nProvider locale="en"><PlatformSetupWizard envelope={envelope} onComplete={() => { completed = true; }} /></I18nProvider>);
  const fillAccount = () => {
    fireEvent.change(view.getByLabelText('Your name'), { target: { value: 'Owner' } });
    fireEvent.change(view.getByLabelText('Admin login email'), { target: { value: 'owner@example.test' } });
    fireEvent.change(view.getByLabelText('Admin password'), { target: { value: 'fixture-password' } });
  };
  const toCatlas = async () => {
    fillAccount();
    fireEvent.click(view.getByRole('button', { name: 'Next' }));
    await waitFor(() => assert.ok(view.container.querySelector('#setup-guide-off')));
  };
  const create = () => view.container.querySelector('#setup-create') as HTMLButtonElement;
  const finishWithoutCatlas = async () => {
    await toCatlas();
    await waitFor(() => assert.ok(view.container.querySelector('#setup-guide-codex')));
    fireEvent.click(view.container.querySelector('#setup-guide-off')!);
    fireEvent.click(create());
  };
  return { view, submitted, toCatlas, fillAccount, create, finishWithoutCatlas, isCompleted: () => completed };
}

test('a browser with no Desktop host sees two steps, no log and no details entry', async (t) => {
  const f = setup(t, { complete: () => Response.json({ error: { code: 'bad_request', message: 'No' } }, { status: 400 }) });
  assert.equal(f.view.container.querySelectorAll('.step').length, 2);
  assert.equal((f.view.container.querySelector('[data-log]') as HTMLElement).hidden, true);
  assert.equal(f.view.container.querySelector('#setup-back'), null);
  await f.finishWithoutCatlas();
  await waitFor(() => assert.match(f.view.container.textContent ?? '', /Cats refused this request/u));
  assert.equal(f.view.container.querySelector('#setup-details-submit'), null);
  assert.doesNotMatch(f.view.container.textContent ?? '', /Start Cats when I sign in/u);
});

test('Next says what is wrong instead of moving on, and a short password is named', async (t) => {
  const f = setup(t);
  fireEvent.click(f.view.getByRole('button', { name: 'Next' }));
  assert.ok(f.view.queryByLabelText('Admin password'));
  assert.match(f.view.container.textContent ?? '', /Enter your name/u);
  assert.match(f.view.container.textContent ?? '', /Use at least 8 characters\. This has 0/u);
  fireEvent.change(f.view.getByLabelText('Admin password'), { target: { value: '密碼' } });
  assert.match(f.view.container.textContent ?? '', /This has 2/u);
});

test('Catlas: on when a tool can answer, one tool chooses itself, off when none can', async (t) => {
  const one = setup(t, { providers: ['codex'] });
  await one.toCatlas();
  const tool = () => one.view.container.querySelector('#setup-guide-codex') as HTMLInputElement;
  await waitFor(() => assert.equal(tool()?.checked, true));
  assert.equal((one.view.container.querySelector('#setup-guide-on') as HTMLInputElement).checked, true);
  cleanup();
  const none = setup(t, { providers: [] });
  await none.toCatlas();
  await waitFor(() => assert.match(none.view.container.textContent ?? '', /No tool is ready for Catlas yet/u));
  assert.equal((none.view.container.querySelector('#setup-guide-on') as HTMLInputElement).disabled, true);
  assert.equal(none.create().disabled, false, 'finishing without Catlas stays possible');
});

test('Codex Catlas requires fresh host readiness on each submit, before creating the account', async t => {
  const host = desktopBridge();
  const checks: Array<string | undefined> = [];
  let status = 'required';
  host.bridge.setupWizard.checkCodexInitialization = async instance => { checks.push(instance); return { status }; };
  const f = setup(t, { providers: ['codex'], bridge: host.bridge });
  await f.toCatlas();
  await waitFor(() => assert.equal((f.view.container.querySelector('#setup-guide-codex') as HTMLInputElement)?.checked, true));
  await waitFor(() => assert.equal(f.create().disabled, false));
  assert.equal(checks.length, 0, 'rendering and choosing a tool run no Codex probe');
  fireEvent.click(f.create());
  await waitFor(() => assert.ok(f.view.container.querySelector('#setup-fix-codex')));
  assert.equal(f.submitted.length, 0);
  status = 'unavailable';
  fireEvent.click(f.create());
  await waitFor(() => assert.equal(checks.length, 2));
  await waitFor(() => assert.equal(f.create().disabled, false));
  assert.equal(f.submitted.length, 0, 'an inconclusive probe cannot create anything');
  status = 'ready';
  fireEvent.click(f.create());
  await waitFor(() => assert.equal(f.submitted.length, 1));
  assert.equal(checks.length, 3);
  assert.equal(checks[2], f.submitted[0]!.guideCatInstance, 'checks the actual submitted target');
});

test('an unready Codex never prevents finishing without Catlas', async t => {
  const host = desktopBridge();
  let probes = 0;
  host.bridge.setupWizard.checkCodexInitialization = async () => { probes++; return { status: 'required' }; };
  const f = setup(t, { providers: ['codex'], bridge: host.bridge });
  await f.finishWithoutCatlas();
  await waitFor(() => assert.equal(f.submitted.length, 1));
  assert.equal(probes, 0);
  assert.equal(f.submitted[0]!.createGuideCat, false);
});

test('closing the setup view during a pending readiness check cannot submit a late result', async t => {
  const host = desktopBridge();
  let complete: ((value: { status: string }) => void) | undefined;
  host.bridge.setupWizard.checkCodexInitialization = () => new Promise(resolve => { complete = resolve; });
  const f = setup(t, { providers: ['codex'], bridge: host.bridge });
  await f.toCatlas();
  await waitFor(() => assert.equal((f.view.container.querySelector('#setup-guide-codex') as HTMLInputElement)?.checked, true));
  await waitFor(() => assert.equal(f.create().disabled, false));
  fireEvent.click(f.create());
  await waitFor(() => assert.ok(complete));
  f.view.unmount();
  complete!({ status: 'ready' });
  await nextTurn();
  assert.equal(f.submitted.length, 0);
});

test('a known non-native Codex target passes the host preflight without native initialization', async t => {
  const host = desktopBridge();
  let probes = 0;
  host.bridge.setupWizard.checkCodexInitialization = async () => { probes++; return { status: 'not_applicable' }; };
  const f = setup(t, { providers: ['codex'], bridge: host.bridge });
  await f.toCatlas();
  await waitFor(() => assert.equal((f.view.container.querySelector('#setup-guide-codex') as HTMLInputElement)?.checked, true));
  await waitFor(() => assert.equal(f.create().disabled, false));
  fireEvent.click(f.create());
  await waitFor(() => assert.equal(f.submitted.length, 1));
  assert.equal(probes, 1);
});

test('with several tools nothing is chosen for you, and the button waits for a choice or Not now', async (t) => {
  const f = setup(t);
  await f.toCatlas();
  await waitFor(() => assert.ok(f.view.container.querySelector('#setup-guide-codex')));
  assert.equal((f.view.container.querySelector('#setup-guide-codex') as HTMLInputElement).checked, false);
  assert.equal(f.create().disabled, true);
  assert.match(f.view.container.textContent ?? '', /Choose a tool for Catlas, or choose Not now/u);
  fireEvent.click(f.view.container.querySelector('#setup-guide-off')!);
  assert.equal(f.create().disabled, false);
});

test('the list says what the button does, and Catlas off is said too', async (t) => {
  const f = setup(t);
  await f.toCatlas();
  await waitFor(() => assert.ok(f.view.container.querySelector('#setup-guide-off')));
  fireEvent.click(f.view.container.querySelector('#setup-guide-off')!);
  const summary = f.view.container.querySelector('.summary')!.textContent ?? '';
  assert.match(summary, /owner@example\.test/u);
  assert.match(summary, /Leaves Catlas off/u);
  assert.match(summary, /Opens the Lobby/u);
});

test('a refused password returns to the account page, naming it, with the rest kept', async (t) => {
  const f = setup(t, { complete: () => Response.json({ error: { code: 'invalid_admin_credentials', reason: 'password_too_short', message: 'Use a longer password.' } }, { status: 400 }) });
  await f.finishWithoutCatlas();
  await waitFor(() => assert.match(f.view.container.textContent ?? '', /Cats refused this email or password/u));
  assert.equal((f.view.getByLabelText('Your name') as HTMLInputElement).value, 'Owner');
  assert.equal((f.view.getByLabelText('Admin login email') as HTMLInputElement).value, 'owner@example.test');
});

test('already finished offers sign-in and stops the button', async (t) => {
  const f = setup(t, { complete: () => Response.json({ error: { code: 'already_complete', message: 'Done' } }, { status: 409 }) });
  await f.finishWithoutCatlas();
  await waitFor(() => assert.ok(f.view.container.querySelector('#setup-to-sign-in')));
  assert.equal(f.create().disabled, true);
});

test('a server failure keeps what was entered, and a lost connection says it is safe to retry', async (t) => {
  let answer: () => Response = () => Response.json({ error: { code: 'internal_error', message: 'x' } }, { status: 500 });
  const f = setup(t, { complete: () => answer() });
  await f.finishWithoutCatlas();
  await waitFor(() => assert.match(f.view.container.textContent ?? '', /Cats could not finish setup/u));
  answer = () => { throw new TypeError('Failed to fetch'); };
  fireEvent.click(f.create());
  await waitFor(() => assert.match(f.view.container.textContent ?? '', /Trying again is safe/u));
  answer = () => Response.json({ ...envelope, products: [], setupCompleteAt: '2099-01-01T00:00:00.000Z' });
  fireEvent.click(f.create());
  await waitFor(() => assert.equal(f.isCompleted(), true));
});

test('Desktop: five steps, the same log, and the password never reaches it', async (t) => {
  const host = desktopBridge();
  const f = setup(t, { bridge: host.bridge });
  await waitFor(() => assert.equal(f.view.container.querySelectorAll('.step').length, 5));
  await f.finishWithoutCatlas();
  await waitFor(() => assert.equal(f.isCompleted(), true));
  assert.equal(host.runs.length, 1);
  const logged = JSON.stringify(host.runs) + JSON.stringify(host.finished);
  assert.match(logged, /\(not logged\)/u);
  assert.doesNotMatch(logged, /fixture-password/u);
  assert.equal(host.finished[0]?.[1].status, 'ready');
});

test('Desktop: a failure reaches the details page, and back keeps the form', async (t) => {
  const host = desktopBridge();
  const f = setup(t, { bridge: host.bridge, complete: () => Response.json({ error: { code: 'bad_request', message: 'No' } }, { status: 400 }) });
  await f.finishWithoutCatlas();
  await waitFor(() => assert.ok(f.view.container.querySelector('#setup-details-submit')));
  fireEvent.click(f.view.container.querySelector('#setup-details-submit')!);
  await waitFor(() => assert.ok(f.view.container.querySelector('[data-diag]')));
  assert.match(f.view.container.querySelector('[data-diag]')!.textContent ?? '', /400 bad_request|Technical details/u);
  assert.equal(f.view.container.querySelectorAll('.diag-section').length, 4);
  fireEvent.click(f.view.container.querySelector('[data-diag-back]')!);
  assert.equal(f.view.container.querySelector('[data-diag]'), null);
  assert.ok(f.view.container.querySelector('#setup-create'));
  assert.deepEqual(host.finished[0]?.[1].error, '400 bad_request');
});

test('Desktop: start at login is ticked by default, and the final button writes the choice', async (t) => {
  const kept = desktopBridge();
  const first = setup(t, { bridge: kept.bridge });
  await first.finishWithoutCatlas();
  await waitFor(() => assert.equal(first.isCompleted(), true));
  assert.equal((kept.preferences[0] as { startAtLogin: boolean }).startAtLogin, true);
  cleanup();

  const off = desktopBridge();
  const second = setup(t, { bridge: off.bridge });
  await second.toCatlas();
  const box = second.view.container.querySelector('#setup-start-at-login') as HTMLInputElement;
  assert.equal(box.checked, true);
  await waitFor(() => assert.ok(second.view.container.querySelector('#setup-guide-off')));
  fireEvent.click(box);
  assert.deepEqual(off.preferences, [], 'nothing is written before the final button');
  fireEvent.click(second.view.container.querySelector('#setup-guide-off')!);
  fireEvent.click(second.create());
  await waitFor(() => assert.equal(second.isCompleted(), true));
  assert.equal((off.preferences[0] as { startAtLogin: boolean }).startAtLogin, false);
});

test('Desktop: a tool that is chosen but not usable says why and links back; going back keeps name and email only', async (t) => {
  const host = desktopBridge({ lang: 'en', rows: { claude: { kind: 'ready', status: 'auth_required' } }, skipped: [] });
  const f = setup(t, { bridge: host.bridge });
  await f.toCatlas();
  await waitFor(() => assert.ok(f.view.container.querySelector('[data-row="guide-grok"]')));
  assert.match(f.view.container.querySelector('[data-row="guide-grok"]')!.textContent ?? '', /Not installed/u);
  assert.equal(f.view.container.querySelector('#setup-guide-grok'), null);
  assert.match(f.view.container.querySelector('[data-row="guide-claude"]')!.textContent ?? '', /Not signed in/u);
  fireEvent.click(f.view.container.querySelector('#setup-fix-grok')!);
  assert.deepEqual(host.returned, [2]);
  const draft = globalThis.sessionStorage.getItem('cats-setup-account') ?? '';
  assert.match(draft, /owner@example\.test/u);
  assert.doesNotMatch(draft, /fixture-password/u);
});

test('Desktop: page 5 counts changes made before it opened, and before a restart', async (t) => {
  const host = desktopBridge({ priorChanges: 1, rows: {}, skipped: [] });
  host.bridge.setupWizard.runs = async () => [{ id: 1, kind: 'change', label: 'Install-Node.ps1', command: 'x', startedAt: '2026-11-04T00:00:00.000Z', endedAt: '2026-11-04T00:00:01.000Z', status: 'ready', applied: ['install_node'], error: null }];
  const f = setup(t, { bridge: host.bridge });
  await f.toCatlas();
  await waitFor(() => assert.match(f.view.container.querySelector('.summary')!.textContent ?? '', /changed 2 item/u));
});

test('page 5 adds no error text, Retry or Runtime Setup link around the picker (SPEC-013)', async (t) => {
  const f = setup(t, { providers: [] });
  globalThis.fetch = (async () => { throw new TypeError('timeout'); }) as typeof fetch;
  await f.toCatlas();
  assert.doesNotMatch(f.view.container.textContent ?? '', /timeout|Retry|Runtime setup/iu);
  assert.equal(f.view.container.querySelectorAll('.pane a').length, 0);
});

// Must come first: React captures `canUseDOM` when its module body runs.
import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import {
  CapabilityBootstrapSection,
} from '../src/app/renderer/settings/CapabilityBootstrapSection.tsx';

const INITIAL_VIEW = {
  configPath: '/tmp/provider-capability-bootstrap.yaml',
  configPresent: true,
  revision: 'revision-before',
  canInstallExample: false,
  parsed: true,
  restartRequired: false,
  ruleCount: 1,
  rules: [{
    id: 'claude-native',
    selector: { provider: 'claude', instance: 'native', model: 'opus' },
    initialTreatment: 'strong_agent',
    confidenceLevel: 'catalog_only',
    reason: 'Original reason.',
  }],
  diagnostics: [],
} as const;

test('capability bootstrap Settings edits and saves the complete rule document', async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ method: string; body: unknown }> = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      return new Response(JSON.stringify(INITIAL_VIEW), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const body = JSON.parse(String(init?.body));
    calls.push({ method, body });
    const config = body.config as { profiles: typeof INITIAL_VIEW.rules };
    return new Response(JSON.stringify({
      ...INITIAL_VIEW,
      revision: 'revision-after',
      restartRequired: true,
      rules: config.profiles,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  t.after(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    resetTestDom();
  });

  const toasts: string[] = [];
  const view = render(
    <I18nProvider locale="en">
      <CapabilityBootstrapSection showToast={(message) => toasts.push(message)} />
    </I18nProvider>,
  );

  await waitFor(() => view.getByDisplayValue('Original reason.'));
  fireEvent.change(view.getByLabelText('Reason'), {
    target: { value: 'Owner-approved bounded provider target.' },
  });
  fireEvent.click(view.getByRole('button', { name: 'Save rules' }));

  await waitFor(() => assert.equal(calls.length, 1));
  assert.equal(calls[0]?.method, 'PUT');
  assert.deepEqual(calls[0]?.body, {
    expectedRevision: 'revision-before',
    config: {
      version: 1,
      profiles: [{
        id: 'claude-native',
        selector: { provider: 'claude', instance: 'native', model: 'opus' },
        initialTreatment: 'strong_agent',
        confidenceLevel: 'catalog_only',
        reason: 'Owner-approved bounded provider target.',
      }],
    },
  });
  await waitFor(() => view.getByText(/Restart Cats for it to take effect/u));
  assert.deepEqual(toasts, []);
});

import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { CatImagePolicyCard } from '../src/app/renderer/entities/companion/CatImagePolicyCard.tsx';
import { CatImageAttachment } from '../src/products/shared/renderer/components/conversation-view/CatImageAttachment.tsx';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';

const id = '12345678-1234-1234-1234-123456789abc';
const initial = { policy: null, ready: true, budget: null, jobs: [], bindings: [{ id: 'cat-bot', name: 'owner_cat_bot', linked: true }],
  capabilities: { schemaVersion: 2, revision: 'r1', maxPromptLength: 2000, maxImageBytes: 8388608,
    targets: [{ id: 'grok/native', provider: 'grok', instanceLabel: 'native', availability: 'available' }],
    profiles: [{ id: 'grok-generate', revision: 1, operation: 'image.generate', targetIds: ['grok/native'],
      agentConfigs: [{ id: 'grok-agent', model: 'grok-test', effort: 'xhigh' }], inputs: { min: 0, max: 0 }, aspectRatio: { mode: 'native', options: ['1:1'] } }] } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

test('owner explicitly enables finite image permission and gets save feedback only in Toast', async t => {
  const originalFetch = globalThis.fetch; const writes: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url, input) => {
    if (input?.method === 'PUT') { const policy = JSON.parse(String(input.body)); writes.push(policy); return json({ ...initial, policy: { ...policy, revision: 1 } }); }
    return json(initial);
  }) as typeof fetch;
  t.after(() => { cleanup(); globalThis.fetch = originalFetch; resetTestDom(); });
  const view = render(<I18nProvider locale="en"><CatImagePolicyCard catId="cat-one" /></I18nProvider>);
  await waitFor(() => view.getByLabelText('Allow image generation'));
  assert.equal((view.getByLabelText('Allow image generation') as HTMLInputElement).checked, false);
  assert.equal((view.getByLabelText('Allow occasional images from this Cat') as HTMLInputElement).checked, false);
  fireEvent.click(view.getByLabelText('Allow image generation'));
  fireEvent.click(view.getByLabelText('Allow occasional images from this Cat'));
  fireEvent.change(view.getByLabelText('Generation attempts per day'), { target: { value: '2' } });
  fireEvent.click(view.getByRole('button', { name: 'Save permission' }));
  await waitFor(() => assert.equal(writes.length, 1));
  assert.equal(writes[0]!.enabled, true); assert.equal(writes[0]!.proactive, true); assert.equal(writes[0]!.dailyLimit, 2);
  assert.equal(writes[0]!.totalLimit, 10); assert.equal(writes[0]!.minIntervalMinutes, 60); assert.equal(writes[0]!.bindingId, 'cat-bot');
  assert.equal('ownerActorId' in writes[0]!, false); assert.equal('accountId' in writes[0]!, false);
  await waitFor(() => assert.match(view.container.querySelector('.toast')?.textContent ?? '', /Image permission saved/));
  assert.equal(view.container.querySelectorAll('.companionFormRow .toast').length, 0);
});

test('an uncertain delivery needs owner confirmation and retries only the original image ID', async t => {
  const originalFetch = globalThis.fetch; const originalConfirm = window.confirm;
  const posts: string[] = []; let confirm = false;
  const status = { ...initial, jobs: [{ id, prompt: 'A friendly morning cat', status: 'succeeded', delivery: { status: 'uncertain' } }] };
  globalThis.fetch = (async (url, input) => { if (input?.method === 'POST') posts.push(String(url)); return json(status); }) as typeof fetch;
  window.confirm = () => confirm;
  t.after(() => { cleanup(); globalThis.fetch = originalFetch; window.confirm = originalConfirm; resetTestDom(); });
  const view = render(<I18nProvider locale="en"><CatImagePolicyCard catId="cat-one" /></I18nProvider>);
  await waitFor(() => view.getByRole('button', { name: 'Resend this image' }));
  fireEvent.click(view.getByRole('button', { name: 'Resend this image' })); assert.deepEqual(posts, []);
  confirm = true; fireEvent.click(view.getByRole('button', { name: 'Resend this image' }));
  await waitFor(() => assert.deepEqual(posts, [`/api/cats/cat-one/images/${id}/retry`]));
  await waitFor(() => assert.match(view.container.querySelector('.toast')?.textContent ?? '', /original image is queued/));
});

test('a managed Cat image renders its authorized same-origin asset and rejects arbitrary attachment paths', t => {
  t.after(() => { cleanup(); resetTestDom(); });
  const attachment = { schemaVersion: 1, catId: 'cat-one', jobId: id, sha256: 'a'.repeat(64), mimeType: 'image/png', width: 1024, height: 1024 };
  const view = render(<I18nProvider locale="zh-TW"><CatImageAttachment metadata={{ catImageAttachment: attachment }} /></I18nProvider>);
  const image = view.getByRole('img', { name: 'Cat 為你製作的圖片' });
  assert.equal(image.getAttribute('src'), `/api/cats/cat-one/images/${id}/image`);
  view.rerender(<CatImageAttachment metadata={{ catImageAttachment: { ...attachment, catId: 'https://external.invalid/pixel' } }} />);
  assert.equal(view.queryByRole('img'), null);
});

test('stopping an uncertain delivery asks the owner and keeps the previous outcome unknown', async t => {
  const originalFetch = globalThis.fetch; const originalConfirm = window.confirm;
  let stopped = false;
  globalThis.fetch = (async (url, input) => {
    if (input?.method === 'POST') { assert.equal(String(url), `/api/cats/cat-one/images/${id}/cancel`); stopped = true; }
    return json({ ...initial, jobs: [{ id, prompt: 'Morning cat', status: 'succeeded',
      delivery: { status: 'uncertain', ...(stopped ? { abandonedAt: '2026-10-23T08:00:00Z' } : {}) } }] });
  }) as typeof fetch;
  window.confirm = () => true;
  t.after(() => { cleanup(); globalThis.fetch = originalFetch; window.confirm = originalConfirm; resetTestDom(); });
  const view = render(<I18nProvider locale="en"><CatImagePolicyCard catId="cat-one" /></I18nProvider>);
  await waitFor(() => view.getByRole('button', { name: 'Stop delivery' }));
  fireEvent.click(view.getByRole('button', { name: 'Stop delivery' }));
  await waitFor(() => assert.equal(stopped, true));
  await waitFor(() => view.getByText(/Sending stopped · past delivery outcome unknown/));
  assert.equal(view.queryByRole('button', { name: 'Stop delivery' }), null);
});

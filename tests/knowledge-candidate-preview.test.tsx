import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ArtifactDetailView } from '../src/products/code/renderer/components/ArtifactDetailView.tsx';
import { readKnowledgeCandidatePreview } from '../src/products/code/shared/knowledgeCandidatePreview.ts';

afterEach(() => { cleanup(); resetTestDom(); });
function metadata() {
  return { source: 'preview-knowledge-authoring', knowledgeCandidate: {
    schemaVersion: 1, state: 'unverified', draft: {
      knowledge: { entries: [{ id: 'code.recovery', content: {
        en: '<script>unsafe()</script> Verify cleanup.', 'zh-TW': '取消後仍須確認清理。',
      } }] }, counterexamples: ['A cancellation acknowledgement does not prove cleanup.'],
    },
  } };
}

test('actual artifact page shows both languages as text without invoking a provider', async t => {
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL) => {
    requests.push(String(url));
    return Response.json({ artifact: { id: 'candidate', title: 'Contribution', kind: 'dataset',
      status: 'draft', path: null, summary: null, updatedAt: '', metadata: metadata() },
      task: null, workItem: null, project: null, conversation: null, relatedArtifacts: [],
      focus: { kind: 'artifact', isReady: false, isPublished: false } });
  });
  const view = render(<MemoryRouter initialEntries={['/code/artifacts/candidate']}>
    <Routes><Route path="/code/artifacts/:artifactId" element={<ArtifactDetailView />} /></Routes>
  </MemoryRouter>);
  await waitFor(() => assert.ok(view.getByText('取消後仍須確認清理。')));
  assert.ok(view.getByText('<script>unsafe()</script> Verify cleanup.'));
  assert.ok(view.getByText(/Catlas and Orchestrator have not adopted/u));
  assert.equal(view.container.querySelector('script'), null);
  assert.equal(view.container.querySelector('iframe'), null);
  assert.equal(requests.length, 1);
  assert.match(requests[0]!, /artifacts\/candidate$/u);
});

test('legacy artifacts and malformed or oversized snapshots retain the normal preview fallback', () => {
  assert.equal(readKnowledgeCandidatePreview(undefined), null);
  assert.equal(readKnowledgeCandidatePreview({ source: 'preview-knowledge-authoring' }), null);
  for (const kind of ['adopted', 'missing-language', 'duplicate', 'oversized'] as const) {
    const input = metadata(), candidate = input.knowledgeCandidate;
    if (kind === 'adopted') candidate.state = 'promoted';
    if (kind === 'missing-language') candidate.draft.knowledge.entries[0]!.content.en = '';
    if (kind === 'duplicate') candidate.draft.knowledge.entries.push(candidate.draft.knowledge.entries[0]!);
    if (kind === 'oversized') candidate.draft.knowledge.entries[0]!.content.en = 'x'.repeat(16_001);
    assert.equal(readKnowledgeCandidatePreview(input), null, kind);
  }
});

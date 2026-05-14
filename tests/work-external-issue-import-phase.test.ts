import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveWorkExternalIssueImportPhase,
} from '../src/products/work/shared/workExternalIssueImportPhase.js';

test('external issue import phase matches explicit GitHub issue import requests', () => {
  const result = resolveWorkExternalIssueImportPhase({
    rawText: 'Boss Cat, import https://github.com/cats-inc/cats-platform/issues/42',
  });

  assert.equal(result.kind, 'matched');
  assert.equal(result.kind === 'matched' ? result.phase : null, 'external_tracker_binding');
  assert.equal(result.kind === 'matched' ? result.external.provider : null, 'github');
  assert.equal(result.kind === 'matched' ? result.external.externalType : null, 'issue');
  assert.equal(result.kind === 'matched' ? result.external.externalId : null, '42');
});

test('external issue import phase matches Redmine and Bugzilla issue imports', () => {
  const redmine = resolveWorkExternalIssueImportPhase({
    rawText: '匯入 https://redmine.example.com/issues/987 到 Cats Work',
  });
  const bugzilla = resolveWorkExternalIssueImportPhase({
    rawText: 'import https://bugzilla.example.com/show_bug.cgi?id=123',
  });

  assert.equal(redmine.kind, 'matched');
  assert.equal(redmine.kind === 'matched' ? redmine.external.provider : null, 'redmine');
  assert.equal(redmine.kind === 'matched' ? redmine.external.externalId : null, '987');
  assert.equal(bugzilla.kind, 'matched');
  assert.equal(bugzilla.kind === 'matched' ? bugzilla.external.provider : null, 'bugzilla');
  assert.equal(bugzilla.kind === 'matched' ? bugzilla.external.externalId : null, '123');
});

test('external issue import phase accepts common Chinese import cues', () => {
  for (const cue of ['加進系統', '匯進', '收進來', '撈進'] as const) {
    const result = resolveWorkExternalIssueImportPhase({
      rawText: `${cue} https://github.com/cats-inc/cats-platform/issues/43`,
    });

    assert.equal(result.kind, 'matched');
    assert.equal(result.kind === 'matched' ? result.external.externalId : null, '43');
  }
});

test('external issue import phase trims common closing punctuation from URLs', () => {
  const markdown = resolveWorkExternalIssueImportPhase({
    rawText: 'import [issue](https://github.com/cats-inc/cats-platform/issues/44)',
  });
  const bracket = resolveWorkExternalIssueImportPhase({
    rawText: 'import https://github.com/cats-inc/cats-platform/issues/45]',
  });

  assert.equal(markdown.kind, 'matched');
  assert.equal(markdown.kind === 'matched' ? markdown.external.externalId : null, '44');
  assert.equal(markdown.kind === 'matched' ? markdown.externalUrl : null,
    'https://github.com/cats-inc/cats-platform/issues/44');
  assert.equal(bracket.kind, 'matched');
  assert.equal(bracket.kind === 'matched' ? bracket.external.externalId : null, '45');
  assert.equal(bracket.kind === 'matched' ? bracket.externalUrl : null,
    'https://github.com/cats-inc/cats-platform/issues/45');
});

test('external issue import phase ignores binding turns and unsupported URLs', () => {
  assert.equal(
    resolveWorkExternalIssueImportPhase({
      rawText: 'Link work-item-alpha to https://github.com/cats-inc/cats-platform/issues/42',
    }).kind,
    'none',
  );
  assert.equal(
    resolveWorkExternalIssueImportPhase({
      rawText: 'import https://gitlab.com/cats-inc/cats-platform/-/issues/42',
    }).kind,
    'none',
  );
  assert.equal(
    resolveWorkExternalIssueImportPhase({
      rawText: '/work import https://github.com/cats-inc/cats-platform/issues/42',
    }).kind,
    'none',
  );
});

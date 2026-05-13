import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inferExternalIssueImportSourceFromUrl,
} from '../src/products/work/integrations/externalIssueImportSources.js';

test('external issue import source resolver maps GitHub issue URLs to repository config', () => {
  assert.deepEqual(
    inferExternalIssueImportSourceFromUrl(
      'https://github.com/cats-inc/cats-platform/issues/123?from=chat',
    ),
    {
      provider: 'github',
      externalType: 'issue',
      externalId: '123',
      externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
      owner: 'cats-inc',
      repo: 'cats-platform',
      repository: 'cats-inc/cats-platform',
    },
  );

  assert.equal(
    inferExternalIssueImportSourceFromUrl('https://github.com/cats-inc/cats-platform/pull/123'),
    null,
  );
});

test('external issue import source resolver maps self-hosted Redmine URLs to base URL config', () => {
  assert.deepEqual(
    inferExternalIssueImportSourceFromUrl(
      'https://tracker.example.test/redmine/issues/77#note-1',
      'redmine',
    ),
    {
      provider: 'redmine',
      externalType: 'ticket',
      externalId: '77',
      externalUrl: 'https://tracker.example.test/redmine/issues/77',
      baseUrl: 'https://tracker.example.test/redmine',
    },
  );

  assert.deepEqual(
    inferExternalIssueImportSourceFromUrl(
      'https://redmine.example.test/issues/78',
    ),
    {
      provider: 'redmine',
      externalType: 'ticket',
      externalId: '78',
      externalUrl: 'https://redmine.example.test/issues/78',
      baseUrl: 'https://redmine.example.test',
    },
  );
});

test('external issue import source resolver maps Bugzilla URLs to base URL config', () => {
  assert.deepEqual(
    inferExternalIssueImportSourceFromUrl(
      'https://bugs.example.test/bugzilla/show_bug.cgi?id=1888&ctype=xml',
      'bugzilla',
    ),
    {
      provider: 'bugzilla',
      externalType: 'ticket',
      externalId: '1888',
      externalUrl: 'https://bugs.example.test/bugzilla/show_bug.cgi?id=1888',
      baseUrl: 'https://bugs.example.test/bugzilla',
    },
  );

  assert.deepEqual(
    inferExternalIssueImportSourceFromUrl(
      'https://bugzilla.mozilla.org/show_bug.cgi?id=1889',
    ),
    {
      provider: 'bugzilla',
      externalType: 'ticket',
      externalId: '1889',
      externalUrl: 'https://bugzilla.mozilla.org/show_bug.cgi?id=1889',
      baseUrl: 'https://bugzilla.mozilla.org',
    },
  );
});

test('external issue import source resolver ignores unsafe or unsupported URLs', () => {
  assert.equal(
    inferExternalIssueImportSourceFromUrl(
      'https://user:pass@github.com/cats-inc/cats-platform/issues/123',
    ),
    null,
  );
  assert.equal(
    inferExternalIssueImportSourceFromUrl(
      'https://gitlab.com/cats-inc/cats-platform/-/issues/123',
    ),
    null,
  );
  assert.equal(
    inferExternalIssueImportSourceFromUrl('javascript:alert(1)'),
    null,
  );
  assert.equal(
    inferExternalIssueImportSourceFromUrl('not a url'),
    null,
  );
});

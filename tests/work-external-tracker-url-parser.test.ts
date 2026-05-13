import assert from 'node:assert/strict';
import test from 'node:test';

import { inferExternalTrackerBindingFromUrl } from '../src/products/work/shared/externalTrackerUrls.ts';

test('external tracker URL parser infers common issue tracker bindings', () => {
  assert.deepEqual(
    inferExternalTrackerBindingFromUrl(
      'https://github.com/cats-inc/cats-platform/issues/123',
    ),
    {
      externalId: '123',
      externalType: 'issue',
      provider: 'github',
    },
  );

  assert.deepEqual(
    inferExternalTrackerBindingFromUrl(
      'https://gitlab.com/cats-inc/cats-platform/-/issues/42',
    ),
    {
      externalId: '42',
      externalType: 'issue',
      provider: 'gitlab',
    },
  );

  assert.deepEqual(
    inferExternalTrackerBindingFromUrl(
      'https://bugzilla.mozilla.org/show_bug.cgi?id=1888',
    ),
    {
      externalId: '1888',
      externalType: 'ticket',
      provider: 'bugzilla',
    },
  );
});

test('external tracker URL parser uses selected provider for self-hosted URLs', () => {
  assert.deepEqual(
    inferExternalTrackerBindingFromUrl(
      'https://tracker.example.test/issues/77',
      'redmine',
    ),
    {
      externalId: '77',
      externalType: 'ticket',
      provider: 'redmine',
    },
  );

  assert.deepEqual(
    inferExternalTrackerBindingFromUrl(
      'https://tracker.example.test/projects/cats-platform',
      'redmine',
    ),
    {
      externalId: 'cats-platform',
      externalType: 'project',
      provider: 'redmine',
    },
  );

  assert.deepEqual(
    inferExternalTrackerBindingFromUrl(
      'https://git.example.test/org/repo/issues/9',
      'gitea',
    ),
    {
      externalId: '9',
      externalType: 'issue',
      provider: 'gitea',
    },
  );
});

test('external tracker URL parser ignores non-http and unrecognized URLs', () => {
  assert.equal(inferExternalTrackerBindingFromUrl('javascript:alert(1)'), null);
  assert.equal(inferExternalTrackerBindingFromUrl('not a url'), null);
  assert.equal(inferExternalTrackerBindingFromUrl('https://example.test/nope'), null);
});

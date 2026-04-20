import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCodeArtifactPath,
  CODE_ARTIFACTS_PATH,
  CODE_BUILD_PATH,
  CODE_RELAY_PATH,
  CODE_ROUTE_PREFIX,
  isCodeBuildPath,
  isCodeRelayPath,
} from '../src/products/code/renderer/codePaths.ts';

test('code route helpers build stable product paths', () => {
  assert.equal(CODE_ROUTE_PREFIX, '/code');
  assert.equal(CODE_RELAY_PATH, '/code/relay');
  assert.equal(CODE_BUILD_PATH, '/code/build');
  assert.equal(CODE_ARTIFACTS_PATH, '/code/artifacts');
  assert.equal(buildCodeArtifactPath(), '/code/artifacts');
  assert.equal(buildCodeArtifactPath('artifact/1'), '/code/artifacts/artifact%2F1');
});

test('code route helpers identify relay and build sections from the pathname', () => {
  assert.equal(isCodeRelayPath('/code/relay'), true);
  assert.equal(isCodeRelayPath('/code/relay/thread-1'), true);
  assert.equal(isCodeRelayPath('/code/build'), false);
  assert.equal(isCodeBuildPath('/code/build'), true);
  assert.equal(isCodeBuildPath('/code/build/preview'), true);
  assert.equal(isCodeBuildPath('/code/relay'), false);
});

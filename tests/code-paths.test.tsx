import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCodeArtifactPath,
  buildCodeCodespacePath,
  CODE_ARTIFACTS_PATH,
  CODE_BUILD_PATH,
  CODE_CODESPACES_PATH,
  CODE_RELAY_PATH,
  CODE_ROUTE_PREFIX,
  isCodeBuildPath,
  isCodeCodespacesPath,
  isCodeRelayPath,
} from '../src/products/code/renderer/codePaths.ts';

test('code route helpers build stable product paths', () => {
  assert.equal(CODE_ROUTE_PREFIX, '/code');
  assert.equal(CODE_RELAY_PATH, '/code/relay');
  assert.equal(CODE_BUILD_PATH, '/code/build');
  assert.equal(CODE_ARTIFACTS_PATH, '/code/artifacts');
  assert.equal(CODE_CODESPACES_PATH, '/code/codespaces');
  assert.equal(buildCodeArtifactPath(), '/code/artifacts');
  assert.equal(buildCodeArtifactPath('artifact/1'), '/code/artifacts/artifact%2F1');
  assert.equal(buildCodeCodespacePath(), '/code/codespaces');
  assert.equal(buildCodeCodespacePath('codespace/1'), '/code/codespaces/codespace%2F1');
});

test('code route helpers identify relay and build sections from the pathname', () => {
  assert.equal(isCodeRelayPath('/code/relay'), true);
  assert.equal(isCodeRelayPath('/code/relay/thread-1'), true);
  assert.equal(isCodeRelayPath('/code/build'), false);
  assert.equal(isCodeBuildPath('/code/build'), true);
  assert.equal(isCodeBuildPath('/code/build/preview'), true);
  assert.equal(isCodeBuildPath('/code/relay'), false);
  assert.equal(isCodeCodespacesPath('/code/codespaces'), true);
  assert.equal(isCodeCodespacesPath('/code/codespaces/codespace-1'), true);
  assert.equal(isCodeCodespacesPath('/code/artifacts'), false);
});

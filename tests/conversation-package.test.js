import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConversationResponse } from '@cats-inc/platform-ui-web';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
test('packed conversation source, integrity, public exports and standalone contracts are self-contained', async () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json')));
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json')));
  const file = path.join(root, manifest.dependencies['@cats-inc/platform-ui-web'].replace(/^file:/u, ''));
  assert.equal(lock.packages['node_modules/@cats-inc/platform-ui-web'].integrity,
    `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`);
  assert.ok(manifest.bundledDependencies.includes('@cats-inc/platform-ui-web'), 'npm consumer receives the local dependency');
  const producer = path.join(root, 'packages/platform-ui-web');
  const hash = createHash('sha256');
  for (const name of [...readdirSync(path.join(producer, 'src')).map(name => `src/${name}`),
    'conversation.css', 'package.json', 'tsconfig.json', 'LICENSE', 'README.md'].sort()) {
    hash.update(name).update('\0').update(readFileSync(path.join(producer, name), 'utf8').replace(/\r\n/gu, '\n'));
  }
  const installed = path.dirname(require.resolve('@cats-inc/platform-ui-web/package.json'));
  assert.equal(JSON.parse(readFileSync(path.join(installed, 'provenance.json'))).sourceSha256, hash.digest('hex'));
  assert.equal(readFileSync(path.join(installed, 'conversation.css'), 'utf8').replace(/\r\n/gu, '\n'),
    readFileSync(path.join(producer, 'conversation.css'), 'utf8').replace(/\r\n/gu, '\n'));
  assert.throws(() => require.resolve('@cats-inc/platform-ui-web/src/ConversationResponse.tsx'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  const isolated = mkdtempSync(path.join(tmpdir(), 'cats-conversation-pack-'));
  try {
    execFileSync('tar', ['-xzf', file, '-C', isolated], { windowsHide: true });
    assert.ok(existsSync(path.join(isolated, 'package/LICENSE')));
    assert.ok(!existsSync(path.join(isolated, 'package/src')));
    const contracts = await import(pathToFileURL(path.join(isolated, 'package/dist/contracts.js')).href);
    assert.equal(contracts.readConversationPresentation({ version: 99 }), null);
    for (const name of readdirSync(path.join(isolated, 'package/dist')).filter(name => name.endsWith('.js'))) {
      const source = readFileSync(path.join(isolated, 'package/dist', name), 'utf8');
      assert.doesNotMatch(source, /(?:from\s*|import\s*\()['"](?:node:|electron|@cats-inc\/cats-platform|\.\.\/\.\.\/)/u);
      assert.doesNotMatch(source, /\b(?:fetch|localStorage|sessionStorage)\s*[.(]/u, 'presentation library has no service/profile access');
    }
  } finally { rmSync(isolated, { recursive: true, force: true }); }
});

test('packed response renders accessible failure, safe Markdown and stable ordered blocks', () => {
  const render = status => renderToStaticMarkup(React.createElement(ConversationResponse, {
    response: { version: 1, id: 'execution', phase: 'sealed', blocks: [
      { id: 'text', index: 0, kind: 'text', status: 'complete', title: null, toolName: null, toolId: null,
        text: 'Before ![image](https://example.com/private.png) [bad](javascript:alert(1))' },
      { id: 'tool', index: 1, kind: 'tool', status, title: null, toolName: 'Read', toolId: 'same', text: 'result', input: 'input', result: 'result' },
    ] }, labels: { tool: 'Tool', input: 'Input', result: 'Result', noResult: 'None', error: 'Incomplete or failed' },
    showProgressDetails: true, copyLabel: 'Copy',
  }));
  const failed = render('error');
  assert.match(failed, /aria-label="Incomplete or failed"/u);
  assert.match(failed, /data-response-id="execution:segment:text"/u);
  assert.match(failed, /data-block-id="tool"/u);
  assert.doesNotMatch(failed, /<img|href="javascript:/u);
  assert.notEqual(failed, render('complete'));
});

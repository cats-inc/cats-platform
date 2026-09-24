import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

test('desktop host shows the bootstrap window on initial load without relying only on ready-to-show', async () => {
  const source = await readFile(
    new URL('../desktop/host/main.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /const showBootstrapWindow = \(\) => \{/u);
  assert.match(source, /window\.webContents\.once\('did-finish-load', showBootstrapWindow\);/u);
  assert.match(source, /window\.once\('ready-to-show', showBootstrapWindow\);/u);
  assert.match(source, /bootstrapPageVisible = true;\s*[\r\n]+\s*await window\.loadURL/u);
});

test('late host events do not touch destroyed Electron windows during shutdown', async () => {
  const source = await readFile(new URL('../desktop/host/main.ts', import.meta.url), 'utf8');
  const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
  const helper = parsed.statements.find((statement) => ts.isFunctionDeclaration(statement)
    && statement.name?.text === 'sendMainWindowEvent');
  assert.ok(helper);
  const code = ts.transpileModule(helper.getText(parsed), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { mainWindow: null };
  vm.runInNewContext(code, context);
  const send = context.sendMainWindowEvent;
  assert.doesNotThrow(() => send('cats-host:snapshot', {}));
  context.mainWindow = { isDestroyed: () => true,
    get webContents() { assert.fail('Destroyed BrowserWindow was dereferenced.'); } };
  assert.doesNotThrow(() => send('cats-host:snapshot', {}));
  context.mainWindow = { isDestroyed: () => false,
    webContents: { isDestroyed: () => true, send: () => assert.fail('Destroyed webContents received an event.') } };
  assert.doesNotThrow(() => send('cats-host:snapshot', {}));
  const received = [];
  const payload = { phase: 'ready' };
  context.mainWindow = { isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send: (...args) => received.push(args) } };
  send('cats-host:snapshot', payload);
  assert.deepEqual(received, [['cats-host:snapshot', payload]]);
  assert.match(source, /sendMainWindowEvent\('cats-host:snapshot', enriched\)/u);
  assert.match(source, /window\.once\('closed', \(\) => \{\s*if \(mainWindow === window\) mainWindow = null;/u);
});

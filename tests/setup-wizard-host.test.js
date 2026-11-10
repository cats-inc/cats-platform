import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createPullProgressTracker, isLoopbackEndpoint, isValidOllamaModelName, listOllamaModels, pullOllamaModel,
} from '../build/desktop/ollamaModels.js';
import { SetupRunLog } from '../build/desktop/setupRunLog.js';
import { openCodexInitializationTerminal, openSignInTerminal, signInCommand, signInScript, terminalInvocation } from '../build/desktop/setupTerminal.js';
import { takeSetupWizardDraft, validSetupWizardState, writeSetupWizardDraft } from '../build/desktop/setupWizardDraft.js';
import {
  isSettingsToolsPage, isSetupHostPage, isSetupToolsPage, readSetupToolsHelperRequest, scanEvents, selectionSaveEvent,
} from '../build/desktop/setupWizardEvents.js';
import { isDesktopHostOnlyHelper, isDesktopPrerequisiteHelper } from '../build/desktop/setupAudit.js';

/* ------------------------------ The log (SPEC-136 FR-21, FR-22) ------------------------------ */

test('a run opens, closes once, and a late result cannot rewrite it', () => {
  let clock = new Date('2026-11-04T00:00:00.000Z');
  const log = new SetupRunLog({ now: () => clock });
  const id = log.start({ kind: 'check', label: 'Install-Node.ps1', command: 'powershell.exe -File x -CheckOnly -Json' });
  assert.equal(log.list()[0].endedAt, null);
  clock = new Date('2026-11-04T00:00:02.500Z');
  log.finish(id, { status: 'ready', version: '22.12.0', planned: [], applied: [] });
  assert.equal(log.list()[0].status, 'ready');
  assert.equal(log.list()[0].tookMs, 2500);
  assert.equal(log.finish(id, { status: 'failed' }), null);
  assert.equal(log.list()[0].status, 'ready');
  assert.equal(log.finish(999, { status: 'failed' }), null);
});

test('the log keeps the latest runs, and a long report stays bounded', () => {
  const log = new SetupRunLog({ limit: 3 });
  for (let index = 0; index < 5; index += 1) log.start({ kind: 'check', label: `run ${index}`, command: 'x' });
  assert.deepEqual(log.list().map((run) => run.label), ['run 2', 'run 3', 'run 4']);
  const id = log.start({ kind: 'change', label: 'big', command: 'x'.repeat(10_000) });
  const finished = log.finish(id, { error: 'y'.repeat(10_000), warnings: Array.from({ length: 200 }, () => 'w') });
  assert.ok(finished.command.length < 4_100);
  assert.ok(finished.error.length < 4_100);
  assert.equal(finished.warnings.length, 50);
});

test('host.log gets fixed words only, and listeners cannot break a run', () => {
  const records = [];
  const log = new SetupRunLog({
    record: (fields) => records.push(fields),
    onChange: () => { throw new Error('the window is gone'); },
    redact: (text) => text.replaceAll('secret-value', '[redacted]'),
  });
  const id = log.start({ kind: 'change', label: 'Install-Codex.ps1', command: 'run secret-value' });
  log.finish(id, { status: 'failed', error: 'secret-value leaked', applied: ['one'] });
  assert.equal(log.list()[0].command, 'run [redacted]');
  assert.equal(log.list()[0].error, '[redacted] leaked');
  assert.deepEqual(Object.keys(records[0]).sort(), ['changes', 'kind', 'label', 'status', 'tookMs']);
  assert.equal(JSON.stringify(records).includes('leaked'), false);
});

/* ------------------------------ The terminal (FR-24) ------------------------------ */

test('each provider has one fixed sign-in command, and nothing else has any', () => {
  assert.equal(signInCommand('codex'), 'codex login');
  assert.equal(signInCommand('claude'), 'claude');
  assert.equal(signInCommand('devin'), 'devin auth login');
  for (const value of ['calc.exe', 'constructor', '__proto__', 'codex & calc', 'cursor', '', 42, null, {}]) {
    assert.equal(signInCommand(value), null, String(value));
  }
});

test('Windows opens Command Prompt in its own window, which needs no PowerShell policy', () => {
  const invocation = terminalInvocation('win32', 'codex login', { ComSpec: 'C:\\Windows\\system32\\cmd.exe' });
  assert.equal(invocation.command, 'C:\\Windows\\system32\\cmd.exe');
  assert.deepEqual(invocation.args, ['/c', 'start', 'Cats Setup', 'C:\\Windows\\system32\\cmd.exe', '/k', 'codex login']);
  // Node quotes only arguments with a space, and `start` reads an unquoted title as the program.
  assert.match(invocation.args[2], / /);
  assert.equal(invocation.script, undefined);
});

test('macOS and Linux run a script that carries PATH, and Linux with no terminal says so', () => {
  const mac = terminalInvocation('darwin', 'grok login', { PATH: '/Users/cat/.grok/bin:/usr/bin' });
  assert.equal(mac.command, 'open');
  assert.match(mac.script, /export PATH='\/Users\/cat\/\.grok\/bin:\/usr\/bin'/);
  assert.equal(terminalInvocation('linux', 'claude', { PATH: '' }, () => false), null);
  assert.equal(terminalInvocation('linux', 'claude', { PATH: '' }, (program) => program === 'xterm').command, 'xterm');
  assert.match(signInScript('claude', "it's"), /'it'\\''s'/);
});

test('a page cannot make the terminal run anything else, and a failed launch offers the command', async () => {
  const launched = [];
  const launch = (command, args) => {
    launched.push([command, args]);
    const child = new EventEmitter();
    child.unref = () => {};
    queueMicrotask(() => child.emit('error', new Error('no shell')));
    return child;
  };
  assert.deepEqual(await openSignInTerminal('calc & whoami', { platform: 'win32', launch, freshEnv: async (env) => env }), { opened: false, command: null });
  assert.equal(launched.length, 0);
  assert.deepEqual(await openSignInTerminal('codex', { platform: 'win32', env: {}, launch, freshEnv: async (env) => env }), { opened: false, command: 'codex login' });
  assert.equal(launched.length, 1);
});

/* ------------------------------ Ollama (FR-25) ------------------------------ */

test('Codex initialization uses Command Prompt, an owned folder and the existing profile without a policy change', async t => {
  const calls = [];
  const launch = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter(); child.unref = () => {};
    queueMicrotask(() => child.emit('spawn')); return child;
  };
  const env = { ComSpec: 'cmd.exe', CODEX_HOME: 'same-profile' };
  const cwd = mkdtempSync(join(tmpdir(), 'cats-codex-terminal-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const result = await openCodexInitializationTerminal({ platform: 'win32', env, cwd, launch, freshEnv: async value => value });
  assert.deepEqual(result, { opened: true, command: 'codex' });
  assert.equal(calls[0].args.at(-1), 'codex');
  assert.equal(calls[0].options.cwd, cwd);
  assert.equal(calls[0].options.env, env);
  assert.ok(!calls[0].args.some(arg => /powershell|ExecutionPolicy|--yolo/u.test(arg)));
  assert.deepEqual(await openCodexInitializationTerminal({ platform: 'darwin', launch }), { opened: false, command: null });
});

test('only a loopback endpoint and a plain model name are accepted', async () => {
  assert.equal(isLoopbackEndpoint('http://127.0.0.1:11434'), true);
  assert.equal(isLoopbackEndpoint('http://localhost:11434'), true);
  assert.equal(isLoopbackEndpoint('http://10.0.0.2:11434'), false);
  assert.equal(isLoopbackEndpoint('http://127.0.0.1.evil.example/'), false);
  assert.equal(isLoopbackEndpoint('file:///etc/passwd'), false);
  assert.equal(isValidOllamaModelName('qwen2.5-coder:7b'), true);
  assert.equal(isValidOllamaModelName('library/llama3.2'), true);
  for (const name of ['', ' llama', 'a b', '-rm', '../x;rm', 42, null]) assert.equal(isValidOllamaModelName(name), false, String(name));
  let called = false;
  await assert.rejects(listOllamaModels('http://10.0.0.2:11434', { fetch: async () => { called = true; return Response.json({}); } }));
  await assert.rejects(pullOllamaModel('http://127.0.0.1:11434', 'a b', { fetch: async () => { called = true; return Response.json({}); } }));
  assert.equal(called, false);
});

test('the overall figure only moves forward through a pull, and 100 means finished', () => {
  const track = createPullProgressTracker('m');
  assert.equal(track({ status: 'pulling manifest' }).percent, null);
  assert.equal(track({ status: 'pulling', digest: 'a', total: 100, completed: 50 }).percent, 50);
  assert.equal(track({ status: 'pulling', digest: 'b', total: 900, completed: 0 }).percent, 50);
  assert.equal(track({ status: 'pulling', digest: 'b', total: 900, completed: 900 }).percent, 95);
  assert.equal(track({ status: 'success' }).percent, 100);
});

const pullReply = (lines) => new Response(new ReadableStream({
  start(controller) {
    for (const line of lines) controller.enqueue(new TextEncoder().encode(line));
    controller.close();
  },
}));

test('a pull reports progress across chunks, and only success counts as finished', async () => {
  const seen = [];
  await pullOllamaModel('http://127.0.0.1:11434', 'm', {
    fetch: async (url, init) => {
      assert.equal(url, 'http://127.0.0.1:11434/api/pull');
      assert.deepEqual(JSON.parse(init.body), { model: 'm', stream: true });
      return pullReply(['{"status":"pulling","digest":"a","total":10,', '"completed":5}\n{"status":"success"}\n']);
    },
    onProgress: (progress) => seen.push(progress.percent),
  });
  assert.deepEqual(seen, [50, 100]);
  await assert.rejects(pullOllamaModel('http://127.0.0.1:11434', 'm', { fetch: async () => pullReply(['{"status":"pulling"}\n']) }), /stopped before/);
  await assert.rejects(pullOllamaModel('http://127.0.0.1:11434', 'm', { fetch: async () => pullReply(['{"error":"disk full"}\n']) }), /disk full/);
  await assert.rejects(pullOllamaModel('http://127.0.0.1:11434', 'm', { fetch: async () => new Response('', { status: 500 }) }), /500/);
});

/* ------------------------------ What the wizard remembers (FR-39) ------------------------------ */

test('the draft is read once, and an unusable one leaves nothing behind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cats-setup-draft-'));
  const path = join(dir, 'nested', 'setup-wizard-draft.json');
  assert.equal(takeSetupWizardDraft(path), null);
  writeSetupWizardDraft(path, { page: 2, ticked: ['node'] });
  if (process.platform !== 'win32') assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.deepEqual(takeSetupWizardDraft(path), { page: 2, ticked: ['node'] });
  assert.equal(existsSync(path), false);
  writeSetupWizardDraft(path, { page: 1 });
  writeFileSync(path, '{not json');
  assert.equal(takeSetupWizardDraft(path), null);
  assert.equal(existsSync(path), false);
});

test('only a bounded plain object counts as wizard state', () => {
  assert.deepEqual(validSetupWizardState({ page: 1 }), { page: 1 });
  for (const value of [null, 'x', 3, [], undefined]) assert.equal(validSetupWizardState(value), null);
  assert.equal(validSetupWizardState({ big: 'x'.repeat(300 * 1024) }), null);
});

/* ------------------------------ What the record gets (FR-37) ------------------------------ */

test('a save and a scan leave evidence, in fixed words plus the error text', () => {
  assert.equal(selectionSaveEvent(2).kind, 'selection_saved');
  const failed = selectionSaveEvent(2, new Error('disk full'));
  assert.equal(failed.kind, 'selection_save_failed');
  assert.equal(failed.errorMessage, 'disk full');
  const claw = { provider: 'openclaw', backend: 'agent', instance: 'gateway' };
  const cli = { provider: 'codex', backend: 'cli', instance: 'native' };
  assert.deepEqual(scanEvents([cli], [{ ...cli, commandStatus: 'ready' }]), []);
  assert.equal(scanEvents([claw], [{ ...claw, connectionStatus: 'connected' }])[0].kind, 'connection_tested');
  const refused = scanEvents([claw], [{ ...claw, connectionStatus: 'failed', detail: 'ECONNREFUSED' }])[0];
  assert.equal(refused.kind, 'connection_test_failed');
  assert.equal(refused.errorMessage, 'ECONNREFUSED');
  assert.equal(scanEvents([cli], undefined, new Error('down'))[0].kind, 'scan_failed');
});

test('wizard state belongs to the host page alone: a Platform page is not it', () => {
  assert.equal(isSetupHostPage('data:text/html;base64,PGh0bWw+'), true);
  assert.equal(isSetupHostPage('http://127.0.0.1:8181/setup'), false);
  assert.equal(isSetupHostPage('http://127.0.0.1:8181/settings/runtime'), false);
  assert.equal(isSetupHostPage(''), false);
  assert.equal(isSetupHostPage(undefined), false);
});

test('SPEC-137: helpers, terminals and models also run from Settings > Runtime, and nowhere else on Platform', () => {
  const app = 'http://127.0.0.1:8181';
  assert.equal(isSettingsToolsPage(`${app}/settings/runtime`, app), true);
  assert.equal(isSettingsToolsPage(`${app}/settings/runtime?tab=x#top`, app), true);
  assert.equal(isSettingsToolsPage(`${app}/settings/runtime/more`, app), true);
  assert.equal(isSettingsToolsPage(`${app}/settings/runtimeish`, app), false);
  assert.equal(isSettingsToolsPage(`${app}/settings/general`, app), false);
  assert.equal(isSettingsToolsPage(`${app}/chat/c1`, app), false);
  assert.equal(isSettingsToolsPage(`${app}/setup`, app), false);
  assert.equal(isSettingsToolsPage('http://127.0.0.1:9999/settings/runtime', app), false, 'another port');
  assert.equal(isSettingsToolsPage('http://evil.example/settings/runtime', app), false, 'another host');
  assert.equal(isSettingsToolsPage('http://u:p@127.0.0.1:8181/settings/runtime', app), false, 'credentials');
  assert.equal(isSettingsToolsPage(`${app}/settings/runtime`, null), false, 'no app yet');
  assert.equal(isSettingsToolsPage('not a url', app), false);
  assert.equal(isSetupToolsPage('data:text/html;base64,PGh0bWw+', app), true);
  assert.equal(isSetupToolsPage(`${app}/settings/runtime`, app), true);
  assert.equal(isSetupToolsPage(`${app}/settings/data`, app), false);
});

test('SPEC-137: a helper request takes a fixed mode, and a dry run only previews an uninstall', () => {
  assert.deepEqual(readSetupToolsHelperRequest({ helperId: 'windows-claude-native-installer', mode: 'upgrade' }),
    { helperId: 'windows-claude-native-installer', mode: 'upgrade', dryRun: false });
  assert.deepEqual(readSetupToolsHelperRequest({ helperId: 'h', mode: 'uninstall', dryRun: true }), { helperId: 'h', mode: 'uninstall', dryRun: true });
  for (const mode of ['check', 'apply', 'force']) assert.equal(readSetupToolsHelperRequest({ helperId: 'h', mode }).mode, mode);
  assert.throws(() => readSetupToolsHelperRequest({ helperId: 'h', mode: 'upgrade', dryRun: true }), /only previews an uninstall/);
  assert.throws(() => readSetupToolsHelperRequest({ helperId: 'h', mode: 'apply', dryRun: 'yes' }), /Invalid/);
  assert.throws(() => readSetupToolsHelperRequest({ helperId: 'h', mode: 'shell' }), /Invalid/);
  assert.throws(() => readSetupToolsHelperRequest({ helperId: '', mode: 'check' }), /Invalid/);
  assert.throws(() => readSetupToolsHelperRequest(null), /Invalid/);
});

test('the PowerShell scripts row needs no selected provider, and stays out of the audit', () => {
  assert.equal(isDesktopHostOnlyHelper('windows-cli-readiness-helper'), true);
  assert.equal(isDesktopHostOnlyHelper('windows-node-host-installer'), true);
  assert.equal(isDesktopPrerequisiteHelper('windows-cli-readiness-helper'), false);
  assert.equal(isDesktopHostOnlyHelper('windows-codex-native-installer'), false);
});

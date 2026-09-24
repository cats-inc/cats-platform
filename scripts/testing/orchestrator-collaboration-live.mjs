#!/usr/bin/env node
/**
 * Run one owner-confirmed K3 collaboration with a real Codex Runtime.
 * Usage: node scripts/testing/orchestrator-collaboration-live.mjs --help
 * All writes use a new output directory, including provider state and Git work.
 */
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { access, copyFile, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { waitForCandidateRuntimeReady } from './runtime-candidate-readiness.mjs';

const exec = promisify(execFile);
const options = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const flag = process.argv[i];
  if (flag === '--help') {
    process.stdout.write(`Usage: node scripts/testing/orchestrator-collaboration-live.mjs [options]
  --platform-package PATH  Built or extracted Platform package (required)
  --runtime-package PATH   Built or extracted Runtime package (required)
  --codex-command PATH     Absolute installed Codex executable/shim (required)
  --auth-source PATH       Codex auth.json to copy privately (required; never printed)
  --output-dir PATH        New, absolute evidence/profile directory (required)
  --model ID               Explicit Codex model (required)
  --npm-prefix PATH        Existing Codex npm installation prefix for version inspection
  --readiness-only         Check the isolated provider configuration without inference
Copies only provider authentication into the new profile, then removes that copy
on exit. Does not import user provider configuration, skills or session history.
Runs one fixed fixture with a 5-minute/80,000-token collaboration threshold.
Tokens are measured after each response; one response can exceed the remainder. Retains
fixture data and sanitized evidence; never uses the default running services.
`);
    process.exit(0);
  }
  if (flag === '--readiness-only') { options['readiness-only'] = true; continue; }
  if (!['--platform-package', '--runtime-package', '--codex-command', '--auth-source', '--output-dir', '--model', '--npm-prefix'].includes(flag)
    || !process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error(`Invalid option: ${flag}`);
  options[flag.slice(2)] = process.argv[++i];
}
for (const name of ['platform-package', 'runtime-package', 'codex-command', 'auth-source', 'output-dir', 'model']) {
  if (!options[name]) throw new Error(`Missing --${name}`);
  if (name !== 'model' && !path.isAbsolute(options[name])) throw new Error(`--${name} must be absolute`);
}
if (options['npm-prefix'] && !path.isAbsolute(options['npm-prefix'])) throw new Error('--npm-prefix must be absolute');
const root = path.resolve(options['output-dir']);
if (root === path.parse(root).root) throw new Error('Output must not be a filesystem root');
try { await access(root); throw new Error('Output directory must not already exist'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(root, { recursive: true, mode: 0o700 });
const runtimeRoot = path.join(root, 'runtime');
const providerHome = path.join(root, 'home');
const codexHome = path.join(providerHome, '.codex');
const workspace = path.join(root, 'fixture-repo');
for (const dir of [path.join(runtimeRoot, 'config'), path.join(codexHome, 'sessions'), workspace, path.join(root, 'tmp'),
  path.join(root, 'appdata'), path.join(root, 'localappdata')]) await mkdir(dir, { recursive: true });
const authCopy = path.join(codexHome, 'auth.json');
const key = randomBytes(32).toString('hex');
let child;
let runtime;
let interrupted = false;
let cleanupPromise;
let credentialCopy;
const sessions = new Set();
const calls = [];
const runtimeLogs = [];
const report = { startedAt: new Date().toISOString(), provider: 'codex', model: options.model,
  budget: { maxDurationMs: 300_000, maxTokens: 80_000 }, status: 'starting' };
const load = relative => import(pathToFileURL(path.join(options['platform-package'], 'build/server', relative)).href);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const inheritedKeys = new Set(['path', 'pathext', 'systemroot', 'windir', 'comspec', 'systemdrive',
  'programfiles', 'programfiles(x86)', 'programw6432', 'programdata', 'os', 'number_of_processors',
  'processor_architecture', 'username', 'userdomain', 'http_proxy', 'https_proxy', 'all_proxy',
  'no_proxy', 'node_extra_ca_certs', 'ssl_cert_file', 'ssl_cert_dir']);
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => inheritedKeys.has(name.toLowerCase()))),
  HOME: providerHome, USERPROFILE: providerHome, CODEX_HOME: codexHome,
  CLAUDE_CONFIG_DIR: path.join(providerHome, '.claude'), APPDATA: path.join(root, 'appdata'),
  LOCALAPPDATA: path.join(root, 'localappdata'), TEMP: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'),
  CATS_RUNTIME_DIR: runtimeRoot, CATS_RUNTIME_PACKAGE_ROOT: options['runtime-package'],
  CATS_RUNTIME_API_KEY: key, CATS_RUNTIME_NATIVE_DISCOVERY_INTERVAL_MS: '0',
  CATS_RUNTIME_WSL_DISCOVERY_POLICY: 'manual_only', CATS_RUNTIME_DOCKER_DISCOVERY_POLICY: 'manual_only',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(root, 'gitconfig'), GIT_TERMINAL_PROMPT: '0',
  GIT_CEILING_DIRECTORIES: root, npm_config_cache: path.join(root, 'npm-cache'),
  ...(options['npm-prefix'] ? { npm_config_prefix: options['npm-prefix'] } : {}) };
async function bounded(promise, ms) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Cleanup deadline exceeded')), ms);
  })]); } finally { clearTimeout(timer); }
}
async function cleanup() {
  cleanupPromise ??= (async () => {
    await credentialCopy?.catch(() => {});
    await Promise.all([...sessions].map(async id => {
      await bounded((async () => {
        await runtime?.cancelSession(id).catch(() => {});
        await runtime?.closeSession(id).catch(() => {});
      })(), 5000).catch(() => {});
    }));
    const alive = () => child?.pid && child.exitCode === null && child.signalCode === null;
    if (alive()) {
      child.stdin.end();
      await bounded(once(child, 'exit'), 10_000).catch(() => {});
      if (alive()) {
        if (process.platform === 'win32') {
          await exec('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'],
            { env, windowsHide: true, timeout: 10_000 }).catch(() => {});
        } else {
          try { process.kill(-child.pid, 'SIGKILL'); } catch {}
        }
        if (alive()) await bounded(once(child, 'exit'), 5000);
      }
    }
    if (alive()) throw new Error('Candidate process is still alive; credential cleanup remains pending');
    await rm(authCopy, { force: true });
  })();
  return cleanupPromise;
}
async function saveEvidence() {
  report.finishedAt = new Date().toISOString();
  const messages = calls.filter(call => call.operation === 'sendMessage' && call.result);
  report.inferenceCalls = messages.length;
  report.measuredTokens = messages.reduce((sum, call) => sum + (call.result.tokensUsed ?? 0), 0);
  report.authenticationCopyRemoved = await access(authCopy).then(() => false, () => true);
  await writeFile(path.join(root, 'result.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(root, 'provider-calls.json'), JSON.stringify(calls, null, 2));
  await writeFile(path.join(root, 'runtime.log'), runtimeLogs.join(''));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  interrupted = true;
  report.status = 'interrupted';
  void cleanup().catch(error => { report.cleanupError = error.message; }).then(saveEvidence)
    .finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
});
async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
try {
  credentialCopy = copyFile(options['auth-source'], authCopy);
  await credentialCopy;
  if (interrupted) throw new Error('Interrupted before candidate startup');
  delete process.env.CATS_PLATFORM_PACKAGE_ROOT;
  process.chdir(root);
  // Provider and Git overrides apply only to candidate children, never the agent shell.
  const hookDir = path.join(root, 'empty-hooks');
  await mkdir(hookDir);
  await writeFile(env.GIT_CONFIG_GLOBAL, `[core]\n hooksPath = ${JSON.stringify(hookDir.replaceAll('\\', '/'))}\n[commit]\n gpgSign = false\n`);
  const config = { version: 1, environments: { native: { kind: 'native' } },
    routing: { providers: { codex: { default_target: { backend: 'cli', instance: 'native' } } } },
    backends: { cli: { providers: { codex: { instances: { native: { environment: 'native',
      command: options['codex-command'], runner: 'auto', sessions_dir: path.join(codexHome, 'sessions') } } } } } } };
  await writeFile(path.join(runtimeRoot, 'config/providers.yaml'), JSON.stringify(config, null, 2));
  await writeFile(path.join(workspace, 'calc.mjs'), 'export const add = (a, b) => a - b;\n');
  await writeFile(path.join(workspace, 'calc.test.mjs'), `import assert from 'node:assert/strict';
import { add } from './calc.mjs';
assert.equal(add(2, 3), 5);
assert.equal(add(-2, 3), 1);
`);
  const git = (args, cwd = workspace) => exec('git', args, { cwd, env, windowsHide: true, timeout: 10_000 });
  await git(['init', '--initial-branch=main']);
  await git(['config', 'user.name', 'K4 Fixture']);
  await git(['config', 'user.email', 'k4@example.invalid']);
  await git(['add', 'calc.mjs', 'calc.test.mjs']);
  await git(['commit', '-m', 'fixture: initial failing addition']);
  report.baselineCommitId = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  const port = await freePort();
  report.runtimePort = port;
  if (interrupted) throw new Error('Interrupted before candidate startup');
  child = spawn(process.execPath, [path.join(options['runtime-package'], 'build/runtime/index.js'),
    '--startup-mode', 'app-managed', '--managed-by', 'plan110-k4', '--ready-output', 'json',
    '--host', '127.0.0.1', '--port', String(port), '--no-open'],
  { cwd: root, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
  child.on('error', error => { runtimeLogs.push(String(error)); });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
    if (runtimeLogs.join('').length < 100_000) runtimeLogs.push(chunk.toString().replaceAll(key, '[REDACTED]'));
  });
  // A new random port can be claimed after freePort() releases it. Never use
  // another local Runtime merely because its unauthenticated /health answers.
  const ownedReady = await waitForCandidateRuntimeReady(child, { port });
  report.runtimeLifecycle = { pid: ownedReady.pid, port: ownedReady.port,
    mode: ownedReady.mode, managedBy: ownedReady.managedBy, timestamp: ownedReady.timestamp };
  const baseUrl = `http://127.0.0.1:${port}`;
  let healthy = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Candidate Runtime exited before health verification');
    try {
      const response = await fetch(`${baseUrl}/health`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(1000) });
      if (response.ok) { healthy = true; break; }
    } catch {}
    await sleep(200);
  }
  if (!healthy) throw new Error('Candidate Runtime did not become healthy');
  const { CatsRuntimeClient } = await load('platform/runtime/client.js');
  const { createRuntimeDeliveryClient } = await load('platform/runtime/deliveryClient.js');
  const client = new CatsRuntimeClient(baseUrl, { apiKey: key, timeoutMs: 120_000,
    selectorDiagnosticsTimeoutMs: 30_000 });
  runtime = new Proxy(client, { get(target, property) {
    if (property === 'createSession') return async input => {
      const result = await target.createSession(input);
      sessions.add(result.id);
      calls.push({ operation: 'createSession', input, result: { id: result.id, cwd: result.cwd, model: result.model } });
      return result;
    };
    if (property === 'sendMessage') return async (id, content, input) => {
      const result = await target.sendMessage(id, content, input);
      calls.push({ operation: 'sendMessage', sessionId: id, content, input,
        result: { tokensUsed: result.tokensUsed, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
          segments: result.segments } });
      return result;
    };
    if (property === 'getProviderDiagnostics') return async input => {
      try {
        const result = await target.getProviderDiagnostics(input);
        calls.push({ operation: 'getProviderDiagnostics', input,
          result: { probe: result.probe, providers: result.providers.map(({ provider, instance, defaultTarget, availability }) =>
            ({ provider, instance, defaultTarget, availability })) } });
        return result;
      } catch (error) {
        calls.push({ operation: 'getProviderDiagnostics', input, error: error.message });
        throw error;
      }
    };
    const value = Reflect.get(target, property);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const delivery = createRuntimeDeliveryClient({ baseUrl, apiKey: key });
  const { createDefaultChatState } = await load('products/chat/state/defaults.js');
  const { createChannel, createCat, appendMessage } = await load('products/chat/state/model/index.js');
  const { FileChatStore } = await load('products/chat/state/store.js');
  const { appendCollaborationReport } = await load('products/chat/state/orchestratorCollaborationReport.js');
  const operations = await load('products/chat/state/orchestratorCollaboration.js');
  const execution = await load('products/chat/state/collaborationExecutionSurface.js');
  const { buildChatProviderAgentObservation } = await load('products/chat/state/providerAgentObservation.js');
  const { resolveProviderCapabilityProfile } = await load('platform/supervision/providerCapabilityProfiles.js');
  const { createChatProviderAgentDecisionRequester } = await load('products/chat/state/providerAgentDecisionRequester.js');
  const now = new Date();
  const goal = 'Create a bug-fix conversation with an implementer and a distinct reviewer. Fix calc.mjs so add(a,b) returns a+b. '
    + 'Change only calc.mjs. The fixture tests assert add(2,3)=5 and add(-2,3)=1. Do not run commands or commit; Cats will capture the local commit. '
    + 'Review the captured implementation revision, then report the actual result.';
  const policy = { dials: { autonomy: 'single_step', taskGranularity: 'tiny', toolScope: 'narrow_write',
    scaffolding: 'few_shot', validation: 'schema_required', checkpointCadence: 'every_step',
    approvalThreshold: 'high', fallbackPolicy: 'retry' }, allowedFallbacks: ['retry'] };
  let state = createChannel(createDefaultChatState(), { title: 'K4 addition fixture', topic: goal,
    originSurface: 'chat', repoPath: workspace, roomMode: 'chat_channel', responseLanguage: 'en',
    cats: [{ name: 'Implementer', provider: 'codex', roles: ['implementation'] }] }, now);
  const channelId = state.selectedChannelId;
  state = createCat(state, { name: 'Reviewer', provider: 'codex', roles: ['review'] }, now);
  const target = { provider: 'codex', instance: 'native', model: options.model };
  state.globalOrchestrator.visibleParticipant.executionTarget = target;
  for (const cat of state.cats) cat.defaultExecutionTarget = target;
  for (const channel of state.channels) for (const assignment of channel.catAssignments) assignment.execution.target = target;
  const original = appendMessage(state, channelId, { body: goal, senderKind: 'user', senderName: 'Fixture owner' }, now);
  state = original.state;
  const observe = availableTools => buildChatProviderAgentObservation({ state, channelId, actorRef: 'orchestrator',
    capabilityProfile: resolveProviderCapabilityProfile(target, { assessedAt: now.toISOString() }), policy: policy.dials,
    availableTools, goal, messageCharacterCount: goal.length,
    routing: { trigger: 'room_default', resolution: { selectionKind: 'default_target' }, targetCount: 1,
      unresolvedCount: 0, mentionCount: 0 }, now });
  const snapshot = operations.collaborationSnapshot(state, channelId, observe(operations.collaborationToolDescriptors(policy)));
  const receipts = [];
  report.phase = 'provider-readiness';
  // Codex live compatibility diagnostics invoke version/help only, no inference.
  const diagnostics = await runtime.getProviderDiagnostics({ probe: 'live', provider: 'codex', instance: 'native' });
  report.readiness = diagnostics.providers.map(({ provider, instance, availability }) => ({ provider, instance, availability }));
  assert.equal(diagnostics.providers.find(entry => entry.provider === 'codex' && entry.instance === 'native')?.availability.status,
    'ok', 'Strict worker readiness is required before spending coordinator tokens');
  if (options['readiness-only']) {
    report.status = 'ready';
    report.inferenceCalls = 0;
  } else {
    report.phase = 'collaboration';
    for (const [toolName, toolInput] of [[operations.DISCOVER_COLLABORATION_CATS, {}],
      [operations.INSPECT_COLLABORATION_CONTEXT, {}], [operations.PREPARE_COLLABORATION, {
        revision: snapshot.revision, implementerId: state.cats.find(cat => cat.name === 'Implementer').id,
        reviewerId: state.cats.find(cat => cat.name === 'Reviewer').id, conversationIntent: 'create',
        expectedOutput: 'A captured local revision fixing addition, followed by an independent review.',
        missingInformation: [], budget: report.budget }]]) {
      const result = operations.executeCollaborationRead({ toolName, toolInput, snapshot, goal, receipts, diagnostics });
      receipts.push({ toolName, decisionId: toolName, result });
    }
    const preparation = receipts.at(-1).result.result;
    assert.equal(preparation.status, 'prepared');
    const published = appendCollaborationReport({ state, channelId, sourceMessageId: original.message.id,
      report: { schemaVersion: 1, revision: snapshot.revision, status: 'prepared', preparation,
        feedbackDelivered: true, receipts }, locale: 'en', now, canExecute: true });
    const choiceResponse = { sourceMessageId: published.resultMessage.id, status: 'submitted',
      answers: [{ question: published.resultMessage.choices[0].question, selectedOptionIds: [execution.ACCEPT_COLLABORATION] }],
      submittedAt: now.toISOString() };
    state = appendMessage(published.state, channelId, { body: 'Execute the confirmed proposal.', senderKind: 'user',
      senderName: 'Fixture owner' }, now, { choiceResponse }).state;
    const store = new FileChatStore(path.join(root, 'platform/state/chat-state.local.json'));
    await store.write(state);
    const requester = createChatProviderAgentDecisionRequester({ chatStore: store, readState: () => store.read(), deliveryClient: delivery });
    await requester({ state, channelId, observation: observe(execution.collaborationExecutionDescriptors()), now,
      payload: { body: 'Execute the confirmed proposal.', choiceResponse }, runtimeClient: runtime,
      isCancelled: () => interrupted, onCollaborationResult: result => { report.collaboration = result; } });
    const core = await store.readCore();
    const intent = core.tasks.find(task => task.metadata.collaborationIntent)?.metadata.collaborationIntent;
    report.intent = intent;
    report.status = intent?.status ?? 'no_intent';
    if (intent?.implementationEvidence) {
      const worktree = await realpath(intent.implementationEvidence.workspacePath);
      const suffix = path.relative(await realpath(root), worktree);
      assert.ok(suffix && !path.isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${path.sep}`));
      assert.equal((await git(['diff', '--name-only', report.baselineCommitId, intent.implementationEvidence.commitId], worktree)).stdout.trim(), 'calc.mjs');
      // Only execute the fixed fixture after verifying its bounded, pure edit.
      assert.match(await readFile(path.join(worktree, 'calc.mjs'), 'utf8'), /^export\s+const\s+add\s*=\s*\(a,\s*b\)\s*=>\s*a\s*\+\s*b;?\s*$/u);
      const tested = await exec(process.execPath, ['calc.test.mjs'], { cwd: worktree, env, windowsHide: true, timeout: 5000 });
      report.mechanicalTest = { exitCode: 0, stdout: tested.stdout, stderr: tested.stderr };
      assert.equal(intent.review?.commitId, intent.implementationEvidence.commitId);
    }
    report.sourceUnchanged = (await git(['status', '--porcelain'])).stdout.trim() === ''
      && (await git(['rev-parse', 'HEAD'])).stdout.trim() === report.baselineCommitId;
    assert.equal(report.sourceUnchanged, true);
    assert.equal(intent?.status, 'completed', intent?.reason ?? 'Collaboration did not complete');
    const countBefore = core.tasks.length;
    const callsBefore = calls.length;
    const sessionsBefore = sessions.size;
    await requester({ state: await store.read(), channelId, observation: observe(execution.collaborationExecutionDescriptors()), now,
      payload: { body: 'Execute the confirmed proposal.', choiceResponse }, runtimeClient: runtime,
      isCancelled: () => interrupted, onCollaborationResult: () => {} });
    report.duplicatePreserved = (await store.readCore()).tasks.length === countBefore;
    assert.equal(report.duplicatePreserved, true);
    assert.equal(calls.length, callsBefore);
    assert.equal(sessions.size, sessionsBefore);
  }
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  if (!interrupted) report.status = 'failed';
  process.exitCode = 1;
} finally {
  await cleanup().catch(error => { report.cleanupError = error.message; process.exitCode = 1; });
  await saveEvidence();
  process.stdout.write(JSON.stringify({ status: report.status, error: report.error,
    resultPath: path.join(root, 'result.json') }) + '\n');
}

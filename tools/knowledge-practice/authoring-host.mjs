#!/usr/bin/env node
/**
 * Explicit developer-only app sidecar for one isolated Desktop authoring task.
 * Set CATS_DESKTOP_APP_ENTRY to this file, CATS_DESKTOP_APP_ROOT to Platform,
 * CATS_DESKTOP_RUNTIME_ROOT to a built preview Runtime, and
 * CATS_KNOWLEDGE_AUTHORING_REQUEST to a private request JSON inside the candidate
 * root. Use the normal candidate Desktop launch contract. See docs/knowledge-practice.md.
 * Restart inspects the existing run; it never repeats an admitted model call.
 */
import assert from 'node:assert/strict';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { startApp } from '../../build/server/index.js';
import { loadConfig } from '../../build/server/config.js';
import { parseAppCliOptions, resolveAppStartupState } from '../../build/server/app/server/startup.js';
import { contains, digest, physical, readJson, fields } from './artifacts.mjs';
import { authorKnowledge, recoverAuthoring, readAuthoringRequest, readPreviewPolicy } from './managedAuthoring.mjs';

export async function validateAuthoringHost(env, argv) {
  const root = env.CATS_DESKTOP_CANDIDATE_ROOT;
  assert.ok(root && isAbsolute(root), 'An explicit isolated Desktop candidate is required.');
  assert.equal(await physical(root), root, 'Candidate root must be canonical.');
  const startup = resolveAppStartupState(parseAppCliOptions(argv), env);
  assert.equal(startup.mode, 'app-managed'); assert.equal(startup.managedBy, 'cats-electron');
  const config = loadConfig(env);
  const paths = {
    CATS_PLATFORM_DIR: join(root, 'cats/platform'),
    CATS_RUNTIME_DIR: join(root, 'cats/runtime'),
    CATS_DESKTOP_DIR: join(root, 'cats/desktop'),
  };
  for (const [key, value] of Object.entries(paths)) assert.equal(await physical(env[key] ?? ''), value, `${key} mismatch.`);
  assert.equal(await physical(config.chatStatePath), join(root, 'cats/platform/state/chat-state.local.json'));
  assert.equal(config.host, '127.0.0.1');
  assert.equal(String(config.port), env.CATS_DESKTOP_APP_PORT);
  assert.ok(![8181, 3110].includes(config.port));
  const runtimePort = Number(env.CATS_DESKTOP_RUNTIME_PORT);
  assert.ok(Number.isInteger(runtimePort) && runtimePort > 0 && runtimePort < 65536
    && ![8181, 3110, config.port].includes(runtimePort));
  assert.equal(config.runtimeBaseUrl, `http://127.0.0.1:${runtimePort}`);
  const requestFile = await physical(env.CATS_KNOWLEDGE_AUTHORING_REQUEST ?? '');
  assert.ok(contains(root, requestFile), 'Authoring request must belong to the candidate.');
  const runtimeRoot = env.CATS_DESKTOP_RUNTIME_ROOT;
  assert.ok(runtimeRoot && isAbsolute(runtimeRoot), 'Select the exact preview Runtime package.');
  await readPreviewPolicy(runtimeRoot);
  const request = await readAuthoringRequest(requestFile);
  const outputRoot = join(root, 'knowledge-authoring', request.id);
  assert.equal(await physical(outputRoot), outputRoot, 'Candidate output escapes through a link.');
  return { config, request, runtimeRoot, runtimeBaseUrl: config.runtimeBaseUrl,
    startFile: join(root, 'authoring-start.json'),
    outputRoot, runtimeWorkspaceRoot: join(root, 'cats/runtime/sessions') };
}

/** The native operator writes this only after observing Desktop-owned sidecars. */
export async function waitForAuthoringStart(admission, signal) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    assert.equal(await physical(admission.startFile), admission.startFile, 'Start receipt must be canonical.');
    let receipt;
    try { receipt = await readJson(admission.startFile, 4_096); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (receipt) {
      fields(receipt, ['requestDigest', 'desktopPid', 'appPid', 'runtimePid']);
      assert.equal(receipt.requestDigest, digest(admission.request));
      assert.equal(receipt.appPid, process.pid); assert.equal(receipt.desktopPid, process.ppid);
      assert.ok(Number.isSafeInteger(receipt.runtimePid) && receipt.runtimePid > 0);
      return receipt;
    }
    await delay(250, undefined, { signal });
  }
  throw new Error('Native ownership preflight was not supplied; no authoring was started.');
}

export async function runAuthoringHost(env = process.env, argv = process.argv.slice(2)) {
  // Runs before startApp can provision auth or initialize persisted state.
  const admission = await validateAuthoringHost(env, argv);
  const controller = new AbortController();
  let authoring;
  await startApp({
    async ready({ config, chatStore, runtimeClient }) {
      assert.equal(config.chatStatePath, admission.config.chatStatePath);
      assert.equal(config.runtimeBaseUrl, admission.config.runtimeBaseUrl);
      await recoverAuthoring({ ...admission, coreStore: chatStore, runtimeClient });
      if (controller.signal.aborted) return;
      authoring = (async () => {
        await waitForAuthoringStart(admission, controller.signal);
        return authorKnowledge({ ...admission, coreStore: chatStore, runtimeClient, signal: controller.signal });
      })();
      void authoring.then(receipt => {
        process.stdout.write(`${JSON.stringify({ event: 'knowledge.authoring.finished', runId: receipt.runId,
          status: receipt.status, phase: receipt.phase, cleanup: receipt.cleanup })}\n`);
      }).catch(error => { process.stderr.write(`Knowledge authoring stopped: ${error.message}\n`); });
    },
    async shutdown() { controller.abort(); await authoring?.catch(error => {
      if (error.name !== 'AbortError') throw error;
    }); },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAuthoringHost().catch(error => { process.stderr.write(`${error.message}\n`); process.exit(1); });
}

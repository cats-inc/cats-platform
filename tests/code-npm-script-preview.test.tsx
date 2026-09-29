import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreConversation } from '../src/core/model/structuralRecords.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { runStartDevPreview, type DevPreviewContext } from '../src/products/code/agentTools/devPreview.ts';
import {
  DEFAULT_LIVE_PREVIEW_CONFIG,
  NPM_SCRIPT_LIVE_PREVIEW_PROFILES,
  withBuiltinLivePreviewProfiles,
} from '../src/products/code/livePreview/contracts.ts';
import { createCodeConversationPreviews } from '../src/products/code/livePreview/conversationPreviews.ts';
import { findNpmCli, type NpmDiscoveryEnvironment } from '../src/products/code/livePreview/npmDiscovery.ts';
import type {
  LivePreviewProcessAdapter,
  LivePreviewProcessHandle,
  LivePreviewProcessSpawnInput,
} from '../src/products/code/livePreview/processAdapter.ts';
import { validateLivePreviewConfig } from '../src/products/code/livePreview/profileValidation.ts';
import { createCodeLivePreviewProcessAdapter } from '../src/products/code/livePreview/staticAdapter.ts';
import { LivePreviewSupervisor } from '../src/products/code/livePreview/supervisor.ts';
import { DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG } from '../src/products/shared/artifactCanvas/iframePolicy.ts';
import { ArtifactCanvasRenderIntentHub } from '../src/products/shared/artifactCanvas/renderIntent.ts';

const CHANNEL = 'channel-1';
const SURFACE = { kind: 'code_conversation' as const, surfaceId: CHANNEL };
const NPM_CLI = 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js';

class FakeAdapter implements LivePreviewProcessAdapter {
  readonly spawned: LivePreviewProcessSpawnInput[] = [];
  async spawn(input: LivePreviewProcessSpawnInput): Promise<LivePreviewProcessHandle> {
    this.spawned.push(input);
    return {
      processId: 7000 + this.spawned.length,
      onStdout() {}, onStderr() {}, onExit() {},
      async stop() {},
    };
  }
}

function makeSupervisor(adapter: FakeAdapter, npmCli: string | null = NPM_CLI) {
  return new LivePreviewSupervisor({
    config: withBuiltinLivePreviewProfiles({
      ...DEFAULT_LIVE_PREVIEW_CONFIG,
      commandProfiles: NPM_SCRIPT_LIVE_PREVIEW_PROFILES.map((profile) => ({ ...profile, enabled: true })),
    }),
    processAdapter: createCodeLivePreviewProcessAdapter(adapter),
    readinessProbe: async () => ({ status: 200 }),
    sleep: async () => {},
    portAvailable: async () => true,
    resolveNpmCli: () => npmCli,
  });
}

function discovery(overrides: Partial<NpmDiscoveryEnvironment> & { files: string[] }): NpmDiscoveryEnvironment {
  const files = new Set(overrides.files.map((file) => path.normalize(file)));
  return {
    env: {},
    execPath: 'C:/Cats/Cats.exe',
    platform: 'win32',
    exists: (file) => files.has(path.normalize(file)),
    realpath: (file) => file,
    ...overrides,
  };
}

test('the reviewed npm-script profiles validate and stay off until registered', () => {
  for (const profile of NPM_SCRIPT_LIVE_PREVIEW_PROFILES) assert.equal(profile.enabled, false, profile.id);
  assert.doesNotThrow(() => validateLivePreviewConfig({
    ...DEFAULT_LIVE_PREVIEW_CONFIG,
    commandProfiles: [...NPM_SCRIPT_LIVE_PREVIEW_PROFILES],
  }));
  const next = NPM_SCRIPT_LIVE_PREVIEW_PROFILES.find((profile) => profile.id === 'npm-script:next');
  assert.deepEqual(next?.args, ['{npmCli}', 'run', '{script}', '--', '-H', '127.0.0.1', '-p', '{port}']);
});

test('npm is found through npm_execpath, beside the runtime or on PATH', () => {
  assert.equal(findNpmCli(discovery({
    env: { npm_execpath: 'D:/tools/npm/bin/npm-cli.js' },
    files: ['D:/tools/npm/bin/npm-cli.js'],
  })), 'D:/tools/npm/bin/npm-cli.js');
  assert.equal(path.normalize(findNpmCli(discovery({
    env: { Path: 'C:\\Windows;C:\\Program Files\\nodejs' },
    files: ['C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'],
  })) ?? ''), path.normalize('C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'));
  assert.equal(findNpmCli(discovery({
    platform: 'linux',
    execPath: '/opt/cats/cats',
    env: { PATH: '/usr/bin:/home/me/.nvm/versions/node/v22.0.0/bin' },
    files: ['/home/me/.nvm/versions/node/v22.0.0/lib/node_modules/npm/bin/npm-cli.js'],
  })), '/home/me/.nvm/versions/node/v22.0.0/lib/node_modules/npm/bin/npm-cli.js');
  assert.equal(findNpmCli(discovery({ env: { PATH: 'C:\\Windows' }, files: [] })), null);
});

test('the supervisor renders the npm entry and script, and refuses without npm', async () => {
  const adapter = new FakeAdapter();
  const supervisor = makeSupervisor(adapter);
  const started = await supervisor.start({
    commandProfileId: 'npm-script:next',
    workspace: { kind: 'code_workspace', id: 'w', rootPath: tmpdir() },
    surface: SURFACE,
    script: 'dev',
  });
  assert.equal(started.status, 'accepted');
  assert.deepEqual(adapter.spawned[0]?.args, [NPM_CLI, 'run', 'dev', '--', '-H', '127.0.0.1', '-p', '47100']);
  assert.equal(adapter.spawned[0]?.executable, 'node');
  assert.deepEqual(adapter.spawned[0]?.env, { HOST: '127.0.0.1', BROWSER: 'none', PORT: '47100' });
  assert.equal(supervisor.getLease(started.status === 'accepted' ? started.previewId : '')?.script, 'dev');

  const noScript = await supervisor.start({
    commandProfileId: 'npm-script', workspace: { kind: 'code_workspace', id: 'w2', rootPath: tmpdir() }, surface: SURFACE,
  });
  assert.equal(noScript.status === 'rejected' ? noScript.error.code : noScript.status, 'live_preview_request_invalid');
  const badScript = await supervisor.start({
    commandProfileId: 'npm-script', workspace: { kind: 'code_workspace', id: 'w3', rootPath: tmpdir() }, surface: SURFACE,
    script: 'dev && rm -rf /',
  });
  assert.equal(badScript.status === 'rejected' ? badScript.error.code : badScript.status, 'live_preview_request_invalid');

  const withoutNpm = makeSupervisor(new FakeAdapter(), null);
  const refused = await withoutNpm.start({
    commandProfileId: 'npm-script', workspace: { kind: 'code_workspace', id: 'w', rootPath: tmpdir() }, surface: SURFACE,
    script: 'dev',
  });
  assert.equal(refused.status === 'rejected' ? refused.error.code : refused.status, 'live_preview_npm_unavailable');
  await supervisor.stopAll('test');
});

test('start_dev_preview runs a Next.js script through npm and a restart reuses the script', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'cats-npm-script-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = join(root, 'site');
  mkdirSync(join(app, 'node_modules'), { recursive: true });
  writeFileSync(join(app, 'package.json'), JSON.stringify({ scripts: { dev: 'next dev' }, dependencies: { next: '15' } }));
  const adapter = new FakeAdapter();
  const supervisor = makeSupervisor(adapter);
  const store = new MemoryCoreStore(upsertCoreConversation(createDefaultCoreState(), {
    id: `conversation-channel-${CHANNEL}`, title: 'Site', kind: 'code_thread', status: 'active',
  }).core);
  const previews = createCodeConversationPreviews({ supervisor, coreStore: store, previewServersEnabled: async () => true });
  const context: DevPreviewContext = {
    binding: { channelId: CHANNEL, conversationId: `conversation-channel-${CHANNEL}`, workspacePath: root, actorId: null, shellExecution: true },
    supervisor,
    devLeases: previews.devLeases,
    staticLeases: previews.staticLeases,
    previewServersEnabled: async () => true,
    updateCore: (mutator) => store.updateCore(mutator),
    policyConfig: DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
    hub: new ArtifactCanvasRenderIntentHub(),
    now: () => new Date(),
  };
  const result = (await runStartDevPreview({ directory: 'site' }, context)).structuredContent as Record<string, string>;
  assert.equal(result.profileId, 'npm-script:next', JSON.stringify(result));
  assert.deepEqual(adapter.spawned[0]?.args.slice(0, 3), [NPM_CLI, 'run', 'dev']);
  assert.equal(adapter.spawned[0]?.cwd, app);

  await supervisor.stop(result.previewId!, 'user_stop');
  const restarted = await previews.restartArtifact(result.artifactId!);
  assert.equal(restarted.status, 'ready');
  assert.deepEqual(adapter.spawned[1]?.args.slice(0, 3), [NPM_CLI, 'run', 'dev'], 'the recorded script runs again');
  await supervisor.stopAll('test');
});

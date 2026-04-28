import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../src/config.ts';
import { CatsRuntimeClient } from '../src/platform/runtime/client.ts';
import {
  parseProviderCapabilityBootstrapConfigYaml,
} from '../src/platform/supervision/providerCapabilityBootstrapYaml.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  buildChannelView,
  createChannel,
  requireChannel,
} from '../src/products/chat/state/model/index.ts';
import {
  beginChannelMessageDispatch,
  continueBegunChannelMessageDispatch,
} from '../src/products/chat/state/runtime-dispatch/routing.ts';

const RUN_LIVE_PROVIDER_SMOKE = process.env.CATS_CHAT_LIVE_PROVIDER_SMOKE === '1';
const LIVE_PROVIDER_IDS = (process.env.CATS_CHAT_LIVE_PROVIDERS ?? 'claude,codex')
  .split(',')
  .map((provider) => provider.trim())
  .filter((provider) => provider.length > 0);

const LIVE_TARGETS: Record<string, { instance: string | null; model: string | null }> = {
  claude: { instance: 'native', model: 'sonnet' },
  codex: { instance: 'native', model: 'gpt-5.4' },
};
const PLAN_080_BOOTSTRAP_FIXTURE_URL =
  new URL('./fixtures/provider-capability-bootstrap.yaml', import.meta.url);
const PLAN_080_BOOTSTRAP_FIXTURE_PATH = fileURLToPath(PLAN_080_BOOTSTRAP_FIXTURE_URL);

test(
  'live Claude/Codex Chat turns run through provider-agent supervision',
  {
    skip: RUN_LIVE_PROVIDER_SMOKE
      ? false
      : 'Set CATS_CHAT_LIVE_PROVIDER_SMOKE=1 to run live cats-runtime provider smoke.',
    timeout: 180_000,
  },
  async (t) => {
    assert.ok(LIVE_PROVIDER_IDS.length > 0, 'expected at least one live provider id');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-chat-live-provider-smoke-'));
    const openedSessionIds: string[] = [];
    let runtimeClient: CatsRuntimeClient | null = null;
    t.after(async () => {
      for (const sessionId of openedSessionIds) {
        await runtimeClient?.closeSession(sessionId).catch(() => {});
      }
      await rm(tempDir, { recursive: true, force: true });
    });

    const config = {
      ...loadConfig({
        ...process.env,
        CATS_PROVIDER_CAPABILITY_BOOTSTRAP_CONFIG: PLAN_080_BOOTSTRAP_FIXTURE_PATH,
      }),
      chatStatePath: tempDir,
      runtimeDataDir: tempDir,
    };
    const bootstrapResult = parseProviderCapabilityBootstrapConfigYaml(
      readFileSync(PLAN_080_BOOTSTRAP_FIXTURE_PATH, 'utf8'),
      {
        observedAt: new Date().toISOString(),
        configPath: PLAN_080_BOOTSTRAP_FIXTURE_PATH,
      },
    );
    assert.ok(
      bootstrapResult.config,
      bootstrapResult.diagnostics.map((diagnostic) => diagnostic.message).join('; '),
    );
    assert.equal(config.providerCapabilityBootstrapConfigPath, PLAN_080_BOOTSTRAP_FIXTURE_PATH);

    runtimeClient = new CatsRuntimeClient(config.runtimeBaseUrl, {
      apiKey: config.runtimeApiKey,
      timeoutMs: 120_000,
      providerRegistryTimeoutMs: 120_000,
    });
    const health = await runtimeClient.getHealth();
    assert.equal(health.reachable, true, health.error ?? 'cats-runtime must be reachable');

    for (const provider of LIVE_PROVIDER_IDS) {
      const target = LIVE_TARGETS[provider] ?? { instance: null, model: null };
      const state = createChannel(
        createDefaultChatState(),
        {
          title: `Live ${provider} Chat smoke`,
          topic: 'Live provider smoke for Chat provider-agent supervision.',
          originSurface: 'chat',
          entryKind: 'solo',
          pendingProvider: provider,
          pendingInstance: target.instance,
          pendingModel: target.model,
          skipBossCatGreeting: true,
        },
        new Date('2026-04-28T09:00:00.000Z'),
      );
      const channel = buildChannelView(state, state.selectedChannelId);
      const begun = await beginChannelMessageDispatch(
        state,
        channel.id,
        {
          body:
            `Reply with one short sentence confirming this supervised Chat smoke for ${provider}.`,
        },
        runtimeClient,
        new Date('2026-04-28T09:01:00.000Z'),
        {
          chatStatePath: tempDir,
          runtimeDataDir: tempDir,
          providerCapabilityBootstrapConfig: bootstrapResult.config,
        },
      );

      assert.equal(begun.preparedTurn?.providerAgentObservation?.actor.target.kind, 'execution_target');
      assert.equal(
        begun.preparedTurn?.providerAgentObservation?.policy.dials.taskGranularity,
        provider === 'claude' || provider === 'codex' ? 'step' : 'tiny',
      );

      const settled = await continueBegunChannelMessageDispatch(
        begun,
        channel.id,
        runtimeClient,
        new Date('2026-04-28T09:01:01.000Z'),
        {
          chatStatePath: tempDir,
          runtimeDataDir: tempDir,
        },
      );
      const settledChannel = requireChannel(settled.state, channel.id);
      const sessionStarted = settledChannel.messages.find((message) =>
        message.metadata?.event === 'session_started');
      const assistantReply = settledChannel.messages.find((message) =>
        message.metadata?.event === 'assistant_turn_segment'
        && message.metadata?.terminal === true);
      const resultSessionId = settled.results.find((result) =>
        typeof result.sessionId === 'string' && result.sessionId.length > 0)?.sessionId;
      const replySessionId = typeof assistantReply?.metadata?.sessionId === 'string'
        ? assistantReply.metadata.sessionId
        : null;
      const sessionId = sessionStarted?.metadata?.sessionId ?? resultSessionId ?? replySessionId;

      if (sessionId) {
        openedSessionIds.push(String(sessionId));
      }
      assert.ok(assistantReply);
      assert.equal(assistantReply.senderKind, 'agent');
      assert.equal(typeof assistantReply.body, 'string');
      assert.ok(assistantReply.body.length > 0);
    }
  },
);

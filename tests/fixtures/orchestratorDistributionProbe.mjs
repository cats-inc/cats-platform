// Executed in a child process beside a relocated distribution, never the checkout.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [packageRoot, layout, locale] = process.argv.slice(2);
const modules = {
  catlas: 'platform/catlas/knowledge.js',
  orchestrator: 'products/chat/state/orchestratorKnowledge.js',
  requester: 'products/chat/state/providerAgentDecisionRequester.js',
  defaults: 'products/chat/state/defaults.js',
  model: 'products/chat/state/model/index.js',
  profiles: 'platform/supervision/providerCapabilityProfiles.js',
  paths: 'shared/platformPaths.js',
};
const loaded = layout === 'bundle'
  ? await import(pathToFileURL(join(packageRoot, 'build/server/index.js')).href)
  : Object.assign({}, ...await Promise.all(Object.values(modules).map((file) =>
    import(pathToFileURL(join(packageRoot, 'build/server', file)).href))));

const now = new Date('2026-09-25T00:00:00Z');
const binding = { provider: 'claude', instance: 'distribution-coordinator', model: 'distribution-model' };
const body = locale === 'zh-TW' ? '請同伴實作並由另一位審查。' : 'Ask a teammate to implement and review this change.';
let state = loaded.createDefaultChatState();
state.globalOrchestrator.executionTarget = { ...binding };
state.globalOrchestrator.visibleParticipant.executionTarget = { ...binding };
state = loaded.createChannel(state, {
  title: 'Distribution fixture', topic: 'Isolated knowledge delivery',
  originSurface: 'chat', roomMode: 'chat_channel', responseLanguage: locale,
}, now);
const channelId = state.selectedChannelId;
const profile = loaded.resolveProviderCapabilityProfile(binding, { assessedAt: now.toISOString() });
const observation = {
  contractVersion: 1, observationId: 'distribution-observation', runId: `chat:${channelId}`,
  goal: 'Handle the next Chat turn using bounded routing metadata.',
  task: { kind: 'chat_turn', risk: 'low' },
  actor: { actorRef: 'orchestrator',
    target: { kind: 'execution_target', provider: profile.provider, model: profile.model },
    capabilityProfileRef: profile.profileId, providerRef: profile.profileId },
  policy: { dials: { autonomy: 'single_step', taskGranularity: 'tiny', toolScope: 'read_only',
    scaffolding: 'few_shot', validation: 'best_effort', checkpointCadence: 'every_step',
    approvalThreshold: 'low', fallbackPolicy: 'retry' }, allowedFallbacks: ['retry'] },
  availableTools: [], contextRefs: [`chat-channel:${channelId}`],
  summaries: [{ key: 'routing_target_count', kind: 'count', value: 1 }],
  budget: { maxDurationMs: 30_000, hardStop: true },
  invariants: ['Chat deterministic routing stays product-owned.'],
};
const response = {
  contractVersion: 1, kind: 'semantic_plan', decisionId: 'distribution-decision',
  planId: 'distribution-plan', confidence: 'medium', rationaleSummary: 'Respond within current tools.',
  steps: [{ stepId: 'respond', summary: 'Explain supported next steps.', action: 'respond' }],
};
const calls = { create: [], send: [] };
// Deliberately no skill discovery, native skill delivery, Catlas or filesystem API.
const runtimeClient = {
  async createSession(input) {
    calls.create.push(input);
    return { id: 'distribution-session', provider: input.provider, model: input.model, status: 'ready', cwd: null };
  },
  async sendMessage(sessionId, content, input) {
    calls.send.push({ sessionId, content, input });
    return { segments: [{ kind: 'text', text: JSON.stringify(response), toolName: null, toolId: null }],
      inputTokens: 1, outputTokens: 1, tokensUsed: 2 };
  },
};
// No filePath option: both production consumers must discover their own assets.
const catlas = await loaded.loadCatlasKnowledge({ locale });
const orchestrator = await loaded.loadOrchestratorKnowledge({
  channel: loaded.buildChannelView(state, channelId), body,
  surface: 'chat-decision', target: binding,
});
const decision = await loaded.createChatProviderAgentDecisionRequester()({
  state, channelId, payload: { body }, observation, runtimeClient, now,
});
process.stdout.write(JSON.stringify({
  packageRoot: loaded.resolvePlatformPackageRoot(), cwd: process.cwd(),
  rootOverride: process.env.CATS_PLATFORM_PACKAGE_ROOT ?? null,
  body, binding, catlas, orchestrator, calls, decision,
}));

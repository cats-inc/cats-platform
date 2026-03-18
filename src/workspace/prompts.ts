import type {
  GlobalOrchestratorSummary,
  MemoryCheckpointSummary,
  WorkspaceChannelPal,
  WorkspaceChannelView,
  WorkspaceMessage,
} from '../shared/app-shell.js';
import { ORCHESTRATOR_NAME } from './model.js';

function languageInstruction(responseLanguage: string): string {
  if (!responseLanguage || responseLanguage === 'en') {
    return 'Respond in English unless the user explicitly asks for another language.';
  }

  return `Respond in ${responseLanguage}. Keep code, paths, and technical identifiers in English.`;
}

function formatRecentMessages(messages: WorkspaceMessage[]): string {
  const recent = messages.slice(-6);
  if (recent.length === 0) {
    return 'No prior chat messages.';
  }

  return recent
    .map((message) => `[${message.senderKind}:${message.senderName}] ${message.body}`)
    .join('\n');
}

function formatPalRoster(channel: WorkspaceChannelView): string {
  const activePals = channel.assignedPals.filter((pal) => pal.status === 'active');
  if (activePals.length === 0) {
    return 'No active pals in this chat yet.';
  }

  return activePals
    .map((pal) => {
      const roleLabel = pal.roles.length > 0 ? pal.roles.join(', ') : 'general';
      return `- ${pal.name} (${pal.execution.target.provider}${pal.execution.target.model ? ` / ${pal.execution.target.model}` : ''}; roles: ${roleLabel})`;
    })
    .join('\n');
}

function formatMemoryCheckpoint(memory: MemoryCheckpointSummary): string {
  const lines: string[] = [];

  if (memory.summary) {
    lines.push(`Summary: ${memory.summary}`);
  }
  if (memory.facts.length > 0) {
    lines.push(`Facts: ${memory.facts.join(' | ')}`);
  }
  if (memory.openLoops.length > 0) {
    lines.push(`Open loops: ${memory.openLoops.join(' | ')}`);
  }
  if (memory.updatedAt) {
    lines.push(`Updated at: ${memory.updatedAt}`);
  }

  return lines.length > 0 ? lines.join('\n') : 'No saved memory checkpoint yet.';
}

function formatSharedContext(
  channel: WorkspaceChannelView,
  orchestrator: GlobalOrchestratorSummary,
): string {
  const lines = [
    `Chat: ${channel.title}`,
    `Topic: ${channel.topic}`,
    `Chat status: ${channel.status}`,
    `Formation mode: ${channel.formationMode}`,
  ];

  if (channel.repoPath) {
    lines.push(`Repo path: ${channel.repoPath}`);
  }
  if (channel.workspaceCwd) {
    lines.push(`Runtime cwd: ${channel.workspaceCwd}`);
  }
  if (channel.language) {
    lines.push(`Project language: ${channel.language}`);
  }
  if (channel.skillProfile) {
    lines.push(`Chat skill profile: ${channel.skillProfile}`);
  }
  if (channel.mcpProfile) {
    lines.push(`Chat MCP profile: ${channel.mcpProfile}`);
  }

  lines.push(`Global orchestrator provider: ${orchestrator.executionTarget.provider}`);
  if (orchestrator.executionTarget.model) {
    lines.push(`Global orchestrator model: ${orchestrator.executionTarget.model}`);
  }

  return lines.join('\n');
}

export function buildOrchestratorPrompt(
  channel: WorkspaceChannelView,
  orchestrator: GlobalOrchestratorSummary,
  userMessage: WorkspaceMessage,
  orchestratorName = ORCHESTRATOR_NAME,
): string {
  const activePalCount = channel.assignedPals.filter((pal) => pal.status === 'active').length;

  return [
    `You are ${orchestratorName}, the visible Boss Cat and chat coordinator for Cats Inc.`,
    'You coordinate who should act next inside this chat. Respect explicit @mentions.',
    'If the user explicitly mentions a teammate, assume they want that teammate involved.',
    'When referring to teammates, mention them with @Name so Chat can route follow-up turns.',
    activePalCount === 0
      ? 'There are no other active cats in this chat right now, so answer the user directly instead of delegating.'
      : 'If another active cat is better suited, you may mention that cat to involve them.',
    `Never address yourself with @${orchestratorName} or @${ORCHESTRATOR_NAME}.`,
    'Never output internal routing notes, self-instructions, or coordinator scratchpad text.',
    'Before repo-specific work, check for AGENTS.md in the working directory if a repo path is available.',
    languageInstruction(channel.responseLanguage),
    `Global system prompt:\n${orchestrator.systemPrompt}`,
    `Shared context:\n${formatSharedContext(channel, orchestrator)}`,
    `Coordinator memory checkpoint:\n${formatMemoryCheckpoint(orchestrator.memory)}`,
    `Active pals:\n${formatPalRoster(channel)}`,
    `Recent messages:\n${formatRecentMessages(channel.messages)}`,
    `Latest user message:\n${userMessage.body}`,
    'Respond directly to the user. Be concise, explicit about who should act, and mention teammates when needed.',
  ].join('\n\n');
}

export function buildOrchestratorRewritePrompt(
  channel: WorkspaceChannelView,
  userMessage: WorkspaceMessage,
  orchestratorName: string,
  draft: string,
): string {
  return [
    `You are ${orchestratorName}, rewriting your previous draft into the final reply for the user.`,
    'Rewrite the draft as a direct user-facing assistant response.',
    `Do not address yourself with @${orchestratorName} or @${ORCHESTRATOR_NAME}.`,
    'Do not mention routing, delegation, coordination, or what the user is asking in third person.',
    'Do not add commentary about internal process. Just give the user the answer.',
    languageInstruction(channel.responseLanguage),
    `Latest user message:\n${userMessage.body}`,
    `Draft to rewrite:\n${draft}`,
  ].join('\n\n');
}

export function buildPalPrompt(
  channel: WorkspaceChannelView,
  orchestrator: GlobalOrchestratorSummary,
  pal: WorkspaceChannelPal,
  userMessage: WorkspaceMessage,
): string {
  const roleLabel = pal.roles.length > 0 ? pal.roles.join(', ') : 'general';

  return [
    `You are ${pal.name}, a chat participant inside the Chat module for Cats Inc.`,
    `Your provider is ${pal.execution.target.provider}${pal.execution.target.model ? ` and model ${pal.execution.target.model}` : ''}.`,
    `Your roles in this chat: ${roleLabel}.`,
    'Work inside the current chat context and answer as a teammate, not as the orchestrator.',
    'Before repo-specific work, check for AGENTS.md in the working directory if a repo path is available.',
    languageInstruction(channel.responseLanguage),
    `Global orchestrator guidance:\n${orchestrator.systemPrompt}`,
    `Shared context:\n${formatSharedContext(channel, orchestrator)}`,
    `Your memory checkpoint:\n${formatMemoryCheckpoint(pal.memory)}`,
    `Channel roster:\n${formatPalRoster(channel)}`,
    `Recent messages:\n${formatRecentMessages(channel.messages)}`,
    `Latest routed message:\n${userMessage.body}`,
    'Reply with the work product or the next useful observation. Mention teammates with @Name only when needed.',
  ].join('\n\n');
}

import type {
  GlobalOrchestratorSummary,
  WorkspaceChannelState,
  WorkspaceMember,
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

function formatMemberRoster(channel: WorkspaceChannelState): string {
  const activeMembers = channel.members.filter((member) => member.status === 'active');
  if (activeMembers.length === 0) {
    return 'No active people in this chat yet.';
  }

  return activeMembers
    .map((member) => {
      const roleLabel = member.roles.length > 0 ? member.roles.join(', ') : 'general';
      return `- ${member.name} (${member.provider}${member.model ? ` / ${member.model}` : ''}; roles: ${roleLabel})`;
    })
    .join('\n');
}

function formatSharedContext(
  channel: WorkspaceChannelState,
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

  lines.push(`Global orchestrator provider: ${orchestrator.provider}`);
  if (orchestrator.model) {
    lines.push(`Global orchestrator model: ${orchestrator.model}`);
  }

  return lines.join('\n');
}

export function buildOrchestratorPrompt(
  channel: WorkspaceChannelState,
  orchestrator: GlobalOrchestratorSummary,
  userMessage: WorkspaceMessage,
): string {
  return [
    `You are ${ORCHESTRATOR_NAME}, the global chat coordinator for Cats Inc.`,
    'You coordinate who should act next inside this chat. Respect explicit @mentions.',
    'If the user explicitly mentions a teammate, assume they want that teammate involved.',
    'When referring to teammates, mention them with @Name so Chat can route follow-up turns.',
    'Before repo-specific work, check for AGENTS.md in the working directory if a repo path is available.',
    languageInstruction(channel.responseLanguage),
    `Global system prompt:\n${orchestrator.systemPrompt}`,
    `Shared context:\n${formatSharedContext(channel, orchestrator)}`,
    `Active members:\n${formatMemberRoster(channel)}`,
    `Recent messages:\n${formatRecentMessages(channel.messages)}`,
    `Latest user message:\n${userMessage.body}`,
    'Respond directly to the user. Be concise, explicit about who should act, and mention teammates when needed.',
  ].join('\n\n');
}

export function buildMemberPrompt(
  channel: WorkspaceChannelState,
  orchestrator: GlobalOrchestratorSummary,
  member: WorkspaceMember,
  userMessage: WorkspaceMessage,
): string {
  const roleLabel = member.roles.length > 0 ? member.roles.join(', ') : 'general';

  return [
    `You are ${member.name}, a chat participant inside the Chat module for Cats Inc.`,
    `Your provider is ${member.provider}${member.model ? ` and model ${member.model}` : ''}.`,
    `Your roles in this chat: ${roleLabel}.`,
    'Work inside the current chat context and answer as a teammate, not as the orchestrator.',
    'Before repo-specific work, check for AGENTS.md in the working directory if a repo path is available.',
    languageInstruction(channel.responseLanguage),
    `Global orchestrator guidance:\n${orchestrator.systemPrompt}`,
    `Shared context:\n${formatSharedContext(channel, orchestrator)}`,
    `Channel roster:\n${formatMemberRoster(channel)}`,
    `Recent messages:\n${formatRecentMessages(channel.messages)}`,
    `Latest routed message:\n${userMessage.body}`,
    'Reply with the work product or the next useful observation. Mention teammates with @Name only when needed.',
  ].join('\n\n');
}

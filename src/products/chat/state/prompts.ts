import type {
  GlobalOrchestratorSummary,
  ChatChannelCat,
  ChatChannelParticipant,
  ChatChannelView,
  ChatMessage,
} from '../api/contracts.js';
import type { MemoryCheckpointSummary } from '../../../core/types.js';
import { ORCHESTRATOR_NAME } from './model/index.js';

export interface PromptRoutingContext {
  reason: string;
  recentMessages?: ChatMessage[];
  sourceParticipantName?: string | null;
  transport?: 'telegram' | 'web';
}

export const MAX_PROMPT_RECENT_MESSAGES = 8;

function conversationalMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(
    (message) => message.senderKind !== 'system' && message.body.trim().length > 0,
  );
}

function readMessageToolLabels(message: Pick<ChatMessage, 'metadata'>): string[] {
  const value = message.metadata?.precedingTools;
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }

    const toolName = typeof entry.toolName === 'string' && entry.toolName.trim().length > 0
      ? entry.toolName.trim()
      : null;
    const toolId = typeof entry.toolId === 'string' && entry.toolId.trim().length > 0
      ? entry.toolId.trim()
      : null;
    const label = toolName ?? toolId;
    return label ? [label] : [];
  }).filter((label, index, labels) => labels.indexOf(label) === index);
}

function readAssistantTurnId(message: Pick<ChatMessage, 'metadata'>): string | null {
  const value = message.metadata?.assistantTurnId;
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeContinuityMessages(messages: ChatMessage[]): Array<{
  senderKind: ChatMessage['senderKind'];
  senderName: string;
  body: string;
  toolLabels: string[];
  assistantTurnId: string | null;
}> {
  const normalized: Array<{
    senderKind: ChatMessage['senderKind'];
    senderName: string;
    body: string;
    toolLabels: string[];
    assistantTurnId: string | null;
  }> = [];

  for (const message of messages) {
    const assistantTurnId = readAssistantTurnId(message);
    const toolLabels = readMessageToolLabels(message);
    const last = normalized.at(-1);
    if (
      assistantTurnId
      && last
      && last.assistantTurnId === assistantTurnId
      && last.senderKind === message.senderKind
      && last.senderName === message.senderName
    ) {
      const shouldInsertSpace = last.body.length > 0
        && message.body.length > 0
        && !/\s$/u.test(last.body)
        && !/^\s/u.test(message.body);
      last.body += shouldInsertSpace
        ? ` ${message.body}`
        : message.body;
      last.toolLabels = [...last.toolLabels, ...toolLabels]
        .filter((label, index, labels) => labels.indexOf(label) === index);
      continue;
    }

    normalized.push({
      senderKind: message.senderKind,
      senderName: message.senderName,
      body: message.body,
      toolLabels,
      assistantTurnId,
    });
  }

  return normalized;
}

function formatContinuityMessages(messages: ChatMessage[]): string {
  return normalizeContinuityMessages(messages)
    .map((message) => {
      const toolPrefix = message.toolLabels.length > 0
        ? ` [tools: ${message.toolLabels.join(', ')}]`
        : '';
      return `[${message.senderKind}:${message.senderName}]${toolPrefix} ${message.body}`;
    })
    .join('\n');
}

function languageInstruction(responseLanguage: string): string {
  if (!responseLanguage || responseLanguage === 'en') {
    return 'Respond in English unless the user explicitly asks for another language.';
  }

  return `Respond in ${responseLanguage}. Keep code, paths, and technical identifiers in English.`;
}

function formatRecentMessages(messages: ChatMessage[]): string {
  const recent = messages.slice(-MAX_PROMPT_RECENT_MESSAGES);
  if (recent.length === 0) {
    return 'No prior chat messages.';
  }

  return recent
    .map((message) => `[${message.senderKind}:${message.senderName}] ${message.body}`)
    .join('\n');
}

type PromptParticipant = ChatChannelCat | ChatChannelParticipant;

function activeParticipants(channel: ChatChannelView): PromptParticipant[] {
  const participants = channel.assignedParticipants && channel.assignedParticipants.length > 0
    ? channel.assignedParticipants
    : channel.assignedCats;
  return participants.filter((participant) => participant.status === 'active');
}

function formatParticipantRoster(channel: ChatChannelView): string {
  const participants = activeParticipants(channel);
  if (participants.length === 0) {
    return 'No active participants in this chat yet.';
  }

  return participants
    .map((participant) => {
      const roleLabel = participant.roles.length > 0
        ? participant.roles.join(', ')
        : participant.roleHint?.trim() || (participant.sourceKind === 'cat' ? 'general' : 'temporary');
      return `- ${participant.name} (${participant.execution.target.provider}${participant.execution.target.model ? ` / ${participant.execution.target.model}` : ''}; roles: ${roleLabel})`;
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
  channel: ChatChannelView,
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
  if (channel.chatCwd) {
    lines.push(`Runtime cwd: ${channel.chatCwd}`);
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
  if (orchestrator.executionTarget.instance) {
    lines.push(`Global orchestrator instance: ${orchestrator.executionTarget.instance}`);
  }
  if (orchestrator.executionTarget.model) {
    lines.push(`Global orchestrator model: ${orchestrator.executionTarget.model}`);
  }

  return lines.join('\n');
}

function transportInstruction(
  transport: PromptRoutingContext['transport'],
): string | null {
  if (transport !== 'telegram') {
    return null;
  }

  return [
    'The operator came in through Telegram.',
    'Keep the reply concise, operator-facing, and suitable for a Telegram relay back to the owner.',
    'Prefer short progress updates, clarifying questions, or direct answers over long transcript-style dumps.',
  ].join(' ');
}

function joinPromptSections(sections: Array<string | null | undefined>): string {
  return sections
    .filter((section): section is string => typeof section === 'string' && section.length > 0)
    .join('\n\n');
}

export function buildOrchestratorPrompt(
  channel: ChatChannelView,
  orchestrator: GlobalOrchestratorSummary,
  sourceMessage: ChatMessage,
  orchestratorName = ORCHESTRATOR_NAME,
  routingContext?: PromptRoutingContext,
): string {
  const activeParticipantCount = activeParticipants(channel).length;
  const recentMessages = routingContext?.recentMessages ?? channel.messages;
  const sourceLabel = sourceMessage.senderKind === 'user'
    ? 'Latest user message'
    : 'Latest routed handoff';
  const transportGuidance = transportInstruction(routingContext?.transport);

  return joinPromptSections([
    `You are ${orchestratorName}, the visible Boss Cat and chat coordinator for Cats Inc.`,
    'The system layer has already routed this turn to you. Do not reinterpret target selection.',
    routingContext?.reason ?? 'System routing selected you as the current turn owner.',
    routingContext?.sourceParticipantName
      ? `This handoff came from ${routingContext.sourceParticipantName}.`
      : 'This turn currently originates from the operator.',
    'When referring to teammates, mention them with @Name so Chat can route follow-up turns.',
    activeParticipantCount === 0
      ? 'There are no other active participants in this chat right now, so answer the user directly instead of delegating.'
      : 'If another active participant is better positioned, you may mention them to involve them.',
    `Never address yourself with @${orchestratorName} or @${ORCHESTRATOR_NAME}.`,
    'Never output internal routing notes, self-instructions, or coordinator scratchpad text.',
    transportGuidance,
    'Before repo-specific work, check for AGENTS.md in the working directory if a repo path is available.',
    languageInstruction(channel.responseLanguage),
    `Global system prompt:\n${orchestrator.systemPrompt}`,
    `Shared context:\n${formatSharedContext(channel, orchestrator)}`,
    `Coordinator memory checkpoint:\n${formatMemoryCheckpoint(orchestrator.memory)}`,
    `Room roster:\n${formatParticipantRoster(channel)}`,
    `Recent messages:\n${formatRecentMessages(recentMessages)}`,
    `${sourceLabel}:\n${sourceMessage.body}`,
    'Respond with the next useful contribution for the room.',
    'If another teammate should continue after you, mention them explicitly with @Name. Otherwise, answer without a handoff mention.',
  ]);
}

export function buildSoloChatBootstrapInstructions(
  priorMessages: ChatMessage[],
): string | null {
  const earlierMessages = conversationalMessages(priorMessages)
    .slice(-MAX_PROMPT_RECENT_MESSAGES);
  if (earlierMessages.length === 0) {
    return null;
  }

  return joinPromptSections([
    'Earlier chat context:',
    formatContinuityMessages(earlierMessages),
    'Current message follows separately.',
  ]);
}

export function buildSoloChatContinuityTransplantInstructions(
  priorMessages: ChatMessage[],
): string | null {
  const earlierMessages = conversationalMessages(priorMessages);
  if (earlierMessages.length === 0) {
    return null;
  }

  return joinPromptSections([
    'Same conversation continuity transcript:',
    formatContinuityMessages(earlierMessages),
    'Current message follows separately.',
  ]);
}

export function buildOrchestratorRewritePrompt(
  channel: ChatChannelView,
  userMessage: ChatMessage,
  orchestratorName: string,
  draft: string,
): string {
  return joinPromptSections([
    `You are ${orchestratorName}, rewriting your previous draft into the final reply for the user.`,
    'Rewrite the draft as a direct user-facing assistant response.',
    `Do not address yourself with @${orchestratorName} or @${ORCHESTRATOR_NAME}.`,
    'Do not mention routing, delegation, coordination, or what the user is asking in third person.',
    'Do not add commentary about internal process. Just give the user the answer.',
    languageInstruction(channel.responseLanguage),
    `Latest user message:\n${userMessage.body}`,
    `Draft to rewrite:\n${draft}`,
  ]);
}

export function buildCatPrompt(
  channel: ChatChannelView,
  orchestrator: GlobalOrchestratorSummary,
  cat: PromptParticipant,
  sourceMessage: ChatMessage,
  routingContext?: PromptRoutingContext,
): string {
  const roleLabel = cat.roles.length > 0
    ? cat.roles.join(', ')
    : cat.roleHint?.trim() || (cat.sourceKind === 'cat' ? 'general' : 'temporary');
  const recentMessages = routingContext?.recentMessages ?? channel.messages;
  const sourceLabel = sourceMessage.senderKind === 'user'
    ? 'Latest user message'
    : 'Latest routed handoff';
  const transportGuidance = transportInstruction(routingContext?.transport);

  return joinPromptSections([
    cat.sourceKind === 'cat'
      ? `You are ${cat.name}, a chat participant inside the Chat module for Cats Inc.`
      : `You are ${cat.name}, a temporary chat participant for this room inside the Chat module for Cats Inc.`,
    `Your provider is ${cat.execution.target.provider}${cat.execution.target.model ? ` and model ${cat.execution.target.model}` : ''}.`,
    cat.sourceKind === 'cat'
      ? `Your roles in this chat: ${roleLabel}.`
      : `Your role in this room: ${roleLabel}.`,
    'The system layer has already routed this turn to you. Do not reinterpret target selection.',
    routingContext?.reason ?? 'System routing selected you for the current turn.',
    routingContext?.sourceParticipantName
      ? `This handoff came from ${routingContext.sourceParticipantName}.`
      : 'This turn currently originates from the operator.',
    'Work inside the current chat context and answer as a teammate, not as the orchestrator.',
    transportGuidance,
    'Before repo-specific work, check for AGENTS.md in the working directory if a repo path is available.',
    languageInstruction(channel.responseLanguage),
    `Global orchestrator guidance:\n${orchestrator.systemPrompt}`,
    `Shared context:\n${formatSharedContext(channel, orchestrator)}`,
    `Your memory checkpoint:\n${formatMemoryCheckpoint(cat.memory)}`,
    `Channel roster:\n${formatParticipantRoster(channel)}`,
    `Recent messages:\n${formatRecentMessages(recentMessages)}`,
    `${sourceLabel}:\n${sourceMessage.body}`,
    'Reply with the work product or the next useful observation.',
    'If another teammate should continue after you, mention them explicitly with @Name. Otherwise, answer without a handoff mention.',
  ]);
}

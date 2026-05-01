import type {
  GlobalOrchestratorSummary,
  ChatChannelCat,
  ChatChannelParticipant,
  ChatChannelView,
  ChatMessage,
} from '../api/contracts.js';
import type { MemoryCheckpointSummary } from '../../../core/types.js';
import {
  buildAssistantResponseLanguageInstruction,
  parseAssistantResponseLanguage,
} from '../../../shared/assistantResponseLanguage.js';
import { buildChoiceResponseBody } from '../shared/messageChoices.js';
import { ORCHESTRATOR_NAME } from './model/index.js';

export interface PromptRoutingContext {
  reason: string;
  recentMessages?: ChatMessage[];
  sourceParticipantName?: string | null;
  transport?: 'telegram' | 'web';
}

export const MAX_BOUNDED_RECENT_CONTEXT_MESSAGES = 8;
export const MAX_CONTINUITY_TRANSPLANT_CHARACTERS = 12_000;

type ContinuityInstructionMode =
  | 'fresh_start'
  | 'full_transplant'
  | 'semantic_transplant'
  | 'targeted_handoff';

interface ContinuityInstructionPackage {
  instructions: string | null;
  mode: ContinuityInstructionMode;
}

type SoloContinuityInstructionMode =
  | 'fresh_start'
  | 'full_transplant'
  | 'semantic_transplant';

interface SoloContinuityInstructionPackage {
  instructions: string | null;
  mode: SoloContinuityInstructionMode;
}

interface NormalizedContinuityMessage {
  senderKind: ChatMessage['senderKind'];
  senderName: string;
  body: string;
  toolLabels: string[];
  assistantTurnId: string | null;
}

function resolveContinuityMessageBody(message: ChatMessage): string {
  const body = message.body.trim();
  if (body.length > 0) {
    return message.body;
  }
  if (message.choiceResponse) {
    return buildChoiceResponseBody(message.choiceResponse, message.choices ?? null);
  }
  return '';
}

function conversationalMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(
    (message) => message.senderKind !== 'system' && resolveContinuityMessageBody(message).trim().length > 0,
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

function normalizeContinuityMessages(messages: ChatMessage[]): NormalizedContinuityMessage[] {
  const normalized: NormalizedContinuityMessage[] = [];

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
      body: resolveContinuityMessageBody(message),
      toolLabels,
      assistantTurnId,
    });
  }

  return normalized;
}

function formatNormalizedContinuityLine(
  message: Pick<NormalizedContinuityMessage, 'senderKind' | 'senderName' | 'body' | 'toolLabels'>,
): string {
  const toolPrefix = message.toolLabels.length > 0
    ? ` [tools: ${message.toolLabels.join(', ')}]`
    : '';
  return `[${message.senderKind}:${message.senderName}]${toolPrefix} ${message.body}`;
}

function formatContinuityMessages(messages: ChatMessage[]): string {
  return normalizeContinuityMessages(messages)
    .map((message) => formatNormalizedContinuityLine(message))
    .join('\n');
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function truncateContinuityText(value: string, maxLength: number): string {
  if (maxLength <= 0) {
    return '';
  }

  const compact = compactWhitespace(value);
  if (compact.length <= maxLength) {
    return compact;
  }

  if (maxLength <= 1) {
    return '…';
  }

  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function pickRepresentativeContinuityMessages(
  messages: NormalizedContinuityMessage[],
  maxSnippetCount = 3,
): NormalizedContinuityMessage[] {
  if (messages.length <= maxSnippetCount) {
    return messages;
  }

  const lastIndex = messages.length - 1;
  const indices = new Set<number>([0, lastIndex]);
  for (let slot = 1; slot < maxSnippetCount - 1; slot += 1) {
    indices.add(Math.round((slot * lastIndex) / (maxSnippetCount - 1)));
  }

  return [...indices]
    .sort((left, right) => left - right)
    .map((index) => messages[index]!);
}

function buildContinuityChunkDigest(
  messages: NormalizedContinuityMessage[],
  startIndex: number,
  endIndex: number,
  snippetLength: number,
): string {
  const chunk = messages.slice(startIndex, endIndex);
  const userMessages = chunk.filter((message) => message.senderKind === 'user');
  const assistantMessages = chunk.filter((message) => message.senderKind !== 'user');
  const toolLabels = chunk.flatMap((message) => message.toolLabels)
    .filter((label, index, labels) => labels.indexOf(label) === index);

  const describeSpeakerTurns = (
    label: string,
    speakerMessages: NormalizedContinuityMessage[],
  ): string | null => {
    if (speakerMessages.length === 0) {
      return null;
    }

    const representativeMessages = pickRepresentativeContinuityMessages(speakerMessages);
    const snippetSummary = representativeMessages
      .map((message) => `"${truncateContinuityText(message.body, snippetLength)}"`)
      .join(' | ');
    return speakerMessages.length === 1
      ? `${label}: ${snippetSummary}`
      : `${label}(${speakerMessages.length}): ${snippetSummary}`;
  };

  const chunkStart = startIndex + 1;
  const chunkEnd = endIndex;
  const details = [
    describeSpeakerTurns('user', userMessages),
    describeSpeakerTurns('assistant', assistantMessages),
    toolLabels.length > 0 ? `tools: ${toolLabels.join(', ')}` : null,
  ].filter((detail): detail is string => Boolean(detail));

  return `Turns ${chunkStart}-${chunkEnd}: ${details.join(' | ')}`;
}

function renderSemanticContinuityInstructions(
  messages: NormalizedContinuityMessage[],
  options: {
    recentCount: number;
    digestBucketCount: number;
    digestSnippetLength: number;
    recentLineLimit: number | null;
    recentLabel: string;
  },
): string {
  const recentCount = Math.min(options.recentCount, messages.length);
  const recentMessages = messages.slice(-recentCount);
  const earlierMessages = messages.slice(0, -recentCount);
  const digestBucketCount = Math.max(1, options.digestBucketCount);
  const digestChunkSize = earlierMessages.length > 0
    ? Math.max(1, Math.ceil(earlierMessages.length / digestBucketCount))
    : 0;
  const digestLines = digestChunkSize > 0
    ? Array.from({ length: Math.ceil(earlierMessages.length / digestChunkSize) }, (_value, index) => {
      const startIndex = index * digestChunkSize;
      const endIndex = Math.min(startIndex + digestChunkSize, earlierMessages.length);
      return buildContinuityChunkDigest(
        earlierMessages,
        startIndex,
        endIndex,
        options.digestSnippetLength,
      );
    })
    : [];
  const recentLines = recentMessages.map((message) => {
    const formatted = formatNormalizedContinuityLine(message);
    return options.recentLineLimit === null
      ? formatted
      : truncateContinuityText(formatted, options.recentLineLimit);
  });

  return joinPromptSections([
    'Same conversation continuity package:',
    earlierMessages.length > 0
      ? [
        `Earlier transcript was compacted from ${earlierMessages.length} prior turns to fit provider limits while preserving sender and turn order.`,
        'Earlier continuity digest:',
        digestLines.join('\n'),
      ].join('\n')
      : null,
    `${options.recentLabel}\n${recentLines.join('\n')}`,
    'Current message follows separately.',
  ]);
}

function clampContinuityInstructions(
  instructions: string,
): string {
  if (instructions.length <= MAX_CONTINUITY_TRANSPLANT_CHARACTERS) {
    return instructions;
  }

  const suffix = '\n\nCurrent message follows separately.';
  const availablePrefixLength = Math.max(
    0,
    MAX_CONTINUITY_TRANSPLANT_CHARACTERS - suffix.length - 1,
  );
  const compactPrefix = instructions
    .slice(0, availablePrefixLength)
    .trimEnd();
  return `${compactPrefix}…${suffix}`;
}

function buildSemanticContinuityTransplantInstructions(
  messages: NormalizedContinuityMessage[],
): string {
  const configs: Array<{
    recentCount: number;
    digestBucketCount: number;
    digestSnippetLength: number;
    recentLineLimit: number | null;
    recentLabel: string;
  }> = [
    {
      recentCount: 6,
      digestBucketCount: 24,
      digestSnippetLength: 96,
      recentLineLimit: null,
      recentLabel: 'Recent verbatim transcript:',
    },
    {
      recentCount: 6,
      digestBucketCount: 20,
      digestSnippetLength: 84,
      recentLineLimit: 480,
      recentLabel: 'Recent verbatim turn excerpts:',
    },
    {
      recentCount: 4,
      digestBucketCount: 16,
      digestSnippetLength: 72,
      recentLineLimit: 320,
      recentLabel: 'Recent verbatim turn excerpts:',
    },
    {
      recentCount: 2,
      digestBucketCount: 12,
      digestSnippetLength: 64,
      recentLineLimit: 220,
      recentLabel: 'Recent verbatim turn excerpts:',
    },
  ];

  for (const config of configs) {
    const rendered = renderSemanticContinuityInstructions(messages, config);
    if (rendered.length <= MAX_CONTINUITY_TRANSPLANT_CHARACTERS) {
      return rendered;
    }
  }

  return clampContinuityInstructions(renderSemanticContinuityInstructions(messages, {
    recentCount: 2,
    digestBucketCount: 8,
    digestSnippetLength: 48,
    recentLineLimit: 180,
    recentLabel: 'Recent verbatim turn excerpts:',
  }));
}

function languageInstruction(responseLanguage: string): string {
  const parsedLanguage = parseAssistantResponseLanguage(responseLanguage);
  const instruction = parsedLanguage
    ? buildAssistantResponseLanguageInstruction(parsedLanguage)
    : null;
  if (instruction) {
    return instruction;
  }
  if (!responseLanguage || responseLanguage === 'unspecified') {
    return '';
  }

  return `Respond in ${responseLanguage}. Keep code, paths, and technical identifiers in English.`;
}

function formatRecentMessages(messages: ChatMessage[]): string {
  const recent = messages.slice(-MAX_BOUNDED_RECENT_CONTEXT_MESSAGES);
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

export function buildBoundedRecentContextInstructions(
  priorMessages: ChatMessage[],
): string | null {
  const earlierMessages = conversationalMessages(priorMessages)
    .slice(-MAX_BOUNDED_RECENT_CONTEXT_MESSAGES);
  if (earlierMessages.length === 0) {
    return null;
  }

  return joinPromptSections([
    'Earlier chat context:',
    formatContinuityMessages(earlierMessages),
    'Current message follows separately.',
  ]);
}

export function buildSoloChatContinuityTransplantPackage(
  priorMessages: ChatMessage[],
): SoloContinuityInstructionPackage {
  const earlierMessages = conversationalMessages(priorMessages);
  if (earlierMessages.length === 0) {
    return {
      instructions: null,
      mode: 'fresh_start',
    };
  }

  const normalizedMessages = normalizeContinuityMessages(earlierMessages);
  const fullInstructions = joinPromptSections([
    'Same conversation continuity transcript:',
    normalizedMessages.map((message) => formatNormalizedContinuityLine(message)).join('\n'),
    'Current message follows separately.',
  ]);

  if (fullInstructions.length <= MAX_CONTINUITY_TRANSPLANT_CHARACTERS) {
    return {
      instructions: fullInstructions,
      mode: 'full_transplant',
    };
  }

  return {
    instructions: buildSemanticContinuityTransplantInstructions(normalizedMessages),
    mode: 'semantic_transplant',
  };
}

export function buildTargetedChatHandoffPackage(input: {
  priorMessages: ChatMessage[];
  reason?: string | null;
  sourceParticipantName?: string | null;
}): ContinuityInstructionPackage {
  const earlierMessages = conversationalMessages(input.priorMessages)
    .slice(-MAX_BOUNDED_RECENT_CONTEXT_MESSAGES);
  if (earlierMessages.length === 0) {
    return {
      instructions: null,
      mode: 'fresh_start',
    };
  }

  return {
    instructions: joinPromptSections([
      'Targeted same-conversation handoff context:',
      input.reason?.trim() || null,
      input.sourceParticipantName?.trim()
        ? `This handoff came from ${input.sourceParticipantName.trim()}.`
        : null,
      `Relevant recent room messages:\n${formatContinuityMessages(earlierMessages)}`,
      'Current message follows separately.',
    ]),
    mode: 'targeted_handoff',
  };
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

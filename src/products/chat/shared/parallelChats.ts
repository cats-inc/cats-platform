import type {
  ParallelChatRelayCommandKind,
  ParallelChatTarget,
} from '../api/contracts.js';
import { resolveExecutionTargetLabel } from '../../../shared/executionLabel.js';
import { parseMentionsWithPositions } from '../../../shared/mentionParsing.js';
import {
  createTranslator,
  messageKeys,
  normalizeMessageLocale,
  type MessageKey,
  type MessageLocale,
} from '../../../shared/i18n/index.js';

export interface ParallelChatRelayCommandDefinition {
  id: ParallelChatRelayCommandKind;
  label: string;
  shortLabel: string;
  description: string;
}

interface ParallelChatRelayCommandCopyKeys {
  labelKey: MessageKey;
  shortLabelKey: MessageKey;
  descriptionKey: MessageKey;
  promptInstructionOneKey: MessageKey;
  promptInstructionTwoKey: MessageKey;
}

const PARALLEL_CHAT_RELAY_COMMAND_IDS: ParallelChatRelayCommandKind[] = [
  'check_this',
  'adopt_this',
  'debate_this',
  'improve_this',
  'counter_this',
  'synthesize_this',
];

const PARALLEL_CHAT_RELAY_COMMAND_COPY: Record<
  ParallelChatRelayCommandKind,
  ParallelChatRelayCommandCopyKeys
> = {
  check_this: {
    labelKey: messageKeys.chatParallelRelayCommandCheckLabel,
    shortLabelKey: messageKeys.chatParallelRelayCommandCheckShortLabel,
    descriptionKey: messageKeys.chatParallelRelayCommandCheckDescription,
    promptInstructionOneKey: messageKeys.chatParallelRelayPromptCheckInstructionOne,
    promptInstructionTwoKey: messageKeys.chatParallelRelayPromptCheckInstructionTwo,
  },
  adopt_this: {
    labelKey: messageKeys.chatParallelRelayCommandAdoptLabel,
    shortLabelKey: messageKeys.chatParallelRelayCommandAdoptShortLabel,
    descriptionKey: messageKeys.chatParallelRelayCommandAdoptDescription,
    promptInstructionOneKey: messageKeys.chatParallelRelayPromptAdoptInstructionOne,
    promptInstructionTwoKey: messageKeys.chatParallelRelayPromptAdoptInstructionTwo,
  },
  debate_this: {
    labelKey: messageKeys.chatParallelRelayCommandDebateLabel,
    shortLabelKey: messageKeys.chatParallelRelayCommandDebateShortLabel,
    descriptionKey: messageKeys.chatParallelRelayCommandDebateDescription,
    promptInstructionOneKey: messageKeys.chatParallelRelayPromptDebateInstructionOne,
    promptInstructionTwoKey: messageKeys.chatParallelRelayPromptDebateInstructionTwo,
  },
  improve_this: {
    labelKey: messageKeys.chatParallelRelayCommandImproveLabel,
    shortLabelKey: messageKeys.chatParallelRelayCommandImproveShortLabel,
    descriptionKey: messageKeys.chatParallelRelayCommandImproveDescription,
    promptInstructionOneKey: messageKeys.chatParallelRelayPromptImproveInstructionOne,
    promptInstructionTwoKey: messageKeys.chatParallelRelayPromptImproveInstructionTwo,
  },
  counter_this: {
    labelKey: messageKeys.chatParallelRelayCommandCounterLabel,
    shortLabelKey: messageKeys.chatParallelRelayCommandCounterShortLabel,
    descriptionKey: messageKeys.chatParallelRelayCommandCounterDescription,
    promptInstructionOneKey: messageKeys.chatParallelRelayPromptCounterInstructionOne,
    promptInstructionTwoKey: messageKeys.chatParallelRelayPromptCounterInstructionTwo,
  },
  synthesize_this: {
    labelKey: messageKeys.chatParallelRelayCommandSynthesizeLabel,
    shortLabelKey: messageKeys.chatParallelRelayCommandSynthesizeShortLabel,
    descriptionKey: messageKeys.chatParallelRelayCommandSynthesizeDescription,
    promptInstructionOneKey: messageKeys.chatParallelRelayPromptSynthesizeInstructionOne,
    promptInstructionTwoKey: messageKeys.chatParallelRelayPromptSynthesizeInstructionTwo,
  },
};

function resolveRelayLocale(locale: string | null | undefined): MessageLocale {
  return normalizeMessageLocale(locale);
}

function buildRelayCommandDefinition(
  id: ParallelChatRelayCommandKind,
  locale: string | null | undefined,
): ParallelChatRelayCommandDefinition {
  const t = createTranslator(resolveRelayLocale(locale));
  const copy = PARALLEL_CHAT_RELAY_COMMAND_COPY[id];
  return {
    id,
    label: t(copy.labelKey),
    shortLabel: t(copy.shortLabelKey),
    description: t(copy.descriptionKey),
  };
}

export const PARALLEL_CHAT_RELAY_COMMANDS: ParallelChatRelayCommandDefinition[] =
  PARALLEL_CHAT_RELAY_COMMAND_IDS.map((id) => buildRelayCommandDefinition(id, 'en'));

export function buildParallelChatMemberLabel(target: ParallelChatTarget): string {
  return resolveExecutionTargetLabel({
    provider: target.provider,
    instance: target.instance,
    model: target.model,
    modelSelection: target.modelSelection ?? null,
  });
}

export function createParallelChatTitle(existingCount: number): string {
  return existingCount > 0 ? `Parallel chat ${existingCount + 1}` : 'Parallel chat';
}

export function findParallelChatRelayCommand(
  command: ParallelChatRelayCommandKind,
  locale?: string | null,
): ParallelChatRelayCommandDefinition {
  const normalizedCommand = PARALLEL_CHAT_RELAY_COMMAND_IDS.includes(command)
    ? command
    : PARALLEL_CHAT_RELAY_COMMAND_IDS[0]!;
  return buildRelayCommandDefinition(normalizedCommand, locale);
}

export function normalizeParallelChatRelayCommand(
  command: string | null | undefined,
): ParallelChatRelayCommandKind | null {
  if (!command) {
    return null;
  }
  return PARALLEL_CHAT_RELAY_COMMAND_IDS.some((entry) => entry === command)
    ? command as ParallelChatRelayCommandKind
    : null;
}

function formatRelayMessageId(sourceMessageId: string): string {
  const normalized = sourceMessageId.trim();
  return normalized.length > 8 ? normalized.slice(0, 8) : normalized;
}

function formatRelayTargetLabels(labels: string[], locale?: string | null): string {
  const resolvedLocale = resolveRelayLocale(locale);
  const t = createTranslator(resolvedLocale);
  if (labels.length === 0) {
    return t(messageKeys.chatParallelRelayTargetNoChats);
  }
  if (labels.length === 1) {
    return labels[0]!;
  }
  if (labels.length === 2) {
    return t(messageKeys.chatParallelRelayTargetPair, {
      first: labels[0]!,
      second: labels[1]!,
    });
  }

  return t(messageKeys.chatParallelRelayTargetMany, {
    allButLast: labels.slice(0, -1).join(resolvedLocale === 'zh-TW' ? '、' : ', '),
    last: labels[labels.length - 1]!,
  });
}

export function buildParallelChatRelayOutgoingNote(input: {
  command: ParallelChatRelayCommandKind;
  sourceMessageId: string;
  targetMemberLabels: string[];
  locale?: string | null;
}): string {
  const t = createTranslator(resolveRelayLocale(input.locale));
  return t(messageKeys.chatParallelRelayOutgoingNote, {
    replyId: formatRelayMessageId(input.sourceMessageId),
    commandLabel: findParallelChatRelayCommand(input.command, input.locale).label,
    targets: formatRelayTargetLabels(input.targetMemberLabels, input.locale),
  });
}

export function buildParallelChatRelayIncomingNote(input: {
  command: ParallelChatRelayCommandKind;
  sourceMessageId: string;
  sourceMemberLabel: string;
  locale?: string | null;
}): string {
  const t = createTranslator(resolveRelayLocale(input.locale));
  return t(messageKeys.chatParallelRelayIncomingNote, {
    replyId: formatRelayMessageId(input.sourceMessageId),
    commandLabel: findParallelChatRelayCommand(input.command, input.locale).label,
    sourceMemberLabel: input.sourceMemberLabel,
  });
}

function escapeRelayQuotedMentions(body: string): string {
  const positions = parseMentionsWithPositions(body).positions;
  if (positions.length === 0) {
    return body;
  }

  let cursor = 0;
  let escaped = '';
  for (const position of positions) {
    escaped += body.slice(cursor, position.start);
    escaped += `@\u200B${position.name}`;
    cursor = position.end;
  }
  escaped += body.slice(cursor);
  return escaped;
}

export function buildParallelChatRelayPrompt(input: {
  command: ParallelChatRelayCommandKind;
  sourceMemberLabel: string;
  sourceBody: string;
  locale?: string | null;
}): string {
  const t = createTranslator(resolveRelayLocale(input.locale));
  const commandDefinition = findParallelChatRelayCommand(input.command, input.locale);
  const commandCopy = PARALLEL_CHAT_RELAY_COMMAND_COPY[input.command];
  const sanitizedSourceBody = escapeRelayQuotedMentions(input.sourceBody);
  const sourceBlock = [
    t(messageKeys.chatParallelRelayPromptSourceHeader),
    t(messageKeys.chatParallelRelayPromptSourceLabel, {
      sourceMemberLabel: input.sourceMemberLabel,
    }),
    '---',
    sanitizedSourceBody.trim(),
    '---',
  ].join('\n');

  if (commandCopy) {
    return [
      t(messageKeys.chatParallelRelayPromptHeader, {
        commandLabel: commandDefinition.label,
      }),
      t(commandCopy.promptInstructionOneKey),
      t(commandCopy.promptInstructionTwoKey),
      '',
      sourceBlock,
    ].join('\n');
  }

  throw new Error(`Unsupported concurrent relay command: ${input.command}`);
}

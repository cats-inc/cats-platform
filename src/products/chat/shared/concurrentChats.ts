import type {
  ConcurrentChatRelayCommandKind,
  ConcurrentChatTarget,
} from '../api/contracts.js';
import {
  getProviderDisplayName,
  getProviderModels,
} from '../../../shared/providerCatalog.js';

export interface ConcurrentChatRelayCommandDefinition {
  id: ConcurrentChatRelayCommandKind;
  label: string;
  shortLabel: string;
  description: string;
}

export const CONCURRENT_CHAT_RELAY_COMMANDS: ConcurrentChatRelayCommandDefinition[] = [
  {
    id: 'check_this',
    label: 'Check this',
    shortLabel: 'Check',
    description: 'Stress-test another reply for gaps, risks, and wrong assumptions.',
  },
  {
    id: 'adopt_this',
    label: 'Adopt this',
    shortLabel: 'Adopt',
    description: 'Use another reply as the new working direction and improve it.',
  },
  {
    id: 'debate_this',
    label: 'Debate this',
    shortLabel: 'Debate',
    description: 'Take the strongest reasonable counter-position to another reply.',
  },
  {
    id: 'build_on_this',
    label: 'Build on this',
    shortLabel: 'Build on',
    description: 'Continue from another reply without starting over.',
  },
];

function normalizeModelLabel(provider: string, model: string | null): string | null {
  if (!model) {
    return null;
  }

  const catalogLabel = getProviderModels(provider)
    .find((entry) => entry.value === model)?.label
    ?.replace(/\s*\(default\)\s*/giu, '')
    ?.trim();
  return catalogLabel || model;
}

export function buildConcurrentChatMemberLabel(target: ConcurrentChatTarget): string {
  const providerLabel = getProviderDisplayName(target.provider);
  const modelLabel = normalizeModelLabel(target.provider, target.model);
  if (!modelLabel) {
    return providerLabel;
  }

  return `${providerLabel} · ${modelLabel}`;
}

export function createCompareChatTitle(existingCount: number): string {
  return existingCount > 0 ? `Parallel chat ${existingCount + 1}` : 'Parallel chat';
}

export function findConcurrentRelayCommand(
  command: ConcurrentChatRelayCommandKind,
): ConcurrentChatRelayCommandDefinition {
  return CONCURRENT_CHAT_RELAY_COMMANDS.find((entry) => entry.id === command)
    ?? CONCURRENT_CHAT_RELAY_COMMANDS[0]!;
}

export function buildConcurrentRelayPrompt(input: {
  command: ConcurrentChatRelayCommandKind;
  sourceMemberLabel: string;
  sourceBody: string;
}): string {
  const sourceBlock = [
    '[Reply to review]',
    `Source: ${input.sourceMemberLabel}`,
    '---',
    input.sourceBody.trim(),
    '---',
  ].join('\n');

  switch (input.command) {
    case 'adopt_this':
      return [
        '[Parallel relay · Adopt this]',
        'Treat the quoted reply as the new draft to continue from.',
        'Keep what is strong, fix what is weak, and answer in your own words.',
        '',
        sourceBlock,
      ].join('\n');
    case 'debate_this':
      return [
        '[Parallel relay · Debate this]',
        'Take the strongest reasonable counter-position to the quoted reply.',
        'Challenge assumptions, point out weak spots, and state where you disagree.',
        '',
        sourceBlock,
      ].join('\n');
    case 'build_on_this':
      return [
        '[Parallel relay · Build on this]',
        'Use the quoted reply as prior work and continue from it.',
        'Add missing depth, extensions, or implementation detail without restarting the answer.',
        '',
        sourceBlock,
      ].join('\n');
    case 'check_this':
    default:
      return [
        '[Parallel relay · Check this]',
        'Review the quoted reply for correctness, risks, blind spots, and unsupported assumptions.',
        'State what is solid, what is weak, and what you would change.',
        '',
        sourceBlock,
      ].join('\n');
  }
}

import type {
  ConcurrentChatRelayCommandKind,
  ConcurrentChatTarget,
} from '../api/contracts.js';
import { buildExecutionLabel } from '../../../shared/executionLabel.js';

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
    id: 'improve_this',
    label: 'Improve this',
    shortLabel: 'Improve',
    description: 'Refine, expand, or strengthen another reply.',
  },
  {
    id: 'counter_this',
    label: 'Counter this',
    shortLabel: 'Counter',
    description: 'Provide a strong counter-argument or alternative approach.',
  },
  {
    id: 'synthesize_this',
    label: 'Synthesize this',
    shortLabel: 'Synthesize',
    description: 'Combine this with your own analysis — where do they align or diverge?',
  },
];

export function buildConcurrentChatMemberLabel(target: ConcurrentChatTarget): string {
  return buildExecutionLabel(target.provider, target.instance, target.model);
}

export function createParallelChatTitle(existingCount: number): string {
  return existingCount > 0 ? `Parallel chat ${existingCount + 1}` : 'Parallel chat';
}

export function findConcurrentRelayCommand(
  command: ConcurrentChatRelayCommandKind,
): ConcurrentChatRelayCommandDefinition {
  return CONCURRENT_CHAT_RELAY_COMMANDS.find((entry) => entry.id === command)
    ?? CONCURRENT_CHAT_RELAY_COMMANDS[0]!;
}

export function normalizeConcurrentRelayCommand(
  command: string | null | undefined,
): ConcurrentChatRelayCommandKind | null {
  if (!command) {
    return null;
  }
  return CONCURRENT_CHAT_RELAY_COMMANDS.some((entry) => entry.id === command)
    ? command as ConcurrentChatRelayCommandKind
    : null;
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
    case 'improve_this':
      return [
        '[Parallel relay · Improve this]',
        'Refine, expand, or strengthen the quoted reply.',
        'Fix weaknesses, add missing depth, and produce a better version.',
        '',
        sourceBlock,
      ].join('\n');
    case 'counter_this':
      return [
        '[Parallel relay · Counter this]',
        'Provide a strong counter-argument or alternative approach to the quoted reply.',
        'Argue from the opposite perspective with concrete reasoning.',
        '',
        sourceBlock,
      ].join('\n');
    case 'synthesize_this':
      return [
        '[Parallel relay · Synthesize this]',
        'Based on our conversation so far, synthesize the quoted reply with your own analysis.',
        'Identify where you align, where you diverge, and what a combined view would look like.',
        '',
        sourceBlock,
      ].join('\n');
    case 'check_this':
      return [
        '[Parallel relay · Check this]',
        'Review the quoted reply for correctness, risks, blind spots, and unsupported assumptions.',
        'State what is solid, what is weak, and what you would change.',
        '',
        sourceBlock,
      ].join('\n');
  }

  throw new Error(`Unsupported concurrent relay command: ${input.command}`);
}

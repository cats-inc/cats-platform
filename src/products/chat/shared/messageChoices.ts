import type {
  ChatMessageChoice,
  ChatMessageChoiceAnswer,
  ChatMessageChoiceResponse,
  ChatMessageOption,
} from '../api/contracts.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function normalizeChatMessageOption(value: unknown): ChatMessageOption | null {
  const option = asRecord(value);
  if (!option) {
    return null;
  }

  const id = readString(option.id);
  const label = readString(option.label);
  if (!id || !label) {
    return null;
  }

  const style = option.style === 'primary'
    || option.style === 'secondary'
    || option.style === 'danger'
    ? option.style
    : undefined;

  return {
    id,
    label,
    description: readString(option.description) ?? undefined,
    style,
  };
}

function normalizeChatMessageChoice(value: unknown): ChatMessageChoice | null {
  const choice = asRecord(value);
  if (!choice) {
    return null;
  }

  const question = readString(choice.question);
  if (!question) {
    return null;
  }

  const options = Array.isArray(choice.options)
    ? choice.options
        .map((option) => normalizeChatMessageOption(option))
        .filter((option): option is ChatMessageOption => Boolean(option))
    : [];

  if (options.length === 0) {
    return null;
  }

  return {
    question,
    options,
    multiSelect: readBoolean(choice.multiSelect) ?? undefined,
    allowCustom: readBoolean(choice.allowCustom) ?? undefined,
    allowSkip: readBoolean(choice.allowSkip) ?? undefined,
  };
}

export function normalizeChatMessageChoices(value: unknown): ChatMessageChoice[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((choice) => normalizeChatMessageChoice(choice))
    .filter((choice): choice is ChatMessageChoice => Boolean(choice));

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeChatMessageChoiceAnswer(value: unknown): ChatMessageChoiceAnswer | null {
  const answer = asRecord(value);
  if (!answer) {
    return null;
  }

  const question = readString(answer.question);
  if (!question) {
    return null;
  }

  return {
    question,
    selectedOptionIds: readStringArray(answer.selectedOptionIds),
    customText: readString(answer.customText) ?? undefined,
    skipped: readBoolean(answer.skipped) ?? undefined,
  };
}

export function normalizeChatMessageChoiceResponse(
  value: unknown,
): ChatMessageChoiceResponse | null {
  const response = asRecord(value);
  if (!response) {
    return null;
  }

  const sourceMessageId = readString(response.sourceMessageId);
  const status = response.status === 'submitted' || response.status === 'skipped'
    ? response.status
    : null;
  const submittedAt = readString(response.submittedAt);
  const answers = Array.isArray(response.answers)
    ? response.answers
        .map((answer) => normalizeChatMessageChoiceAnswer(answer))
        .filter((answer): answer is ChatMessageChoiceAnswer => Boolean(answer))
    : [];

  if (!sourceMessageId || !status || !submittedAt) {
    return null;
  }

  return {
    sourceMessageId,
    status,
    answers,
    submittedAt,
  };
}

function parseChoicePayload(value: string): ChatMessageChoice[] | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeChatMessageChoices(parsed);
    }

    const record = asRecord(parsed);
    return normalizeChatMessageChoices(record?.choices);
  } catch {
    return undefined;
  }
}

export function extractChatMessageChoicesFromBody(
  body: string,
  explicitChoices?: unknown,
): { body: string; choices?: ChatMessageChoice[] } {
  const normalizedBody = body.trim();
  const normalizedChoices = normalizeChatMessageChoices(explicitChoices);
  if (normalizedChoices) {
    return { body: normalizedBody, choices: normalizedChoices };
  }

  if (!normalizedBody) {
    return { body: normalizedBody };
  }

  const fullPayloadChoices = parseChoicePayload(normalizedBody);
  if (fullPayloadChoices) {
    return {
      body: '',
      choices: fullPayloadChoices,
    };
  }

  const fencedMatch = normalizedBody.match(/```json\s*([\s\S]*?)```/iu);
  if (!fencedMatch) {
    return { body: normalizedBody };
  }

  const fencedChoices = parseChoicePayload(fencedMatch[1]);
  if (!fencedChoices) {
    return { body: normalizedBody };
  }

  return {
    body: normalizedBody.replace(fencedMatch[0], '').replace(/\n{3,}/gu, '\n\n').trim(),
    choices: fencedChoices,
  };
}

export function buildChoiceResponseBody(
  response: ChatMessageChoiceResponse,
  sourceChoices?: ChatMessageChoice[] | null,
): string {
  if (response.status === 'skipped') {
    return 'Skipped requested choices.';
  }

  const sections = response.answers.map((answer) => {
    const sourceChoice = sourceChoices?.find((choice) => choice.question === answer.question);
    const selectedLabels = answer.selectedOptionIds.map((optionId) =>
      sourceChoice?.options.find((option) => option.id === optionId)?.label ?? optionId,
    );
    const answerParts = [
      ...selectedLabels,
      ...(answer.customText ? [answer.customText] : []),
    ];

    return `Q: ${answer.question}\nA: ${answerParts.length > 0 ? answerParts.join(', ') : 'Skipped'}`;
  });

  return sections.join('\n\n');
}

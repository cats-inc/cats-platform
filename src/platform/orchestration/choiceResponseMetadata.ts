import type { OrchestratorChoiceResponse } from './contracts.js';

export function normalizeOrchestratorChoiceResponse(
  value: unknown,
): OrchestratorChoiceResponse | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const sourceMessageId = readNonEmptyString(record.sourceMessageId);
  const status = record.status === 'submitted' || record.status === 'skipped'
    ? record.status
    : null;
  const submittedAt = readNonEmptyString(record.submittedAt);
  const answers = Array.isArray(record.answers)
    ? record.answers.map(readChoiceAnswer)
    : null;
  if (
    !sourceMessageId
    || !status
    || !submittedAt
    || !answers
    || answers.some((answer) => answer === null)
  ) {
    return null;
  }

  return {
    sourceMessageId,
    status,
    submittedAt,
    answers: answers as OrchestratorChoiceResponse['answers'],
  };
}

function readChoiceAnswer(value: unknown): OrchestratorChoiceResponse['answers'][number] | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const question = readNonEmptyString(record.question);
  const selectedOptionIdValues = record.selectedOptionIds;
  const selectedOptionIds = Array.isArray(selectedOptionIdValues)
    ? selectedOptionIdValues.filter((candidate): candidate is string =>
        typeof candidate === 'string')
    : null;
  if (
    !question
    || !selectedOptionIds
    || !Array.isArray(selectedOptionIdValues)
    || selectedOptionIds.length !== selectedOptionIdValues.length
  ) {
    return null;
  }

  return {
    question,
    selectedOptionIds,
    ...(typeof record.customText === 'string'
      ? { customText: record.customText }
      : {}),
    ...(typeof record.skipped === 'boolean'
      ? { skipped: record.skipped }
      : {}),
  };
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

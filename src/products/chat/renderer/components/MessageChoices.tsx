import { useState } from 'react';

import type {
  ChatMessageChoice,
  ChatMessageChoiceResponse,
} from '../../../../shared/app-shell.js';
import { buildChoiceResponseBody } from '../../shared/messageChoices.js';

export interface MessageChoicesSubmitInput {
  channelId: string;
  body: string;
  choiceResponse: ChatMessageChoiceResponse;
}

export interface MessageChoicesProps {
  channelId: string;
  messageId: string;
  choices: ChatMessageChoice[];
  existingResponse?: ChatMessageChoiceResponse | null;
  busy: boolean;
  onSubmit: (input: MessageChoicesSubmitInput) => void;
}

function answerForQuestion(
  response: ChatMessageChoiceResponse | null | undefined,
  question: string,
) {
  return response?.answers.find((answer) => answer.question === question) ?? null;
}

export function MessageChoices({
  channelId,
  messageId,
  choices,
  existingResponse,
  busy,
  onSubmit,
}: MessageChoicesProps) {
  const [selectedByQuestion, setSelectedByQuestion] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      choices.map((choice) => [
        choice.question,
        answerForQuestion(existingResponse, choice.question)?.selectedOptionIds ?? [],
      ]),
    ),
  );
  const [customByQuestion, setCustomByQuestion] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      choices.map((choice) => [
        choice.question,
        answerForQuestion(existingResponse, choice.question)?.customText ?? '',
      ]),
    ),
  );
  const [customOpenByQuestion, setCustomOpenByQuestion] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      choices.map((choice) => [
        choice.question,
        Boolean(answerForQuestion(existingResponse, choice.question)?.customText),
      ]),
    ),
  );

  const disabled = busy || Boolean(existingResponse);
  const allowSkip = choices.some((choice) => choice.allowSkip);

  function isSelected(question: string, optionId: string): boolean {
    const answer = answerForQuestion(existingResponse, question);
    if (answer) {
      return answer.selectedOptionIds.includes(optionId);
    }

    return (selectedByQuestion[question] ?? []).includes(optionId);
  }

  function toggleOption(question: string, optionId: string, multiSelect = false): void {
    if (disabled) {
      return;
    }

    setSelectedByQuestion((current) => {
      const next = new Set(current[question] ?? []);
      if (multiSelect) {
        if (next.has(optionId)) {
          next.delete(optionId);
        } else {
          next.add(optionId);
        }
        return { ...current, [question]: Array.from(next) };
      }

      return {
        ...current,
        [question]: next.has(optionId) ? [] : [optionId],
      };
    });
  }

  function canSubmit(): boolean {
    return choices.every((choice) => {
      const selected = selectedByQuestion[choice.question] ?? [];
      const customText = customByQuestion[choice.question]?.trim() ?? '';
      return selected.length > 0 || customText.length > 0;
    });
  }

  function submit(status: 'submitted' | 'skipped'): void {
    const submittedAt = new Date().toISOString();
    const choiceResponse: ChatMessageChoiceResponse = {
      sourceMessageId: messageId,
      status,
      submittedAt,
      answers: choices.map((choice) => ({
        question: choice.question,
        selectedOptionIds: status === 'skipped'
          ? []
          : selectedByQuestion[choice.question] ?? [],
        ...(status === 'skipped' ? { skipped: true } : {}),
        ...(status !== 'skipped' && customByQuestion[choice.question]?.trim()
          ? { customText: customByQuestion[choice.question].trim() }
          : {}),
      })),
    };

    onSubmit({
      channelId,
      body: buildChoiceResponseBody(choiceResponse, choices),
      choiceResponse,
    });
  }

  return (
    <div className="messageChoices">
      {choices.map((choice) => (
        <section key={`${messageId}:${choice.question}`} className="messageChoiceSection">
          <p className="messageChoiceQuestion">{choice.question}</p>
          <div className="messageChoiceOptions">
            {choice.options.map((option) => {
              const selected = isSelected(choice.question, option.id);
              return (
                <button
                  key={`${messageId}:${choice.question}:${option.id}`}
                  className={selected
                    ? 'messageChoiceButton messageChoiceButtonSelected'
                    : 'messageChoiceButton'}
                  type="button"
                  disabled={disabled}
                  title={option.description}
                  onClick={() => toggleOption(choice.question, option.id, choice.multiSelect)}
                >
                  {option.label}
                </button>
              );
            })}
            {choice.allowCustom ? (
              <button
                className={customOpenByQuestion[choice.question]
                  ? 'messageChoiceButton messageChoiceButtonSelected'
                  : 'messageChoiceButton'}
                type="button"
                disabled={disabled}
                onClick={() =>
                  setCustomOpenByQuestion((current) => ({
                    ...current,
                    [choice.question]: !current[choice.question],
                  }))}
              >
                Custom
              </button>
            ) : null}
          </div>
          {choice.allowCustom && customOpenByQuestion[choice.question] ? (
            <textarea
              className="messageChoiceCustomInput"
              rows={2}
              value={existingResponse
                ? (answerForQuestion(existingResponse, choice.question)?.customText ?? '')
                : (customByQuestion[choice.question] ?? '')}
              disabled={disabled}
              placeholder="Add your own answer"
              onChange={(event) =>
                setCustomByQuestion((current) => ({
                  ...current,
                  [choice.question]: event.target.value,
                }))}
            />
          ) : null}
        </section>
      ))}
      {existingResponse ? (
        <p className="messageChoiceResolved">
          {existingResponse.status === 'skipped'
            ? 'Owner skipped these choices.'
            : 'Owner response recorded.'}
        </p>
      ) : (
        <div className="messageChoiceActions">
          <button
            className="messageChoiceActionButton messageChoiceActionButtonPrimary"
            type="button"
            disabled={busy || !canSubmit()}
            onClick={() => submit('submitted')}
          >
            Confirm
          </button>
          {allowSkip ? (
            <button
              className="messageChoiceActionButton"
              type="button"
              disabled={busy}
              onClick={() => submit('skipped')}
            >
              Skip
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

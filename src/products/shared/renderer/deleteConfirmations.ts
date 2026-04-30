import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../shared/i18n/index.js';

export interface DeleteConfirmationCopy {
  title: string;
  message: string;
  confirmLabel: string;
}

type DeleteConfirmationTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const defaultDeleteConfirmationTranslator = createTranslator('en');

function readEntityLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function buildDeleteParallelChatGroupConfirmation(
  groupTitle?: string | null,
  t: DeleteConfirmationTranslator = defaultDeleteConfirmationTranslator,
): DeleteConfirmationCopy {
  const label = readEntityLabel(
    groupTitle,
    t(messageKeys.sharedDeleteParallelChatGroupFallback),
  );
  return {
    title: t(messageKeys.sharedDeleteParallelChatGroupTitle),
    message: t(messageKeys.sharedDeleteParallelChatGroupMessage, {
      groupTitle: label,
    }),
    confirmLabel: t(messageKeys.sharedDeleteParallelChatGroupConfirm),
  };
}

export function buildDeleteCatConfirmation(
  catName?: string | null,
  t: DeleteConfirmationTranslator = defaultDeleteConfirmationTranslator,
): DeleteConfirmationCopy {
  const label = readEntityLabel(catName, t(messageKeys.sharedDeleteCatFallback));
  return {
    title: t(messageKeys.sharedDeleteCatTitle),
    message: t(messageKeys.sharedDeleteCatMessage, { catName: label }),
    confirmLabel: t(messageKeys.sharedDeleteCatConfirm),
  };
}

import type {
  MessageInterpolationValues,
  MessageKey,
} from '../../../../shared/i18n/index.js';

type WorkTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

export function localizeWorkCrudErrorMessage(
  message: string,
  t: WorkTranslator,
): string | null {
  const value = message.trim();
  if (value.length === 0) return null;

  switch (value) {
    case 'title is required.':
      return t('workCrudErrorTitleRequired');
    case 'Invalid input':
      return t('workCrudErrorInvalidInput');
    case 'Project id is required.':
      return t('workCrudErrorProjectIdRequired');
    case 'Work item id is required.':
      return t('workCrudErrorWorkItemIdRequired');
    case 'Task id is required.':
      return t('workCrudErrorTaskIdRequired');
    case 'must be a string when provided.':
      return t('workCrudErrorMustBeStringWhenProvided');
    case 'metadata must be an object when provided.':
      return t('workCrudErrorMetadataObjectRequired');
    default:
      break;
  }

  let match = /^No project with id (.+)\.$/u.exec(value);
  if (match) {
    return t('workCrudErrorProjectNotFound', { id: match[1] ?? '' });
  }
  match = /^No work item with id (.+)\.$/u.exec(value);
  if (match) {
    return t('workCrudErrorWorkItemNotFound', { id: match[1] ?? '' });
  }
  match = /^No task with id (.+)\.$/u.exec(value);
  if (match) {
    return t('workCrudErrorTaskNotFound', { id: match[1] ?? '' });
  }
  match = /^(.+) must be a string or null\.$/u.exec(value);
  if (match) {
    return t('workCrudErrorFieldStringOrNull', { fieldName: match[1] ?? '' });
  }
  match = /^(.+) must be a string\[\]\.$/u.exec(value);
  if (match) {
    return t('workCrudErrorFieldStringArray', { fieldName: match[1] ?? '' });
  }
  match = /^must be one of: (.+)\.$/u.exec(value);
  if (match) {
    return t('workCrudErrorMustBeOneOf', { values: match[1] ?? '' });
  }

  return null;
}

export function formatWorkCrudMutationError(
  error: unknown,
  fallback: string,
  t: WorkTranslator,
): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  return localizeWorkCrudErrorMessage(error.message, t) ?? error.message;
}

import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from "../../../../../shared/i18n/index.js";

export type WorkQueryTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

export function createWorkQueryHttpError(
  response: Response,
  t: WorkQueryTranslator,
): Error {
  const statusText = response.statusText.trim();
  return new Error(
    statusText
      ? t(messageKeys.workQueryHttpErrorWithStatusText, {
          status: response.status,
          statusText,
        })
      : t(messageKeys.workQueryHttpError, { status: response.status }),
  );
}

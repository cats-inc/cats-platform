import {
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { shouldSubmitComposerOnKeyDown } from '../../../../shared/composer.js';

export function useComposerSubmitBindings(
  submitComposerMessage: () => Promise<void>,
) {
  const onSendMessage = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      await submitComposerMessage();
    },
    [submitComposerMessage],
  );

  const onComposerKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLTextAreaElement>): Promise<void> => {
      if (
        !shouldSubmitComposerOnKeyDown({
          key: event.key,
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          isComposing: event.nativeEvent.isComposing,
        })
      ) {
        return;
      }

      event.preventDefault();
      await submitComposerMessage();
    },
    [submitComposerMessage],
  );

  return {
    onComposerKeyDown,
    onSendMessage,
  };
}

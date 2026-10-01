import type { KeyboardEvent, MouseEvent } from 'react';

import { useI18n } from '../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../shared/i18n/index.js';

/** Red mark for a saved model choice the current catalog no longer offers. */
export function SelectionAttentionBadge(input: {
  hint: string;
  placement?: 'inline' | 'avatarCorner';
}) {
  const { t } = useI18n();
  return (
    <span
      className={`selectionAttentionBadge${input.placement === 'avatarCorner' ? ' isAvatarCorner' : ''}`}
      role="img"
      aria-label={`${t(messageKeys.sharedProviderModelAttentionBadgeLabel)}: ${input.hint}`}
      data-tooltip={input.hint}
    >
      !
    </span>
  );
}

/**
 * Covers a marked avatar so a click anywhere on it opens the place to choose
 * again, instead of the avatar's usual action. The parent must be positioned.
 */
export function AvatarSelectionAttention(input: { hint: string; onOpen: () => void }) {
  const { t } = useI18n();
  const open = (event: MouseEvent | KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    input.onOpen();
  };
  return (
    <span
      className="selectionAttentionAvatarTarget"
      role="button"
      tabIndex={0}
      aria-label={`${t(messageKeys.sharedProviderModelAttentionBadgeLabel)}: ${input.hint}`}
      data-tooltip={input.hint}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') open(event);
      }}
    >
      <span className="selectionAttentionBadge isAvatarCorner" aria-hidden="true">!</span>
    </span>
  );
}

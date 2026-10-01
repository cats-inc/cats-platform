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

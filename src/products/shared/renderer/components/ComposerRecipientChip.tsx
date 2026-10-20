import type { CSSProperties } from 'react';

import { buildCatExecutionLabel } from '../../../../shared/executionLabel.js';
import { cloneProviderModelSelection, type ProviderModelSelection } from '../../../../shared/providerSelection.js';
import type { AppShellPayload } from '../../api/workspaceContracts.js';
import { catInitials } from '../workspaceChatUtils.js';
import { isAdminCat } from '../../catGroups.js';

export interface RecipientChipTarget {
  kind: 'named';
  participantId?: string;
  catId?: string;
  name: string;
  executionLabel?: string | null;
  avatarColor?: string | null;
  avatarUrl?: string | null;
  provider?: string | null;
  instance?: string | null;
  model?: string | null;
  modelSelection?: ProviderModelSelection | null;
  isBoss?: boolean;
}

export interface ComposerRecipientChipProps {
  recipients: RecipientChipTarget[];
  onClick?: () => void;
  disabled?: boolean;
}

export function buildNamedRecipient(input: {
  participantId?: string;
  catId?: string;
  name: string;
  avatarColor?: string | null;
  avatarUrl?: string | null;
  executionLabel?: string | null;
  provider?: string | null;
  instance?: string | null;
  model?: string | null;
  modelSelection?: ProviderModelSelection | null;
  isBoss?: boolean;
}): RecipientChipTarget {
  return {
    kind: 'named',
    participantId: input.participantId,
    catId: input.catId,
    name: input.name,
    executionLabel: input.executionLabel ?? null,
    avatarColor: input.avatarColor ?? null,
    avatarUrl: input.avatarUrl ?? null,
    provider: input.provider ?? null,
    instance: input.instance ?? null,
    model: input.model ?? null,
    modelSelection: cloneProviderModelSelection(input.modelSelection),
    isBoss: input.isBoss ?? false,
  };
}

export function buildRecipientFromCat(
  cat: AppShellPayload['chat']['cats'][number],
): RecipientChipTarget {
  return buildNamedRecipient({
    catId: cat.id,
    name: cat.name,
    executionLabel: buildCatExecutionLabel(cat as Parameters<typeof buildCatExecutionLabel>[0]),
    avatarColor: cat.avatarColor,
    avatarUrl: cat.avatarUrl,
    provider: cat.defaultExecutionTarget?.provider ?? null,
    instance: cat.defaultExecutionTarget?.instance ?? null,
    model: cat.defaultExecutionTarget?.model ?? null,
    modelSelection: cat.defaultModelSelection ?? null,
    isBoss: isAdminCat(cat),
  });
}

function RecipientAvatar({ target }: { target: RecipientChipTarget }) {
  const style: CSSProperties = target.avatarUrl
    ? { backgroundImage: `url(${target.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : target.avatarColor
      ? { backgroundColor: target.avatarColor }
      : {};

  return (
    <span
      className={`recipientChipAvatar${target.isBoss ? ' recipientChipAvatarBoss' : ''}`}
      style={style}
    >
      {target.avatarUrl ? null : catInitials(target.name)}
    </span>
  );
}

export function ComposerRecipientChip({
  recipients,
  onClick,
  disabled,
}: ComposerRecipientChipProps) {
  if (recipients.length === 0) return null;

  const primary = recipients[0]!;
  const overflow = recipients.length > 1 ? recipients.length - 1 : 0;

  return (
    <button
      type="button"
      className="composerRecipientChip"
      disabled={disabled || !onClick}
      onClick={onClick}
      data-tooltip={
        recipients.length === 1
          ? primary.name
          : `${primary.name} + ${overflow} more`
      }
    >
      <span className="composerRecipientChipAvatars">
        {recipients.slice(0, 3).map((target, index) => (
          <span
            key={target.catId ?? target.participantId ?? target.name ?? index}
            className="composerRecipientChipAvatarSlot"
            style={{ zIndex: recipients.length - index }}
          >
            <RecipientAvatar target={target} />
          </span>
        ))}
      </span>
      <span className="composerRecipientChipLabel">
        {primary.name}
        {overflow > 0 ? <span className="composerRecipientChipOverflow"> +{overflow}</span> : null}
      </span>
      <svg className="composerRecipientChipCaret" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 4 5 6.5 7.5 4" />
      </svg>
    </button>
  );
}

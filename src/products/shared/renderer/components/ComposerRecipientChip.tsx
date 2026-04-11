import type { CSSProperties } from 'react';

import { buildExecutionLabel, resolveControlDisplayLabels } from '../../../../shared/executionLabel.js';
import { cloneProviderModelSelection, type ProviderModelSelection } from '../../../../shared/providerSelection.js';
import type { AppShellPayload } from '../../api/workspaceContracts.js';
import { catInitials } from '../workspaceChatUtils.js';

export interface RecipientChipTarget {
  kind: 'named' | 'implicit';
  participantId?: string;
  catId?: string;
  name: string;
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
  bossCatId: string | null,
): RecipientChipTarget {
  return buildNamedRecipient({
    catId: cat.id,
    name: cat.name,
    avatarColor: cat.avatarColor,
    avatarUrl: cat.avatarUrl,
    provider: cat.defaultExecutionTarget?.provider ?? null,
    instance: cat.defaultExecutionTarget?.instance ?? null,
    model: cat.defaultExecutionTarget?.model ?? null,
    modelSelection: cat.defaultModelSelection ?? null,
    isBoss: cat.id === bossCatId,
  });
}

export function buildImplicitRecipient(input: {
  provider: string;
  instance?: string | null;
  model?: string | null;
  modelSelection?: ProviderModelSelection | null;
}): RecipientChipTarget {
  const controlLabels = resolveControlDisplayLabels(input.modelSelection?.controls);
  return {
    kind: 'implicit',
    name: buildExecutionLabel(
      input.provider,
      input.instance ?? null,
      input.model ?? null,
      null,
      controlLabels,
    ),
    provider: input.provider,
    instance: input.instance ?? null,
    model: input.model ?? null,
    modelSelection: cloneProviderModelSelection(input.modelSelection),
  };
}

function RecipientAvatar({ target }: { target: RecipientChipTarget }) {
  if (target.kind === 'implicit') {
    return (
      <span className="recipientChipIcon" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6" />
          <path d="M5.5 8h5M8 5.5v5" />
        </svg>
      </span>
    );
  }

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

import { type CSSProperties, type RefObject, useEffect, useRef } from 'react';

import { nameInitials } from '../../../../shared/nameInitials.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { ProviderModelFields } from '../../../../design/components/ProviderModelFields.js';
import type { AudienceTargetEditor } from './AudienceChip.js';
import {
  buildExecutionTargetLabel,
  createExecutionTargetValueFromProviderSelection,
} from './ExecutionTarget.js';
import type { DraftComposerStackParticipant } from './newConversationDraftSupport.js';

export function buildAudienceAvatarStyle(
  participant: DraftComposerStackParticipant,
): CSSProperties {
  if (participant.avatarUrl) {
    return {
      backgroundImage: `url(${participant.avatarUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return participant.isCat
    ? { background: participant.avatarColor ?? '#8B7E74' }
    : {
        background: '#fff',
        color: '#222',
        border: '1px solid rgba(0, 0, 0, 0.15)',
      };
}

/**
 * The tooltip for a participant's avatar. Its model comes from the target the
 * participant's editor changes, so the avatar and its popover cannot disagree.
 */
export function buildParticipantTooltip(
  participant: DraftComposerStackParticipant,
  editor: AudienceTargetEditor | null,
): string | undefined {
  const executionLabel = editor
    ? buildExecutionTargetLabel(editor.target)
    : participant.executionLabel;
  if (participant.isCat && executionLabel) {
    return `${participant.name} · ${executionLabel}`;
  }
  return executionLabel || participant.name || undefined;
}

/** Closes a floating layer on Escape or on a press outside the returned anchor. */
export function useDismissablePopover(
  open: boolean,
  onClose: () => void,
): RefObject<HTMLDivElement> {
  const anchorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(event: MouseEvent) {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);
  return anchorRef;
}

/** Where the popover sits against its anchor: above it or below it, from its start or end edge. */
export type ParticipantTargetPopoverPlacement = 'above-end' | 'above-start' | 'below-start';

const placementClassNames: Record<ParticipantTargetPopoverPlacement, string> = {
  'above-end': '',
  'above-start': ' audiencePopoverStart',
  'below-start': ' audiencePopoverStart audiencePopoverBelow',
};

export interface ParticipantTargetPopoverProps {
  participant: DraftComposerStackParticipant;
  editor: AudienceTargetEditor;
  /** The implicit target has no identity of its own and so no header. */
  showIdentity: boolean;
  placement: ParticipantTargetPopoverPlacement;
  onClose: () => void;
}

/** One participant's model picker, with its conversation action and settings link. */
export function ParticipantTargetPopover({
  participant,
  editor,
  showIdentity,
  placement,
  onClose,
}: ParticipantTargetPopoverProps) {
  const { t } = useI18n();
  return (
    <div
      className={`audiencePopover audiencePopoverEditor${placementClassNames[placement]}`}
      role="dialog"
      aria-label={participant.name}
    >
      {showIdentity ? (
        <div className="audiencePopoverEditorHeader">
          <div className="audiencePopoverAvatar" style={buildAudienceAvatarStyle(participant)}>
            {participant.avatarUrl ? null : nameInitials(participant.name)}
          </div>
          <span className="audiencePopoverName">{participant.name}</span>
        </div>
      ) : null}
      <div className="audiencePopoverEditorFields">
        <ProviderModelFields
          provider={editor.target.provider}
          instance={editor.target.instance ?? ''}
          model={editor.target.model ?? ''}
          modelSelection={editor.target.modelSelection}
          onTargetChange={(selection) => {
            editor.onChange(createExecutionTargetValueFromProviderSelection(selection));
          }}
        />
      </div>
      {editor.action ? (
        <button
          type="button"
          className="operatorActionButton audiencePopoverAction"
          disabled={editor.action.disabled}
          onClick={() => {
            onClose();
            editor.action?.onSelect();
          }}
        >
          {editor.action.label}
        </button>
      ) : null}
      {editor.action?.hint ? (
        <p className="operatorEmptyState audiencePopoverActionHint">{editor.action.hint}</p>
      ) : null}
      {editor.onOpenSettings ? (
        <button
          type="button"
          className="audiencePopoverSettingsLink"
          onClick={() => {
            onClose();
            editor.onOpenSettings?.();
          }}
        >
          {t(messageKeys.sharedAudienceOpenCatSettingsLabel, { name: participant.name })}
        </button>
      ) : null}
    </div>
  );
}

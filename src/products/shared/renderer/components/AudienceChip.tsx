import { type DragEvent, useCallback, useState } from 'react';

import { nameInitials } from '../../../../shared/nameInitials.js';
import type { RoomWorkflowShape } from '../../../../shared/roomRouting.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { SelectionAttentionBadge } from '../../../../design/components/SelectionAttentionBadge.js';
import { buildExecutionTargetLabel, type ExecutionTargetValue } from './ExecutionTarget.js';
import type { DraftComposerStackParticipant } from './newConversationDraftSupport.js';
import {
  buildAudienceAvatarStyle,
  buildParticipantTooltip,
  ParticipantTargetPopover,
  useDismissablePopover,
} from './ParticipantTargetPopover.js';

/** A temporary participant's own name and role hint. */
export interface ParticipantProfileEditor {
  name: string;
  roleHint: string | null;
  /** Saves a changed name or role hint; absent when both are read-only. */
  onSave?: (update: { name?: string; roleHint?: string | null }) => void;
}

/** The model a participant answers with in this conversation, and how to change it. */
export interface AudienceTargetEditor {
  target: ExecutionTargetValue;
  /** Absent when the model only changes at its source, such as an assistant preset. */
  onChange?: (value: ExecutionTargetValue) => void;
  profile?: ParticipantProfileEditor;
  /** Opens the cat's own page, where its default model lives. */
  onOpenSettings?: () => void;
  /** One conversation-level action shown under the picker, e.g. start fresh. */
  action?: {
    label: string;
    hint?: string;
    disabled?: boolean;
    onSelect: () => void;
  };
}

export interface AudienceChipProps {
  audienceParticipants: DraftComposerStackParticipant[];
  allParticipants?: DraftComposerStackParticipant[];
  onSetAudienceKeys?: (keys: string[]) => void;
  onSingleClick?: () => void;
  /**
   * The chip chooses who hears a message and in what order. Only a lone
   * participant, whose avatar the chip stands in for, opens its model picker.
   */
  resolveTargetEditor?: (participant: DraftComposerStackParticipant) => AudienceTargetEditor | null;
  disabled?: boolean;
  maxSelectedParticipants?: number;
  workflowShape?: RoomWorkflowShape;
  onToggleWorkflowShape?: () => void;
  /** Why the single target's saved model choice needs a new pick; shown as a red mark. */
  attention?: string | null;
}

function shouldShowAvatar(participant: DraftComposerStackParticipant): boolean {
  return Boolean(participant.avatarUrl || participant.avatarColor || participant.isCat || participant.participantId);
}

// When the chip carries a single audience member, the avatar is only meaningful
// for cats or participants with an explicit avatar/colour. A bare temp
// participant that collapses back to the implicit execution target should show
// no avatar.
function shouldShowImplicitAvatar(participant: DraftComposerStackParticipant): boolean {
  return Boolean(participant.avatarUrl || participant.avatarColor || participant.isCat);
}

export function AudienceChip({
  audienceParticipants,
  allParticipants = [],
  onSetAudienceKeys,
  onSingleClick,
  resolveTargetEditor,
  disabled,
  maxSelectedParticipants,
  workflowShape = 'sequential',
  onToggleWorkflowShape,
  attention,
}: AudienceChipProps) {
  const { t } = useI18n();
  const isMulti = audienceParticipants.length > 1;
  const canPopover = Boolean(onSetAudienceKeys) && allParticipants.length > 1;
  const [open, setOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const audienceKeySet = new Set(audienceParticipants.map((p) => p.key));
  const effectiveMaxSelectedParticipants = Number.isFinite(maxSelectedParticipants)
    ? Math.max(1, Math.trunc(maxSelectedParticipants ?? Number.POSITIVE_INFINITY))
    : Number.POSITIVE_INFINITY;

  const orderedForPopover = canPopover
    ? [
        ...audienceParticipants,
        ...allParticipants.filter((p) => !audienceKeySet.has(p.key)),
      ]
    : [];

  const closePopover = useCallback(() => setOpen(false), []);
  const wrapperRef = useDismissablePopover(open, closePopover);

  const first = audienceParticipants[0];
  const extraCount = audienceParticipants.length - 1;

  const toggleMember = useCallback((key: string) => {
    if (!onSetAudienceKeys) return;
    if (audienceKeySet.has(key)) {
      if (audienceParticipants.length <= 1) return;
      onSetAudienceKeys(audienceParticipants.filter((p) => p.key !== key).map((p) => p.key));
    } else {
      if (audienceParticipants.length >= effectiveMaxSelectedParticipants) return;
      onSetAudienceKeys([...audienceParticipants.map((p) => p.key), key]);
    }
  }, [
    audienceParticipants,
    audienceKeySet,
    effectiveMaxSelectedParticipants,
    onSetAudienceKeys,
  ]);

  const onDragStart = useCallback((event: DragEvent<HTMLDivElement>, index: number) => {
    setDragIndex(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }, []);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>, dropIndex: number) => {
    event.preventDefault();
    const fromIndex = dragIndex;
    setDragIndex(null);
    setDragOverIndex(null);
    if (!onSetAudienceKeys || fromIndex === null || fromIndex === dropIndex) return;

    const sourceKey = audienceParticipants[fromIndex]?.key;
    if (!sourceKey) return;

    const next = [...audienceParticipants.map((p) => p.key)];
    next.splice(fromIndex, 1);
    next.splice(dropIndex, 0, sourceKey);
    onSetAudienceKeys(next);
  }, [dragIndex, audienceParticipants, onSetAudienceKeys]);

  const onDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  if (!first) return null;

  // A participant's shown model always comes from the target its editor
  // changes, so the chip and its popover cannot disagree.
  const firstEditor = resolveTargetEditor?.(first) ?? null;
  const showsFirstEditor = !canPopover && firstEditor != null;
  const firstExecutionLabel = firstEditor
    ? buildExecutionTargetLabel(firstEditor.target)
    : first.executionLabel;
  const showAvatar = isMulti ? shouldShowAvatar(first) : shouldShowImplicitAvatar(first);
  const chipLabel = isMulti
    ? `${first.name} +${extraCount}`
    : (first.isCat ? first.name : (firstExecutionLabel || first.name));
  const firstTooltip = first.isCat && firstExecutionLabel
    ? `${first.name} · ${firstExecutionLabel}`
    : (firstExecutionLabel || first.name);
  const chipTooltip = isMulti ? t(messageKeys.sharedAudienceSelectAudienceLabel) : firstTooltip;

  const workflowTooltip = workflowShape === 'sequential'
    ? t(messageKeys.sharedAudienceSwitchToConcurrentModeLabel)
    : t(messageKeys.sharedAudienceSwitchToSequentialModeLabel);

  const handleChipClick = () => {
    if (open) {
      closePopover();
    } else if (canPopover || showsFirstEditor) {
      setOpen(true);
    } else if (onSingleClick) {
      onSingleClick();
    }
  };

  return (
    <div className="audienceChipWrapper" ref={wrapperRef}>
      <button
        type="button"
        className="audienceChip"
        disabled={disabled}
        onClick={handleChipClick}
        aria-expanded={canPopover || showsFirstEditor ? open : undefined}
        data-tooltip={open ? undefined : chipTooltip}
      >
        {showAvatar ? (
          <div className="audienceChipAvatar" style={buildAudienceAvatarStyle(first)}>
            {first.avatarUrl ? null : nameInitials(first.name)}
          </div>
        ) : null}
        <span className="audienceChipLabel">{chipLabel}</span>
        {attention ? (
          <SelectionAttentionBadge hint={`${attention} ${t(messageKeys.sharedProviderModelAttentionChooseHere)}`} />
        ) : null}
        <svg className="audienceChipChevron" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4 5 6.5 7.5 4" />
        </svg>
        {isMulti && onToggleWorkflowShape ? (
          <span
            className="audienceChipWorkflow"
            role="button"
            tabIndex={disabled ? -1 : 0}
            data-tooltip={workflowShape === 'sequential'
              ? t(messageKeys.sharedAudienceWorkflowSequential)
              : t(messageKeys.sharedAudienceWorkflowConcurrent)}
            aria-label={workflowTooltip}
            onClick={(event) => {
              event.stopPropagation();
              onToggleWorkflowShape();
            }}
          >
            {workflowShape === 'sequential' ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 4h8L3 12h9" />
                <path d="M10.5 10.5L12 12l-1.5 1.5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 5h8" />
                <path d="M9 3.5L11 5 9 6.5" />
                <path d="M3 11h8" />
                <path d="M9 9.5L11 11 9 12.5" />
              </svg>
            )}
          </span>
        ) : null}
      </button>

      {open && showsFirstEditor && firstEditor ? (
        <ParticipantTargetPopover
          participant={first}
          editor={firstEditor}
          showIdentity={first.isCat || firstEditor.profile != null}
          placement="above-end"
          onClose={closePopover}
        />
      ) : open && canPopover ? (
        <div className="audiencePopover">
          <div className="audiencePopoverHeader">{t(messageKeys.sharedAudiencePopoverHeader)}</div>
          {orderedForPopover.map((participant) => {
            const isInAudience = audienceKeySet.has(participant.key);
            const audienceIndex = isInAudience
              ? audienceParticipants.findIndex((p) => p.key === participant.key)
              : -1;
            const isDragging = dragIndex === audienceIndex;
            const isDragOver = dragOverIndex === audienceIndex;
            const editor = resolveTargetEditor?.(participant) ?? null;

            return (
              <div
                key={participant.key}
                className={`audiencePopoverItem${isDragging ? ' isDragging' : ''}${isDragOver ? ' isDragOver' : ''}`}
                data-tooltip={buildParticipantTooltip(participant, editor)}
                draggable={isInAudience}
                onDragStart={isInAudience ? (e) => onDragStart(e, audienceIndex) : undefined}
                onDragOver={isInAudience ? (e) => onDragOver(e, audienceIndex) : undefined}
                onDrop={isInAudience ? (e) => onDrop(e, audienceIndex) : undefined}
                onDragEnd={onDragEnd}
              >
                {isInAudience ? (
                  <span className="audiencePopoverDragHandle" aria-hidden="true">⋮⋮</span>
                ) : (
                  <span className="audiencePopoverDragHandle audiencePopoverDragHandlePlaceholder" aria-hidden="true" />
                )}
                <div className="audiencePopoverAvatar" style={buildAudienceAvatarStyle(participant)}>
                  {participant.avatarUrl ? null : nameInitials(participant.name)}
                </div>
                <span className="audiencePopoverName">{participant.name}</span>
                <label className="audiencePopoverCheck">
                  <input
                    type="checkbox"
                    checked={isInAudience}
                    disabled={
                      (isInAudience && audienceParticipants.length <= 1)
                      || (!isInAudience && audienceParticipants.length >= effectiveMaxSelectedParticipants)
                    }
                    onChange={() => toggleMember(participant.key)}
                  />
                </label>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

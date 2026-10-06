import { type CSSProperties, type DragEvent, useCallback, useEffect, useRef, useState } from 'react';

import { nameInitials } from '../../../../shared/nameInitials.js';
import type { RoomWorkflowShape } from '../../../../shared/roomRouting.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { ProviderModelFields } from '../../../../design/components/ProviderModelFields.js';
import { SelectionAttentionBadge } from '../../../../design/components/SelectionAttentionBadge.js';
import {
  buildExecutionTargetLabel,
  createExecutionTargetValueFromProviderSelection,
  type ExecutionTargetValue,
} from './ExecutionTarget.js';
import type { DraftComposerStackParticipant } from './newConversationDraftSupport.js';

/** The model a participant answers with in this conversation, and how to change it. */
export interface AudienceTargetEditor {
  target: ExecutionTargetValue;
  onChange: (value: ExecutionTargetValue) => void;
  /** Opens the cat's own page, where its default model lives. */
  onOpenSettings?: () => void;
}

export interface AudienceChipProps {
  audienceParticipants: DraftComposerStackParticipant[];
  allParticipants?: DraftComposerStackParticipant[];
  onSetAudienceKeys?: (keys: string[]) => void;
  onSingleClick?: () => void;
  /** Participants with an editor get their model picker inside the chip's popover. */
  resolveTargetEditor?: (participant: DraftComposerStackParticipant) => AudienceTargetEditor | null;
  disabled?: boolean;
  maxSelectedParticipants?: number;
  workflowShape?: RoomWorkflowShape;
  onToggleWorkflowShape?: () => void;
  /** Why the single target's saved model choice needs a new pick; shown as a red mark. */
  attention?: string | null;
}

function buildAvatarStyle(participant: DraftComposerStackParticipant): CSSProperties {
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
  // The participant whose picker replaces the list; one floating layer only.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
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

  const closePopover = useCallback(() => {
    setOpen(false);
    setEditingKey(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        closePopover();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closePopover();
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closePopover, open]);

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
    } else if (canPopover) {
      setEditingKey(null);
      setOpen(true);
    } else if (firstEditor) {
      setEditingKey(first.key);
      setOpen(true);
    } else if (onSingleClick) {
      onSingleClick();
    }
  };

  const editingParticipant = editingKey
    ? (canPopover ? orderedForPopover : [first]).find((participant) => participant.key === editingKey) ?? null
    : null;
  const editingEditor = editingParticipant ? resolveTargetEditor?.(editingParticipant) ?? null : null;
  // The implicit target has no identity of its own; its picker needs no header.
  const showEditingIdentity = editingParticipant != null
    && (editingParticipant.isCat || editingParticipant.participantId != null || canPopover);

  return (
    <div className="audienceChipWrapper" ref={wrapperRef}>
      <button
        type="button"
        className="audienceChip"
        disabled={disabled}
        onClick={handleChipClick}
        aria-expanded={canPopover || firstEditor ? open : undefined}
        data-tooltip={open ? undefined : chipTooltip}
      >
        {showAvatar ? (
          <div className="audienceChipAvatar" style={buildAvatarStyle(first)}>
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

      {open && editingParticipant && editingEditor ? (
        <div className="audiencePopover audiencePopoverEditor" role="dialog" aria-label={editingParticipant.name}>
          {showEditingIdentity ? (
            <div className="audiencePopoverEditorHeader">
              {canPopover ? (
                <button
                  type="button"
                  className="audiencePopoverBack"
                  aria-label={t(messageKeys.sharedAudienceBackToListLabel)}
                  onClick={() => setEditingKey(null)}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10 3 5 8l5 5" />
                  </svg>
                </button>
              ) : null}
              <div className="audiencePopoverAvatar" style={buildAvatarStyle(editingParticipant)}>
                {editingParticipant.avatarUrl ? null : nameInitials(editingParticipant.name)}
              </div>
              <span className="audiencePopoverName">{editingParticipant.name}</span>
            </div>
          ) : null}
          <div className="audiencePopoverEditorFields">
            <ProviderModelFields
              provider={editingEditor.target.provider}
              instance={editingEditor.target.instance ?? ''}
              model={editingEditor.target.model ?? ''}
              modelSelection={editingEditor.target.modelSelection}
              onTargetChange={(selection) => {
                editingEditor.onChange(createExecutionTargetValueFromProviderSelection(selection));
              }}
            />
          </div>
          {editingEditor.onOpenSettings ? (
            <button
              type="button"
              className="audiencePopoverSettingsLink"
              onClick={() => {
                closePopover();
                editingEditor.onOpenSettings?.();
              }}
            >
              {t(messageKeys.sharedAudienceOpenCatSettingsLabel, { name: editingParticipant.name })}
            </button>
          ) : null}
        </div>
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
            const executionLabel = editor ? buildExecutionTargetLabel(editor.target) : participant.executionLabel;
            const identity = (
              <>
                <div className="audiencePopoverAvatar" style={buildAvatarStyle(participant)}>
                  {participant.avatarUrl ? null : nameInitials(participant.name)}
                </div>
                <span className="audiencePopoverName">{participant.name}</span>
              </>
            );

            return (
              <div
                key={participant.key}
                className={`audiencePopoverItem${isDragging ? ' isDragging' : ''}${isDragOver ? ' isDragOver' : ''}`}
                data-tooltip={editor
                  ? undefined
                  : participant.isCat && executionLabel
                    ? `${participant.name} · ${executionLabel}`
                    : (executionLabel || undefined)}
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
                {editor ? (
                  <button
                    type="button"
                    className="audiencePopoverRowButton"
                    aria-label={t(messageKeys.sharedAudienceChangeModelLabel, { name: participant.name })}
                    onClick={() => setEditingKey(participant.key)}
                  >
                    {identity}
                    <span className="audiencePopoverModel">{executionLabel}</span>
                    <svg className="audiencePopoverRowChevron" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 3l5 5-5 5" />
                    </svg>
                  </button>
                ) : identity}
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

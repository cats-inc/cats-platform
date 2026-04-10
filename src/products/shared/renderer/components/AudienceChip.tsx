import { type DragEvent, useCallback, useEffect, useRef, useState } from 'react';

import { nameInitials } from '../../../../shared/nameInitials.js';
import type { RoomWorkflowShape } from '../../../../shared/roomRouting.js';
import type { DraftComposerStackParticipant } from './chatNewChatDraftSupport.js';

export interface AudienceChipProps {
  audienceParticipants: DraftComposerStackParticipant[];
  allParticipants: DraftComposerStackParticipant[];
  onSetAudienceKeys: (keys: string[]) => void;
  disabled?: boolean;
  workflowShape?: RoomWorkflowShape;
  onToggleWorkflowShape?: () => void;
}

export function AudienceChip({
  audienceParticipants,
  allParticipants,
  onSetAudienceKeys,
  disabled,
  workflowShape = 'sequential',
  onToggleWorkflowShape,
}: AudienceChipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const audienceKeySet = new Set(audienceParticipants.map((p) => p.key));

  // Build the ordered list for popover: audience first (in order), then excluded
  const orderedForPopover = [
    ...audienceParticipants,
    ...allParticipants.filter((p) => !audienceKeySet.has(p.key)),
  ];

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const first = audienceParticipants[0];
  const extraCount = audienceParticipants.length - 1;

  const toggleMember = useCallback((key: string) => {
    if (audienceKeySet.has(key)) {
      if (audienceParticipants.length <= 1) return;
      onSetAudienceKeys(audienceParticipants.filter((p) => p.key !== key).map((p) => p.key));
    } else {
      onSetAudienceKeys([...audienceParticipants.map((p) => p.key), key]);
    }
  }, [audienceParticipants, audienceKeySet, onSetAudienceKeys]);

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
    if (fromIndex === null || fromIndex === dropIndex) return;

    // Only reorder within the audience list
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

  return (
    <div className="audienceChipWrapper" ref={wrapperRef}>
      <button
        type="button"
        className="audienceChip"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        data-tooltip="Select audience"
      >
        <div
          className="audienceChipAvatar"
          style={
            first.avatarUrl
              ? {
                  backgroundImage: `url(${first.avatarUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : first.isCat
                ? { background: first.avatarColor ?? '#8B7E74' }
                : {
                    background: '#fff',
                    color: '#222',
                    border: '1px solid rgba(0, 0, 0, 0.15)',
                  }
          }
        >
          {first.avatarUrl ? null : nameInitials(first.name)}
        </div>
        <span className="audienceChipLabel">
          {audienceParticipants.length === 1
            ? first.name
            : `${first.name} +${extraCount}`}
        </span>
        <svg className="audienceChipChevron" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4 5 6.5 7.5 4" />
        </svg>
        {onToggleWorkflowShape ? (
          <span
            className={`audienceChipWorkflow${audienceParticipants.length <= 1 ? ' isDisabled' : ''}`}
            role="button"
            tabIndex={disabled || audienceParticipants.length <= 1 ? -1 : 0}
            data-tooltip={workflowShape === 'sequential' ? 'Sequential' : 'Concurrent'}
            aria-label={`Switch to ${workflowShape === 'sequential' ? 'concurrent' : 'sequential'} mode`}
            onClick={(event) => {
              event.stopPropagation();
              if (audienceParticipants.length > 1) {
                onToggleWorkflowShape();
              }
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

      {open ? (
        <div className="audiencePopover">
          <div className="audiencePopoverHeader">Audience</div>
          {orderedForPopover.map((participant, index) => {
            const isInAudience = audienceKeySet.has(participant.key);
            const audienceIndex = isInAudience
              ? audienceParticipants.findIndex((p) => p.key === participant.key)
              : -1;
            const isDragging = dragIndex === audienceIndex;
            const isDragOver = dragOverIndex === audienceIndex;

            return (
              <div
                key={participant.key}
                className={`audiencePopoverItem${isDragging ? ' isDragging' : ''}${isDragOver ? ' isDragOver' : ''}`}
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
                <div
                  className="audiencePopoverAvatar"
                  style={
                    participant.avatarUrl
                      ? {
                          backgroundImage: `url(${participant.avatarUrl})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }
                      : participant.isCat
                        ? { background: participant.avatarColor ?? '#8B7E74' }
                        : {
                            background: '#fff',
                            color: '#222',
                            border: '1px solid rgba(0, 0, 0, 0.15)',
                          }
                  }
                >
                  {participant.avatarUrl ? null : nameInitials(participant.name)}
                </div>
                <span className="audiencePopoverName">{participant.name}</span>
                <label className="audiencePopoverCheck">
                  <input
                    type="checkbox"
                    checked={isInAudience}
                    disabled={isInAudience && audienceParticipants.length <= 1}
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

import { useEffect, useRef, useState } from 'react';

import { messageKeys } from '../../../shared/i18n/index.js';
import type {
  MembershipStatus,
  PlatformClowderView,
  PlatformDirectoryView,
  PlatformLobbyCatSummary,
} from '../../../shared/platform-contract.js';
import { useI18n } from '../i18n/index.js';
import { directoryApi, type DirectoryRequestError } from './directoryApi.js';
import {
  DirectoryCatAvatar,
  DirectoryGroupAvatar,
  DirectorySegmented,
  groupClowders,
  type DirectoryCanvasActions,
} from './directoryParts.js';

/**
 * Moves a Cat to another Clowder, or also adds it there. With no `source` (a
 * Cattery member in no Clowder) it only adds, with `status` as the new
 * membership's status. Moving is one request, so a failure never leaves the
 * Cat in neither Clowder.
 */
export function MoveMemberDialog({
  directory,
  source,
  cat,
  initialMode,
  status,
  actions,
  onClose,
}: {
  directory: PlatformDirectoryView;
  source: PlatformClowderView | null;
  cat: PlatformLobbyCatSummary;
  initialMode: 'move' | 'add';
  status?: MembershipStatus;
  actions: DirectoryCanvasActions;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'move' | 'add'>(source ? initialMode : 'add');
  const targets = directory.clowders.filter((candidate) => candidate.id !== source?.id);
  const isMember = (target: PlatformClowderView) => target.members.some((member) => member.catId === cat.id);
  const [targetId, setTargetId] = useState<string | null>(targets.find((target) => !isMember(target))?.id ?? null);
  const target = targets.find((candidate) => candidate.id === targetId) ?? null;
  const groups = groupClowders({ ...directory, clowders: targets }, t(messageKeys.clowderHomeChipCrossUnit));
  const dialogRef = useRef<HTMLDivElement>(null);
  const title = source
    ? t(messageKeys.clowdersCanvasMoveTitle, { name: cat.name })
    : t(messageKeys.clowdersCanvasAddTitle, { name: cat.name });

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    dialogRef.current?.querySelector<HTMLElement>('[aria-checked="true"], button[aria-pressed="true"]')?.focus();
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function confirm() {
    if (!target) return;
    const membership = source?.members.find((member) => member.catId === cat.id);
    try {
      if (source && mode === 'move') {
        await actions.run(() => directoryApi.moveClowderMember(source.id, cat.id, target.id));
        actions.toast(t(messageKeys.clowdersCanvasToastMoved, { cat: cat.name, group: target.name }));
      } else {
        const nextStatus = membership?.status ?? status ?? 'formal';
        await actions.run(() => directoryApi.addClowderMember(target.id, {
          catId: cat.id,
          status: nextStatus,
          expiresAt: nextStatus === 'temp' ? membership?.expiresAt ?? null : null,
        }));
        actions.toast(t(messageKeys.directoryToastAdded, { cat: cat.name, group: target.name }));
      }
      onClose();
    } catch (error) {
      actions.fail(error as DirectoryRequestError);
    }
  }

  return (
    <div className="confirmOverlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="confirmDialog directoryMoveDialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="directoryMoveHeader">
          <DirectoryCatAvatar cat={cat} />
          <div>
            <p className="confirmTitle">{title}</p>
            {source ? (
              <p className="directoryHint">{t(messageKeys.clowdersCanvasMoveCurrent, { group: source.name })}</p>
            ) : null}
          </div>
        </div>
        {source ? (
          <>
            <DirectorySegmented<'move' | 'add'>
              label={t(messageKeys.clowdersCanvasMoveModeAria)}
              value={mode}
              options={[
                { value: 'move', label: t(messageKeys.clowdersCanvasMoveModeMove) },
                { value: 'add', label: t(messageKeys.clowdersCanvasMoveModeAdd) },
              ]}
              onChange={setMode}
            />
            <p className="directoryHint">
              {t(mode === 'move' ? messageKeys.clowdersCanvasMoveModeMoveHint : messageKeys.clowdersCanvasMoveModeAddHint, {
                name: cat.name,
                group: source.name,
              })}
            </p>
          </>
        ) : null}
        <div className="directoryMoveTargets" role="radiogroup" aria-label={t(messageKeys.clowdersCanvasMoveChoose)}>
          {targets.length === 0 ? <p className="directoryHint">{t(messageKeys.clowdersCanvasMoveNoTargets)}</p> : null}
          {groups.map((group) => (
            <div key={group.key} className="directoryMoveGroup">
              <span className="directoryStripCaption">{group.label}</span>
              {group.clowders.map((candidate) => {
                const already = isMember(candidate);
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    role="radio"
                    aria-checked={candidate.id === targetId}
                    className="directoryMoveTarget"
                    disabled={already}
                    onClick={() => setTargetId(candidate.id)}
                  >
                    <DirectoryGroupAvatar name={candidate.name} kind="clowder" size="small" />
                    <span className="directoryOptionName">{candidate.name}</span>
                    <span className="directoryHint">
                      {already
                        ? t(messageKeys.clowdersCanvasMoveAlreadyIn)
                        : t(messageKeys.clowdersCanvasMoveMemberCount, { count: String(candidate.members.length) })}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="confirmActions">
          <button type="button" className="confirmCancelButton" onClick={onClose}>
            {t(messageKeys.sharedCatsCreateCancel)}
          </button>
          <button
            type="button"
            className="confirmPrimaryButton"
            disabled={!target || actions.pending}
            onClick={() => { void confirm(); }}
          >
            {target
              ? t(source && mode === 'move' ? messageKeys.clowdersCanvasMoveConfirmMove : messageKeys.clowdersCanvasMoveConfirmAdd, { group: target.name })
              : t(source && mode === 'move' ? messageKeys.clowdersCanvasMoveModeMove : messageKeys.clowdersCanvasMoveModeAdd)}
          </button>
        </div>
      </div>
    </div>
  );
}

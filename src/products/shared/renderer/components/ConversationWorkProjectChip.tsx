import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { messageKeys } from '../../../../shared/i18n/index.js';
import { useI18n } from '../../../../app/renderer/i18n/useI18n.js';
import {
  ConversationWorkProjectError,
  fetchConversationWorkProject,
  setConversationWorkProject,
  type ConversationWorkProjectOption,
  type ConversationWorkProjectView,
} from '../api/workProject.js';

type Translate = ReturnType<typeof useI18n>['t'];

/** The owner-facing reason for a refused change, from the route's stable code (FR-23). */
export function describeWorkProjectRefusal(code: string | null | undefined, t: Translate): string {
  switch (code) {
    case 'parallel_member': return t(messageKeys.sharedWorkProjectErrorParallelMember);
    case 'conversation_archived': return t(messageKeys.sharedWorkProjectErrorArchived);
    case 'supervised_run_active': return t(messageKeys.sharedWorkProjectErrorRunActive);
    case 'project_not_found':
    case 'project_archived': return t(messageKeys.sharedWorkProjectErrorProjectGone);
    case 'revision_stale': return t(messageKeys.sharedWorkProjectErrorStale);
    case 'not_work_level':
    case 'direct_lane': return t(messageKeys.sharedWorkProjectErrorNotWork);
    default: return t(messageKeys.sharedWorkProjectErrorGeneric);
  }
}

/** What the confirmation says for a choice: the folder its supervised runs would start in (FR-16, FR-26). */
export function buildWorkProjectConfirmation(
  view: Pick<ConversationWorkProjectView, 'project'>,
  target: ConversationWorkProjectOption | null,
  t: Translate,
): { title: string; lines: string[]; confirmLabel: string } {
  if (!target) {
    return {
      title: t(messageKeys.sharedWorkProjectLeaveTitle, { project: view.project?.title ?? '' }),
      lines: [t(messageKeys.sharedWorkProjectLeaveNote)],
      confirmLabel: t(messageKeys.sharedWorkProjectLeaveConfirm),
    };
  }
  return {
    title: t(messageKeys.sharedWorkProjectJoinTitle, { project: target.title }),
    lines: [
      target.folder
        ? t(messageKeys.sharedWorkProjectFolderWarning, { folder: target.folder })
        : t(messageKeys.sharedWorkProjectFolderSandbox),
      t(messageKeys.sharedWorkProjectReach, { conversations: target.otherConversations, workItems: target.workItems }),
      t(messageKeys.sharedWorkProjectOwnFolder),
    ],
    confirmLabel: t(messageKeys.sharedWorkProjectJoinConfirm),
  };
}

export interface ConversationWorkProjectChipProps {
  readOnly?: boolean;
  channel: { id: string; workProjectId?: string | null };
  /** Shows a short notice, such as the outcome of a change. */
  report(message: string): void;
}

/**
 * SPEC-142 FR-23: the owner sets, changes or clears a Work conversation's Project here. The parent
 * mounts it only for a conversation at Work that is not a direct lane.
 */
export function ConversationWorkProjectChip({ channel, report, readOnly = false }: ConversationWorkProjectChipProps) {
  const { t } = useI18n();
  const [view, setView] = useState<ConversationWorkProjectView | null>(null);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<{ view: ConversationWorkProjectView; target: ConversationWorkProjectOption | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // One change at a time, locked in the handler and not only on the button.
  const savingRef = useRef(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setOpen(false);
    setDialog(null);
    fetchConversationWorkProject(channel.id, controller.signal)
      .then((next) => { if (!controller.signal.aborted) setView(next); })
      .catch(() => { if (!controller.signal.aborted) setView(null); });
    return () => controller.abort();
  }, [channel.id, channel.workProjectId, reload, readOnly]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent): void {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const label = view?.project?.title ?? t(messageKeys.sharedWorkProjectChipNone);
  const fixedReason = readOnly ? t(messageKeys.sharedWorkProjectErrorArchived)
    : view && !view.canChange ? describeWorkProjectRefusal(view.refusal, t) : null;
  const choices = view ? view.projects.filter((option) => option.id !== view.projectId) : [];

  async function confirm(): Promise<void> {
    if (!dialog || savingRef.current || readOnly) return;
    const { view: shown, target } = dialog;
    setDialog(null);
    savingRef.current = true;
    setSaving(true);
    try {
      await setConversationWorkProject(channel.id, target?.id ?? null, shown.revision);
      report(target
        ? t(messageKeys.sharedWorkProjectJoined, { project: target.title })
        : t(messageKeys.sharedWorkProjectLeft));
    } catch (error) {
      report(describeWorkProjectRefusal(error instanceof ConversationWorkProjectError ? error.code : null, t));
    } finally {
      savingRef.current = false;
      setSaving(false);
      setReload((value) => value + 1);
    }
  }

  return (
    <div className="composerSelectChipWrapper conversationWorkProjectChipWrapper" ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        className="composerSurfaceChip conversationWorkProjectChip"
        disabled={readOnly || !view || !view.canChange || saving}
        aria-busy={saving || undefined}
        aria-haspopup="menu"
        aria-expanded={open && !readOnly}
        title={saving
          ? t(messageKeys.sharedWorkProjectPending)
          : fixedReason
            ? t(messageKeys.sharedWorkProjectChipTitleFixed, { reason: fixedReason })
            : t(messageKeys.sharedWorkProjectChipTitle)}
        onClick={() => setOpen((current) => !current)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1.5 3.5h3l1 1h5v5.5h-9z" />
        </svg>
        <span>{label}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 4 5 6.5 7.5 4" />
        </svg>
      </button>
      {open && !readOnly && view && view.canChange && !saving ? (
        <div className="composerSelectChipMenu" role="menu" aria-label={t(messageKeys.sharedWorkProjectMenuAria)}>
          {view.projectId ? (
            <button type="button" role="menuitem" className="composerSelectChipMenuItem"
              onClick={() => { setOpen(false); setDialog({ view, target: null }); }}>
              <span>{t(messageKeys.sharedWorkProjectMenuNone)}</span>
            </button>
          ) : null}
          {choices.map((option) => (
            <button key={option.id} type="button" role="menuitem" className="composerSelectChipMenuItem"
              onClick={() => { setOpen(false); setDialog({ view, target: option }); }}>
              <span>{option.title}</span>
              <span className="conversationWorkProjectMenuFolder">{option.folder ?? t(messageKeys.sharedWorkProjectMenuSandbox)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {dialog && !readOnly ? (
        <WorkProjectDialog
          content={buildWorkProjectConfirmation(dialog.view, dialog.target, t)}
          onCancel={() => setDialog(null)}
          onConfirm={() => { void confirm(); }}
          returnFocus={() => buttonRef.current?.focus()}
        />
      ) : null}
    </div>
  );
}

function WorkProjectDialog({ content, onCancel, onConfirm, returnFocus }: {
  content: { title: string; lines: string[]; confirmLabel: string };
  onCancel: () => void;
  onConfirm: () => void;
  returnFocus: () => void;
}) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const returnFocusRef = useRef(returnFocus);
  returnFocusRef.current = returnFocus;

  useEffect(() => {
    cancelRef.current?.focus();
    return () => returnFocusRef.current();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
      if (event.key === 'Tab') {
        const controls = containerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)');
        const first = controls?.[0];
        const last = controls?.[controls.length - 1];
        if (!containerRef.current?.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
          return;
        }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return createPortal(
    <div className="confirmOverlay" onClick={onCancel}>
      <div ref={containerRef} className="confirmDialog conversationWorkProjectDialog" role="dialog" aria-modal="true"
        aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <p id={titleId} className="confirmTitle">{content.title}</p>
        {content.lines.map((line) => <p key={line} className="confirmMessage">{line}</p>)}
        <div className="confirmActions">
          <button ref={cancelRef} className="confirmCancelButton" type="button" onClick={onCancel}>
            {t(messageKeys.sharedCommonCancel)}
          </button>
          <button className="confirmPrimaryButton" type="button" onClick={onConfirm}>
            {content.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

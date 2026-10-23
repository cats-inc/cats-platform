import React, { useCallback, useEffect, useId, useRef, useState } from 'react';

import { useI18n } from '../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../shared/i18n/index.js';

export type ConfirmDialogAction = 'confirm' | 'cancel' | 'auxiliary';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  auxiliaryLabel?: string;
  defaultAction?: ConfirmDialogAction;
  /** Confirm button styling; destructive (the default) for removals, primary for constructive actions. */
  tone?: 'destructive' | 'primary';
  requiredText?: { value: string; label: string };
  checkbox?: { label: string; description: string; disabled?: boolean; onChange: (checked: boolean) => void };
}

interface ConfirmDialogState {
  options: ConfirmDialogOptions;
  resolve: (action: ConfirmDialogAction) => void;
}

export function useConfirmDialog() {
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);

  const choose = useCallback((options: ConfirmDialogOptions): Promise<ConfirmDialogAction> => {
    return new Promise((resolve) => {
      setDialog({ options, resolve });
    });
  }, []);

  const confirm = useCallback(async (options: ConfirmDialogOptions): Promise<boolean> => {
    const action = await choose(options);
    return action === 'confirm';
  }, [choose]);

  const handleClose = useCallback((action: ConfirmDialogAction | boolean) => {
    if (dialog) {
      dialog.resolve(normalizeConfirmDialogAction(action));
      setDialog(null);
    }
  }, [dialog]);

  return { dialog, confirm, choose, handleClose };
}

export function ConfirmDialog(props: {
  dialog: { options: ConfirmDialogOptions } | null;
  onClose: (action: ConfirmDialogAction | boolean) => void;
}) {
  return props.dialog ? <ConfirmDialogContent dialog={props.dialog} onClose={props.onClose} /> : null;
}

function ConfirmDialogContent({
  dialog,
  onClose,
}: {
  dialog: { options: ConfirmDialogOptions };
  onClose: (action: ConfirmDialogAction | boolean) => void;
}) {
  const { t } = useI18n();
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const messageId = useId();
  const checkboxDescriptionId = useId();
  const [text, setText] = useState('');
  const [checked, setChecked] = useState(false);
  const canConfirm = !dialog.options.requiredText || text === dialog.options.requiredText.value;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    setText('');
    setChecked(false);
    initialFocusRef.current?.focus();
    return () => previous?.focus();
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose('cancel');
      }
      if (e.key === 'Tab') {
        const controls = containerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
        const first = controls?.[0];
        const last = controls?.[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dialog, onClose]);

  const defaultAction = dialog.options.defaultAction ?? 'confirm';

  return (
    <div className="confirmOverlay" onClick={() => onClose('cancel')}>
      <div ref={containerRef} className="confirmDialog" role="dialog" aria-modal="true"
        aria-labelledby={titleId} aria-describedby={messageId} onClick={(e) => e.stopPropagation()}>
        <p id={titleId} className="confirmTitle">{dialog.options.title}</p>
        <p id={messageId} className="confirmMessage">{dialog.options.message}</p>
        {dialog.options.checkbox ? <div className="confirmRuntimeOption">
          <label className="confirmCheckboxLabel"><input type="checkbox" checked={checked}
            disabled={dialog.options.checkbox.disabled} aria-describedby={checkboxDescriptionId}
            onChange={event => { setChecked(event.target.checked); dialog.options.checkbox?.onChange(event.target.checked); }} />
            {dialog.options.checkbox.label}</label>
          <p id={checkboxDescriptionId} className="confirmOptionDescription">{dialog.options.checkbox.description}</p>
        </div> : null}
        {dialog.options.requiredText ? <label className="confirmTextLabel">
          {dialog.options.requiredText.label}
          <input type="text" value={text} autoComplete="off" autoCapitalize="off" spellCheck={false}
            onChange={event => setText(event.target.value)} />
        </label> : null}
        <div className="confirmActions">
          <button
            ref={defaultAction === 'cancel' ? initialFocusRef : null}
            className="confirmCancelButton"
            type="button"
            onClick={() => onClose('cancel')}
          >
            {dialog.options.cancelLabel ?? t(messageKeys.sharedCommonCancel)}
          </button>
          {dialog.options.auxiliaryLabel ? (
            <button
              ref={defaultAction === 'auxiliary' ? initialFocusRef : null}
              className="confirmAuxiliaryButton"
              type="button"
              onClick={() => onClose('auxiliary')}
            >
              {dialog.options.auxiliaryLabel}
            </button>
          ) : null}
          <button
            ref={defaultAction === 'confirm' ? initialFocusRef : null}
            className={dialog.options.tone === 'primary' ? 'confirmPrimaryButton' : 'confirmDestructiveButton'}
            type="button"
            disabled={!canConfirm}
            onClick={() => { if (canConfirm) onClose('confirm'); }}
          >
            {dialog.options.confirmLabel ?? t(messageKeys.sharedCommonDelete)}
          </button>
        </div>
      </div>
    </div>
  );
}

function normalizeConfirmDialogAction(
  action: ConfirmDialogAction | boolean,
): ConfirmDialogAction {
  if (typeof action === 'boolean') {
    return action ? 'confirm' : 'cancel';
  }
  return action;
}

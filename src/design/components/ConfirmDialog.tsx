import React, { useCallback, useEffect, useRef, useState } from 'react';

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

export function ConfirmDialog({
  dialog,
  onClose,
}: {
  dialog: { options: ConfirmDialogOptions } | null;
  onClose: (action: ConfirmDialogAction | boolean) => void;
}) {
  const { t } = useI18n();
  const initialFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (dialog) {
      initialFocusRef.current?.focus();
    }
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose('cancel');
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dialog, onClose]);

  if (!dialog) return null;

  const defaultAction = dialog.options.defaultAction ?? 'confirm';

  return (
    <div className="confirmOverlay" onClick={() => onClose('cancel')}>
      <div className="confirmDialog" onClick={(e) => e.stopPropagation()}>
        <p className="confirmTitle">{dialog.options.title}</p>
        <p className="confirmMessage">{dialog.options.message}</p>
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
            className="confirmDestructiveButton"
            type="button"
            onClick={() => onClose('confirm')}
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

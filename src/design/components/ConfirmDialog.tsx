import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmDialogState {
  options: ConfirmDialogOptions;
  resolve: (confirmed: boolean) => void;
}

export function useConfirmDialog() {
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);

  const confirm = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({ options, resolve });
    });
  }, []);

  const handleClose = useCallback((confirmed: boolean) => {
    if (dialog) {
      dialog.resolve(confirmed);
      setDialog(null);
    }
  }, [dialog]);

  return { dialog, confirm, handleClose };
}

export function ConfirmDialog({
  dialog,
  onClose,
}: {
  dialog: { options: ConfirmDialogOptions } | null;
  onClose: (confirmed: boolean) => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (dialog) {
      confirmRef.current?.focus();
    }
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dialog, onClose]);

  if (!dialog) return null;

  return (
    <div className="confirmOverlay" onClick={() => onClose(false)}>
      <div className="confirmDialog" onClick={(e) => e.stopPropagation()}>
        <p className="confirmTitle">{dialog.options.title}</p>
        <p className="confirmMessage">{dialog.options.message}</p>
        <div className="confirmActions">
          <button
            className="confirmCancelButton"
            type="button"
            onClick={() => onClose(false)}
          >
            {dialog.options.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            className="confirmDestructiveButton"
            type="button"
            onClick={() => onClose(true)}
          >
            {dialog.options.confirmLabel ?? 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

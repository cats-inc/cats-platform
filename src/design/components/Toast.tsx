import { useCallback, useEffect, useRef, useState } from 'react';

import { useI18n } from '../../app/renderer/i18n/index.js';
import { messageKeys } from '../../shared/i18n/messageKeys.js';

/** A button on a toast, such as "Open System Settings" (ADR-147). */
export interface ToastAction {
  label: string;
  onSelect: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
}

export type ShowToast = (message: string, options?: ToastOptions) => void;

interface ToastEntry {
  id: number;
  message: string;
  fading: boolean;
  action?: ToastAction;
  dismiss?: () => void;
}

const TOAST_DURATION_MS = 3000;
const TOAST_FADE_MS = 300;

let nextId = 1;

export function useToast() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, fading: true } : t)),
    );
    const removeTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(id);
    }, TOAST_FADE_MS);
    timersRef.current.set(id, removeTimer);
  }, []);

  const show = useCallback<ShowToast>((message, options) => {
    if (!message) return;
    const id = nextId++;
    // A toast with an action stays until the owner uses it or dismisses it:
    // three seconds is too short to reach a button.
    if (options?.action) {
      const action = options.action;
      setToasts((prev) => [
        ...prev,
        { id, message, fading: false, action, dismiss: () => dismiss(id) },
      ]);
      return;
    }
    setToasts((prev) => [...prev, { id, message, fading: false }]);

    const fadeTimer = setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    timersRef.current.set(id, fadeTimer);
  }, [dismiss]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return { toasts, showToast: show };
}

export function ToastContainer({ toasts }: { toasts: ToastEntry[] }) {
  const { t } = useI18n();
  if (toasts.length === 0) return null;
  return (
    <div className="toastContainer">
      {toasts.map((entry) => (
        <div
          key={entry.id}
          className={[
            'toast',
            entry.action ? 'toastWithAction' : '',
            entry.fading ? 'toastFading' : '',
          ].filter(Boolean).join(' ')}
          role={entry.action ? 'alert' : undefined}
        >
          <span className="toastMessage">{entry.message}</span>
          {entry.action && (
            <button
              type="button"
              className="toastAction"
              onClick={() => {
                entry.dismiss?.();
                entry.action?.onSelect();
              }}
            >
              {entry.action.label}
            </button>
          )}
          {entry.action && (
            <button
              type="button"
              className="toastDismiss"
              aria-label={t(messageKeys.sharedCommonDismiss)}
              onClick={() => entry.dismiss?.()}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

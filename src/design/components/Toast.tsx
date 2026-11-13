import { useCallback, useEffect, useRef, useState } from 'react';

import { useI18n } from '../../app/renderer/i18n/index.js';
import { messageKeys } from '../../shared/i18n/messageKeys.js';

/** A button on a toast, such as "Open System Settings" (ADR-147). */
export interface ToastAction {
  label: string;
  onSelect: () => void;
}

/** `error` stays until the owner dismisses it; `info` (the default) fades after three seconds. */
export type ToastLevel = 'info' | 'error';

export interface ToastOptions {
  action?: ToastAction;
  level?: ToastLevel;
  /**
   * One toast per key: showing a keyed toast replaces the open one with that key, and
   * `dismissToast(key)` removes it, for a toast that mirrors state its owner may clear.
   */
  key?: string;
  /** Called when the owner closes the toast (✕ or its action), not when `dismissToast` removes it. */
  onDismiss?: () => void;
}

export type ShowToast = (message: string, options?: ToastOptions) => void;

interface ToastEntry {
  id: number;
  message: string;
  fading: boolean;
  level: ToastLevel;
  /** Stays until the owner acts: it has an action or is an error. */
  persistent: boolean;
  action?: ToastAction;
  dismiss?: () => void;
}

const TOAST_DURATION_MS = 3000;
const TOAST_FADE_MS = 300;

let nextId = 1;

export function useToast() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const keyedRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    for (const [key, keyedId] of keyedRef.current) {
      if (keyedId === id) keyedRef.current.delete(key);
    }
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, fading: true } : t)),
    );
    const removeTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(id);
    }, TOAST_FADE_MS);
    timersRef.current.set(id, removeTimer);
  }, []);

  const dismissToast = useCallback((key: string) => {
    const id = keyedRef.current.get(key);
    if (id !== undefined) dismiss(id);
  }, [dismiss]);

  const show = useCallback<ShowToast>((message, options) => {
    if (!message) return;
    const id = nextId++;
    const level = options?.level ?? 'info';
    const action = options?.action;
    const onDismiss = options?.onDismiss;
    // A toast with an action stays until the owner uses it or dismisses it:
    // three seconds is too short to reach a button. An error stays so it can be read.
    const persistent = Boolean(action) || level === 'error';
    const entry: ToastEntry = {
      id, message, fading: false, level, persistent, action,
      dismiss: persistent ? () => { dismiss(id); onDismiss?.(); } : undefined,
    };
    if (options?.key) {
      const previous = keyedRef.current.get(options.key);
      if (previous !== undefined) dismiss(previous);
      keyedRef.current.set(options.key, id);
      setToasts((prev) => [...prev, entry]);
    } else if (persistent) {
      // The same refusal twice (another screenshot, Settings opened again) is
      // one toast, since these stay until the owner acts.
      setToasts((prev) => (
        prev.some((open) => open.persistent && !open.fading && open.message === message)
          ? prev
          : [...prev, entry]
      ));
    } else {
      setToasts((prev) => [...prev, entry]);
    }
    if (!persistent) {
      const fadeTimer = setTimeout(() => dismiss(id), TOAST_DURATION_MS);
      timersRef.current.set(id, fadeTimer);
    }
  }, [dismiss]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return { toasts, showToast: show, dismissToast };
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
            entry.persistent ? 'toastDismissible' : '',
            entry.action ? 'toastWithAction' : '',
            entry.level === 'error' ? 'toastError' : '',
            entry.fading ? 'toastFading' : '',
          ].filter(Boolean).join(' ')}
          role={entry.persistent ? 'alert' : undefined}
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
          {entry.persistent && (
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

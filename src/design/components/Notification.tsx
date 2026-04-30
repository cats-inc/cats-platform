import { useCallback, useEffect, useRef, useState } from 'react';

import { messageKeys } from '../../shared/i18n/messageKeys.js';
import { useI18n } from '../../app/renderer/i18n/index.js';

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

export interface NotificationOptions {
  title: string;
  message?: string;
  level?: NotificationLevel;
}

interface NotificationEntry {
  id: number;
  title: string;
  message?: string;
  level: NotificationLevel;
  fading: boolean;
}

const FADE_MS = 250;
const AUTO_DISMISS_MS = 4000;

let nextId = 1;

export function useNotifications() {
  const [items, setItems] = useState<NotificationEntry[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, fading: true } : n)),
    );
    const removeTimer = setTimeout(() => {
      setItems((prev) => prev.filter((n) => n.id !== id));
      timersRef.current.delete(id);
    }, FADE_MS);
    timersRef.current.set(id, removeTimer);
  }, []);

  const notify = useCallback((options: NotificationOptions) => {
    const id = nextId++;
    const level = options.level ?? 'info';
    setItems((prev) => [
      ...prev,
      { id, title: options.title, message: options.message, level, fading: false },
    ]);
    // Auto-dismiss non-error notifications
    if (level !== 'error') {
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);
    }
  }, [dismiss]);

  const dismissAll = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, fading: true })));
    const removeTimer = setTimeout(() => {
      setItems([]);
      timersRef.current.clear();
    }, FADE_MS);
    timersRef.current.set(-1, removeTimer);
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return { notifications: items, notify, dismiss, dismissAll };
}

const LEVEL_CLASS: Record<NotificationLevel, string> = {
  info: 'notificationInfo',
  success: 'notificationSuccess',
  warning: 'notificationWarning',
  error: 'notificationError',
};

export function NotificationContainer({
  notifications,
  onDismiss,
}: {
  notifications: NotificationEntry[];
  onDismiss: (id: number) => void;
}) {
  const { t } = useI18n();
  if (notifications.length === 0) return null;
  return (
    <div className="notificationContainer">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={
            `notification ${LEVEL_CLASS[n.level]}`
            + (n.fading ? ' notificationFading' : '')
          }
        >
          <div className="notificationBody">
            <p className="notificationTitle">{n.title}</p>
            {n.message ? <p className="notificationMessage">{n.message}</p> : null}
          </div>
          <button
            className="notificationDismiss"
            type="button"
            onClick={() => onDismiss(n.id)}
            aria-label={t(messageKeys.designNotificationDismissLabel)}
          >
            &#x2715;
          </button>
        </div>
      ))}
    </div>
  );
}

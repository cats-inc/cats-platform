import { useCallback, useEffect, useRef, useState } from 'react';

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

let nextId = 1;

export function useNotifications() {
  const [items, setItems] = useState<NotificationEntry[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const notify = useCallback((options: NotificationOptions) => {
    const id = nextId++;
    setItems((prev) => [
      ...prev,
      {
        id,
        title: options.title,
        message: options.message,
        level: options.level ?? 'info',
        fading: false,
      },
    ]);
  }, []);

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
            aria-label="Dismiss"
          >
            &#x2715;
          </button>
        </div>
      ))}
    </div>
  );
}

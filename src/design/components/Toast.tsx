import { useCallback, useEffect, useRef, useState } from 'react';

interface ToastEntry {
  id: number;
  message: string;
  fading: boolean;
}

const TOAST_DURATION_MS = 3000;
const TOAST_FADE_MS = 300;

let nextId = 1;

export function useToast() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const show = useCallback((message: string) => {
    if (!message) return;
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, fading: false }]);

    const fadeTimer = setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, fading: true } : t)),
      );
      const removeTimer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timersRef.current.delete(id);
      }, TOAST_FADE_MS);
      timersRef.current.set(id, removeTimer);
    }, TOAST_DURATION_MS);
    timersRef.current.set(id, fadeTimer);
  }, []);

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
  if (toasts.length === 0) return null;
  return (
    <div className="toastContainer">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={t.fading ? 'toast toastFading' : 'toast'}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

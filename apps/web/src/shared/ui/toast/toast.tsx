import React, { useState, useEffect } from "react";
import styles from "./toast.module.scss";

interface ToastItem {
  id: string;
  message: string;
}

type ToastListener = (toasts: ToastItem[]) => void;

let activeToasts: ToastItem[] = [];
const listeners = new Set<ToastListener>();
const recentToastTimestamps = new Map<string, number>();

const DEDUPE_WINDOW_MS = 2500;

function notify() {
  for (const listener of listeners) {
    listener([...activeToasts]);
  }
}

export function showToast(message: string, options?: { id?: string; durationMs?: number }) {
  const dedupeKey = options?.id || message;
  const now = Date.now();
  const lastTime = recentToastTimestamps.get(dedupeKey);

  if (lastTime && now - lastTime < DEDUPE_WINDOW_MS) {
    return;
  }
  recentToastTimestamps.set(dedupeKey, now);

  const id = options?.id || Math.random().toString(36).slice(2);
  const duration = options?.durationMs ?? 3200;

  // Keep at most 2 toasts visible at once
  activeToasts = [...activeToasts.filter((t) => t.id !== id), { id, message }].slice(-2);
  notify();

  setTimeout(() => {
    activeToasts = activeToasts.filter((t) => t.id !== id);
    notify();
  }, duration);
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>(() => activeToasts);

  useEffect(() => {
    listeners.add(setToasts);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.toastContainer} aria-live="polite" role="status">
      {toasts.map((toast) => (
        <div key={toast.id} className={styles.toast}>
          {toast.message}
        </div>
      ))}
    </div>
  );
};

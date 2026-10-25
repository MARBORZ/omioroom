import { useCallback, useEffect, useRef, useState } from "react";
import { CHAT_WIDTH_EVENT, CHAT_WIDTH_KEY } from "./chat-layout.js";

export function clampWidth(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function readStored(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // Private mode or blocked storage: the width just is not remembered
  }
}

/** Upper bound as a share of the window, so the video never gets squeezed out. */
function maxFor(maxPx: number, maxShare: number): number {
  return Math.min(maxPx, Math.floor(window.innerWidth * maxShare));
}

/** A side panel width the user drags (or nudges with arrow keys); remembered between visits. */
export function useResizableWidth(storageKey: string, defaultPx: number, minPx: number, maxPx: number, maxShare = 0.6) {
  const [width, setWidth] = useState<number>(() =>
    clampWidth(readStored(storageKey) ?? defaultPx, minPx, maxFor(maxPx, maxShare))
  );
  const widthRef = useRef(width);
  widthRef.current = width;

  const update = useCallback(
    (next: number, persist: boolean) => {
      const clamped = clampWidth(next, minPx, maxFor(maxPx, maxShare));
      setWidth(clamped);
      widthRef.current = clamped;
      if (persist) writeStored(storageKey, clamped);
    },
    [storageKey, minPx, maxPx, maxShare]
  );

  // Keep the panel inside the window when it shrinks (rotation, resized window)
  useEffect(() => {
    const onResize = () => update(widthRef.current, false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [update]);

  // The settings slider changes the same stored width (event carries null when it is reset to the default)
  useEffect(() => {
    const onExternal = (e: Event) => {
      if (storageKey !== CHAT_WIDTH_KEY) return;
      const detail = (e as CustomEvent<number | null>).detail;
      update(detail ?? defaultPx, false);
    };
    window.addEventListener(CHAT_WIDTH_EVENT, onExternal);
    return () => window.removeEventListener(CHAT_WIDTH_EVENT, onExternal);
  }, [storageKey, defaultPx, update]);

  return {
    width,
    min: minPx,
    max: maxFor(maxPx, maxShare),
    /** The panel sits on the right: dragging left makes it wider. */
    startDrag: (startX: number) => {
      const startWidth = widthRef.current;
      return {
        move: (clientX: number) => update(startWidth + (startX - clientX), false),
        end: () => update(widthRef.current, true),
      };
    },
    nudge: (delta: number) => update(widthRef.current + delta, true),
  };
}

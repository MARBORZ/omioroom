/** The chat panel width is a drag handle in the room and a slider in the settings; both write the same stored value. */
export const CHAT_WIDTH_KEY = "omioroom_chat_width";
export const CHAT_WIDTH_MIN = 280;
export const CHAT_WIDTH_MAX = 640;
export const CHAT_WIDTH_EVENT = "omioroom:chat-width";

export function readChatWidth(): number | null {
  try {
    const raw = window.localStorage.getItem(CHAT_WIDTH_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Stores the width and tells an open room to apply it right away. */
export function writeChatWidth(px: number): void {
  const value = Math.round(Math.min(Math.max(px, CHAT_WIDTH_MIN), CHAT_WIDTH_MAX));
  try {
    window.localStorage.setItem(CHAT_WIDTH_KEY, String(value));
  } catch {
    // storage blocked: still applied for this visit
  }
  window.dispatchEvent(new CustomEvent(CHAT_WIDTH_EVENT, { detail: value }));
}

export function clearChatWidth(): void {
  try {
    window.localStorage.removeItem(CHAT_WIDTH_KEY);
  } catch {
    // nothing to clear
  }
  window.dispatchEvent(new CustomEvent(CHAT_WIDTH_EVENT, { detail: null }));
}

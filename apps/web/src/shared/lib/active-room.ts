const STORAGE_KEY = "omioroom_active_room";

export interface StoredActiveRoom {
  roomId: string;
  globalId: string;
}

export function getStoredActiveRoom(): StoredActiveRoom | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.roomId === "string" &&
      typeof parsed.globalId === "string" &&
      parsed.roomId.length > 0
    ) {
      return parsed as StoredActiveRoom;
    }
  } catch {}
  return null;
}

export function setStoredActiveRoom(room: StoredActiveRoom): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        roomId: room.roomId,
        globalId: room.globalId,
      })
    );
  } catch {}
}

export function clearStoredActiveRoom(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

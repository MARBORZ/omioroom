import type { ArchivedMessage } from "./format.js";

/**
 * A copy of a room's chat kept in this browser only (IndexedDB), because the server keeps just the last 100 messages
 * and drops the chat when the room closes. Every call fails soft: private windows and blocked storage return nothing.
 */
const DB_NAME = "omioroom-chat-archive";
const STORE = "messages";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveToArchive(messages: readonly ArchivedMessage[]): Promise<void> {
  if (messages.length === 0) return;
  try {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    for (const m of messages) tx.objectStore(STORE).put(m);
    await done(tx);
    db.close();
  } catch {
    // Archiving is a convenience; chat keeps working without it
  }
}

export async function readArchive(): Promise<ArchivedMessage[]> {
  try {
    const db = await open();
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    const result = await new Promise<ArchivedMessage[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as ArchivedMessage[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  } catch {
    return [];
  }
}

export async function clearArchive(): Promise<void> {
  try {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    await done(tx);
    db.close();
  } catch {
    // Nothing to clear
  }
}

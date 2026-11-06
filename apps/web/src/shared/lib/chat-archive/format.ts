import type { ZipEntry } from "./zip.js";

export interface ArchivedMessage {
  id: string;
  roomId: string;
  /** Room number shown to people (the global id), for headings. */
  roomLabel: string;
  senderName: string;
  text: string;
  hasAttachment: boolean;
  /** ISO timestamp the message was sent. */
  createdAt: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar day as ISO 8601 (YYYY-MM-DD): the 24-hour day the person lives in. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** One text file per day, rooms as sections, messages in order: "[HH:MM:SS] Name: text". */
export function buildDailyFiles(messages: readonly ArchivedMessage[], attachmentLabel = "[image]"): ZipEntry[] {
  const byDay = new Map<string, ArchivedMessage[]>();
  for (const m of [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    const day = localDay(m.createdAt);
    const list = byDay.get(day);
    if (list) list.push(m);
    else byDay.set(day, [m]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => {
      const lines: string[] = [];
      let room: string | null = null;
      for (const m of list) {
        if (m.roomId !== room) {
          if (room !== null) lines.push("");
          lines.push(`=== ${m.roomLabel} ===`);
          room = m.roomId;
        }
        const text = [m.text, m.hasAttachment ? attachmentLabel : ""].filter(Boolean).join(" ");
        lines.push(`[${localTime(m.createdAt)}] ${m.senderName}: ${text.replace(/\r?\n/g, "\n    ")}`);
      }
      return { name: `${day}.txt`, content: `${lines.join("\n")}\n` };
    });
}

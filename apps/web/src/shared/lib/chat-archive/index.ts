import { buildDailyFiles } from "./format.js";
import { createZip } from "./zip.js";
import { readArchive } from "./store.js";

export type { ArchivedMessage } from "./format.js";
export { saveToArchive, readArchive, clearArchive } from "./store.js";
export { buildDailyFiles, localDay } from "./format.js";
export { createZip } from "./zip.js";

/** Builds a ZIP with one "YYYY-MM-DD.txt" per day from everything archived here; null when nothing is archived. */
export async function buildArchiveZip(attachmentLabel?: string): Promise<{ blob: Blob; files: number; messages: number } | null> {
  const messages = await readArchive();
  if (messages.length === 0) return null;
  const files = buildDailyFiles(messages, attachmentLabel);
  const bytes = createZip(files);
  return { blob: new Blob([bytes.buffer as ArrayBuffer], { type: "application/zip" }), files: files.length, messages: messages.length };
}

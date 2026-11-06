import { describe, expect, it } from "vitest";
import { buildDailyFiles, type ArchivedMessage } from "../shared/lib/chat-archive/format.js";
import { createZip, crc32 } from "../shared/lib/chat-archive/zip.js";

const msg = (id: string, createdAt: string, text: string, extra: Partial<ArchivedMessage> = {}): ArchivedMessage => ({
  id,
  roomId: "room-1",
  roomLabel: "123456",
  senderName: "Mar",
  text,
  hasAttachment: false,
  createdAt,
  ...extra,
});

describe("chat archive", () => {
  it("writes one ISO-dated file per local day, in order, with rooms as sections", () => {
    const files = buildDailyFiles([
      msg("b", new Date(2026, 10, 6, 9, 5, 7).toISOString(), "second day"),
      msg("a", new Date(2026, 10, 5, 23, 59, 58).toISOString(), "late\nmultiline"),
      msg("c", new Date(2026, 10, 5, 8, 0, 0).toISOString(), "", { hasAttachment: true, roomId: "room-2", roomLabel: "654321" }),
    ]);
    expect(files.map((f) => f.name)).toEqual(["2026-11-05.txt", "2026-11-06.txt"]);
    expect(files[0]!.content).toBe("=== 654321 ===\n[08:00:00] Mar: [image]\n\n=== 123456 ===\n[23:59:58] Mar: late\n    multiline\n");
    expect(files[1]!.content).toBe("=== 123456 ===\n[09:05:07] Mar: second day\n");
  });

  it("builds a valid zip with stored UTF-8 entries", () => {
    const zip = createZip([{ name: "2026-11-05.txt", content: "Привет\n" }]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const size = view.getUint32(18, true);
    const nameLen = view.getUint16(26, true);
    const data = zip.slice(30 + nameLen, 30 + nameLen + size);
    expect(new TextDecoder().decode(data)).toBe("Привет\n");
    expect(view.getUint32(14, true)).toBe(crc32(data));
    // End of central directory: one entry
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(1);
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

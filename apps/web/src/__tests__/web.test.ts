import { describe, it, expect } from "vitest";
import { formatTime } from "../shared/lib/format-time.js";
import { generateClientRequestId } from "../shared/api/backend.js";
import { en } from "../shared/lib/i18n/translations/en.js";
import { ru } from "../shared/lib/i18n/translations/ru.js";

describe("Web Utilities", () => {
  it("formats time correctly for mm:ss and hh:mm:ss", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(45)).toBe("00:45");
    expect(formatTime(65)).toBe("01:05");
    expect(formatTime(3600)).toBe("1:00:00");
    expect(formatTime(3665)).toBe("1:01:05");
    expect(formatTime(-10)).toBe("00:00");
  });

  it("generates valid client request IDs", () => {
    const id1 = generateClientRequestId();
    const id2 = generateClientRequestId();
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
  });

  it("has consistent i18n dictionaries for EN and RU", () => {
    expect(en.common.brand).toBe("OMIOROOM");
    expect(ru.common.brand).toBe("OMIOROOM");

    expect(en.home.createTitle).toBe("Create a Watch Room");
    expect(ru.home.createTitle).toBe("Создать комнату");

    expect(en.room.inSyncRev(5)).toBe("In sync (rev 5)");
    expect(ru.room.inSyncRev(5)).toBe("В синхроне (рев. 5)");
  });
});

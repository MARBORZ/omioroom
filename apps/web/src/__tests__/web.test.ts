import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatTime } from "../shared/lib/format-time.js";
import { generateClientRequestId } from "../shared/api/backend.js";
import { en } from "../shared/lib/i18n/translations/en.js";
import { ru } from "../shared/lib/i18n/translations/ru.js";
import { Skeleton } from "../shared/ui/skeleton/skeleton.js";
import { Loader } from "../shared/ui/loader/loader.js";

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

  it("has the same i18n keys in EN and RU and no empty strings", () => {
    const keys = (obj: Record<string, unknown>, prefix = ""): string[] =>
      Object.entries(obj).flatMap(([k, v]) =>
        v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]
      );
    expect(keys(ru as unknown as Record<string, unknown>).sort()).toEqual(
      keys(en as unknown as Record<string, unknown>).sort()
    );

    const empties = (obj: Record<string, unknown>): string[] =>
      Object.entries(obj).flatMap(([k, v]) =>
        v && typeof v === "object" ? empties(v as Record<string, unknown>) : v === "" ? [k] : []
      );
    expect(empties(en as unknown as Record<string, unknown>)).toEqual([]);
    expect(empties(ru as unknown as Record<string, unknown>)).toEqual([]);
    expect(en.common.brand).toBe("OMIOROOM");
    expect(ru.common.brand).toBe("OMIOROOM");
  });

  it("Skeleton handles loading prop correctly", () => {
    const htmlLoading = renderToStaticMarkup(
      React.createElement(
        Skeleton,
        { loading: true },
        React.createElement("span", null, "Loaded content")
      )
    );
    expect(htmlLoading).toContain('aria-hidden="true"');
    expect(htmlLoading).not.toContain("Loaded content");

    const htmlDone = renderToStaticMarkup(
      React.createElement(
        Skeleton,
        { loading: false },
        React.createElement("span", null, "Loaded content")
      )
    );
    expect(htmlDone).toContain("Loaded content");
    expect(htmlDone).not.toContain('aria-hidden="true"');
  });

  it("Loader handles loading prop correctly", () => {
    const htmlLoading = renderToStaticMarkup(
      React.createElement(Loader, { loading: true, label: "Please wait" })
    );
    expect(htmlLoading).toContain('role="status"');
    expect(htmlLoading).toContain("Please wait");

    const htmlDone = renderToStaticMarkup(
      React.createElement(
        Loader,
        { loading: false, label: "Please wait" },
        React.createElement("div", null, "Actual app")
      )
    );
    expect(htmlDone).toContain("Actual app");
    expect(htmlDone).not.toContain('role="status"');
  });
});

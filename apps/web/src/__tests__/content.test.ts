import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_PAGES, findContentPage, SITE_URL } from "../content/index.js";

const sitemap = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "sitemap.xml"), "utf8");

describe("informational pages", () => {
  it("have unique addresses and are found by path", () => {
    const paths = CONTENT_PAGES.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of paths) {
      expect(p.startsWith("/")).toBe(true);
      expect(findContentPage(p)?.path).toBe(p);
      expect(findContentPage(p + "/")?.path).toBe(p);
    }
    expect(findContentPage("/")).toBeNull();
    expect(findContentPage("/room")).toBeNull();
  });

  it("have complete text in both languages with search-friendly lengths", () => {
    for (const page of CONTENT_PAGES) {
      for (const lang of ["ru", "en"] as const) {
        const t = page.text[lang];
        expect(page.nav[lang].trim().length, `${page.path} nav ${lang}`).toBeGreaterThan(0);
        expect(t.title.length, `${page.path} title ${lang}`).toBeLessThanOrEqual(70);
        expect(t.title.length).toBeGreaterThan(10);
        expect(t.description.length, `${page.path} description ${lang}`).toBeLessThanOrEqual(200);
        expect(t.description.length).toBeGreaterThan(50);
        expect(t.heading.length).toBeGreaterThan(0);
        expect(t.lead.length).toBeGreaterThan(0);
        expect(t.sections.length > 0 || (t.faq?.length ?? 0) > 0, `${page.path} has content ${lang}`).toBe(true);
      }
      // The two languages describe the same structure
      expect(page.text.ru.sections.length).toBe(page.text.en.sections.length);
      expect(page.text.ru.faq?.length).toBe(page.text.en.faq?.length);
    }
  });

  it("have distinct titles, so search results do not repeat", () => {
    for (const lang of ["ru", "en"] as const) {
      const titles = CONTENT_PAGES.map((p) => p.text[lang].title);
      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  it("legal pages show the date of the last change", () => {
    for (const page of CONTENT_PAGES.filter((p) => p.group === "legal")) {
      expect(page.text.ru.updated).toBeTruthy();
      expect(page.text.en.updated).toBeTruthy();
    }
  });

  it("are all listed in the sitemap, which lists nothing else", () => {
    const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const expected = [SITE_URL + "/", ...CONTENT_PAGES.map((p) => SITE_URL + p.path)];
    expect(listed.sort()).toEqual(expected.sort());
  });
});

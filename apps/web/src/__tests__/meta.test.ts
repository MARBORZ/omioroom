import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_META } from "../shared/lib/i18n/meta.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(join(ROOT, "index.html"), "utf8");

describe("page metadata", () => {
  it("has the tags search engines and link previews need", () => {
    for (const needle of [
      "<title>",
      'name="description"',
      'rel="canonical"',
      'property="og:title"',
      'property="og:description"',
      'property="og:image"',
      'name="twitter:card"',
      'rel="manifest"',
      'type="application/ld+json"',
    ]) {
      expect(html, needle).toContain(needle);
    }
  });

  it("points the preview image and icons at files that exist", () => {
    for (const file of ["og-image.png", "favicon.svg", "favicon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "site.webmanifest", "robots.txt", "sitemap.xml"]) {
      expect(existsSync(join(ROOT, "public", file)), file).toBe(true);
    }
  });

  it("has complete metadata for every interface language", () => {
    expect(Object.keys(PAGE_META).sort()).toEqual(["en", "ru"]);
    for (const meta of Object.values(PAGE_META)) {
      for (const value of Object.values(meta)) expect(value.trim().length).toBeGreaterThan(0);
      expect(meta.description.length).toBeLessThanOrEqual(200);
      expect(meta.title.length).toBeLessThanOrEqual(70);
    }
    expect(PAGE_META.ru.title).not.toBe(PAGE_META.en.title);
  });

  it("every meta tag the app rewrites exists in index.html", () => {
    for (const needle of [
      'name="description"',
      'property="og:title"',
      'property="og:description"',
      'property="og:image:alt"',
      'property="og:locale"',
      'property="og:locale:alternate"',
      'name="twitter:title"',
      'name="twitter:description"',
    ]) {
      expect(html, needle).toContain(needle);
    }
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain JavaScript build helper
import { renderPageHtml } from "../../scripts/prerender-lib.mjs";
import { CONTENT_PAGES, SITE_URL } from "../content/index.js";

const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "index.html"), "utf8");

describe("prerendered pages", () => {
  it("each page gets its own title, description, canonical address and text", () => {
    const seen = new Set<string>();
    for (const page of CONTENT_PAGES) {
      const html: string = renderPageHtml(template, page, SITE_URL, "ru");
      const t = page.text.ru;
      expect(html).toContain(`<title>${t.title.replace(/&/g, "&amp;")}</title>`);
      expect(html).toContain(`rel="canonical" href="${SITE_URL}${page.path}"`);
      expect(html).toContain(`property="og:url" content="${SITE_URL}${page.path}"`);
      expect(html).toContain(`<h1>${t.heading}</h1>`);
      seen.add(html);
    }
    expect(seen.size).toBe(CONTENT_PAGES.length);
  });

  it("keeps the app mount point and script, and writes valid structured data", () => {
    for (const page of CONTENT_PAGES) {
      const html: string = renderPageHtml(template, page, SITE_URL, "ru");
      expect(html).toContain('<div id="root">');
      expect(html).toContain('src="/src/app/index.tsx"');
      const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      expect(ld).not.toBeNull();
      const data = JSON.parse(ld![1]!.replace(/\\u003c/g, "<"));
      expect(["FAQPage", "WebPage"]).toContain(data["@type"]);
      if (page.group === "faq") expect(data.mainEntity.length).toBe(page.text.ru.faq!.length);
    }
  });

  it("escapes text so a page cannot break the markup", () => {
    const evil = {
      ...CONTENT_PAGES[0]!,
      text: {
        ...CONTENT_PAGES[0]!.text,
        ru: { ...CONTENT_PAGES[0]!.text.ru, heading: '<script>alert("x")</script>', title: 'A & "B"' },
      },
    };
    const html: string = renderPageHtml(template, evil, SITE_URL, "ru");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<title>A &amp; &quot;B&quot;</title>");
  });
});

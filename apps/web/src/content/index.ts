import type { ContentPageDef } from "./types.js";
import { GUIDE_PAGES } from "./guide.js";
import { SOURCE_PAGES } from "./sources.js";
import { FAQ_PAGE } from "./faq.js";
import { LEGAL_PAGES } from "./legal.js";

export const CONTENT_PAGES: ContentPageDef[] = [...GUIDE_PAGES, ...SOURCE_PAGES, FAQ_PAGE, ...LEGAL_PAGES];

/** Finds the page for an address such as "/faq" or "/faq/"; null for everything else (the app itself). */
export function findContentPage(pathname: string): ContentPageDef | null {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return CONTENT_PAGES.find((p) => p.path === clean) ?? null;
}

export * from "./site.js";
export type { ContentPageDef, PageText } from "./types.js";

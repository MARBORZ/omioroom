import type { Lang } from "../shared/lib/i18n/types.js";

export interface ContentSection {
  heading?: string;
  paragraphs?: string[];
  list?: string[];
  steps?: string[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface PageText {
  /** Browser tab title and search result title (up to 70 characters). */
  title: string;
  /** Search result snippet (up to 200 characters). */
  description: string;
  heading: string;
  lead: string;
  sections: ContentSection[];
  faq?: FaqItem[];
  /** Legal pages show when they were last changed. */
  updated?: string;
}

export interface ContentPageDef {
  /** Public address, e.g. "/rules". */
  path: string;
  group: "guide" | "source" | "faq" | "legal";
  /** Short label for navigation and the footer. */
  nav: Record<Lang, string>;
  text: Record<Lang, PageText>;
}

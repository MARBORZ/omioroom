import { useEffect } from "react";
import { useI18n } from "../shared/lib/i18n/index.js";
import { PAGE_META } from "../shared/lib/i18n/meta.js";

function setMeta(selector: string, value: string): void {
  document.head.querySelector(selector)?.setAttribute("content", value);
}

/** Keeps the page title, description and social preview in the language of the interface. */
export const DocumentMeta: React.FC = () => {
  const { lang } = useI18n();

  useEffect(() => {
    const meta = PAGE_META[lang];
    document.documentElement.lang = lang;
    document.title = meta.title;
    setMeta('meta[name="description"]', meta.description);
    setMeta('meta[property="og:title"]', meta.title);
    setMeta('meta[property="og:description"]', meta.shortDescription);
    setMeta('meta[property="og:image:alt"]', meta.imageAlt);
    setMeta('meta[property="og:locale"]', meta.locale);
    setMeta('meta[property="og:locale:alternate"]', meta.alternateLocale);
    setMeta('meta[name="twitter:title"]', meta.title);
    setMeta('meta[name="twitter:description"]', meta.shortDescription);
  }, [lang]);

  return null;
};

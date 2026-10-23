import React, { useEffect } from "react";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { LangSwitch } from "../../../shared/ui/lang-switch/lang-switch.js";
import { Logo } from "../../../shared/ui/logo/logo.js";
import {
  CONTENT_PAGES,
  CONTACT_EMAIL,
  SITE_URL,
  type ContentPageDef,
} from "../../../content/index.js";
import styles from "./content-page.module.scss";

function setTag(selector: string, attr: string, value: string): void {
  document.head.querySelector(selector)?.setAttribute(attr, value);
}

/** One layout for every informational page: header, article, footer. All text comes from src/content. */
export const ContentPage: React.FC<{ page: ContentPageDef }> = ({ page }) => {
  const { lang } = useI18n();
  const text = page.text[lang];
  const url = SITE_URL + page.path;
  const ru = lang === "ru";

  // Search and sharing metadata of this page, in the language of the interface
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = text.title;
    setTag('meta[name="description"]', "content", text.description);
    setTag('link[rel="canonical"]', "href", url);
    setTag('meta[property="og:title"]', "content", text.title);
    setTag('meta[property="og:description"]', "content", text.description);
    setTag('meta[property="og:url"]', "content", url);
    setTag('meta[name="twitter:title"]', "content", text.title);
    setTag('meta[name="twitter:description"]', "content", text.description);

    // Structured data for questions and answers
    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.dataset.page = "content";
    ld.text = JSON.stringify(
      text.faq
        ? {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: text.faq.map((f) => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: { "@type": "Answer", text: f.answer },
            })),
          }
        : { "@context": "https://schema.org", "@type": "WebPage", name: text.title, description: text.description, url }
    );
    document.head.appendChild(ld);
    window.scrollTo(0, 0);
    return () => ld.remove();
  }, [lang, text, url]);

  const group = (g: ContentPageDef["group"]) => CONTENT_PAGES.filter((p) => p.group === g);
  const link = (p: ContentPageDef) => (
    <a key={p.path} href={p.path} className={styles.cpLink} aria-current={p.path === page.path ? "page" : undefined}>
      {p.nav[lang]}
    </a>
  );

  return (
    <div className={styles.cp}>
      <div className={styles.cpBar}>
        <a href="/" className={styles.cpBrand} aria-label="OMIOROOM">
          <Logo size="sm" showText={true} />
        </a>
        <nav className={styles.cpTopNav} aria-label={ru ? "Разделы" : "Sections"}>
          {[...group("guide"), ...group("faq")].map(link)}
        </nav>
        <div className={styles.cpBarEnd}>
          <LangSwitch />
          <a href="/" className={styles.cpOpen}>
            {ru ? "Открыть сервис" : "Open the app"}
          </a>
        </div>
      </div>

      <main className={styles.cpMain}>
        <article>
          <h1 className={styles.cpTitle}>{text.heading}</h1>
          {text.updated && (
            <p className={styles.cpMeta}>
              {ru ? "Обновлено: " : "Updated: "}
              {text.updated}
            </p>
          )}
          <p className={styles.cpLead}>{text.lead}</p>

          {text.sections.map((s, i) => (
            <section key={i} className={styles.cpSection}>
              {s.heading && <h2 className={styles.cpH2}>{s.heading}</h2>}
              {s.paragraphs?.map((para, j) => (
                <p key={j}>{para}</p>
              ))}
              {s.list && (
                <ul>
                  {s.list.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              )}
              {s.steps && (
                <ol>
                  {s.steps.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ol>
              )}
            </section>
          ))}

          {text.faq && (
            <section className={styles.cpSection}>
              {text.faq.map((f, i) => (
                <details key={i} className={styles.cpFaq}>
                  <summary>{f.question}</summary>
                  <p>{f.answer}</p>
                </details>
              ))}
            </section>
          )}

          {page.group !== "legal" && (
            <div className={styles.cpCta}>
              <a href="/" className={styles.cpOpen}>
                {ru ? "Создать комнату" : "Create a room"}
              </a>
            </div>
          )}
        </article>
      </main>

      <footer className={styles.cpFoot}>
        <nav className={styles.cpFootRow} aria-label={ru ? "Ссылки" : "Links"}>
          {[...group("guide"), ...group("faq"), ...group("source"), ...group("legal")].map(link)}
          <a className={styles.cpLink} href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          <span className={styles.cpCopy}>© OMIOROOM</span>
        </nav>
      </footer>
    </div>
  );
};

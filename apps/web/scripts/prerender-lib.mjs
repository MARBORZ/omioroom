// Builds the static HTML of an informational page from the built index.html (pure functions, no file access).

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function replaceAttr(html, selectorRegex, attr, value) {
  return html.replace(selectorRegex, (tag) => tag.replace(new RegExp(`${attr}="[^"]*"`), `${attr}="${esc(value)}"`));
}

/** Readable text of the page for crawlers and for the moment before the script has loaded. */
export function renderArticle(text) {
  const parts = [`<h1>${esc(text.heading)}</h1>`, `<p>${esc(text.lead)}</p>`];
  for (const s of text.sections ?? []) {
    if (s.heading) parts.push(`<h2>${esc(s.heading)}</h2>`);
    for (const p of s.paragraphs ?? []) parts.push(`<p>${esc(p)}</p>`);
    if (s.list) parts.push(`<ul>${s.list.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`);
    if (s.steps) parts.push(`<ol>${s.steps.map((i) => `<li>${esc(i)}</li>`).join("")}</ol>`);
  }
  for (const f of text.faq ?? []) parts.push(`<h2>${esc(f.question)}</h2><p>${esc(f.answer)}</p>`);
  return parts.join("\n        ");
}

export function structuredData(text, url) {
  return text.faq
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: text.faq.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      }
    : { "@context": "https://schema.org", "@type": "WebPage", name: text.title, description: text.description, url };
}

/** Returns the page's own index.html: its title, description, address, preview tags and text. */
export function renderPageHtml(template, page, siteUrl, lang = "ru") {
  const text = page.text[lang];
  const url = siteUrl + page.path;
  let html = template;

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(text.title)}</title>`);
  html = html.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/s, `$1${esc(text.description)}$2`);
  html = replaceAttr(html, /<link rel="canonical"[^>]*>/, "href", url);
  html = replaceAttr(html, /<meta property="og:url"[^>]*>/, "content", url);
  html = replaceAttr(html, /<meta property="og:title"[^>]*>/, "content", text.title);
  html = replaceAttr(html, /<meta property="og:description"[^>]*>/, "content", text.description);
  html = replaceAttr(html, /<meta name="twitter:title"[^>]*>/, "content", text.title);
  html = replaceAttr(html, /<meta name="twitter:description"[^>]*>/, "content", text.description);
  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">${JSON.stringify(structuredData(text, url)).replace(/</g, "\\u003c")}</script>`
  );
  html = html.replace(/(<div id="root">)[\s\S]*?(<\/div>\s*<noscript>)/, (_m, open, close) => {
    return `${open}\n      <main style="font-family: system-ui, sans-serif; color: #f4f0e8; background: #101010; min-height: 100vh; padding: 48px 24px; line-height: 1.6;">\n        ${renderArticle(text)}\n      </main>\n    ${close}`;
  });
  return html;
}

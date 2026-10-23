// After the build: writes dist/<path>/index.html for every informational page, so search engines get the
// right title, description, canonical address and text without running scripts.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderPageHtml } from "./prerender-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const tmp = join(root, "node_modules", ".prerender-content.mjs");

await build({
  entryPoints: [join(root, "src/content/index.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: tmp,
  logLevel: "silent",
});
const { CONTENT_PAGES, SITE_URL } = await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
rmSync(tmp, { force: true });

const template = readFileSync(join(dist, "index.html"), "utf8");
for (const page of CONTENT_PAGES) {
  const dir = join(dist, page.path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), renderPageHtml(template, page, SITE_URL, "ru"));
}
console.log(`prerendered ${CONTENT_PAGES.length} pages`);

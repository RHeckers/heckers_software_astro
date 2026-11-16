// @ts-check
import sitemap from "@astrojs/sitemap";
import { readFileSync, readdirSync } from "node:fs";
import { defineConfig } from "astro/config";
import rehypeExternalLinks from "./src/plugins/rehype-external-links.mjs";
import rehypeWrapTables from "./src/plugins/rehype-wrap-tables.mjs";

const site = "https://heckerssoftware.com";

/**
 * Last-modified dates for the sitemap, read from each post's frontmatter
 * (updatedDate, else pubDate). Only posts get one: a date that is not
 * really known is worse than none, because search engines stop trusting
 * lastmod on a site that gets it wrong.
 */
function postLastmod() {
  const dir = new URL("./src/content/blog/", import.meta.url);
  const dates = new Map();
  for (const file of readdirSync(dir)) {
    if (!/\.mdx?$/.test(file)) continue;
    const head = readFileSync(new URL(file, dir), "utf8").slice(0, 2000);
    const pick = (/** @type {string} */ key) =>
      head.match(new RegExp(`^${key}:\\s*["']?([0-9-]+)`, "m"))?.[1];
    const raw = pick("updatedDate") ?? pick("pubDate");
    // "2026-9-18" is not ISO; pad it so every engine parses it the same way.
    const iso = raw?.replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/, (_, y, m, d) =>
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`,
    );
    const date = new Date(iso ?? "");
    if (!Number.isNaN(date.valueOf())) {
      dates.set(`${site}/blog/${file.replace(/\.mdx?$/, "")}/`, date.toISOString());
    }
  }
  return dates;
}
const lastmod = postLastmod();

// https://astro.build/config
export default defineConfig({
  site,
  // Every page is a directory (/about/index.html) and every canonical URL
  // ends in a slash; links have to match so no click costs a redirect and
  // search engines see one URL per page.
  trailingSlash: "always",
  build: {
    // Inline every stylesheet into the HTML. The three external CSS files
    // (~17 KiB compressed in total) were render-blocking and delayed the
    // discovery of the web fonts; a single HTML response removes that chain.
    inlineStylesheets: "always",
  },
  image: {
    // Sharp for everything, except animated GIFs, which are served as-is.
    service: { entrypoint: "./src/plugins/image-service.mjs" },
  },
  integrations: [
    sitemap({
      // Legal pages carry no search value; keep them out of the sitemap.
      filter: (page) => !page.includes("/legal/"),
      serialize(item) {
        const date = lastmod.get(item.url);
        return date ? { ...item, lastmod: date } : item;
      },
    }),
  ],
  markdown: {
    // Tables get a scroll wrapper; links to other sites open in a new tab.
    rehypePlugins: [rehypeWrapTables, [rehypeExternalLinks, { site }]],
  },
});

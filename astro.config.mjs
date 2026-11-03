// @ts-check
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import rehypeExternalLinks from "./src/plugins/rehype-external-links.mjs";
import rehypeWrapTables from "./src/plugins/rehype-wrap-tables.mjs";

const site = "https://heckerssoftware.com";

// https://astro.build/config
export default defineConfig({
  site,
  build: {
    // Inline every stylesheet into the HTML. The three external CSS files
    // (~17 KiB compressed in total) were render-blocking and delayed the
    // discovery of the web fonts; a single HTML response removes that chain.
    inlineStylesheets: "always",
  },
  integrations: [
    sitemap({
      // Legal pages carry no search value; keep them out of the sitemap.
      filter: (page) => !page.includes("/legal/"),
    }),
  ],
  markdown: {
    // Tables get a scroll wrapper; links to other sites open in a new tab.
    rehypePlugins: [rehypeWrapTables, [rehypeExternalLinks, { site }]],
  },
});

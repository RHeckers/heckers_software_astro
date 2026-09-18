// @ts-check
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import rehypeWrapTables from "./src/plugins/rehype-wrap-tables.mjs";

// https://astro.build/config
export default defineConfig({
  site: "https://heckerssoftware.com",
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
    rehypePlugins: [rehypeWrapTables],
  },
});

// @ts-check
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import rehypeWrapTables from "./src/plugins/rehype-wrap-tables.mjs";

// https://astro.build/config
export default defineConfig({
  site: "https://heckerssoftware.com",
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

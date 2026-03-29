// @ts-check
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import rehypeWrapTables from "./src/plugins/rehype-wrap-tables.mjs";

// https://astro.build/config
export default defineConfig({
  site: "https://heckerssoftware.com",
  integrations: [sitemap()],
  markdown: {
    rehypePlugins: [rehypeWrapTables],
  },
});

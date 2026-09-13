import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { BLOG_CATEGORIES } from "./lib/categories";

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      heroImage: image().optional(),
      categories: z.array(z.enum(BLOG_CATEGORIES)).default([]),
    }),
});

export const collections = { blog };

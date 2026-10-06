import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { categoryToSlug } from "./lib/categories";

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      heroImage: image().optional(),
      /**
       * Free-form: any label is accepted and the blog picks it up on the
       * next build. The only rule is that it has to survive slugification,
       * because the label becomes a /blog/category/<slug>/ URL.
       */
      categories: z
        .array(
          z
            .string()
            .trim()
            .min(1, "A category cannot be empty")
            .refine((category) => categoryToSlug(category).length > 0, {
              message:
                "A category needs at least one letter or digit so it can be turned into a URL",
            }),
        )
        .default([]),
    }),
});

export const collections = { blog };

import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { categoryToSlug } from "./lib/categories";

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      /**
       * Search-result versions of the title and description. Search engines
       * cut titles at about 60 characters and descriptions at about 155;
       * these fill the <title> and meta description when the full versions
       * (still used for the heading, the post cards and RSS) are longer.
       */
      metaTitle: z.string().max(60).optional(),
      metaDescription: z.string().max(160).optional(),
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

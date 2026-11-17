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
      /**
       * The call to action under the post. Left out, it follows from the
       * categories (see PostCta); "none" leaves the block out.
       */
      cta: z.enum(["assessment", "workshop", "fde", "none"]).optional(),
    }),
});

/**
 * Case studies: one client engagement each. The markdown body carries the
 * three written sections (Situation, What I did, Result) as h2 headings;
 * the stack, the figures and the optional client quote are frontmatter, so
 * the template lays them out the same way on every page.
 *
 * A draft is built in development only. It never reaches the production
 * build, the listing, the sitemap or any link from another page.
 */
const caseStudies = defineCollection({
  loader: glob({ base: "./src/content/case-studies", pattern: "**/*.md" }),
  schema: z.object({
    title: z.string(),
    client: z.string(),
    sector: z.string().optional(),
    /** As shown: "Jan 2025 to present". */
    period: z.string().optional(),
    role: z.string().optional(),
    /** One or two sentences for the listing and the meta description. */
    summary: z.string().optional(),
    /** Listing order, lowest first. */
    order: z.number().default(100),
    /** Service pages that link to this case study. */
    services: z
      .array(
        z.enum([
          "forward-deployed-engineering",
          "architecture-assessment",
          "workshops",
        ]),
      )
      .default([]),
    stack: z.array(z.string()).default([]),
    /** The headline figures, shown above the text. */
    results: z
      .array(z.object({ value: z.string(), label: z.string() }))
      .default([]),
    /** Key of a snippet in lib/testimonials.ts. Optional. */
    quote: z.string().optional(),
    /** Short format: no figures row, no quote. */
    short: z.boolean().default(false),
    draft: z.boolean().default(false),
    /** What has to be verified or approved before the draft flag comes off. */
    toConfirm: z.array(z.string()).default([]),
  }),
});

export const collections = { blog, caseStudies };

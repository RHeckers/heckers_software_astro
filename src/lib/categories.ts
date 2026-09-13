/**
 * Single source of truth for blog categories.
 *
 * Used by the content collection schema (validation), the blog filter bar,
 * the category pages, and the homepage internal links.
 */
export const BLOG_CATEGORIES = [
  "Angular",
  "Nx",
  "Architecture",
  "Forms",
  "Error Handling",
  "Testing",
  "AI",
  "Workshops",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

/** "Error Handling" → "error-handling" */
export function categoryToSlug(category: BlogCategory): string {
  return category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** "error-handling" → "Error Handling" (undefined when the slug is unknown) */
export function slugToCategory(slug: string): BlogCategory | undefined {
  return BLOG_CATEGORIES.find((category) => categoryToSlug(category) === slug);
}

/** Absolute path of a category page, with trailing slash like post URLs. */
export function categoryHref(category: BlogCategory): string {
  return `/blog/category/${categoryToSlug(category)}/`;
}

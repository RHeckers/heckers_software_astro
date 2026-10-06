/**
 * Blog categories.
 *
 * Categories are free-form. A post may put any label in its `categories`
 * frontmatter and the chips, the filter bar and the
 * /blog/category/<slug>/ page follow automatically — a new label does not
 * have to be registered anywhere first.
 *
 * BLOG_CATEGORIES is only a curated list: it pins the display order of the
 * categories we lead with, and gives the homepage links a typo-proof set to
 * choose from. Any other label a post uses still shows up, sorted
 * alphabetically after the curated ones.
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

/**
 * One of the curated categories above. Used where a typo should fail the
 * build (the homepage section links) rather than silently link nowhere.
 */
export type KnownBlogCategory = (typeof BLOG_CATEGORIES)[number];

/** Any category label a post declares. Free-form by design. */
export type BlogCategory = string;

/**
 * "Error Handling" → "error-handling"
 *
 * Also the identity of a category: labels that slugify the same (`Nx` and
 * `nx`) are treated as one category, so a stray capital in a post's
 * frontmatter cannot split a category in two or collide two routes.
 */
export function categoryToSlug(category: BlogCategory): string {
  return category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Absolute path of a category page, with trailing slash like post URLs. */
export function categoryHref(category: BlogCategory): string {
  return `/blog/category/${categoryToSlug(category)}/`;
}

/**
 * Ordering for every category list on the site: the curated ones first, in
 * the order declared above, then everything else alphabetically.
 */
export function compareCategories(a: BlogCategory, b: BlogCategory): number {
  const curated: readonly string[] = BLOG_CATEGORIES;
  const rank = (category: BlogCategory) => {
    const index = curated.indexOf(category);
    return index === -1 ? curated.length : index;
  };

  return rank(a) - rank(b) || a.localeCompare(b);
}

import { getCollection, type CollectionEntry } from "astro:content";
import {
  categoryToSlug,
  compareCategories,
  type BlogCategory,
} from "./categories";

export type BlogPost = CollectionEntry<"blog">;

/** A category as it is actually used by the posts, with its posts. */
export interface CategoryGroup {
  /** Label to display, taken from the newest post that uses the category. */
  category: BlogCategory;
  /** URL segment of the category page. */
  slug: string;
  /** Posts in this category, newest first. */
  posts: BlogPost[];
}

/** Absolute path of a post, with trailing slash (matches the sitemap). */
export function postHref(post: BlogPost): string {
  return `/blog/${post.id}/`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** All posts, newest first. */
export async function getSortedPosts(): Promise<BlogPost[]> {
  const posts = await getCollection("blog");
  return posts.sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );
}

export function postsInCategory(
  posts: BlogPost[],
  category: BlogCategory,
): BlogPost[] {
  const slug = categoryToSlug(category);
  return posts.filter((post) =>
    post.data.categories.some((other) => categoryToSlug(other) === slug),
  );
}

/**
 * Every category used by at least one post — derived from the posts, so a
 * new label in a post's frontmatter needs no further configuration.
 *
 * Grouped by slug, which is what the category routes are keyed on: two
 * labels that slugify the same become one group instead of two colliding
 * pages. Ordering follows compareCategories (curated first, then A→Z).
 */
export function categoryGroups(posts: BlogPost[]): CategoryGroup[] {
  const bySlug = new Map<string, CategoryGroup>();

  for (const post of posts) {
    for (const category of post.data.categories) {
      const slug = categoryToSlug(category);
      let group = bySlug.get(slug);

      if (!group) {
        group = { category, slug, posts: [] };
        bySlug.set(slug, group);
      }

      // A post that lists the same category twice still appears once.
      if (!group.posts.includes(post)) {
        group.posts.push(post);
      }
    }
  }

  return [...bySlug.values()].sort((a, b) =>
    compareCategories(a.category, b.category),
  );
}

/** Categories that have at least one post, in display order. */
export function categoriesWithPosts(posts: BlogPost[]): BlogCategory[] {
  return categoryGroups(posts).map((group) => group.category);
}

/**
 * Other posts to suggest at the bottom of a post: those sharing the most
 * categories first, then newest first.
 */
export function relatedPosts(
  current: BlogPost,
  posts: BlogPost[],
  limit = 3,
): BlogPost[] {
  const currentSlugs = new Set(current.data.categories.map(categoryToSlug));
  const shared = (post: BlogPost) =>
    post.data.categories.filter((category) =>
      currentSlugs.has(categoryToSlug(category)),
    ).length;

  return posts
    .filter((post) => post.id !== current.id)
    .sort(
      (a, b) =>
        shared(b) - shared(a) ||
        b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
    )
    .slice(0, limit);
}

import { getCollection, type CollectionEntry } from "astro:content";
import { BLOG_CATEGORIES, type BlogCategory } from "./categories";

export type BlogPost = CollectionEntry<"blog">;

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
  return posts.filter((post) => post.data.categories.includes(category));
}

/** Categories that have at least one post, in the canonical enum order. */
export function categoriesWithPosts(posts: BlogPost[]): BlogCategory[] {
  return BLOG_CATEGORIES.filter(
    (category) => postsInCategory(posts, category).length > 0,
  );
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
  const shared = (post: BlogPost) =>
    post.data.categories.filter((category) =>
      current.data.categories.includes(category),
    ).length;

  return posts
    .filter((post) => post.id !== current.id)
    .sort(
      (a, b) =>
        shared(b) - shared(a) || b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
    )
    .slice(0, limit);
}

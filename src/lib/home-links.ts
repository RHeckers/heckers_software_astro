import { categoryHref, type BlogCategory } from "./categories";
import { getSortedPosts, postHref, postsInCategory } from "./blog";

export interface HomeLinkTarget {
  category: BlogCategory;
  /** Human wording for the anchor text, e.g. "Nx monorepo". */
  topic: string;
}

export interface HomeLink {
  href: string;
  label: string;
}

/**
 * Which blog category each homepage section points to.
 *
 * Change the category here and the section link resolves itself at build
 * time: more than one post → category page, exactly one → that post,
 * none → no link is rendered. `topic` is only used for the anchor text.
 */
export const HOME_CATEGORY_LINKS = {
  codeAnalysis: { category: "Architecture", topic: "architecture" },
  workshops: {
    "enterprise-angular": { category: "Angular", topic: "Angular" },
    "nx-monorepo": { category: "Nx", topic: "Nx monorepo" },
    ai: { category: "AI", topic: "AI" },
  },
} as const satisfies {
  codeAnalysis: HomeLinkTarget;
  workshops: Record<string, HomeLinkTarget>;
};

/**
 * Resolve a section target to a concrete link, or null when the category has
 * no posts yet (in which case the section renders no link).
 */
export async function resolveHomeLink(
  target: HomeLinkTarget | undefined,
): Promise<HomeLink | null> {
  if (!target) return null;
  const posts = postsInCategory(await getSortedPosts(), target.category);
  if (posts.length === 0) return null;
  if (posts.length === 1) {
    return {
      href: postHref(posts[0]),
      label: `Read our ${target.topic} article`,
    };
  }
  return {
    href: categoryHref(target.category),
    label: `Read our ${target.topic} articles`,
  };
}

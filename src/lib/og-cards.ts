/**
 * Social preview cards (1200x630), generated at build time by
 * src/pages/og/[...card].png.ts. Blog posts use their own cover image
 * instead; every other page gets a branded card with its own headline.
 *
 * `key` is the file name under /og/, `path` the page it belongs to.
 */
export interface OgCard {
  key: string;
  path: string;
  eyebrow: string;
  headline: string;
}

export const OG_CARDS: readonly OgCard[] = [
  {
    key: "home",
    path: "/",
    eyebrow: "Forward-deployed engineering",
    headline: "Software and AI, delivered into production inside your company",
  },
  {
    key: "about",
    path: "/about/",
    eyebrow: "About Heckers Software",
    headline: "One senior engineer in your team, accountable end to end",
  },
  {
    key: "forward-deployed-engineering",
    path: "/services/forward-deployed-engineering/",
    eyebrow: "Forward-deployed engineering",
    headline: "From discovery to deployment, with one owner for the outcome",
  },
  {
    key: "architecture-assessment",
    path: "/services/architecture-assessment/",
    eyebrow: "Architecture assessment",
    headline: "A ranked report and roadmap for your Angular or Nx codebase",
  },
  {
    key: "workshops",
    path: "/services/workshops/",
    eyebrow: "Angular and Nx workshops",
    headline: "Hands-on training on your own codebase, so your team keeps the pace",
  },
  {
    key: "blog",
    path: "/blog/",
    eyebrow: "Blog",
    headline: "Practical articles on Angular, Nx monorepos and AI engineering",
  },
  {
    key: "default",
    path: "",
    eyebrow: "Heckers Software",
    headline: "Angular, Nx and AI engineering for enterprises",
  },
];

/** Category pages get a card per category, keyed by the category slug. */
const CATEGORY_PATH = /^\/blog\/category\/([a-z0-9-]+)\/?$/;

export function categoryCardKey(slug: string): string {
  return `category-${slug}`;
}

/** The generated card for a page path; the default card for any other page. */
export function ogCardPath(pathname: string): string {
  const normalized = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const card = OG_CARDS.find((item) => item.path === normalized);
  if (card) return `/og/${card.key}.png`;
  const category = normalized.match(CATEGORY_PATH);
  if (category) return `/og/${categoryCardKey(category[1])}.png`;
  return "/og/default.png";
}

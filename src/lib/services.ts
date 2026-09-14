/**
 * The three services, in one place. The navbar, the home page panels, the
 * footer and the service pages' cross-links all read from here, so a slug
 * or label changes once.
 *
 * `subject` is the option preselected in the contact form when a call to
 * action for that service is followed (see Contact.astro).
 */
export type ServiceSlug =
  | "architecture-assessment"
  | "workshops"
  | "application-development";

export interface Service {
  slug: ServiceSlug;
  href: string;
  /** Short label used in navigation. */
  navLabel: string;
  /** Sentence-case name used in running text and headings. */
  name: string;
  /** One-line summary used on cross-link cards. */
  summary: string;
  subject: "Code Review" | "Workshop" | "Development";
  /** Wording of the primary call to action for this service. */
  cta: string;
}

export const SERVICES: readonly Service[] = [
  {
    slug: "architecture-assessment",
    href: "/services/architecture-assessment",
    navLabel: "Architecture Assessment",
    name: "Architecture assessment",
    summary:
      "Senior engineers read your Angular or Nx codebase and hand you a ranked report and a roadmap. Fixed scope, two to three weeks.",
    subject: "Code Review",
    cta: "Book assessment",
  },
  {
    slug: "application-development",
    href: "/services/application-development",
    navLabel: "App Development",
    name: "Application development",
    summary:
      "Your first application from scratch, a new product for your scale-up, or a section of your enterprise software, built full stack by one senior team.",
    subject: "Development",
    cta: "Plan your project",
  },
  {
    slug: "workshops",
    href: "/services/workshops",
    navLabel: "Workshops",
    name: "Angular and Nx workshops",
    summary:
      "Hands-on training on your own codebase: enterprise Angular patterns, Nx monorepos, AI-assisted development and UI libraries.",
    subject: "Workshop",
    cta: "Book workshop",
  },
] as const;

export function getService(slug: ServiceSlug): Service {
  const service = SERVICES.find((item) => item.slug === slug);
  if (!service) throw new Error(`Unknown service: ${slug}`);
  return service;
}

export function otherServices(slug: ServiceSlug): Service[] {
  return SERVICES.filter((item) => item.slug !== slug);
}

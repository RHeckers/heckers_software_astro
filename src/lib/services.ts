/**
 * The three services, in one place. The navbar, the home page panels, the
 * footer and the service pages' cross-links all read from here, so a slug
 * or label changes once.
 *
 * Order matters: the first entry is the main offer and leads everywhere
 * the services are listed. The other two are the ways in (an outside read
 * of the code) and the way to keep a team moving after we leave (training).
 *
 * `subject` is the option preselected in the contact form when a call to
 * action for that service is followed (see Contact.astro).
 */
export type ServiceSlug =
  | "forward-deployed-engineering"
  | "architecture-assessment"
  | "workshops";

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
    slug: "forward-deployed-engineering",
    href: "/services/forward-deployed-engineering",
    navLabel: "Forward-Deployed Engineering",
    name: "Forward-Deployed Engineering",
    summary:
      "An industry expert who comes into your company and delivers outcomes end to end: discovery, development, AI integration and deployment. With AI, one senior engineer ships what a team did before. Hand over a backlog, or let us find the highest-impact work first.",
    subject: "Development",
    cta: "Book a discovery call",
  },
  {
    slug: "architecture-assessment",
    href: "/services/architecture-assessment",
    navLabel: "Architecture Assessment",
    name: "Architecture assessment",
    summary:
      "Senior engineers read your Angular or Nx codebase from the outside and hand you a ranked report and a roadmap. Fixed scope, two to three weeks. The diagnosis before any team starts building.",
    subject: "Code Review",
    cta: "Book assessment",
  },
  {
    slug: "workshops",
    href: "/services/workshops",
    navLabel: "Workshops",
    name: "Angular and Nx workshops",
    summary:
      "Hands-on training on your own codebase: AI-native development, AI-driven front ends, Nx monorepos and enterprise Angular architecture. So your team keeps the pace after we leave.",
    subject: "Workshop",
    cta: "Book workshop",
  },
] as const;

export function getService(slug: ServiceSlug): Service {
  const service = SERVICES.find((item) => item.slug === slug);
  if (!service) throw new Error(`Unknown service: ${slug}`);
  return service;
}
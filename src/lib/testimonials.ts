/**
 * Client recommendations, in one place. The full texts feed the
 * testimonials carousel; the snippets are short cuts from those same texts
 * used as proof next to a claim elsewhere on the site (see ProofQuote).
 *
 * Every snippet is a verbatim sentence or clause from the recommendation
 * it points to, so a reader who meets the full text later recognises it.
 */
import type { ImageMetadata } from "astro";
import ferdi from "../assets/testimonials/ferdi.jpg";
import marc from "../assets/testimonials/marc.jpg";
import nico from "../assets/testimonials/nico.jpg";
import peter from "../assets/testimonials/peter.jpg";
import marelLogo from "../assets/logos/marel_logo.svg";
import vattenfallLogo from "../assets/logos/vattenfall_logo.svg";

export type TestimonialId = "ferdi" | "nico" | "marc" | "peter";

export interface Testimonial {
  id: TestimonialId;
  name: string;
  title: string;
  company?: string;
  /** Company logo, when we have it in the brand's own colours. */
  logo?: ImageMetadata;
  image: ImageMetadata;
  content: string;
}

export const TESTIMONIALS: readonly Testimonial[] = [
  {
    id: "ferdi",
    name: "Ferdi Havenaar",
    title: "Manager IT Web & App",
    company: "Vattenfall",
    logo: vattenfallLogo,
    image: ferdi,
    content:
      "Roberto worked with us within the Loyalty team, and I can strongly recommend him as a full-stack developer. His knowledge of Angular is exceptionally deep; it’s clear in everything he does that he understands exactly what is happening and why. He delivers quickly, makes well-considered decisions, and actively contributes to architectural discussions.",
  },
  {
    id: "nico",
    name: "Nico Vandenbroucke",
    title: "IT-Directeur",
    company: "Wit-Gele Kruis West-Vlaanderen",
    image: nico,
    content:
      "It was a pleasure working with Heckers Software and having Roberto on our team. He knows Angular very well, and no task was too difficult for him. I would highly recommend him for your Angular project.",
  },
  {
    id: "marc",
    name: "Marc Caessens",
    title: "Senior Software Program Manager",
    company: "Marel",
    logo: marelLogo,
    image: marc,
    content:
      "Roberto really was a great addition to his team for several years at Marel and has developed a big front-end angular data visualisation framework for us, going from the earliest versions of Angular to the most recent versions and he was able to tackle all challenges that you can encounter in a technology that is continuously improving.",
  },
  {
    id: "peter",
    name: "Peter Nieuwenhuyse",
    title: "Software architect & Angular coach",
    image: peter,
    content:
      "In January 2025 Roberto from Heckers Software joined our team. Not by immediately bulldozing through the code, but by carefully and thoughtfully paving the right paths with insight and calm. Many of the choices he made back then still contribute today to the stability and quality of the project.",
  },
] as const;

/**
 * Short cuts from the recommendations above, by theme. The wording stays
 * as close to the full text as a standalone sentence allows, so the
 * snippets read like different people rather than one template. The
 * recommendations are about Roberto personally; the proof band explains
 * that every engagement is led by him (see ProofRow), and the two snippets
 * that name Heckers Software (nicoTeam, peterApproach) go where the
 * company framing matters most: next to the contact form and first on the
 * home page band.
 */
export const SNIPPETS = {
  /** Depth of Angular knowledge. */
  ferdiDepth: {
    author: "ferdi",
    quote:
      "Roberto’s knowledge of Angular is exceptionally deep. It’s clear in everything he does that he understands exactly what is happening and why.",
  },
  /** Speed and judgement in delivery. */
  ferdiDelivery: {
    author: "ferdi",
    quote:
      "Roberto delivers quickly, makes well-considered decisions, and actively contributes to architectural discussions. I can strongly recommend him as a full-stack developer.",
  },
  /** Nothing too difficult. */
  nicoAngular: {
    author: "nico",
    quote:
      "No task was too difficult for Roberto. He knows Angular very well, and I would highly recommend him for your Angular project.",
  },
  /** Working together; names the company. */
  nicoTeam: {
    author: "nico",
    quote:
      "It was a pleasure working with Heckers Software and having Roberto on our team.",
  },
  /** Long-running framework, across Angular versions. */
  marcFramework: {
    author: "marc",
    quote:
      "Over several years at Marel, Roberto developed a big front-end Angular data visualisation framework for us, going from the earliest versions of Angular to the most recent.",
  },
  /** Keeping up with a moving technology. */
  marcChallenges: {
    author: "marc",
    quote:
      "Roberto was a great addition to the team for several years, able to tackle all the challenges you can encounter in a technology that is continuously improving.",
  },
  /** Calm, careful approach to an existing codebase; names the company. */
  peterApproach: {
    author: "peter",
    quote:
      "Roberto from Heckers Software joined our team. Not by immediately bulldozing through the code, but by carefully and thoughtfully paving the right paths with insight and calm.",
  },
  /** Decisions that hold up. */
  peterLasting: {
    author: "peter",
    quote:
      "Many of the choices Roberto made when he joined still contribute today to the stability and quality of the project.",
  },
} as const satisfies Record<string, { author: TestimonialId; quote: string }>;

export type SnippetKey = keyof typeof SNIPPETS;

export interface Snippet extends Testimonial {
  quote: string;
}

export function getSnippet(key: SnippetKey): Snippet {
  const { author, quote } = SNIPPETS[key];
  const testimonial = TESTIMONIALS.find((item) => item.id === author);
  if (!testimonial) throw new Error(`Unknown testimonial author: ${author}`);
  return { ...testimonial, quote };
}

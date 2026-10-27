/**
 * Client recommendations, in one place. The full texts feed the
 * testimonials carousel; the snippets are short cuts from those same texts
 * used as proof next to a claim elsewhere on the site (see ProofQuote).
 *
 * Every snippet is a verbatim sentence or clause from the recommendation
 * it points to, so a reader who meets the full text later recognises it.
 *
 * The texts are English renderings of the recommendations on Roberto's
 * LinkedIn profile. Ferdi's and Peter's were written in Dutch; the
 * sentences about back-end work, the monorepo, technical challenges and
 * mentoring were added from the originals when the site was repositioned
 * around end-to-end delivery. Check the wording against the Dutch text
 * before relying on it in print.
 */
import type { ImageMetadata } from "astro";
import alex from "../assets/testimonials/alex.jpg";
import ferdi from "../assets/testimonials/ferdi.jpg";
import marc from "../assets/testimonials/marc.jpg";
import nico from "../assets/testimonials/nico.jpg";
import peter from "../assets/testimonials/peter.jpg";
import marelLogo from "../assets/logos/marel_logo.svg";
import vattenfallLogo from "../assets/logos/vattenfall_logo.svg";

export type TestimonialId = "ferdi" | "nico" | "marc" | "peter" | "alex";

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
      "Roberto worked with us within the Loyalty team, and I can strongly recommend him as a full-stack developer. His knowledge of Angular is exceptionally deep; it’s clear in everything he does that he understands exactly what is happening and why. He delivers quickly, makes well-considered decisions, and actively contributes to architectural discussions. Although the role put less emphasis on .NET, he also did excellent work on the .NET back end, and he was involved early in the discussions and decisions about improving our monorepo. He looks beyond his own scope and contributes structurally to quality and maintainability. A very reliable and substantively strong developer.",
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
    id: "alex",
    name: "Alex Wesselink",
    title: "UX Designer",
    company: "Vattenfall",
    logo: vattenfallLogo,
    image: alex,
    content:
      "Working alongside Roberto at Vattenfall has been a great experience. As a UX designer, I was consistently impressed by his ability to not just code, but to actively think along and enhance our user experiences. His quick development skills with Angular, combined with his thoughtful input during product discussions, made our collaboration efficient and productive. What sets Roberto apart is his proactive approach: he doesn't just build what's asked, but actively contributes to improving our product flows. He's been a reliable and valuable development partner who consistently delivers quality work.",
  },
  {
    id: "peter",
    name: "Peter Nieuwenhuyse",
    title: "Software architect & Angular coach",
    image: peter,
    content:
      "In January 2025 Roberto from Heckers Software joined our team. Not by immediately bulldozing through the code, but by carefully and thoughtfully paving the right paths with insight and calm. Many of the choices he made back then still contribute today to the stability and quality of the project. He keeps up with where Angular is going and stays critical and curious instead of settling for the way we have always done it. He does not shy away from technical challenges and keeps working on them until they are solved. And he treats colleagues with respect, especially the less experienced ones, taking on a mentoring role and sharing knowledge without ego. He helps build a team where people grow, not just the codebase.",
  },
] as const;

/**
 * Short cuts from the recommendations above, by theme. The wording stays
 * as close to the full text as a standalone sentence allows, so the
 * snippets read like different people rather than one template. The
 * recommendations are about Roberto personally; the proof band explains
 * that every engagement is delivered by him personally
 * (see ProofRow). The snippets that describe him joining a team and
 * delivering across the stack (peterApproach, ferdiFullStack,
 * ferdiBeyondScope) go where the end-to-end offer is argued; the ones that
 * name Heckers Software (nicoTeam, peterApproach) go next to the contact
 * form and first on the home page band.
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
  /** Front end, back end and the platform underneath: the whole stack. */
  ferdiFullStack: {
    author: "ferdi",
    quote:
      "Although the role put less emphasis on .NET, Roberto also did excellent work on the .NET back end, and he was involved early in the decisions about improving our monorepo.",
  },
  /** Ownership beyond the ticket. */
  ferdiBeyondScope: {
    author: "ferdi",
    quote:
      "Roberto looks beyond his own scope and contributes structurally to quality and maintainability. A very reliable and substantively strong developer.",
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
  /** Finishes what he starts. */
  peterChallenges: {
    author: "peter",
    quote:
      "Roberto does not shy away from technical challenges and keeps working on them until they are solved.",
  },
  /** Builds more than the ticket asks for. */
  alexProactive: {
    author: "alex",
    quote:
      "What sets Roberto apart is his proactive approach: he doesn't just build what's asked, but actively contributes to improving our product flows. A reliable and valuable development partner who consistently delivers quality work.",
  },
  /** Thinks along with design, not just code; from a designer. */
  alexThinkAlong: {
    author: "alex",
    quote:
      "As a UX designer, I was consistently impressed by Roberto's ability to not just code, but to actively think along and enhance our user experiences.",
  },
  /** Speed plus judgement in product discussions. */
  alexCollaboration: {
    author: "alex",
    quote:
      "Roberto's quick development skills with Angular, combined with his thoughtful input during product discussions, made our collaboration efficient and productive.",
  },
  /** Leaves the team stronger, not just the code. */
  peterMentoring: {
    author: "peter",
    quote:
      "Roberto treats colleagues with respect, especially the less experienced ones, taking on a mentoring role and sharing knowledge without ego. He helps build a team where people grow, not just the codebase.",
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

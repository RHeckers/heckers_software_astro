export const SITE_TITLE = "Heckers Software - Angular, Nx and AI engineering for enterprises";
export const SITE_DESCRIPTION = "Forward-deployed engineering: a senior engineer who joins your team, owns the outcome and ships software to production, with AI where it earns its place.";
/** The homepage <title>: the main offer first, the brand last, under 60 characters. */
export const HOME_TITLE = "Forward-Deployed Engineering | Heckers Software";

export const COMPANY = {
  name: "Heckers Software",
  street: "Beatrixstraat 1",
  postalCode: "5554JL",
  city: "Valkenswaard",
  country: "The Netherlands",
  phone: "+31614467756",
  email: "roberto@heckerssoftware.com",
  kvk: "90652479",
  btw: "NL0048.32.507.B79",
} as const;

/** How bigger assignments are staffed. Said the same way everywhere. */
export const CAPACITY_STATEMENT =
  "For larger assignments I bring in senior engineers from my network. I stay the lead and your single point of contact.";

export const AUTHOR = {
  name: "Roberto Heckers",
  url: "https://heckerssoftware.com/about/",
  jobTitle: "Founder and senior software engineer",
  /** One paragraph, used under blog posts and in structured data. */
  bio: "Founder of Heckers Software, author of Effective Angular (Packt, 2024) and speaker at ngPoland, Angular Zurich and The Dutch Angular Group. Builds and untangles Angular, Nx and .NET systems for enterprises, delivers software and AI end to end as a forward-deployed engineer, and keeps the company at the edge of AI through knowledge groups with industry leaders.",
} as const;

/**
 * Public profiles and publications. They are linked from the footer, the
 * about page and every blog post, and listed as sameAs in structured
 * data, so search engines and AI systems can tie the name on this site to
 * the same person elsewhere. An empty string means "not set": the link is
 * left out everywhere until it is filled in.
 */
export const PROFILES = {
  github: "https://github.com/RHeckers",
  linkedin: "https://www.linkedin.com/in/roberto-heckers-2313453b/",
  book: {
    title: "Effective Angular",
    subtitle:
      "Develop applications of any size by effectively using Angular with Nx, RxJS, and NgRx",
    url: "https://www.packtpub.com/en-us/product/effective-angular-9781805125532",
    publisher: "Packt",
    year: "2024",
    isbn: "9781805125532",
  },
  /** Talks, newest last. The ngPoland page is a speaker profile, the
   *  other two are the event pages. */
  talks: [
    {
      event: "ngPoland 2024",
      url: "https://ng-poland.pl/speaker/2024/roberto-heckers",
    },
    {
      event: "Angular Zurich",
      url: "https://angular.zuerich/events/september-2026",
    },
    {
      event: "The Dutch Angular Group",
      url: "https://www.meetup.com/nl-nl/frontvalue/events/316497506/",
    },
  ],
} as const;

/** The profile URLs that are set, for sameAs lists. */
export function profileLinks(): string[] {
  return [
    PROFILES.linkedin,
    PROFILES.book.url,
    PROFILES.talks[0].url,
  ].filter((url) => url.length > 0);
}

/**
 * Site colour palette. Each palette is three colours (light, dark, accent);
 * global.scss maps every colour on the site onto them via data-palette on
 * <html>. Any page can be previewed in the other palette with
 * ?palette=<name> in the URL (remembered for the session).
 */
export const PALETTES = {
  sand: { light: "#f0e5db", dark: "#474329", accent: "#fc75b4" },
  aurora: { light: "#e1e8f2", dark: "#151c2b", accent: "#2bf08a" },
  harbor: { light: "#f2eee6", dark: "#16233a", accent: "#ffbf2e" },
  granite: { light: "#eceae5", dark: "#1f2b30", accent: "#1fe6cf" },
} as const;
export type PaletteName = keyof typeof PALETTES;
export const PALETTE: PaletteName = "harbor";

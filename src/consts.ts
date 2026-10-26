export const SITE_TITLE = "Heckers Software - Angular, Nx and AI engineering for enterprises";
export const SITE_DESCRIPTION = "Forward-deployed engineering: one industry expert, amplified by AI, who comes into your company and delivers software and AI end to end, from discovery to production.";

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

export const AUTHOR = {
  name: "Roberto Heckers",
  url: "https://heckerssoftware.com/about",
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
  /** TODO: the public LinkedIn profile URL. */
  linkedin: "",
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

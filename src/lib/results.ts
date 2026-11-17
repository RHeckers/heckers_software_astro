/**
 * The verified delivery figures, in one place. These are the only numbers
 * about client results the site may state: the results strip on the home
 * page, the case studies and the calls to action under blog posts all
 * read from here. Add a figure only when the client work behind it is
 * confirmed.
 */
export interface Result {
  id: "customers" | "nps" | "productivity" | "tests";
  /** The figure, as shown. */
  value: string;
  /** What the figure measures, in one line. */
  label: string;
  client: string;
  /** Slug of the case study that tells the story behind it. */
  caseStudy: string;
}

export const RESULTS: readonly Result[] = [
  {
    id: "customers",
    value: "2M+",
    label: "customers use the product I led the front end for",
    client: "Vattenfall",
    caseStudy: "vattenfall",
  },
  {
    id: "nps",
    value: "3.4 → 4.2",
    label: "NPS of usage and costs in the app, after my team rebuilt it",
    client: "Vattenfall",
    caseStudy: "vattenfall",
  },
  {
    id: "productivity",
    value: "20%",
    label: "productivity gain for 40+ front-end developers",
    client: "Wit-Gele Kruis",
    caseStudy: "wit-gele-kruis",
  },
  {
    id: "tests",
    value: "90 → 10 min",
    label: "for a full Cypress test run",
    client: "Wit-Gele Kruis",
    caseStudy: "wit-gele-kruis",
  },
] as const;

export function getResult(id: Result["id"]): Result {
  const result = RESULTS.find((item) => item.id === id);
  if (!result) throw new Error(`Unknown result: ${id}`);
  return result;
}

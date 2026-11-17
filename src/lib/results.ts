/**
 * The results strip on the home page: one result per client, four
 * clients. Two are figures, two are outcomes without a number, because no
 * number for them is confirmed. Each one is told in full in its case
 * study. Add or change an entry only when the client work behind it is
 * confirmed.
 */
export interface Result {
  id: "vattenfall" | "wit-gele-kruis" | "marel" | "dh-automation";
  /** The figure or outcome, as shown. */
  value: string;
  /** What it measures, in one line. */
  label: string;
  client: string;
  /** Slug of the case study that tells the story behind it. */
  caseStudy: string;
}

export const RESULTS: readonly Result[] = [
  {
    id: "vattenfall",
    value: "3.4 → 4.2",
    label: "NPS of usage and costs, for 2M+ customers",
    client: "Vattenfall",
    caseStudy: "vattenfall",
  },
  {
    id: "wit-gele-kruis",
    value: "20%",
    label: "productivity gain for 40+ front-end developers",
    client: "Wit-Gele Kruis",
    caseStudy: "wit-gele-kruis",
  },
  {
    id: "marel",
    value: "1 monorepo",
    label: "for every front-end app, with faster builds, tests and lint",
    client: "Marel",
    caseStudy: "marel",
  },
  {
    id: "dh-automation",
    value: "On time",
    label: "launch, as the only software engineer on the product",
    client: "DH Automation",
    caseStudy: "dh-automation",
  },
] as const;

export function getResult(id: Result["id"]): Result {
  const result = RESULTS.find((item) => item.id === id);
  if (!result) throw new Error(`Unknown result: ${id}`);
  return result;
}

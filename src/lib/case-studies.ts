import { getCollection, type CollectionEntry } from "astro:content";
import type { ServiceSlug } from "./services";

export type CaseStudy = CollectionEntry<"caseStudies">;

export function caseStudyHref(study: CaseStudy): string {
  return `/case-studies/${study.id}/`;
}

/**
 * The case studies a visitor may see, in listing order. Drafts are part
 * of that in development, so they can be read and reviewed in place, and
 * are left out of every production build.
 */
export async function getCaseStudies(): Promise<CaseStudy[]> {
  const studies = await getCollection(
    "caseStudies",
    (study) => !study.data.draft || import.meta.env.DEV,
  );
  return studies.sort((a, b) => a.data.order - b.data.order);
}

export async function caseStudiesForService(
  service: ServiceSlug,
): Promise<CaseStudy[]> {
  const studies = await getCaseStudies();
  return studies.filter((study) => study.data.services.includes(service));
}

/** The case study with this slug, when a visitor may see it. */
export async function findCaseStudy(id: string): Promise<CaseStudy | undefined> {
  const studies = await getCaseStudies();
  return studies.find((study) => study.id === id);
}

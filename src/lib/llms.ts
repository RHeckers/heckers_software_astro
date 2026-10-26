/**
 * The site as plain text for AI crawlers and assistants, following the
 * llms.txt convention: /llms.txt is a short index with one line per page,
 * /llms-full.txt carries the full content of the service pages, the about
 * page and every blog post. Both are built from the same data the pages
 * render, so they cannot drift from the site.
 */
import { AUTHOR, COMPANY, PROFILES } from "../consts";
import { getSortedPosts, postHref } from "./blog";
import { FAQS } from "./faqs";
import { PRICING, VAT_NOTE, euro } from "./pricing";
import { SERVICES } from "./services";
import { TAILORED_WORKSHOP, WORKSHOPS } from "./workshops";

export interface PostSummary {
  title: string;
  description: string;
  url: string;
  published: Date;
  updated?: Date;
  categories: readonly string[];
  /** Markdown body, for the full file. */
  body: string;
}

const ABOUT_SUMMARY = `${COMPANY.name} is a software consultancy in ${COMPANY.city}, ${COMPANY.country}, founded and run by ${AUTHOR.name}: author of ${PROFILES.book.title} (${PROFILES.book.publisher}, ${PROFILES.book.year}) and speaker at ngPoland and Angular Zurich. It delivers software and AI end to end inside companies as a forward-deployed engineer, assesses Angular and Nx codebases, and trains development teams on their own code. Default stack: Angular, TypeScript, Nx, .NET, Node.js, SQL, Azure, and the Claude and OpenAI APIs.`;

const PRICING_TEXT: Record<string, string> = {
  "forward-deployed-engineering":
    "Three tiers, every one a fixed price per outcome. Minimum: one outcome you can already describe, scoped in a few days, from three weeks. Standard: a two-week discovery with the people who do the work, then the highest-impact outcomes delivered in two-week increments. Advanced: a roadmap of outcomes planned a quarter at a time, with a team assembled when one person is not enough.",
  "architecture-assessment": `Minimum: a one-week structural scan with the ten costliest findings ranked, ${euro(PRICING.assessment.minimum)} fixed, ${VAT_NOTE}. Standard: two to three weeks with interviews, a full ranked report and a roadmap session, ${euro(PRICING.assessment.standard)} fixed, ${VAT_NOTE}. Advanced: the Standard assessment followed by hands-on execution of the top findings, quoted after the roadmap.`,
  workshops: `Minimum: one workshop day for twelve seats, ${euro(PRICING.workshops.oneDay)} fixed, ${VAT_NOTE}. Standard: two days for twelve seats with half a day on the team's own codebase, ${euro(PRICING.workshops.twoDays)} fixed, ${VAT_NOTE}. Each extra seat is ${euro(PRICING.workshops.extraSeatPerDay)} per workshop day. Advanced: two days followed by a quarter of enablement towards one measurable goal, quoted per goal and group size.`,
};

/** Every post, newest first, with its body, for both files. */
export async function postSummaries(site: URL): Promise<PostSummary[]> {
  const posts = await getSortedPosts();
  return posts.map((post) => ({
    title: post.data.title,
    description: post.data.description,
    url: new URL(postHref(post), site).href,
    published: post.data.pubDate,
    updated: post.data.updatedDate,
    categories: post.data.categories,
    body: post.body ?? "",
  }));
}

function abs(site: URL, path: string): string {
  return new URL(path, site).href;
}

function date(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** /llms.txt: the index. */
export function llmsIndex(site: URL, posts: PostSummary[]): string {
  const lines: string[] = [];
  lines.push(`# ${COMPANY.name}`, "", `> ${ABOUT_SUMMARY}`, "");
  lines.push(
    "Contact: " +
    `${COMPANY.email}, ${COMPANY.phone}, ${COMPANY.street}, ${COMPANY.postalCode} ${COMPANY.city}, ${COMPANY.country}. ` +
    `Chamber of Commerce (KVK) ${COMPANY.kvk}.`,
    "",
  );
  lines.push("## Services", "");
  for (const service of SERVICES) {
    lines.push(`- [${service.name}](${abs(site, service.href)}): ${service.summary}`);
  }
  lines.push("", "## Workshops", "");
  for (const workshop of [...WORKSHOPS, TAILORED_WORKSHOP]) {
    lines.push(
      `- [${workshop.title}](${abs(site, `/services/workshops#${workshop.id}`)}): ${workshop.description}`,
    );
  }
  lines.push("", "## About", "");
  lines.push(`- [About ${COMPANY.name} and ${AUTHOR.name}](${abs(site, "/about")}): ${AUTHOR.bio}`);
  lines.push(`- [${PROFILES.book.title}](${PROFILES.book.url}): ${PROFILES.book.subtitle} (${PROFILES.book.publisher}, ${PROFILES.book.year}).`);
  lines.push(`- [GitHub](${PROFILES.github})`);
  if (PROFILES.linkedin) lines.push(`- [LinkedIn](${PROFILES.linkedin})`);
  lines.push("", "## Blog", "");
  for (const post of posts) {
    lines.push(`- [${post.title}](${post.url}): ${post.description}`);
  }
  lines.push("", "## Optional", "");
  lines.push(`- [Full content](${abs(site, "/llms-full.txt")}): every service page, the about page and every post as plain text.`);
  lines.push(`- [RSS feed](${abs(site, "/rss.xml")})`);
  lines.push(`- [Sitemap](${abs(site, "/sitemap-index.xml")})`);
  return lines.join("\n") + "\n";
}

/** /llms-full.txt: everything. */
export function llmsFull(site: URL, posts: PostSummary[]): string {
  const lines: string[] = [];
  lines.push(`# ${COMPANY.name}`, "", `> ${ABOUT_SUMMARY}`, "");
  lines.push(`Index: ${abs(site, "/llms.txt")}`, "");

  lines.push("# Services", "");
  for (const service of SERVICES) {
    lines.push(`## ${service.name}`, "", `URL: ${abs(site, service.href)}`, "");
    lines.push(service.summary, "");
    lines.push("### Pricing", "", PRICING_TEXT[service.slug], "");
    if (service.slug === "workshops") {
      lines.push("### Workshop catalogue", "");
      for (const workshop of [...WORKSHOPS, TAILORED_WORKSHOP]) {
        lines.push(`#### ${workshop.title}`, "", `${workshop.tag}. ${workshop.description}`, "");
        for (const bullet of workshop.bullets) lines.push(`- ${bullet}`);
        lines.push("", `Outcome: ${workshop.outcome}`, "");
      }
    }
    lines.push("### Frequently asked questions", "");
    for (const item of FAQS[service.slug]) {
      lines.push(`**${item.question}**`, "", item.answer, "");
    }
  }

  lines.push("# About", "", `URL: ${abs(site, "/about")}`, "", ABOUT_SUMMARY, "", AUTHOR.bio, "");
  lines.push(
    `How the work is done: one expert amplified by AI coding agents, with more hands brought in when an outcome needs them; a fixed price per outcome; everything built in the client's own repositories to the client's standards, with decisions written down and handed over.`,
    "",
  );

  lines.push("# Blog", "");
  for (const post of posts) {
    lines.push(`## ${post.title}`, "");
    lines.push(`URL: ${post.url}`);
    lines.push(`Author: ${AUTHOR.name}`);
    lines.push(`Published: ${date(post.published)}${post.updated ? `, updated ${date(post.updated)}` : ""}`);
    if (post.categories.length) lines.push(`Topics: ${post.categories.join(", ")}`);
    // Headings inside a post sit two levels under the post's own heading.
    const body = post.body.trim().replace(/^(#{1,4}) /gm, "$1## ");
    lines.push("", post.description, "", body, "");
  }
  return lines.join("\n") + "\n";
}
